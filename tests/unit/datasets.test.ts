import { describe, expect, it } from 'vitest'
import { loadAllDatasets } from '@/lib/pageFactory'
import { app, indicators, priorities } from '@/config/general'

// Exercises the exact function the real Astro pages call at build/dev time
// (src/pages/[...slug].astro -> buildStaticPaths -> loadAllDatasets), against
// the real parquet files already committed under public/data/parquet — no
// synthetic or invented data. `tryLoad` inside loadAllDatasets swallows read
// errors and falls back to `[]`, so a broken file or a scheme/column
// mismatch wouldn't throw here — it would silently produce empty rows, which
// is exactly the class of bug these assertions are meant to catch.
describe('loadAllDatasets against the real committed sample data', () => {
  it('loads non-empty rows for every configured priority', async () => {
    const { priorityData } = await loadAllDatasets()

    for (const p of priorities) {
      expect(
        priorityData[p.slug]?.length ?? 0,
        `priority "${p.slug}" loaded no rows — check public/data/parquet/${p.file} and its scheme`
      ).toBeGreaterThan(0)
    }
  })

  it('loads non-empty rows for every configured (non-priority) indicator', async () => {
    const { stratifiedData } = await loadAllDatasets()

    for (const ind of indicators) {
      expect(
        stratifiedData[ind.slug]?.length ?? 0,
        `indicator "${ind.slug}" loaded no rows — check public/data/parquet/${ind.file} and its scheme`
      ).toBeGreaterThan(0)
    }
  })

  it('includes every declared stratifier column on the loaded rows', async () => {
    const { stratifiedData } = await loadAllDatasets()

    for (const ind of indicators) {
      const rows = stratifiedData[ind.slug] ?? []
      if (rows.length === 0) continue

      for (const stratifierName of ind.stratifiers ?? []) {
        expect(
          rows[0],
          `indicator "${ind.slug}" row is missing stratifier column "${stratifierName}"`
        ).toHaveProperty(stratifierName)
      }
    }
  })

  it('loads the shared analytics/forestPlot/scatter datasets declared in app.config.json', async () => {
    const { analyticsData, forestPlotData, scatterData } = await loadAllDatasets()

    if (app.datasets?.analytics) {
      expect(analyticsData.length).toBeGreaterThan(0)
    }
    if (app.datasets?.forestPlot) {
      expect(forestPlotData.length).toBeGreaterThan(0)
    }
    if (app.features.scatter && app.datasets?.scatter) {
      expect(scatterData.length).toBeGreaterThan(0)
    }
  })
})
