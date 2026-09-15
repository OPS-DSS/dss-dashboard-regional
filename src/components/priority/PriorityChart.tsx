import { useState, useMemo } from 'react'
import { DSLineChart } from '@ops-dss/charts/line-chart'
import type { PriorityRow } from '@/lib/parquet'
import { ExpandablePanel } from '@/components/ExpandablePanel'
import { Icon } from '@iconify/react'
import { app } from '@/config/general'
import type { IndicatorMeta, IndicatorStratifier } from '@/config/general'

const TOTAL_LABEL = 'Total'
const DEFAULT_COLOR = '#6b7280'

// ── Data pivot ────────────────────────────────────────────────────────────────

/**
 * Keep only the rows that vary along `stratifier` (or the fully aggregated
 * rows for the 'total' view): the selected stratifier column must not be at
 * its aggregate sentinel, while every other configured stratifier column must be.
 */
function pivotData(
  rows: PriorityRow[],
  stratifier: IndicatorStratifier,
  stratifiers: IndicatorStratifier[],
  priority: IndicatorMeta,
) {
  const scheme = priority.scheme ?? []

  const filtered = rows.filter((r) =>
    stratifiers.every((s) => {
      const value = r[s]
      if (value === undefined) return true
      const total = scheme.find((c) => c.name === s)?.aggregate ?? TOTAL_LABEL
      return s === stratifier ? value !== total : value === total
    }),
  )

  const byYear = new Map<number, Record<string, number>>()
  const keySet = new Set<string>()

  for (const row of filtered) {
    const key = stratifier === 'total' ? app.local : String(row[stratifier])

    keySet.add(key)
    if (!byYear.has(row.anio)) byYear.set(row.anio, {})
    byYear.get(row.anio)![key] = row.valor
  }

  const chartData = Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([anio, vals]) => ({ anio, ...vals }))

  // Value order and colors come from the active stratifier column's config.
  const activeColumn = scheme.find((c) => c.name === stratifier)
  const orderArray = activeColumn?.values ?? null
  const colors = activeColumn?.colors ?? {}

  const keys = Array.from(keySet).sort((a, b) => {
    if (orderArray) return orderArray.indexOf(a) - orderArray.indexOf(b)
    return a.localeCompare(b, 'es')
  })

  const lines = keys.map((key) => ({
    dataKey: key,
    name: key,
    color:
      stratifier === 'total'
        ? (priority.totalColor ?? DEFAULT_COLOR)
        : (colors[key] ?? DEFAULT_COLOR),
  }))

  return { chartData, lines, keys }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PriorityChartProps {
  data: PriorityRow[]
  priority: IndicatorMeta
  csvPath?: string
  highlightYear?: number
  stratifier: IndicatorStratifier
  onStratifierChange: (s: IndicatorStratifier) => void
}

export const PriorityChart = ({
  data,
  priority,
  csvPath,
  highlightYear,
  stratifier,
  onStratifierChange: setStratifier,
}: PriorityChartProps) => {
  const [view, setView] = useState<'chart' | 'table'>('chart')

  const stratifiers = (priority.stratifiers ?? []) as IndicatorStratifier[]

  const { chartData, lines, keys } = useMemo(
    () => pivotData(data, stratifier, stratifiers, priority),
    [data, stratifier, stratifiers, priority],
  )

  // 'total' (no stratification) is always available; other options, order,
  // and labels come from the indicator's configured stratifiers/scheme.
  const stratifierOptions: { value: IndicatorStratifier; label: string }[] = [
    { value: 'total', label: TOTAL_LABEL },
    ...stratifiers.map((s) => ({
      value: s,
      label: priority.scheme?.find((c) => c.name === s)?.label ?? s,
    })),
  ]

  if (!data || data.length === 0) {
    return (
      <p className="text-gray-500 italic py-8 text-center">
        No hay datos disponibles.
      </p>
    )
  }

  return (
    <div style={{ width: '100%', margin: '0 auto' }}>
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
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

          {/* ── Stratifier selector ──────────────────────────────────────────────── */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
            {stratifierOptions.map(({ value, label }) => (
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

          <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* ── Chart or Table ─────────────────────────────────────────────────── */}
      {view === 'chart' ? (
        <ExpandablePanel className="relative border rounded-lg px-4 pt-6">
          {(isFullscreen) => (
            <div>
              <DSLineChart
                data={chartData}
                xAxisKey="anio"
                lines={lines}
                height={
                  isFullscreen ? Math.max(300, window.innerHeight - 200) : 400
                }
                xAxisLabel="Año"
                yAxisLabel={priority.axisLabel}
                yAxisDomain={
                  priority.slug === 'gini' ||
                  priority.axisLabel.includes('%') ||
                  priority.label.includes('%') ||
                  priority.title.includes('%')
                    ? [0, 100]
                    : ['auto', 'auto']
                }
                highlightX={highlightYear}
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
