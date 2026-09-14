import { z } from 'astro/zod'
import raw from '../../app.config.json'

const GapComparison = z.object({
  id: z.string(),
  label: z.string(),
  group: z.object({ value: z.string(), label: z.string() }),
  reference: z.object({ value: z.string(), label: z.string() }),
  colorAbsolute: z.string(),
  colorRelative: z.string(),
  interpretation: z.object({
    absolute: z.object({
      below0: z.string(),
      above0: z.string(),
    }),
    relative: z.object({
      below1: z.string(),
      above1: z.string(),
    }),
  }),
})

const GapDimension = z.object({
  field: z.string(),
  scopeField: z.string(),
  scopeValue: z.string(),
  unit: z.string(),
  comparisons: z.array(GapComparison).min(1),
})

// A column of a parquet file: `name` is the field name rows expose to the app,
// `index` is the column position in the file. `role` marks the columns the
// loader treats specially (territory filtering, year sorting, value validity).
const Column = z.object({
  name: z.string(),
  type: z.enum(['string', 'number']),
  index: z.number().int().nonnegative(),
  role: z.enum(['territory', 'year', 'value']).optional(),
  // Display label for this column when offered as a stratifier option.
  label: z.string().optional(),
  values: z.array(z.string()).optional(),
  // Sentinel value marking aggregate/unstratified rows for this column.
  aggregate: z.string().optional(),
  // Display color per value (keys match `values`).
  colors: z.record(z.string(), z.string()).optional(),
})

const Scheme = z.array(Column).min(1)

const Dataset = z.object({
  file: z.string(),
  scheme: Scheme,
})

const Indicator = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  date: z.string(),
  source: z.string(),
  priority: z.boolean().default(false),
  category: z.string().optional(),
  related_priorities: z.array(z.string()).optional(),
  dimension: z.enum(['dss', 'policy']),
  subdimensions: z.array(z.string()),
  stratifiers: z.array(z.string()).optional(),
  label: z.string(),
  axisLabel: z.string(),
  color: z.string(),
  // Line color for the unstratified ('total') series in stratified charts.
  totalColor: z.string().optional(),
  bivariateValue: z.string().optional(),
  inequitySource: z.string().optional(),
  file: z.string().optional(),
  scheme: Scheme.optional(),
  // Keyed by stratifier field name (matching an entry in `stratifiers`), e.g.
  // `{ etnia: {...}, zona: {...}, sexo: {...} }`.
  gaps: z.record(z.string(), GapDimension).optional(),
})

const Config = z.object({
  local: z.string(),
  subnational: z.string(),
  national: z.string(),
  indicators: z.array(z.union([Indicator])),
  features: z.object({
    map: z.boolean().default(false),
    scatter: z.boolean().default(false),
  }),
  data: z.object({ path: z.string() }).default({ path: 'public/data/parquet' }),
  datasets: z
    .object({
      analytics: Dataset.optional(),
      scatter: Dataset.optional(),
      forestPlot: Dataset.optional(),
    })
    .optional(),
})

export const app = Config.parse(raw)
export type IndicatorMeta = z.infer<typeof Indicator>
export type GapComparisonMeta = z.infer<typeof GapComparison>
export type GapDimensionMeta = z.infer<typeof GapDimension>
export type ColumnSpec = z.infer<typeof Column>
export type DatasetScheme = z.infer<typeof Scheme>
export type DatasetMeta = z.infer<typeof Dataset>

export const indicators = app.indicators.filter((i) => !i.priority)
export const priorities = app.indicators.filter((i) => i.priority)

export const indicatorSlugs = indicators.map((i) => i.slug)

const stratifiers = [
  ...new Set(app.indicators.flatMap((i) => i.stratifiers || [])),
] as const

export type IndicatorStratifier = (typeof stratifiers)[number]
