import { expect, test } from '@playwright/test'
import {
  FAILURE_TEXTS,
  STATIC_ROUTES,
  nonPriorityIndicators,
  priorityIndicators,
  withBase,
} from './helpers'

async function expectNoFailureState(page: import('@playwright/test').Page) {
  await page.waitForTimeout(500) // let lazy/suspended content (map) settle
  for (const text of FAILURE_TEXTS) {
    await expect(page.getByText(text), `unexpected "${text}"`).toHaveCount(0)
  }
}

// Iconify/astro-icon icons (nav, buttons) render as <svg data-icon="...">;
// excluding them keeps this assertion honest about "did a chart render",
// rather than passing on the first svg found — which, at desktop viewport
// widths, is the (hidden) mobile menu icon in the navbar.
function chartSvg(page: import('@playwright/test').Page) {
  return page.locator('svg:not([data-icon])').first()
}

for (const route of STATIC_ROUTES) {
  test(`static page ${route} loads without a failure/empty state`, async ({
    page,
  }) => {
    const response = await page.goto(withBase(route), { waitUntil: 'networkidle' })
    expect(response?.status(), `HTTP status for ${route}`).toBeLessThan(400)
    await expectNoFailureState(page)
  })
}

for (const priority of priorityIndicators) {
  for (const section of [
    'determinantes-de-la-salud',
    'analisis-de-inequidad',
    'analisis',
  ]) {
    test(`priority page /${section}/${priority.slug} renders real chart data`, async ({
      page,
    }) => {
      const route = `/${section}/${priority.slug}`
      const response = await page.goto(withBase(route), {
        waitUntil: 'networkidle',
      })
      expect(response?.status(), `HTTP status for ${route}`).toBeLessThan(400)
      await expectNoFailureState(page)
      await expect(chartSvg(page)).toBeVisible()
    })
  }
}

for (const ind of nonPriorityIndicators) {
  test(`indicator page /${ind.slug} renders real chart data`, async ({ page }) => {
    const route = `/${ind.slug}`
    const response = await page.goto(withBase(route), { waitUntil: 'networkidle' })
    expect(response?.status(), `HTTP status for ${route}`).toBeLessThan(400)
    await expectNoFailureState(page)
    await expect(chartSvg(page)).toBeVisible()
  })
}
