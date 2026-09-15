import { useMemo, useState } from 'react'
import { DSScatterChart } from '@ops-dss/charts/scatter-chart'
import { DSLineChart } from '@ops-dss/charts/line-chart'
import { DSForestPlot } from '@ops-dss/charts/forest-plot'
import { DSChoroplethMap } from '@ops-dss/charts/choropleth-map'
import { ExpandablePanel } from '@/components/ExpandablePanel'
import { indicators, priorities } from '@/config/general'
import type { ForestPlotDataRow, AnalyticsRow, ScatterRow } from '@/lib/parquet'

interface Props {
  forestPlotData: ForestPlotDataRow[]
  analyticsData: AnalyticsRow[]
  scatterData: ScatterRow[]
}

export const AnalyticsPageContent = ({ forestPlotData, analyticsData, scatterData }: Props) => {
  const availablePriorities = priorities.filter((p) =>
    forestPlotData.some((r) => r.priorizado === p.slug),
  )
  const [prioritySlug, setPrioritySlug] = useState(availablePriorities[0]?.slug ?? priorities[0]?.slug ?? '')
  const priority = priorities.find((p) => p.slug === prioritySlug) ?? priorities[0]

  const years = useMemo(() => [...new Set(
    forestPlotData
      .filter((r) => r.priorizado === priority?.slug)
      .map((r) => Number(r.anio)),
  )].sort((a, b) => b - a), [forestPlotData, priority])

  const [year, setYear] = useState<number | null>(null)
  const effectiveYear = year !== null && years.includes(year) ? year : (years[0] ?? null)

  const top10 = useMemo(() =>
    forestPlotData
      .filter((r) =>
        r.priorizado === priority?.slug &&
        r.anio === effectiveYear &&
        Number(r.rank_abs) <= 10
      )
      .sort((a, b) => Number(a.rank_abs) - Number(b.rank_abs)),
    [forestPlotData, priority, effectiveYear],
  )

  const [selectedDss, setSelectedDss] = useState('')
  const [mapMode, setMapMode] = useState<'bivariate' | 'priority'>('bivariate')
  const [secondaryDss, setSecondaryDss] = useState('')
  const activeDssSlug = top10.some((r) => r.indicador === selectedDss)
    ? selectedDss
    : (top10[0]?.indicador ?? '')
  const activeDss = indicators.find((i) => i.slug === activeDssSlug)

  const points = scatterData.filter((r) =>
    r.priorizado === priority?.slug &&
    r.dss === activeDssSlug &&
    r.anio === effectiveYear
  )

  const healthTrend = useMemo(() => {
    if (!priority) return []
    const rows = analyticsData.filter((r) => r.tipo === 'priorizado' && r.indicador === priority.slug)
    const grouped = new Map<number, number[]>()
    rows.forEach((r) => {
      if (!grouped.has(r.anio)) grouped.set(r.anio, [])
      grouped.get(r.anio)!.push(Number(r.valor))
    })
    return [...grouped].map(([anio, values]) => ({
      anio,
      valor: values.reduce((a, b) => a + b, 0) / values.length,
    })).sort((a, b) => a.anio - b.anio)
  }, [analyticsData, priority])

  const dssTrend = useMemo(() => {
    if (!activeDss) return []
    const rows = analyticsData.filter((r) => r.tipo === 'dss' && r.indicador === activeDss.slug)
    const grouped = new Map<number, number[]>()
    rows.forEach((r) => {
      if (!grouped.has(r.anio)) grouped.set(r.anio, [])
      grouped.get(r.anio)!.push(Number(r.valor))
    })
    return [...grouped].map(([anio, values]) => ({
      anio,
      valor: values.reduce((a, b) => a + b, 0) / values.length,
    })).sort((a, b) => a.anio - b.anio)
  }, [analyticsData, activeDss])

  if (!priority || forestPlotData.length === 0) {
    return <p className="text-gray-500 italic py-8">No hay resultados analíticos regionales disponibles.</p>
  }

  return (
    <div className="flex flex-col gap-5 mb-10">
      <div className="flex flex-wrap gap-4 items-end">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Indicador de salud priorizado
          <select value={priority.slug} onChange={(e) => { setPrioritySlug(e.target.value); setYear(null); setSelectedDss('') }} className="min-w-80 rounded-lg border border-gray-300 bg-white px-3 py-2">
            {availablePriorities.map((p) => <option key={p.slug} value={p.slug}>{p.title}</option>)}
          </select>
        </label>
      </div>

      {years.length > 1 && (
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm py-2 border-b border-gray-100 overflow-x-auto">
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm w-fit">
            {years.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => { setYear(yr); setSelectedDss('') }}
                className={`px-3 py-1 transition-colors ${
                  yr === effectiveYear
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <ExpandablePanel className="relative border rounded-lg p-4">
          <h2 className="font-bold">Correlaciones con {priority.title}</h2>
          <p className="text-xs text-gray-500 mb-4">Top 10 calculado en R por |ρ de Spearman|. IC95%, p y n corresponden a países con datos coincidentes.</p>
          <DSForestPlot
            data={top10.map((r) => ({
              indicador: r.indicador,
              label: indicators.find((i) => i.slug === r.indicador)?.label ?? r.indicador,
              correlacion: Number(r.correlacion),
              ci_lower: Number(r.ci_lower),
              ci_upper: Number(r.ci_upper),
              p_value: Number(r.p_value),
              n: Number(r.n),
            }))}
            selectedIndicator={activeDssSlug}
            onSelectIndicator={setSelectedDss}
            showSignificance
          />
        </ExpandablePanel>

        <ExpandablePanel className="relative border rounded-lg p-4">
          <h2 className="font-bold">Dispersión: {activeDss?.title ?? ''}</h2>
          <p className="text-xs text-gray-500 mb-3">Cada punto es un país de la Región de las Américas ({effectiveYear}).</p>
          {points.length > 0 ? <DSScatterChart data={points.map((p) => ({ x: Number(p.valor_dss), y: Number(p.valor_salud), label: p.territorio, size: 1 }))} xLabel={activeDss?.axisLabel ?? ''} yLabel={priority.axisLabel} width={760} /> : <p className="text-gray-500 italic py-8">Sin datos para esta combinación.</p>}
        </ExpandablePanel>

        <div className="xl:row-span-2">
        <ExpandablePanel className="relative border rounded-lg p-4 h-full">
          <h2 className="font-bold mb-3">Tendencias temporales</h2>
          <div className="flex flex-col gap-5">
            <DSLineChart data={healthTrend} xAxisKey="anio" lines={[{ dataKey: 'valor', name: priority.label, color: priority.color }]} xAxisLabel="Año" yAxisLabel={priority.axisLabel} height={260} highlightX={effectiveYear ?? undefined} />
            {activeDss && <DSLineChart data={dssTrend} xAxisKey="anio" lines={[{ dataKey: 'valor', name: activeDss.label, color: activeDss.color }]} xAxisLabel="Año" yAxisLabel={activeDss.axisLabel} height={260} highlightX={effectiveYear ?? undefined} />}
          </div>
        </ExpandablePanel>
        </div>

        <div className="xl:row-span-2">
        <ExpandablePanel className="relative border rounded-lg p-4 h-full">
          <h2 className="font-bold">Mapa bivariado</h2>
          <p className="text-xs text-gray-500 mb-3">
            Distribución conjunta de {priority.label} y {activeDss?.label ?? 'DSS'} en los países de las Américas ({effectiveYear}).
          </p>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
                <button
                  type="button"
                  onClick={() => setMapMode('bivariate')}
                  className={`px-4 py-1.5 transition-colors ${mapMode === 'bivariate' && !secondaryDss ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  Bivariado ODS
                </button>
                <button
                  type="button"
                  onClick={() => { setMapMode('priority'); setSecondaryDss('') }}
                  className={`px-4 py-1.5 transition-colors ${mapMode === 'priority' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  Solo {priority.label}
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 shrink-0">Bivariado DSS:</span>
                <select
                  value={secondaryDss}
                  onChange={(e) => { setSecondaryDss(e.target.value); if (e.target.value) setMapMode('bivariate') }}
                  className="text-sm rounded-lg border border-gray-200 bg-white text-gray-600 px-2 py-1.5"
                >
                  <option value="">Seleccionar indicador</option>
                  {indicators.filter((i) => i.slug !== activeDssSlug).map((i) => (
                    <option key={i.slug} value={i.slug}>{i.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {activeDss && effectiveYear !== null && (
              <a
                href={`/dss-dashboard-regional/data/csv/regional-scatter.csv`}
                download
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
              >
                ↓ Descargar tabla
              </a>
            )}
          </div>

          {activeDss && effectiveYear !== null ? (
            <DSChoroplethMap
              geojsonUrl={
                mapMode === 'priority'
                  ? `/dss-dashboard-regional/data/geojson/${priority.slug}-${effectiveYear}.geojson`
                  : secondaryDss
                    ? `/dss-dashboard-regional/data/geojson/bivariate-${activeDss.slug}-${secondaryDss}-${effectiveYear}.geojson`
                    : `/dss-dashboard-regional/data/geojson/bivariate-${priority.slug}-${activeDss.slug}-${effectiveYear}.geojson`
              }
              center={[5, -82]}
              zoom={2}
              height="820px"
              nameProperty="territorio"
              valueProperty="value"
              valueName={mapMode === 'priority' ? priority.axisLabel : activeDss.axisLabel}
              secondaryValueProperty={mapMode === 'bivariate' && !secondaryDss ? 'health_value' : undefined}
              secondaryValueName={mapMode === 'bivariate' && !secondaryDss ? priority.axisLabel : undefined}
            />
          ) : (
            <p className="text-gray-500 italic py-8">Sin mapa disponible.</p>
          )}

          <div className="flex flex-col gap-2 text-sm mt-3">
            <span className="font-medium text-gray-700">Leyenda:</span>
            {mapMode === 'bivariate' ? (
              <div className="flex items-center gap-3 flex-wrap text-xs text-gray-600">
                <span>Menor</span>
                {['#e8e8e8','#ace4e4','#5ac8c8','#dfb0d6','#a5b8c5','#5a9ab5','#be64ac','#8c62aa','#3b4994'].map((color) => (
                  <span key={color} style={{ width: 14, height: 14, background: color, border: '1px solid #9ca3af', display: 'inline-block' }} />
                ))}
                <span>Mayor</span>
                <span style={{ width: 14, height: 14, background: '#CCCCCC', border: '1px solid #9ca3af', display: 'inline-block', marginLeft: 8 }} />
                <span>Sin datos</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span>Menor</span>
                <span style={{ width: 120, height: 14, background: 'linear-gradient(to right, #FFFFB2, #FECC5C, #FD8D3C, #F03B20, #BD0026)', border: '1px solid #9ca3af', display: 'inline-block' }} />
                <span>Mayor</span>
                <span style={{ width: 14, height: 14, background: '#CCCCCC', border: '1px solid #9ca3af', display: 'inline-block', marginLeft: 8 }} />
                <span>Sin datos</span>
              </div>
            )}
          </div>
        </ExpandablePanel>
        </div>

      </div>
    </div>
  )
}
