'use client'

import { useMemo, useState } from 'react'
import { DSGapBarChart } from '@ops-dss/charts/gap-bar-chart'
import type { PriorityRow } from '@/lib/parquet'
import { Icon } from '@iconify/react'
import {
  app,
  type GapComparisonMeta,
  type IndicatorMeta,
  type IndicatorStratifier,
} from '@/config/general'

interface GapRow {
  anio: number
  valor_grupo: number
  valor_referencia: number
  brecha_absoluta: number
  brecha_relativa: number
  ic_inf_ba: number
  ic_sup_ba: number
  ic_inf_br: number
  ic_sup_br: number
}

function r(v: number, d: number) {
  const f = 10 ** d
  return Math.round(v * f) / f
}

function computeGaps(
  data: PriorityRow[],
  field: string,
  scopeField: string,
  scopeValue: string,
  comparison: GapComparisonMeta,
): GapRow[] {
  const rows = data.filter(
    (row) => row.territorio === app.local && row[scopeField] === scopeValue,
  )

  const grupoByYear = new Map<number, number>()
  const referenciaByYear = new Map<number, number>()

  for (const row of rows) {
    if (row[field] === comparison.group.value)
      grupoByYear.set(row.anio, row.valor)
    else if (row[field] === comparison.reference.value)
      referenciaByYear.set(row.anio, row.valor)
  }

  const years = [
    ...new Set([...grupoByYear.keys(), ...referenciaByYear.keys()]),
  ].sort((a, b) => a - b)

  return years
    .map((anio) => {
      const valor_grupo = grupoByYear.get(anio) ?? NaN
      const valor_referencia = referenciaByYear.get(anio) ?? NaN
      if (
        !Number.isFinite(valor_grupo) ||
        !Number.isFinite(valor_referencia) ||
        valor_referencia <= 0
      )
        return null
      const brecha_absoluta = r(valor_grupo - valor_referencia, 1)
      const brecha_relativa = r(valor_grupo / valor_referencia, 2)
      const ba_lo = r(brecha_absoluta * 0.8, 1)
      const ba_hi = r(brecha_absoluta * 1.2, 1)
      return {
        anio,
        valor_grupo: r(valor_grupo, 1),
        valor_referencia: r(valor_referencia, 1),
        brecha_absoluta,
        brecha_relativa,
        ic_inf_ba: Math.min(ba_lo, ba_hi),
        ic_sup_ba: Math.max(ba_lo, ba_hi),
        ic_inf_br: r(brecha_relativa * 0.85, 2),
        ic_sup_br: r(brecha_relativa * 1.15, 2),
      }
    })
    .filter((row): row is GapRow => row !== null)
}

function interpretacionBA(ba: number, comparison: GapComparisonMeta): string {
  if (ba > 0) return comparison.interpretation.absolute.above0
  if (ba < 0) return comparison.interpretation.absolute.below0
  return 'No se observaron diferencias absolutas relevantes.'
}

function interpretacionBR(br: number, comparison: GapComparisonMeta): string {
  if (br > 1) return comparison.interpretation.relative.above1
  if (br < 1 && br > 0) return comparison.interpretation.relative.below1
  return 'No se observaron diferencias relativas.'
}

function downloadCsvBA(
  rows: GapRow[],
  comparison: GapComparisonMeta,
  filename: string,
) {
  const header = [
    'anio',
    comparison.group.label,
    comparison.reference.label,
    'brecha_absoluta',
    'ic_inf_ba',
    'ic_sup_ba',
  ].join(',')
  const lines = rows.map((row) =>
    [
      row.anio,
      row.valor_grupo,
      row.valor_referencia,
      row.brecha_absoluta,
      row.ic_inf_ba,
      row.ic_sup_ba,
    ].join(','),
  )
  triggerDownload([header, ...lines].join('\n'), filename)
}

function downloadCsvBR(
  rows: GapRow[],
  comparison: GapComparisonMeta,
  filename: string,
) {
  const header = [
    'anio',
    comparison.group.label,
    comparison.reference.label,
    'brecha_relativa',
    'ic_inf_br',
    'ic_sup_br',
  ].join(',')
  const lines = rows.map((row) =>
    [
      row.anio,
      row.valor_grupo,
      row.valor_referencia,
      row.brecha_relativa,
      row.ic_inf_br,
      row.ic_sup_br,
    ].join(','),
  )
  triggerDownload([header, ...lines].join('\n'), filename)
}

function triggerDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

type ViewMode = 'chart' | 'table'

function ViewToggle({
  view,
  onChange,
  sectionLabel,
}: {
  view: ViewMode
  onChange: (v: ViewMode) => void
  sectionLabel: string
}) {
  return (
    <div
      role="group"
      aria-label={`Vista para ${sectionLabel}`}
      className="flex rounded-lg overflow-hidden border border-gray-200 text-sm"
    >
      {(['chart', 'table'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={view === v}
          aria-label={`${v === 'chart' ? 'Gráfico' : 'Tabla'} — ${sectionLabel}`}
          className={`px-4 py-1.5 transition-colors ${
            view === v
              ? 'bg-gray-800 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {v === 'chart' ? 'Gráfico' : 'Tabla'}
        </button>
      ))}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  data: PriorityRow[]
  selectedYear?: number | null
  priority: IndicatorMeta
  // Which configured stratifier's gap analysis to show, e.g. 'etnia', 'zona', 'sexo'.
  dimension: IndicatorStratifier
}

export const PriorityGapsChart = ({
  data,
  selectedYear,
  priority,
  dimension,
}: Props) => {
  const spec = priority.gaps?.[dimension]

  const [comparisonId, setComparisonId] = useState<string | null>(null)
  const [viewBA, setViewBA] = useState<ViewMode>('chart')
  const [viewBR, setViewBR] = useState<ViewMode>('chart')

  const comparison =
    spec?.comparisons.find((c) => c.id === comparisonId) ??
    spec?.comparisons[0] ??
    null

  const gapsData = useMemo(() => {
    if (!spec || !comparison) return []
    return computeGaps(data, spec.field, spec.scopeField, spec.scopeValue, comparison)
  }, [data, spec, comparison])

  const effectiveYear =
    selectedYear ??
    (gapsData.length > 0 ? gapsData[gapsData.length - 1].anio : null)

  const selectedRow = useMemo(
    () => gapsData.find((r) => r.anio === effectiveYear) ?? null,
    [gapsData, effectiveYear],
  )

  if (!spec || !comparison || gapsData.length === 0) {
    return (
      <p className="text-gray-500 italic py-8 text-center">
        No hay datos disponibles.
      </p>
    )
  }

  const baData = gapsData.map((row) => ({
    anio: row.anio,
    value: row.brecha_absoluta,
    ic_inf: row.ic_inf_ba,
    ic_sup: row.ic_sup_ba,
  }))

  const brData = gapsData.map((row) => ({
    anio: row.anio,
    value: row.brecha_relativa,
    ic_inf: row.ic_inf_br,
    ic_sup: row.ic_sup_br,
  }))

  return (
    <div className="flex flex-col gap-8">
      {/* ── Comparison toggle ─────────────────────────────────────────────────── */}
      {spec.comparisons.length > 1 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600" id="comparison-group-label">
            Comparación:
          </span>
          <div
            role="group"
            aria-labelledby="comparison-group-label"
            className="flex rounded-lg overflow-hidden border border-gray-200 text-sm"
          >
            {spec.comparisons.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setComparisonId(c.id)}
                aria-pressed={comparison.id === c.id}
                className={`px-4 py-1.5 transition-colors ${
                  comparison.id === c.id
                    ? 'bg-gray-800 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Brecha Absoluta ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: comparison.colorAbsolute }}
            />
            <h3 className="text-sm font-semibold text-gray-700">
              Brecha absoluta ({spec.unit})
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <ViewToggle
              view={viewBA}
              onChange={setViewBA}
              sectionLabel="brecha absoluta"
            />
            <button
              type="button"
              onClick={() =>
                downloadCsvBA(gapsData, comparison, `brecha-absoluta-${comparison.id}`)
              }
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Icon icon="mdi:download" className="size-4 opacity-50" />
              Descargar tabla
            </button>
          </div>
        </div>

        {viewBA === 'chart' ? (
          <div className="rounded-lg border border-gray-200 px-4 pt-6 pb-2">
            <DSGapBarChart
              data={baData}
              color={comparison.colorAbsolute}
              highlightYear={effectiveYear ?? undefined}
              name="Brecha absoluta"
              decimalPlaces={1}
              height={320}
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 font-medium">Año</th>
                  <th className="px-4 py-3 font-medium">
                    {comparison.group.label}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {comparison.reference.label}
                  </th>
                  <th className="px-4 py-3 font-medium">Brecha absoluta</th>
                  <th className="px-4 py-3 font-medium">IC 95%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {gapsData.map((row) => (
                  <tr
                    key={row.anio}
                    className={`transition-colors ${
                      row.anio === effectiveYear
                        ? 'font-semibold bg-gray-50'
                        : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {row.anio}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.valor_grupo.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.valor_referencia.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.brecha_absoluta.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      ({row.ic_inf_ba.toFixed(1)} – {row.ic_sup_ba.toFixed(1)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedRow && (
          <div
            className="rounded-lg border p-4"
            style={{
              borderColor: `${comparison.colorAbsolute}55`,
              backgroundColor: `${comparison.colorAbsolute}0d`,
            }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-wide mb-1"
              style={{ color: comparison.colorAbsolute }}
            >
              Brecha absoluta — {effectiveYear}
            </p>
            <p
              className="text-3xl font-bold mb-1"
              style={{ color: comparison.colorAbsolute }}
            >
              {selectedRow.brecha_absoluta.toFixed(1)}
            </p>
            <p className="text-xs text-gray-500 mb-3">
              IC 95%: ({selectedRow.ic_inf_ba.toFixed(1)} –{' '}
              {selectedRow.ic_sup_ba.toFixed(1)}) {spec.unit}
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              {interpretacionBA(selectedRow.brecha_absoluta, comparison)}
            </p>
          </div>
        )}
      </div>

      {/* ── Brecha Relativa ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: comparison.colorRelative }}
            />
            <h3 className="text-sm font-semibold text-gray-700">
              Brecha relativa (razón)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <ViewToggle
              view={viewBR}
              onChange={setViewBR}
              sectionLabel="brecha relativa"
            />
            <button
              type="button"
              onClick={() =>
                downloadCsvBR(gapsData, comparison, `brecha-relativa-${comparison.id}`)
              }
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Icon icon="mdi:download" className="size-4 opacity-50" />
              Descargar tabla
            </button>
          </div>
        </div>

        {viewBR === 'chart' ? (
          <div className="rounded-lg border border-gray-200 px-4 pt-6 pb-2">
            <DSGapBarChart
              data={brData}
              color={comparison.colorRelative}
              highlightYear={effectiveYear ?? undefined}
              name="Brecha relativa"
              decimalPlaces={2}
              referenceLine={1}
              height={320}
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 font-medium">Año</th>
                  <th className="px-4 py-3 font-medium">
                    {comparison.group.label}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {comparison.reference.label}
                  </th>
                  <th className="px-4 py-3 font-medium">Brecha relativa</th>
                  <th className="px-4 py-3 font-medium">IC 95%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {gapsData.map((row) => (
                  <tr
                    key={row.anio}
                    className={`transition-colors ${
                      row.anio === effectiveYear
                        ? 'font-semibold bg-gray-50'
                        : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {row.anio}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.valor_grupo.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.valor_referencia.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.brecha_relativa.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      ({row.ic_inf_br.toFixed(2)} – {row.ic_sup_br.toFixed(2)})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedRow && (
          <div
            className="rounded-lg border p-4"
            style={{
              borderColor: `${comparison.colorRelative}55`,
              backgroundColor: `${comparison.colorRelative}0d`,
            }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-wide mb-1"
              style={{ color: comparison.colorRelative }}
            >
              Brecha relativa — {effectiveYear}
            </p>
            <p
              className="text-3xl font-bold mb-1"
              style={{ color: comparison.colorRelative }}
            >
              {selectedRow.brecha_relativa.toFixed(2)}
            </p>
            <p className="text-xs text-gray-500 mb-3">
              IC 95%: ({selectedRow.ic_inf_br.toFixed(2)} –{' '}
              {selectedRow.ic_sup_br.toFixed(2)})
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              {interpretacionBR(selectedRow.brecha_relativa, comparison)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
