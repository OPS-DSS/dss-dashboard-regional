import { useState, useMemo, useRef } from 'react'
import { DSLineChart } from '@ops-dss/charts/line-chart'
import type { StratifiedRow } from '@/lib/parquet'
import { app } from '@/config/general'
import type { IndicatorStratifier, IndicatorMeta } from '@/config/general'
import { ExpandablePanel } from './ExpandablePanel'
import { Icon } from '@iconify/react'

// ── Canonical aggregate label ─────────────────────────────────────────────────
// Every stratifier column marks its aggregate rows with this sentinel.
const TOTAL = 'Total'

// ── Colour fallbacks ──────────────────────────────────────────────────────────
// Used only when the indicator's app.config.json scheme doesn't define a
// color for a given stratifier value.
const DEFAULT_TOTAL_COLOR = '#6b7280'
const FALLBACK_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#6366f1',
]

// ── Data pivot ────────────────────────────────────────────────────────────────

/**
 * Keep only the rows that vary along `stratifier` (or the fully aggregated
 * rows for the 'total' view): the selected stratifier column must not be at
 * its Total sentinel, while every other configured stratifier column must be.
 */
function pivotData(
  rows: StratifiedRow[],
  stratifier: IndicatorStratifier,
  stratifiers: IndicatorStratifier[],
  indicator: IndicatorMeta,
) {
  const filtered = rows.filter((r) =>
    stratifiers.every((s) => {
      const value = r[s]
      if (value === undefined) return true
      return s === stratifier ? value !== TOTAL : value === TOTAL
    }),
  )

  // DSS views show only the 15 most recent years actually available for the
  // selected country/indicator (not a fixed 15-calendar-year window).
  const years = [...new Set(filtered.map((r) => r.anio))]
    .sort((a, b) => b - a)
    .slice(0, 15)
  const keepYears = new Set(years)

  // Percentage indicators may arrive either as proportions (0–1) or already
  // expressed on a 0–100 scale. Convert only when the observed values are in
  // the proportion scale.
  const percentageIndicator =
    indicator.axisLabel.includes('%') ||
    indicator.label.includes('%') ||
    indicator.title.includes('%')
  const finiteValues = filtered
    .filter((r) => keepYears.has(r.anio))
    .map((r) => Number(r.valor))
    .filter(Number.isFinite)
  const convertToPercent =
    percentageIndicator &&
    finiteValues.length > 0 &&
    finiteValues.every((v) => v >= 0 && v <= 1)

  const displayValue = (value: number) =>
    convertToPercent ? value * 100 : value

  const byYear = new Map<number, Record<string, number>>()
  const keySet = new Set<string>()

  for (const row of filtered) {
    if (!keepYears.has(row.anio)) continue
    const key = stratifier === 'total' ? TOTAL : String(row[stratifier] ?? '')
    keySet.add(key)
    if (!byYear.has(row.anio)) byYear.set(row.anio, { anio: row.anio })
    byYear.get(row.anio)![key] = displayValue(Number(row.valor))
  }

  const chartData = Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([anio, vals]) => ({ anio, ...vals }))

  const keys = Array.from(keySet).sort((a, b) => {
    const na = parseInt(a)
    const nb = parseInt(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b, 'es')
  })

  const activeColumn = indicator.scheme?.find((col) => col.name === stratifier)
  const colors = activeColumn?.colors ?? {}

  const lines = keys.map((key, i) => ({
    dataKey: key,
    name: key,
    color:
      stratifier === 'total'
        ? (indicator.totalColor ?? DEFAULT_TOTAL_COLOR)
        : (colors[key] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]),
  }))

  return { chartData, lines, keys }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface StratifiedLineChartProps {
  data: StratifiedRow[]
  indicator: IndicatorMeta
  stratifiers?: IndicatorStratifier[]
  yAxisLabel?: string
  csvPath?: string
  geojsonUrls?: Record<number, string>
}

export const StratifiedLineChart = ({
  data,
  indicator,
  stratifiers,
  yAxisLabel = 'Valor',
  csvPath,
  geojsonUrls,
}: StratifiedLineChartProps) => {
  const selectedCountry =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('country')
      : null

  const selectedTerritory = selectedCountry || app.local

  const countryData = useMemo(
    () =>
      data.filter(
        (row) => String(row.territorio ?? '') === selectedTerritory,
      ),
    [data, selectedTerritory],
  )

  const [stratifier, setStratifier] = useState<IndicatorStratifier>('total')
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const chartRef = useRef<HTMLDivElement>(null)

  const { chartData, lines, keys } = useMemo(
    () => pivotData(countryData, stratifier, stratifiers ?? [], indicator),
    [countryData, stratifier, stratifiers, indicator],
  )


  if (!countryData || countryData.length === 0) {
    return (
      <p className="text-gray-500 italic py-8 text-center">
        No hay datos disponibles.
      </p>
    )
  }

  // Stratifier options come from the indicator's configured stratifiers;
  // labels come from each column's `label` in app.config.json, falling back
  // to the raw field name if a label isn't configured.
  const STRATIFIER_OPTIONS: { value: IndicatorStratifier; label: string }[] =
    [
      { value: 'total', label: 'Total' },
      ...(stratifiers ?? []).map((s) => ({
        value: s,
        label: indicator.scheme?.find((c) => c.name === s)?.label ?? s,
      })),
    ]

  return (
    <div style={{ width: '100%', margin: '0 auto' }}>
      {/* ── Stratifier selector ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between gap-1 mb-4">
        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
          <button
            type="button"
            onClick={() => setView('chart')}
            className={`px-4 py-1.5 transition-colors ${
              view === 'chart'
                ? 'bg-gray-800 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Gráfico
          </button>
          <button
            type="button"
            onClick={() => setView('table')}
            className={`px-4 py-1.5 transition-colors ${
              view === 'table'
                ? 'bg-gray-800 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Tabla
          </button>
        </div>

        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
          {STRATIFIER_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setStratifier(value)}
              className={`px-4 py-1.5 transition-colors ${
                stratifier === value
                  ? 'bg-gray-800 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {csvPath && (
          <a
            href={csvPath}
            download
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Icon icon="mdi:download" className="size-4 opacity-50" />
            Descargar tabla
          </a>
        )}
      </div>

      {/* ── Chart or Table ─────────────────────────────────────────────────── */}
      {view === 'chart' ? (
        <ExpandablePanel className="relative border rounded-lg px-4 pt-6">
          {(isFullscreen) => (
            <div ref={chartRef}>
              <DSLineChart
                data={chartData}
                xAxisKey="anio"
                lines={lines}
                height={
                  isFullscreen ? Math.max(300, window.innerHeight - 200) : 400
                }
                xAxisLabel="Año"
                yAxisLabel={yAxisLabel}
                yAxisDomain={['auto', 'auto']}
              />
            </div>
          )}
        </ExpandablePanel>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 font-medium">Año</th>
                {keys.map((k) => (
                  <th key={k} className="px-4 py-3 font-medium">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {chartData.map((row) => (
                <tr
                  key={row.anio}
                  className="bg-white hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.anio}
                  </td>
                  {keys.map((k) => {
                    const value = (row as Record<string, unknown>)[k]
                    return (
                      <td key={k} className="px-4 py-3 text-gray-600">
                        {typeof value === 'number' ? value.toFixed(1) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
