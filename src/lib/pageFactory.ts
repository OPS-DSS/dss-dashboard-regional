import { loadDataset } from './parquet'
import { app, priorities, indicators } from '@/config/general'
import type {
  IndicatorMeta,
  IndicatorStratifier,
  DatasetScheme,
} from '@/config/general'

import type {
  DataRow,
  MapRowsOptions,
  PriorityRow,
  ForestPlotDataRow,
  AnalyticsRow,
  ScatterRow,
  StratifiedRow,
} from './parquet'

// ─── Loaded datasets ─────────────────────────────────────────────────────────

export interface PageDatasets {
  forestPlotData: ForestPlotDataRow[]
  analyticsData: AnalyticsRow[]
  scatterData: ScatterRow[]
  /** Priority indicator data, keyed by indicator slug. */
  priorityData: Record<string, PriorityRow[]>
  /** Stratified indicator data, keyed by indicator slug. */
  stratifiedData: Record<string, StratifiedRow[]>
}

async function tryLoad<T extends DataRow>(
  name: string,
  file: string | undefined,
  scheme: DatasetScheme | undefined,
  options?: MapRowsOptions,
): Promise<T[]> {
  if (!file || !scheme) return []
  try {
    return await loadDataset<T>(file, scheme, options)
  } catch (e) {
    console.error(`[loadAllDatasets] ${name}:`, e)
    return []
  }
}

export async function loadAllDatasets(): Promise<PageDatasets> {
  // Priority indicators keep rows for every territory so charts can compare
  // the municipality against its barrios; the rest keep only local rows.
  const priorityData: Record<string, PriorityRow[]> = {}
  for (const p of priorities) {
    priorityData[p.slug] = await tryLoad<PriorityRow>(p.slug, p.file, p.scheme)
  }

  const stratifiedData: Record<string, StratifiedRow[]> = {}
  for (const ind of indicators) {
    stratifiedData[ind.slug] = await tryLoad<StratifiedRow>(
      ind.slug,
      ind.file,
      ind.scheme,
      { territory: app.local },
    )
  }

  const { analytics, scatter, forestPlot } = app.datasets ?? {}
  return {
    forestPlotData: await tryLoad<ForestPlotDataRow>(
      'forestPlot',
      forestPlot?.file,
      forestPlot?.scheme,
    ),
    analyticsData: await tryLoad<AnalyticsRow>(
      'analytics',
      analytics?.file,
      analytics?.scheme,
    ),
    scatterData: app.features.scatter
      ? await tryLoad<ScatterRow>('scatter', scatter?.file, scatter?.scheme)
      : [],
    priorityData,
    stratifiedData,
  }
}

// ─── Page definitions ─────────────────────────────────────────────────────────

export interface PageDefinition {
  slug: string | undefined
  title: string
  text?: string
  date: string
  navbar: boolean
  source?: string
  data?: PriorityRow[]
  forestPlotData?: ForestPlotDataRow[]
  analyticsData?: AnalyticsRow[]
  scatterData?: ScatterRow[]
  stratifiedData?: StratifiedRow[]
  dimension?: string
  subdimensions?: string[]
  description?: string
  category?: string
  priority?: boolean
  stratifiers?: IndicatorStratifier[]
}

export function buildPages(datasets: PageDatasets): PageDefinition[] {
  const staticPages: PageDefinition[] = [
    {
      slug: undefined,
      title: 'Inicio',
      description:
        'Bienvenidos al Observatorio de Determinantes Sociales de la Salud, un espacio dedicado a la recopilación, análisis y visualización de datos relacionados con la salud. Nuestro objetivo es proporcionar información precisa y actualizada para apoyar la toma de decisiones informadas en el ámbito de la salud pública.',
      date: '2026-01-01',
      navbar: true,
    },
    {
      slug: 'analisis-de-inequidad',
      title: 'Análisis de Inequidad',
      description: 'Problemas, gráficos de tendencias y mediciones de brechas',
      date: '2026-01-01',
      navbar: true,
    },
    {
      slug: 'determinantes-de-la-salud',
      title: 'Determinantes Sociales de la Salud',
      description: 'Factores que influyen en la salud de la población',
      date: '2026-01-01',
      navbar: true,
    },
    {
      slug: 'analisis',
      title: 'Análisis Avanzado',
      description: 'Análisis de relaciones',
      date: '2026-01-01',
      navbar: true,
    },
  ]

  const priorityPages: PageDefinition[] = priorities.flatMap(
    (priority: IndicatorMeta) => [
      {
        slug: `analisis-de-inequidad/${priority.slug}`,
        title: priority.title,
        text: priority.description,
        date: priority.date,
        category: priority.category,
        source: priority.source,
        navbar: false,
        data: datasets.priorityData[priority.slug],
      },
      {
        slug: `determinantes-de-la-salud/${priority.slug}`,
        title: priority.title,
        text: priority.description,
        date: priority.date,
        source: priority.source,
        category: priority.category,
        navbar: false,
      },
      {
        slug: `analisis/${priority.slug}`,
        title: `Análisis de ${priority.label}`,
        description: 'Indicadores de análisis de datos y visualización.',
        date: priority.date,
        category: 'Tendencia',
        navbar: false,
        priority: false,
        forestPlotData: datasets.forestPlotData,
        analyticsData: datasets.analyticsData,
        scatterData: datasets.scatterData,
      },
    ],
  )

  const indicatorPages: PageDefinition[] = indicators.map((ind) => ({
    slug: ind.slug,
    title: ind.title,
    description: ind.description,
    dimension: ind.dimension,
    subdimensions: ind.subdimensions,
    date: ind.date,
    navbar: false,
    stratifiers: ind.stratifiers,
    source: ind.source,
    stratifiedData: datasets.stratifiedData[ind.slug],
  }))

  return [...staticPages, ...indicatorPages, ...priorityPages]
}

// ─── Static path factory ──────────────────────────────────────────────────────

export async function buildStaticPaths() {
  const datasets = await loadAllDatasets()
  const pages = buildPages(datasets)

  return pages.map(
    ({ slug, title, description, date, navbar, source, ...rest }) => ({
      params: { slug },
      props: {
        title,
        description,
        slug,
        date: new Date(date),
        navbar,
        source,
        pages,
        ...rest,
      },
    }),
  )
}
