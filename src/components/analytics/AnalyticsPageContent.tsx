import { useMemo, useState } from 'react'
import { DSScatterChart } from '@ops-dss/charts/scatter-chart'
import { ExpandablePanel } from '@/components/ExpandablePanel'
import { indicators, priorities } from '@/config/general'
import type { StratifiedRow } from '@/lib/parquet'

interface Props {
  allStratifiedData: Record<string, StratifiedRow[]>
}

type Pair = {
  iso3: string
  territorio: string
  x: number
  y: number
}

type CorrelationRow = {
  slug: string
  label: string
  correlation: number
  n: number
}

const MIN_COUNTRIES = 10

function rank(values: number[]) {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  const ranks = Array(values.length).fill(0)
  let i = 0
  while (i < indexed.length) {
    let j = i
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j++
    const averageRank = (i + j + 2) / 2
    for (let k = i; k <= j; k++) ranks[indexed[k].index] = averageRank
    i = j + 1
  }
  return ranks
}

function pearson(x: number[], y: number[]) {
  if (x.length !== y.length || x.length < 2) return NaN
  const mx = x.reduce((a, b) => a + b, 0) / x.length
  const my = y.reduce((a, b) => a + b, 0) / y.length
  let numerator = 0
  let dx2 = 0
  let dy2 = 0
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx
    const dy = y[i] - my
    numerator += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  const denominator = Math.sqrt(dx2 * dy2)
  return denominator === 0 ? NaN : numerator / denominator
}

function spearman(pairs: Pair[]) {
  return pearson(rank(pairs.map((p) => p.x)), rank(pairs.map((p) => p.y)))
}

function pairsForYear(
  priorityRows: StratifiedRow[],
  dssRows: StratifiedRow[],
  year: number,
): Pair[] {
  const priority = new Map<string, StratifiedRow>()
  for (const row of priorityRows) {
    if (row.anio === year && row.iso3) priority.set(String(row.iso3), row)
  }

  const pairs: Pair[] = []
  for (const row of dssRows) {
    if (row.anio !== year || !row.iso3) continue
    const health = priority.get(String(row.iso3))
    if (!health) continue
    const x = Number(row.valor)
    const y = Number(health.valor)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    pairs.push({
      iso3: String(row.iso3),
      territorio: String(row.territorio ?? health.territorio ?? row.iso3),
      x,
      y,
    })
  }
  return pairs
}

