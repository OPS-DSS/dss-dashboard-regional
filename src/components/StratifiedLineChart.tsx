import { useState, useMemo, useRef, lazy, Suspense } from 'react'
import { DSLineChart } from '@ops-dss/charts/line-chart'
import type { StratifiedRow } from '@/lib/parquet'
import { app } from '@/config/general'
import type { IndicatorStratifier, IndicatorMeta } from '@/config/general'
import { ExpandablePanel } from './ExpandablePanel'
import { Icon } from '@iconify/react'

// Loaded on demand — only imported when app.features.map is enabled, so
// deployments without geolocation data never fetch the map bundle.
const DSChoroplethMap = lazy(() =>
  import('@ops-dss/charts/choropleth-map').then((m) => ({
    default: m.DSChoroplethMap,
  })),
)

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

  const byYear = new Map<number, Record<string, number>>()
  const keySet = new Set<string>()

  for (const row of filtered) {
    const key = stratifier === 'total' ? TOTAL : String(row[stratifier] ?? '')

    keySet.add(key)
    if (!byYear.has(row.anio)) byYear.set(row.anio, { anio: row.anio })
    byYear.get(row.anio)![key] = row.valor * 100
  }

  const chartData = Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([anio, vals]) => ({ anio, ...vals }))

  // Sort keys: age groups numerically, others alphabetically
  const keys = Array.from(keySet).sort((a, b) => {
    const na = parseInt(a)
    const nb = parseInt(b)
    if (!isNaN(na) && !isNaN(nb)) return na - nb
    return a.localeCompare(b, 'es')
  })

  const activeColumn = indicator.scheme?.find((c) => c.name === stratifier)
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
  const [stratifier, setStratifier] = useState<IndicatorStratifier>('total')
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [mapView, setMapView] = useState<'map' | 'table'>('map')
  const [mapTableData, setMapTableData] = useState<
    { name: string; value: number | null }[]
  >([])
  const [mapTableLoading, setMapTableLoading] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)

  // ── Year selection (shared between chart highlight and map) ───────────────
  const availableYears = useMemo(() => {
    if (!data || data.length === 0) return []
    return [...new Set(data.map((r) => r.anio))].sort((a, b) => b - a)
  }, [data])

  const lastYear = availableYears[0] ?? null
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const effectiveYear: number | null = selectedYear ?? lastYear

  const activeGeojsonUrl =
    geojsonUrls && effectiveYear !== null
      ? geojsonUrls[effectiveYear]
      : undefined

  const fetchMapTableData = (url: string) => {
    setMapTableLoading(true)
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((geojson) => {
        const rows = (geojson.features ?? [])
          .map(
            (f: { properties: { Territorio?: string; value?: number } }) => ({
              name: f.properties.Territorio ?? '',
              value: f.properties.value ?? null,
            }),
          )
          .sort(
            (
              a: { name: string; value: number | null },
              b: { name: string; value: number | null },
            ) => a.name.localeCompare(b.name),
          )
        setMapTableData(rows)
        setMapTableLoading(false)
      })
      .catch(() => setMapTableLoading(false))
  }

  const handleMapViewChange = (next: 'map' | 'table') => {
    setMapView(next)
    if (next === 'table' && activeGeojsonUrl) {
      fetchMapTableData(activeGeojsonUrl)
    }
  }

  const { chartData, lines, keys } = useMemo(
    () => pivotData(data, stratifier, stratifiers ?? [], indicator),
    [data, stratifier, stratifiers, indicator],
  )

  const hasMap =
    app.features.map && geojsonUrls && Object.keys(geojsonUrls).length > 0

  if (!data || data.length === 0) {
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
      {/* ── Sticky year selector ─────────────────────────────────────────────── */}
      {availableYears.length > 1 && (
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm py-2 border-b border-gray-100 -mx-2 px-2 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 overflow-x-auto mb-4">
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm w-fit">
            {availableYears.map((yr) => {
              const isActive = yr === effectiveYear
              return (
                <button
                  key={yr}
                  type="button"
                  onClick={() => {
                    const next = yr === lastYear ? null : yr
                    setSelectedYear(next)
                    if (mapView === 'table' && hasMap) {
                      const url = geojsonUrls![yr === lastYear ? lastYear! : yr]
                      if (url) fetchMapTableData(url)
                    }
                  }}
                  className={`px-3 py-1 text-sm transition-colors ${
                    isActive
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {yr}
                </button>
              )
            })}
          </div>
        </div>
      )}

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
                yAxisDomain={[0, 100]}
                highlightX={effectiveYear ?? undefined}
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

      {/* ── Map section ─────────────────────────────────────────────────────── */}
      {hasMap && (
        <section className="flex flex-col gap-4 mt-6">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
              <button
                type="button"
                onClick={() => handleMapViewChange('map')}
                className={`px-4 py-1.5 transition-colors ${
                  mapView === 'map'
                    ? 'bg-gray-800 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Mapa
              </button>
              <button
                type="button"
                onClick={() => handleMapViewChange('table')}
                className={`px-4 py-1.5 transition-colors ${
                  mapView === 'table'
                    ? 'bg-gray-800 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                Tabla
              </button>
            </div>
          </div>

          {mapView === 'map' && (
            <ExpandablePanel
              className="relative border rounded-lg p-4"
              positionToBottom={true}
            >
              {(isFullscreen) => (
                <>
                  <Suspense
                    fallback={
                      <div
                        className="flex items-center justify-center text-gray-400 text-sm"
                        style={{
                          height: isFullscreen ? 'calc(100vh - 180px)' : '30em',
                        }}
                      >
                        Cargando mapa…
                      </div>
                    }
                  >
                    <DSChoroplethMap
                      geojsonUrl={activeGeojsonUrl}
                      center={[2.3, -75.7]}
                      zoom={8}
                      height={isFullscreen ? 'calc(100vh - 180px)' : '30em'}
                      nameProperty="Territorio"
                      valueProperty="value"
                      valueName={yAxisLabel}
                      valueFormatter={(v) => (v * 100).toFixed(1) + '%'}
                    />
                  </Suspense>
                  <div className="flex flex-col gap-2 text-sm">
                    <span className="font-medium text-gray-700">Leyenda:</span>
                    <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs w-28 shrink-0">
                          {yAxisLabel}
                        </span>
                        <span className="text-gray-600 text-xs">Menor</span>
                        <div
                          style={{
                            width: 120,
                            height: 14,
                            background:
                              'linear-gradient(to right, #FFFFB2, #FECC5C, #FD8D3C, #F03B20, #BD0026)',
                            border: '1px solid #9ca3af',
                            borderRadius: 3,
                          }}
                        />
                        <span className="text-gray-600 text-xs">Mayor</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            background: '#CCCCCC',
                            border: '1px solid #9ca3af',
                            borderRadius: 3,
                            flexShrink: 0,
                          }}
                        />
                        <span className="text-gray-600 text-xs">Sin datos</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </ExpandablePanel>
          )}

          {mapView === 'table' &&
            (mapTableLoading ? (
              <p className="text-gray-500 italic py-8 text-center">
                Cargando datos…
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                    <tr>
                      <th className="px-4 py-3 font-medium">Barrio</th>
                      <th className="px-4 py-3 font-medium">{yAxisLabel}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {mapTableData.map((row) => (
                      <tr
                        key={row.name}
                        className="bg-white hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {row.name}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {row.value != null && Number.isFinite(row.value)
                            ? (row.value * 100).toFixed(1) + '%'
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </section>
      )}
    </div>
  )
}
