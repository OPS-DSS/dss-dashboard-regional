import { expect, test } from '@playwright/test'
import { FAILURE_TEXTS, LOADING_TEXTS, withBase } from './helpers'

const MAX_PAGES = 40
const SKIP_EXTENSIONS = /\.(csv|parquet|geojson|pdf|zip|png|jpe?g|svg|json)$/i

/**
 * Generic, config-agnostic smoke test: starting from the homepage, follow
 * every internal link the app itself renders, and flag anything that looks
 * broken along the way. This is the check meant to still catch problems
 * even if src/lib/pageRegistry.ts's routing rules change — it never assumes
 * what routes should exist, only that whatever the app links to should work.
 */
test('crawling every link reachable from the homepage finds no broken pages, console errors, or stuck loading/empty states', async ({
  page,
  baseURL,
}) => {
  const problems: string[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      problems.push(`console error on ${page.url()}: ${msg.text()}`)
    }
  })
  page.on('pageerror', (err) => {
    problems.push(`uncaught page error on ${page.url()}: ${err.message}`)
  })
  page.on('requestfailed', (req) => {
    problems.push(
      `request failed on ${page.url()}: ${req.url()} (${req.failure()?.errorText})`
    )
  })
  page.on('response', (res) => {
    if (res.status() >= 400 && baseURL && res.url().startsWith(baseURL)) {
      problems.push(`HTTP ${res.status()} for ${res.url()}`)
    }
  })

  const visited = new Set<string>()
  const queue: string[] = [withBase('/')]

  while (queue.length && visited.size < MAX_PAGES) {
    const route = queue.shift()!
    if (visited.has(route)) continue
    visited.add(route)

    await page.goto(route, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400) // let lazy/suspended content settle

    for (const text of LOADING_TEXTS) {
      const stuck = await page
        .getByText(text)
        .first()
        .isVisible()
        .catch(() => false)
      if (stuck) problems.push(`${route}: stuck on loading state "${text}"`)
    }
    for (const text of FAILURE_TEXTS) {
      const failing = await page
        .getByText(text)
        .first()
        .isVisible()
        .catch(() => false)
      if (failing) problems.push(`${route}: showing failure/empty state "${text}"`)
    }

    const links = await page.$$eval('a[href]', (as) =>
      as.map((a) => ({
        href: a.getAttribute('href'),
        download: a.hasAttribute('download'),
      }))
    )

    for (const { href, download } of links) {
      if (!href || download) continue
      if (href.startsWith('#') || /^(mailto|tel):/i.test(href)) continue
      if (/^https?:\/\//i.test(href)) continue // external
      if (SKIP_EXTENSIONS.test(href)) continue

      const clean = href.split('#')[0].split('?')[0]
      if (clean && !visited.has(clean)) queue.push(clean)
    }
  }

  expect(
    visited.size,
    'the crawl should discover more than just the homepage'
  ).toBeGreaterThan(3)
  expect(problems, problems.join('\n')).toEqual([])
})