export const AnalyticsPageContent = ({ allStratifiedData }: Props) => {
  const [prioritySlug, setPrioritySlug] = useState(priorities[0]?.slug ?? '')
  const priority = priorities.find((p) => p.slug === prioritySlug) ?? priorities[0]

  const availableYears = useMemo(() => {
    if (!priority) return []
    const healthYears = new Set((allStratifiedData[priority.slug] ?? []).map((r) => r.anio))
    const years = new Set<number>()
    for (const dss of indicators) {
      for (const row of allStratifiedData[dss.slug] ?? []) {
        if (healthYears.has(row.anio)) years.add(row.anio)
      }
    }
    return [...years].sort((a, b) => b - a)
  }, [allStratifiedData, priority])

  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const effectiveYear =
    selectedYear !== null && availableYears.includes(selectedYear)
      ? selectedYear
      : (availableYears[0] ?? null)

  const correlations = useMemo<CorrelationRow[]>(() => {
    if (!priority || effectiveYear === null) return []
    const healthRows = allStratifiedData[priority.slug] ?? []
    return indicators
      .map((dss) => {
        const pairs = pairsForYear(
          healthRows,
          allStratifiedData[dss.slug] ?? [],
          effectiveYear,
        )
        return {
          slug: dss.slug,
          label: dss.label,
          correlation: pairs.length >= MIN_COUNTRIES ? spearman(pairs) : NaN,
          n: pairs.length,
        }
      })
      .filter((row) => Number.isFinite(row.correlation))
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
      .slice(0, 10)
  }, [allStratifiedData, priority, effectiveYear])

  const [selectedDssSlug, setSelectedDssSlug] = useState<string>('')
  const activeDssSlug =
    correlations.some((r) => r.slug === selectedDssSlug)
      ? selectedDssSlug
      : (correlations[0]?.slug ?? '')
  const activeDss = indicators.find((i) => i.slug === activeDssSlug)

  const scatterPairs = useMemo(() => {
    if (!priority || !activeDss || effectiveYear === null) return []
    return pairsForYear(
      allStratifiedData[priority.slug] ?? [],
      allStratifiedData[activeDss.slug] ?? [],
      effectiveYear,
    )
  }, [allStratifiedData, priority, activeDss, effectiveYear])

  if (!priority) {
    return <p className="text-gray-500 italic py-8">No hay indicadores de salud priorizados configurados.</p>
  }

  return (
    <div className="flex flex-col gap-6 mb-10">
      <div className="flex flex-wrap gap-4 items-end">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Indicador de salud priorizado
          <select
            value={priority.slug}
            onChange={(e) => {
              setPrioritySlug(e.target.value)
              setSelectedYear(null)
              setSelectedDssSlug('')
            }}
            className="min-w-80 rounded-lg border border-gray-300 bg-white px-3 py-2"
          >
            {priorities.map((item) => (
              <option key={item.slug} value={item.slug}>{item.title}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Año
          <select
            value={effectiveYear ?? ''}
            onChange={(e) => {
              setSelectedYear(Number(e.target.value))
              setSelectedDssSlug('')
            }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2"
          >
            {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </div>

      <ExpandablePanel className="relative border rounded-lg p-5">
        <h2 className="text-xl font-bold text-gray-900">10 DSS con mayor correlación</h2>
        <p className="text-sm text-gray-500 mt-1 mb-5">
          Correlación de Spearman entre países de la Región de las Américas para {effectiveYear}.
          Se ordena por magnitud absoluta, conservando el signo. Solo se calculan asociaciones con al menos {MIN_COUNTRIES} países con datos coincidentes.
        </p>

        {correlations.length === 0 ? (
          <p className="text-gray-500 italic py-6">No hay suficientes países con datos coincidentes para este año.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {correlations.map((row) => {
              const selected = row.slug === activeDssSlug
              return (
                <button
                  key={row.slug}
                  type="button"
                  onClick={() => setSelectedDssSlug(row.slug)}
                  className={`grid grid-cols-[minmax(14rem,1fr)_minmax(10rem,2fr)_5rem] gap-3 items-center rounded-lg px-3 py-2 text-left border ${selected ? 'border-gray-800 bg-gray-50' : 'border-transparent hover:bg-gray-50'}`}
                >
                  <span className="text-sm font-medium">{row.label}</span>
                  <span className="relative h-5 bg-gray-100 rounded">
                    <span className="absolute left-1/2 top-0 bottom-0 border-l border-gray-400" />
                    <span
                      className="absolute top-1 bottom-1 rounded bg-gray-700"
                      style={
                        row.correlation >= 0
                          ? { left: '50%', width: `${Math.abs(row.correlation) * 50}%` }
                          : { right: '50%', width: `${Math.abs(row.correlation) * 50}%` }
                      }
                    />
                  </span>
                  <span className="text-right text-sm tabular-nums">
                    {row.correlation.toFixed(2)} <span className="text-gray-400">(n={row.n})</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </ExpandablePanel>

      {activeDss && scatterPairs.length > 0 && (
        <ExpandablePanel className="relative border rounded-lg p-5">
          <h2 className="text-xl font-bold text-gray-900">
            {activeDss.title} vs {priority.title}
          </h2>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            Cada punto representa un país con información disponible en {effectiveYear}.
          </p>
          <DSScatterChart
            data={scatterPairs.map((p) => ({ x: p.x, y: p.y, label: p.territorio, size: 1 }))}
            xLabel={activeDss.axisLabel}
            yLabel={priority.axisLabel}
            width={900}
          />
        </ExpandablePanel>
      )}

      {activeDss && (
        <ExpandablePanel className="relative border rounded-lg p-5">
          <h2 className="text-xl font-bold text-gray-900">Evolución temporal de la relación</h2>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            Spearman anual entre {activeDss.label} y {priority.label}, utilizando países con datos coincidentes.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr><th className="px-3 py-2">Año</th><th className="px-3 py-2">ρ Spearman</th><th className="px-3 py-2">Países (n)</th></tr>
              </thead>
              <tbody>
                {availableYears.map((year) => {
                  const pairs = pairsForYear(allStratifiedData[priority.slug] ?? [], allStratifiedData[activeDss.slug] ?? [], year)
                  const rho = pairs.length >= MIN_COUNTRIES ? spearman(pairs) : NaN
                  return (
                    <tr key={year} className="border-t">
                      <td className="px-3 py-2">{year}</td>
                      <td className="px-3 py-2">{Number.isFinite(rho) ? rho.toFixed(3) : '—'}</td>
                      <td className="px-3 py-2">{pairs.length}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </ExpandablePanel>
      )}
    </div>
  )
}
