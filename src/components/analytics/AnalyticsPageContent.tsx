import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { DSForestPlot } from '@ops-dss/charts/forest-plot'
import { DSScatterChart } from '@ops-dss/charts/scatter-chart'
import { AnalyticsDualChart } from './AnalyticsDualChart'
import { ExpandablePanel } from '@/components/ExpandablePanel'
import { app, indicators } from '@/config/general'
import type { IndicatorMeta } from '@/config/general'
import type {
  ForestPlotDataRow,
  AnalyticsRow,
  ScatterRow,
  AnalyticsIndicatorKey,
} from '@/lib/parquet'

// ── Constants ─────────────────────────────────────────────────────────────────

// Loaded on demand — only imported when app.features.map is enabled, so
// deployments without geolocation data never fetch the map bundle.
const DSChoroplethMap = lazy(() =>
  import('@ops-dss/charts/choropleth-map').then((m) => ({
    default: m.DSChoroplethMap,
  })),
)

const indicatorsBySlug = Object.fromEntries(
  indicators.map((i) => [i.slug, i]),
) as Record<AnalyticsIndicatorKey, IndicatorMeta>

// Bivariate colour palette — BIVARIATE_COLORS[mmRow][indCol]
// mmRow  0 = low MM … 2 = high MM
// indCol 0 = low indicator … 2 = high indicator
const BIVARIATE_COLORS: string[][] = [
  ['#e8e8e8', '#ace4e4', '#5ac8c8'], // mm low
  ['#dfb0d6', '#a5b8c5', '#5a9ab5'], // mm med
  ['#be64ac', '#8c62aa', '#3b4994'], // mm high
]

// ── Types ─────────────────────────────────────────────────────────────────────

type TableRow = { name: string; value: number | null }

interface AnalyticsPageContentProps {
  priority: IndicatorMeta
  forestPlotData?: ForestPlotDataRow[]
  analyticsData?: AnalyticsRow[]
  scatterData?: ScatterRow[]
  geojsonUrls?: Record<AnalyticsIndicatorKey, Record<number, string>>
  priorityGeojsonUrls?: Record<number, string>
  dssBivariateGeojsonUrls?: Partial<
    Record<
      AnalyticsIndicatorKey,
      Partial<Record<AnalyticsIndicatorKey, Record<number, string>>>
    >
  >
  csvUrl?: string
}

// ── Bivariate legend ──────────────────────────────────────────────────────────

