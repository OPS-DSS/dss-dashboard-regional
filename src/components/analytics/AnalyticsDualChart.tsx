import { DSLineChart } from '@ops-dss/charts/line-chart'
import type { LineChartData } from '@ops-dss/charts/line-chart'
import type { AnalyticsRow, AnalyticsIndicatorKey } from '@/lib/parquet'
import { indicators } from '@/config/general'
import type { IndicatorMeta } from '@/config/general'

const indicatorsBySlug = Object.fromEntries(
  indicators.map((i) => [i.slug, i]),
) as Record<AnalyticsIndicatorKey, IndicatorMeta>

interface AnalyticsDualChartProps {
  priority: IndicatorMeta
  data: AnalyticsRow[]
  selectedIndicator?: AnalyticsIndicatorKey
  selectedYear?: number | null
  isFullscreen?: boolean
}

export const AnalyticsDualChart = ({
  data,
  selectedIndicator = indicators[0]?.slug ?? '',
  selectedYear,
  isFullscreen = false,
  priority,
}: AnalyticsDualChartProps) => {
  const chartHeight = isFullscreen
    ? Math.max(180, Math.floor((window.innerHeight - 260) / 2))
    : 320
  if (!data || data.length === 0) {
    return (
      <p className="text-gray-500 italic py-8 text-center">
        No hay datos disponibles.
      </p>
    )
  }

  const indicatorMeta = indicatorsBySlug[selectedIndicator]
  const priorityData = data.map((row) => ({
    anio: row.anio,
    valor: row.valor,
  }))
  const indicatorData: LineChartData[] = data.flatMap((row) => {
    const raw = Number(row[selectedIndicator])

    return Number.isFinite(raw)
      ? [
          {
            anio: row.anio,
            [selectedIndicator]: raw * 100,
          },
        ]
      : []
  })

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-gray-900 mr-8">
        Tendencias temporales
      </h2>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <DSLineChart
            data={priorityData}
            xAxisKey="anio"
            lines={[
              {
                dataKey: 'valor',
                name: `${priority.axisLabel}`,
                color: '#e11d48',
              },
            ]}
            height={chartHeight}
            xAxisLabel="Año"
            yAxisLabel={priority.axisLabel}
            yAxisDomain={[0, 100]}
            highlightX={selectedYear ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-2">
          <DSLineChart
            data={indicatorData}
            xAxisKey="anio"
            lines={[
              {
                dataKey: selectedIndicator,
                name: indicatorMeta.label,
                color: indicatorMeta.color,
              },
            ]}
            height={chartHeight}
            xAxisLabel="Año"
            yAxisLabel={indicatorMeta.axisLabel}
            yAxisDomain={[0, 100]}
            highlightX={selectedYear ?? undefined}
          />
        </div>
      </div>
    </div>
  )
}
