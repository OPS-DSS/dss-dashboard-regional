import type { AstroComponentFactory } from 'astro/runtime/server/index.js'

import PriorityInequity from '@/components/priority/PriorityInequity.astro'
import Analytics from '@/components/analytics/Analytics.astro'
import Welcome from '@/components/Welcome.astro'
import PrioritySDoH from '@/components/priority/PrioritySDoH.astro'
import PrioritySelector from '@/components/PrioritySelector.astro'
import StratifiedIndicator from '@/components/StratifiedIndicator.astro'

import type {
  PriorityRow,
  ForestPlotDataRow,
  AnalyticsRow,
  ScatterRow,
  StratifiedRow,
} from '@/lib/parquet'
import type { IndicatorStratifier } from '@/config/general'
import { app, priorities, indicators, indicatorSlugs } from '@/config/general'

export interface PageProps {
  title: string
  text: string
  dimension?: string
  subdimensions?: string[]
  pages: unknown[]
  slug: string | undefined
  date: Date
  source?: string
  data?: PriorityRow[]
  forestPlotData?: ForestPlotDataRow[]
  analyticsData?: AnalyticsRow[]
  scatterData?: ScatterRow[]
  stratifiedData?: StratifiedRow[]
  stratifiers?: IndicatorStratifier[]
}

type PropsResolver = (
  props: PageProps,
  baseUrl: string,
) => Record<string, unknown>

interface PageRegistryEntry {
  component: AstroComponentFactory
  resolveProps: PropsResolver
}

const csvUrl = (url: string, path: string) => `${url}/data/csv/${path}`
const geojsonUrl = (url: string, path: string) => `${url}/data/geojson/${path}`

/** Years present in a dataset — geojson assets are generated per year. */
const dataYears = (rows: { anio: number }[] = []) => [
  ...new Set(rows.map((r) => r.anio)),
]

const staticEntries: Record<string, PageRegistryEntry> = {
  // ─── No slug (home) ────────────────────────────────────────────────────────
  '': {
    component: Welcome,
    resolveProps: ({ text }) => ({ text }),
  },

  // ─── Section index pages ───────────────────────────────────────────────────
  'analisis-de-inequidad': {
    component: PrioritySelector,
    resolveProps: ({ title, text, slug }) => ({ title, text, section: slug }),
  },
  'determinantes-de-la-salud': {
    component: PrioritySelector,
    resolveProps: ({ title, text, slug }) => ({ title, text, section: slug }),
  },
  analisis: {
    component: PrioritySelector,
    resolveProps: ({ title, text, slug }) => ({ title, text, section: slug }),
  },
}

// ─── Priority indicator pages (one set per configured priority) ──────────────

const priorityEntries: Record<string, PageRegistryEntry> = Object.fromEntries(
  priorities.flatMap((priority) => [
    [
      `determinantes-de-la-salud/${priority.slug}`,
      {
        component: PrioritySDoH,
        resolveProps: ({ title, text }) => ({ title, text }),
      },
    ],
    [
      `analisis-de-inequidad/${priority.slug}`,
      {
        component: PriorityInequity,
        resolveProps: ({ title, text, data, source }, baseUrl) => ({
          title,
          text,
          data,
          source,
          csvPath: csvUrl(baseUrl, `${priority.slug}.csv`),
          priority,
        }),
      },
    ],
    [
      `analisis/${priority.slug}`,
      {
        component: Analytics,
        resolveProps: (
          { title, text, forestPlotData, analyticsData, scatterData },
          baseUrl,
        ) => {
          const years = dataYears(analyticsData)

          const geojsonUrls = app.features.map
            ? (Object.fromEntries(
                indicatorSlugs.map((ind) => [
                  ind,
                  Object.fromEntries(
                    years.map((yr) => [
                      yr,
                      geojsonUrl(baseUrl, `bivariate-${ind}-${yr}.geojson`),
                    ]),
                  ),
                ]),
              ) as Record<string, Record<number, string>>)
            : undefined

          const priorityGeojsonUrls = app.features.map
            ? (Object.fromEntries(
                years.map((yr) => [
                  yr,
                  geojsonUrl(baseUrl, `${priority.slug}-${yr}.geojson`),
                ]),
              ) as Record<number, string>)
            : undefined

          const dssBivariateGeojsonUrls = app.features.map
            ? Object.fromEntries(
                indicatorSlugs.map((ind_x) => [
                  ind_x,
                  Object.fromEntries(
                    indicatorSlugs
                      .filter((ind_y) => ind_y !== ind_x)
                      .map((ind_y) => [
                        ind_y,
                        Object.fromEntries(
                          years.map((yr) => [
                            yr,
                            geojsonUrl(
                              baseUrl,
                              `bivariate-dss-${ind_x}-${ind_y}-${yr}.geojson`,
                            ),
                          ]),
                        ),
                      ]),
                  ),
                ]),
              )
            : undefined

          const scatterCsv = app.features.scatter
            ? app.datasets?.scatter?.file.replace(/\.parquet$/, '.csv')
            : undefined

          return {
            priority,
            title,
            text,
            forestPlotData,
            analyticsData,
            scatterData,
            geojsonUrls,
            priorityGeojsonUrls,
            dssBivariateGeojsonUrls,
            csvUrl: scatterCsv ? csvUrl(baseUrl, scatterCsv) : undefined,
          }
        },
      },
    ],
  ]),
)

// ─── Stratified indicator pages (one per configured indicator) ───────────────

const indicatorEntries: Record<string, PageRegistryEntry> = Object.fromEntries(
  indicators.map((ind) => [
    ind.slug,
    {
      component: StratifiedIndicator,
      resolveProps: (
        {
          title,
          text,
          dimension,
          subdimensions,
          stratifiers,
          stratifiedData,
          source,
        },
        baseUrl,
      ) => ({
        title,
        text,
        dimension,
        source,
        subdimensions: subdimensions ?? [],
        stratifiers: stratifiers ?? [],
        data: stratifiedData ?? [],
        indicator: ind,
        yAxisLabel: ind.axisLabel,
        csvPath: csvUrl(baseUrl, `${ind.slug}.csv`),
        geojsonUrls: app.features.map
          ? Object.fromEntries(
              dataYears(stratifiedData).map((yr) => [
                yr,
                geojsonUrl(baseUrl, `${ind.slug}-${yr}.geojson`),
              ]),
            )
          : undefined,
      }),
    },
  ]),
)

export const pageRegistry: Record<string, PageRegistryEntry> = {
  ...staticEntries,
  ...priorityEntries,
  ...indicatorEntries,
}