function BivariateLegend({
  indLabel,
  yAxisLabel,
}: {
  indLabel: string
  yAxisLabel: string
}) {
  const cellSize = 22

  return (
    <div className="flex items-end gap-3">
      <div
        className="flex flex-col items-center gap-1 shrink-0"
        style={{ width: 14 }}
      >
        <span
          className="text-gray-500 text-xs font-medium"
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            whiteSpace: 'nowrap',
            lineHeight: 1.1,
          }}
        >
          {yAxisLabel} →
        </span>
      </div>

      <div className="flex flex-col gap-1">
        {[...BIVARIATE_COLORS].reverse().map((mmRow, reversedIdx) => {
          const mmIdx = BIVARIATE_COLORS.length - 1 - reversedIdx
          return (
            <div key={mmIdx} className="flex gap-0.5">
              {mmRow.map((color, indIdx) => (
                <div
                  key={indIdx}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: color,
                    border: '1px solid rgba(0,0,0,0.08)',
                  }}
                  title={`${yAxisLabel}: ${mmIdx === 0 ? 'Baja' : mmIdx === 1 ? 'Media' : 'Alta'} / Indicador: ${indIdx === 0 ? 'Bajo' : indIdx === 1 ? 'Medio' : 'Alto'}`}
                />
              ))}
            </div>
          )
        })}

        <div
          className="flex items-center gap-1 mt-0.5"
          style={{ paddingLeft: 2 }}
        >
          <span className="text-gray-400 text-xs">Bajo</span>
          <div
            className="flex-1 border-t border-gray-400"
            style={{ marginTop: 1 }}
          />
          <span className="text-gray-400 text-xs">→</span>
        </div>

        <div className="text-center">
          <span
            className="text-gray-500 text-xs font-medium"
            style={{ whiteSpace: 'nowrap' }}
          >
            {indLabel}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export const AnalyticsPageContent = ({
  priority,
  forestPlotData,
  analyticsData,
  scatterData,
  geojsonUrls,
  priorityGeojsonUrls,
  dssBivariateGeojsonUrls,
  csvUrl,
}: AnalyticsPageContentProps) => {
  const [selectedIndicator, setSelectedIndicator] =
    useState<AnalyticsIndicatorKey>(indicators[0]?.slug ?? '')

  const [isBivariate, setIsBivariate] = useState(true)
  // null = no DSS-vs-DSS mode; a key = show bivariate of selectedIndicator × selectedDssIndicator
  const [selectedDssIndicator, setSelectedDssIndicator] =
    useState<AnalyticsIndicatorKey | null>(null)

  const [view, setView] = useState<'map' | 'table'>('map')
  const [tableData, setTableData] = useState<TableRow[]>([])
  const [tableLoading, setTableLoading] = useState(false)

  // ── Year selection ──────────────────────────────────────────────────────────

  // Derive available years from whichever datasets are loaded (sorted
  // descending for display) — scatter alone isn't a reliable source since
  // it's gated behind its own feature flag and may be empty.
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    for (const r of analyticsData ?? []) years.add(r.anio)
    for (const r of scatterData ?? []) years.add(r.anio)
    for (const r of forestPlotData ?? []) years.add(r.anio)
    return [...years].sort((a, b) => b - a)
  }, [analyticsData, scatterData, forestPlotData])

  const lastYear = availableYears[0] ?? null

  // selectedYear === null means "use lastYear" (default, pre-selected)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const effectiveYear: number | null = selectedYear ?? lastYear

  // Reset DSS indicator choice whenever the forest-plot selection changes so the
  // dropdown never holds the same key as selectedIndicator.
  useEffect(() => {
    setSelectedDssIndicator(null)
  }, [selectedIndicator])

  // ── Derived values ─────────────────────────────────────────────────────────

  const hasData =
    (forestPlotData && forestPlotData.length > 0) ||
    (analyticsData && analyticsData.length > 0) ||
    (scatterData && scatterData.length > 0)

  const selectedMeta = indicatorsBySlug[selectedIndicator]

  // Forest plot: filter to the selected year; rows without data for this year
  // are simply absent (the R script skips indicator-year combos with n < 4).
  const forestPlotForYear = useMemo(() => {
    if (!forestPlotData || effectiveYear === null) return forestPlotData ?? []
    return forestPlotData.filter((r) => r.anio === effectiveYear)
  }, [forestPlotData, effectiveYear])

  const scatterPoints =
    scatterData && effectiveYear !== null
      ? scatterData
          .filter((r) => r.anio === effectiveYear)
          .map((r) => ({
            x: (r[selectedIndicator] as number) * 100,
            y: r.valor,
            label: r.territorio,
            size: r.nacimientos,
          }))
          .filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y))
      : []

  // 3 map modes:
  //   DSS bivariate  — selectedDssIndicator is set
  //   MM bivariate   — selectedDssIndicator is null && isBivariate
  //   Solo MM        — selectedDssIndicator is null && !isBivariate
  const activeGeojsonUrl =
    effectiveYear !== null
      ? selectedDssIndicator
        ? dssBivariateGeojsonUrls?.[selectedIndicator]?.[
            selectedDssIndicator
          ]?.[effectiveYear]
        : isBivariate
          ? geojsonUrls?.[selectedIndicator]?.[effectiveYear]
          : priorityGeojsonUrls?.[effectiveYear]
      : undefined

  const isDssBivariate = selectedDssIndicator !== null
  const dssSecondaryMeta = selectedDssIndicator
    ? indicatorsBySlug[selectedDssIndicator]
    : null

  // For the map's valueName / secondaryValueName
  const mapValueName =
    !isBivariate && !isDssBivariate ? priority.axisLabel : selectedMeta.label
  const mapSecondaryValueName = isDssBivariate
    ? dssSecondaryMeta!.label
    : isBivariate
      ? priority.axisLabel
      : undefined

  const tableColumnLabel =
    isDssBivariate || isBivariate ? selectedMeta.label : priority.axisLabel

  // DSS indicator values in GeoJSON are in 0-1 range; display as percentages
  const isDssValue = isBivariate || isDssBivariate
  const mapValueFormatter = isDssValue
    ? (v: number) => (v * 100).toFixed(1) + '%'
    : undefined
  const formatTableValue = isDssValue
    ? (v: number) => (v * 100).toFixed(1) + '%'
    : (v: number) => v.toFixed(2)

  // All indicator options except the currently selected one (for the DSS selector)
  const dssOptions = (
    Object.entries(indicatorsBySlug) as [AnalyticsIndicatorKey, IndicatorMeta][]
  ).filter(([key]) => key !== selectedIndicator)

  // ── Map / table handlers ───────────────────────────────────────────────────

  const fetchTableData = (url: string) => {
    setTableLoading(true)
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((geojson) => {
        const rows: TableRow[] = (geojson.features ?? [])
          .map(
            (f: { properties: { Territorio?: string; value?: number } }) => ({
              name: f.properties.Territorio ?? '',
              value: f.properties.value ?? null,
            }),
          )
          .sort((a: TableRow, b: TableRow) => a.name.localeCompare(b.name))
        setTableData(rows)
        setTableLoading(false)
      })
      .catch(() => setTableLoading(false))
  }

  useEffect(() => {
    if (view === 'table' && activeGeojsonUrl) {
      fetchTableData(activeGeojsonUrl)
    }
  }, [activeGeojsonUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleViewChange = (nextView: 'map' | 'table') => {
    setView(nextView)
    if (nextView === 'table' && activeGeojsonUrl) {
      fetchTableData(activeGeojsonUrl)
    }
  }

  const handleBivariateToggle = (next: boolean) => {
    setSelectedDssIndicator(null)
    setIsBivariate(next)
    if (view === 'table') {
      const nextUrl =
        effectiveYear !== null
          ? next
            ? geojsonUrls?.[selectedIndicator]?.[effectiveYear]
            : priorityGeojsonUrls?.[effectiveYear]
          : undefined
      if (nextUrl) fetchTableData(nextUrl)
    }
  }

  const handleDssIndicatorChange = (key: AnalyticsIndicatorKey | null) => {
    setSelectedDssIndicator(key)
    if (view === 'table') {
      const nextUrl =
        effectiveYear !== null
          ? key
            ? dssBivariateGeojsonUrls?.[selectedIndicator]?.[key]?.[
                effectiveYear
              ]
            : isBivariate
              ? geojsonUrls?.[selectedIndicator]?.[effectiveYear]
              : priorityGeojsonUrls?.[effectiveYear]
          : undefined
      if (nextUrl) fetchTableData(nextUrl)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!hasData) {
    return (
      <p className="text-gray-500 italic py-8 text-center">
        No hay datos disponibles.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4 mb-10">
      {/* ── Year selector ── */}
      {availableYears.length > 1 && (
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm py-2 border-b border-gray-100 -mx-2 px-2 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 overflow-x-auto">
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm w-fit">
            {availableYears.map((yr) => {
              const isActive = yr === effectiveYear
              return (
                <button
                  key={yr}
                  onClick={() => setSelectedYear(yr === lastYear ? null : yr)}
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

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex flex-col md:basis-1/2 flex-1 gap-4">
          {/* ── Forest plot ── */}
          {forestPlotData && forestPlotData.length > 0 && (
            <ExpandablePanel>
              <h2 className="text-xl font-bold text-gray-900 mr-8">
                Correlaciones con {priority.title}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Correlación de Spearman entre cada indicador y la problemática
                priorizada (barrios,{' '}
                {effectiveYear !== null
                  ? ` ${effectiveYear}`
                  : 'último año disponible'}
                ). Seleccione un indicador para explorar su relación.
              </p>
              {forestPlotForYear.length > 0 ? (
                <DSForestPlot
                  data={forestPlotForYear}
                  selectedIndicator={selectedIndicator}
                  onSelectIndicator={(ind) =>
                    setSelectedIndicator(ind as AnalyticsIndicatorKey)
                  }
                />
              ) : (
                <p className="text-gray-400 italic text-sm py-6 text-center">
                  Sin datos suficientes para {effectiveYear}.
                </p>
              )}
            </ExpandablePanel>
          )}

          {/* ── Temporal trends ── */}
          {analyticsData && analyticsData.length > 0 && (
            <ExpandablePanel className="relative border rounded-lg p-4 flex flex-col gap-4">
              {(isFullscreen) => (
                <AnalyticsDualChart
                  priority={priority}
                  data={analyticsData}
                  selectedIndicator={selectedIndicator}
                  selectedYear={effectiveYear}
                  isFullscreen={isFullscreen}
                />
              )}
            </ExpandablePanel>
          )}
        </div>

        <div className="flex flex-col md:basis-1/2 gap-4 flex-1">
          {/* ── Scatter chart ── */}
          {scatterPoints.length > 0 && (
            <ExpandablePanel className="relative border rounded-lg p-4 flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mr-8">
                  Dispersión:{' '}
                  <span style={{ color: selectedMeta.color }}>
                    {selectedMeta.title}
                  </span>{' '}
                  vs {priority.axisLabel}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Cada punto es un barrio de {app.local} (
                  {effectiveYear !== null
                    ? `año ${effectiveYear}`
                    : 'último año disponible'}
                  ). El tamaño refleja el número de nacidos vivos. La línea
                  punteada muestra la tendencia lineal.
                </p>
              </div>
              <DSScatterChart
                data={scatterPoints}
                xLabel={selectedMeta.axisLabel}
                yLabel={priority.axisLabel}
                width={800}
              />
            </ExpandablePanel>
          )}

          {/* ── Map section ── */}
          {app.features.map && (
          <ExpandablePanel className="relative border rounded-lg p-4 flex flex-col gap-4">
            {(isFullscreen) => (
              <>
                <h2 className="text-xl font-bold text-gray-900 mr-8">
                  Mapa:{' '}
                  {isBivariate ? (
                    <>
                      <span style={{ color: selectedMeta.color }}>
                        {selectedMeta.title}
                      </span>{' '}
                      vs{' '}
                      <span>
                        {dssSecondaryMeta
                          ? dssSecondaryMeta.title
                          : priority.axisLabel}
                      </span>
                    </>
                  ) : isDssBivariate ? (
                    <>
                      <span style={{ color: selectedMeta.color }}>
                        {selectedMeta.label}
                      </span>{' '}
                      vs{' '}
                      <span>
                        {dssSecondaryMeta
                          ? dssSecondaryMeta.label
                          : priority.axisLabel}
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: selectedMeta.color }}>
                        Solo {priority.title}
                      </span>
                    </>
                  )}
                </h2>
                {/* Controls bar */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {/* Bivariate / solo toggle + DSS indicator selector */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
                      <button
                        onClick={() => handleBivariateToggle(true)}
                        className={`px-4 py-1.5 transition-colors ${
                          isBivariate && !isDssBivariate
                            ? 'bg-gray-800 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Bivariado
                      </button>
                      <button
                        onClick={() => handleBivariateToggle(false)}
                        className={`px-4 py-1.5 transition-colors ${
                          !isBivariate && !isDssBivariate
                            ? 'bg-gray-800 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Solo {priority.title}
                      </button>
                    </div>

                    {/* DSS indicator selector */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500 shrink-0">
                        Bivariado DSS:
                      </span>
                      <select
                        value={selectedDssIndicator ?? ''}
                        onChange={(e) =>
                          handleDssIndicatorChange(
                            e.target.value
                              ? (e.target.value as AnalyticsIndicatorKey)
                              : null,
                          )
                        }
                        className={`text-sm rounded-lg border px-2 py-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 ${
                          isDssBivariate
                            ? 'border-gray-800 bg-gray-800 text-white'
                            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <option value="">Seleccionar indicador</option>
                        {dssOptions.map(([key, meta]) => (
                          <option key={key} value={key}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
                      <button
                        onClick={() => handleViewChange('map')}
                        className={`px-4 py-1.5 transition-colors ${
                          view === 'map'
                            ? 'bg-gray-800 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Mapa
                      </button>
                      <button
                        onClick={() => handleViewChange('table')}
                        className={`px-4 py-1.5 transition-colors ${
                          view === 'table'
                            ? 'bg-gray-800 text-white'
                            : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        Tabla
                      </button>
                    </div>

                    {csvUrl && (
                      <a
                        href={csvUrl}
                        download
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Descargar Tabla
                      </a>
                    )}
                  </div>
                </div>

                {/* Map view */}
                {view === 'map' && (
                  <>
                    <Suspense
                      fallback={
                        <div
                          className="flex items-center justify-center text-gray-400 text-sm"
                          style={{
                            height: isFullscreen
                              ? 'calc(100vh - 280px)'
                              : '30em',
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
                        height={isFullscreen ? 'calc(100vh - 280px)' : '30em'}
                        nameProperty="Territorio"
                        valueProperty="value"
                        valueName={mapValueName}
                        secondaryValueProperty={
                          isDssBivariate || isBivariate
                            ? priority.bivariateValue
                            : undefined
                        }
                        secondaryValueName={mapSecondaryValueName}
                        valueFormatter={mapValueFormatter}
                      />
                    </Suspense>

                    {/* Legend */}
                    <div className="flex flex-col gap-2 text-sm">
                      <span className="font-medium text-gray-700">
                        Leyenda:
                      </span>

                      {isDssBivariate || isBivariate ? (
                        <div className="flex items-start gap-6 flex-wrap">
                          <BivariateLegend
                            indLabel={`${selectedMeta.label} →`}
                            yAxisLabel={
                              isDssBivariate
                                ? dssSecondaryMeta!.label
                                : priority.axisLabel
                            }
                          />
                          <div className="flex items-center gap-1.5 self-end">
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
                            <span className="text-gray-600 text-xs">
                              Sin datos
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 text-xs w-36 shrink-0">
                              {priority.title}
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
                            <span className="text-gray-600 text-xs">
                              Sin datos
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Table view */}
                {view === 'table' &&
                  (tableLoading ? (
                    <p className="text-gray-500 italic py-8 text-center">
                      Cargando datos…
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
                          <tr>
                            <th className="px-4 py-3 font-medium">Barrio</th>
                            <th className="px-4 py-3 font-medium">
                              {tableColumnLabel}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {tableData.map((row) => (
                            <tr
                              key={row.name}
                              className="bg-white hover:bg-gray-50 transition-colors"
                            >
                              <td className="px-4 py-3 font-medium text-gray-900">
                                {row.name}
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {row.value != null && Number.isFinite(row.value)
                                  ? formatTableValue(row.value)
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </>
            )}
          </ExpandablePanel>
          )}
        </div>
      </div>
    </div>
  )
}
