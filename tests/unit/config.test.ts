import { describe, expect, it } from 'vitest'
import { app, indicators, indicatorSlugs, priorities } from '@/config/general'

describe('app.config.json against the general schema', () => {
  // Importing @/config/general already runs `Config.parse(raw)` — if the
  // checked-in app.config.json didn't validate, the import above would have
  // thrown before this file's tests even ran.

  it('has non-empty territory labels and a data path', () => {
    expect(app.local.length).toBeGreaterThan(0)
    expect(app.subnational.length).toBeGreaterThan(0)
    expect(app.national.length).toBeGreaterThan(0)
    expect(app.data.path.length).toBeGreaterThan(0)
  })

  it('splits every indicator into either priorities or non-priority indicators, with no overlap', () => {
    expect(indicators.length + priorities.length).toBe(app.indicators.length)
    const prioritySlugs = new Set(priorities.map((p) => p.slug))
    for (const ind of indicators) {
      expect(prioritySlugs.has(ind.slug)).toBe(false)
    }
  })

  it('derives indicatorSlugs from the non-priority indicators only', () => {
    expect(indicatorSlugs).toEqual(indicators.map((i) => i.slug))
  })

  it('gives every indicator a file and a scheme with a value column', () => {
    for (const ind of app.indicators) {
      expect(ind.file, `indicator "${ind.slug}" is missing a file`).toBeTruthy()
      expect(ind.scheme, `indicator "${ind.slug}" is missing a scheme`).toBeTruthy()
      const valueColumn = ind.scheme?.find((c) => c.role === 'value')
      expect(
        valueColumn,
        `indicator "${ind.slug}" scheme has no value column`
      ).toBeTruthy()
    }
  })

  it('every declared stratifier column exists in the indicator scheme', () => {
    for (const ind of app.indicators) {
      for (const stratifierName of ind.stratifiers ?? []) {
        const column = ind.scheme?.find((c) => c.name === stratifierName)
        expect(
          column,
          `indicator "${ind.slug}" declares stratifier "${stratifierName}" with no matching scheme column`
        ).toBeTruthy()
        expect(column?.values?.length ?? 0).toBeGreaterThanOrEqual(2)
      }
    }
  })
})
