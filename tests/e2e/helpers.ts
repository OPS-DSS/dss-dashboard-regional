import { readFileSync } from 'node:fs'
import path from 'node:path'

// Read directly, rather than importing '@/config/general' (which validates
// through zod) — Playwright's Node process doesn't go through Astro/Vite's
// module resolution, and a plain JSON read is all these helpers need.
const configPath = path.join(process.cwd(), 'app.config.json')
const rawConfig = JSON.parse(readFileSync(configPath, 'utf-8'))

export const priorityIndicators: any[] = rawConfig.indicators.filter(
  (i: any) => i.priority
)
export const nonPriorityIndicators: any[] = rawConfig.indicators.filter(
  (i: any) => !i.priority
)

export const STATIC_ROUTES = [
  '/',
  '/analisis-de-inequidad',
  '/determinantes-de-la-salud',
  '/analisis',
]

// The dev server runs at its real default base path (see playwright.config.ts),
// so every direct navigation needs this prefix. Links discovered by crawling
// the rendered DOM already carry it (NavBarMenu.astro builds hrefs off
// `import.meta.env.BASE_URL` correctly) and should be used as-is.
export const BASE_PATH = '/starter-local-astro'

export function withBase(route: string): string {
  return `${BASE_PATH}${route}`
}

/**
 * Mirrors src/lib/pageRegistry.ts: every priority gets three section pages
 * (and no indicator page of its own — `indicators` there is pre-filtered to
 * non-priority slugs); every non-priority indicator gets its own indicator
 * page. Kept here as a comment/reference in case that file's routing rules
 * change — the generic crawl spec doesn't depend on this and covers routing
 * changes even if this drifts.
 */
export function expectedDynamicRoutes(): string[] {
  const routes: string[] = []

  for (const p of priorityIndicators) {
    routes.push(
      `/determinantes-de-la-salud/${p.slug}`,
      `/analisis-de-inequidad/${p.slug}`,
      `/analisis/${p.slug}`
    )
  }
  for (const ind of nonPriorityIndicators) {
    routes.push(`/${ind.slug}`)
  }

  return routes
}

export const FAILURE_TEXTS = [
  'No hay datos disponibles.',
  'No se pudo cargar el GeoJSON',
]

export const LOADING_TEXTS = ['Cargando mapa', 'Cargando datos']
