import { asyncBufferFromFile, parquetRead } from 'hyparquet'
import { resolve, isAbsolute } from 'node:path'
import { app } from '@/config/general'
import type { DatasetScheme } from '@/config/general'

export function dataPath(filename: string) {
  return resolve(process.cwd(), app.data.path, filename)
}

/** A raw parquet row as returned by hyparquet: cells addressed by position. */
export type RawRow = unknown[]

/** A mapped row: cells addressed by the field names configured in the scheme. */
export type DataRow = Record<string, string | number>

/**
 * Reads a parquet file at build time (Node.js / Astro SSG).
 * Pass a path relative to the project root, e.g. 'public/data/parquet/foo.parquet'.
 */
export async function readParquet<T = RawRow>(filePath: string): Promise<T[]> {
  const resolvedPath = isAbsolute(filePath)
    ? filePath
    : resolve(process.cwd(), filePath)

  const file = await asyncBufferFromFile(resolvedPath)
  return new Promise<T[]>((resolve, reject) => {
    try {
      parquetRead({
        file,
        onComplete: (rows) => resolve((rows ?? []) as unknown as T[]),
      })
    } catch (err) {
      reject(err)
    }
  })
}

export interface MapRowsOptions {
  /**
   * Keep only rows whose territory-role column equals this value
   * (e.g. app.local to keep municipality-level rows). When omitted,
   * rows for every territory are kept.
   */
  territory?: string
}

/**
 * Maps raw parquet rows to named objects using a scheme from app.config.json.
 * The scheme drives everything: which columns are read, at which position,
 * under which name, and with which type.
 *
 * Column roles:
 * - `territory` — used for the optional territory filter.
 * - `year` / `value` — rows where these are missing or non-numeric are
 *   dropped (e.g. years before a programme existed); when a year column
 *   exists, rows are sorted by it.
 */
export function mapRows<T extends DataRow = DataRow>(
  rows: RawRow[],
  scheme: DatasetScheme,
  { territory }: MapRowsOptions = {},
): T[] {
  const territoryCol = scheme.find((c) => c.role === 'territory')
  const yearCol = scheme.find((c) => c.role === 'year')
  const valueCol = scheme.find((c) => c.role === 'value')

  const result: T[] = []
  for (const raw of rows) {
    if (
      territory &&
      territoryCol &&
      String(raw[territoryCol.index]) !== territory
    )
      continue

    const row: DataRow = {}
    let valid = true
    for (const col of scheme) {
      const cell = raw[col.index]
      if (col.type === 'number') {
        const num = cell == null ? NaN : Number(cell)
        if (!Number.isFinite(num) && (col === yearCol || col === valueCol)) {
          valid = false
          break
        }
        row[col.name] = num
      } else {
        row[col.name] = cell == null ? '' : String(cell)
      }
    }
    if (valid) result.push(row as T)
  }

  if (yearCol) {
    result.sort((a, b) => Number(a[yearCol.name]) - Number(b[yearCol.name]))
  }
  return result
}

/** Reads a parquet file from the configured data directory and maps its rows. */
export async function loadDataset<T extends DataRow = DataRow>(
  file: string,
  scheme: DatasetScheme,
  options?: MapRowsOptions,
): Promise<T[]> {
  const rows = await readParquet<RawRow>(dataPath(file))
  return mapRows<T>(rows, scheme, options)
}

// ─── Canonical row shapes ─────────────────────────────────────────────────────
// These describe the field names the chart components expect. The scheme in
// app.config.json decides which parquet column feeds each field; the names
// below are the template's internal vocabulary and must match the `name`
// entries used in the config schemes.

/** Priority indicator rows: kept for every territory so charts can compare. */
export type PriorityRow = {
  territorio: string
  anio: number
  valor: number
} & DataRow

/** Stratified indicator rows: year/value plus any configured stratifiers. */
export type StratifiedRow = {
  anio: number
  valor: number
} & DataRow

/** Wide-format rows keyed by indicator slug (analytics/scatter datasets). */
export type AnalyticsRow = {
  anio: number
  valor: number
} & DataRow

/** Indicator slugs used as data-row keys across the analytics dashboard. */
export type AnalyticsIndicatorKey = string

export type ScatterRow = {
  anio: number
  territorio: string
  valor: number
  nacimientos: number
} & DataRow

export type ForestPlotDataRow = {
  anio: number
  indicador: string
  label: string
  correlacion: number
  ci_lower: number
  ci_upper: number
  p_value: number
  n: number
} & DataRow
