# @ops-dss/starter-local-astro

Part of the DSS (Determinantes Sociales de la Salud) Health Indicators Monitoring System.

## The Priority Problem Model

Every DSS dashboard is organized around one or more **priority problems**, each
measured by a **priority indicator**. This is the central design decision of a
locality's dashboard — everything else hangs off it:

- This **starter template** example uses a single priority indicator: **maternal
  mortality**.
- All other indicators are **social determinants of health (SDH)** indicators.
  They appear under the social-determinants section, and the **"advanced
  analysis" tab** analyzes how each of them relates to the priority indicator.

The priority problem is chosen by the locality (typically from its health
situation analysis — in Colombia, for example, the ASIS). It is **never inherited from the
template**: maternal mortality in the starter is an example, not a default.

## Multiple priorities

Some localities have more than one priority problem. Then:

- Each priority gets its own advanced-analysis view relating determinants to
  *that* priority.
- Determinant indicators are mapped **per priority** — a determinant may relate
  to one priority, several, or all of them. The mapping is explicit, not
  assumed.

## Priorities as determinants of each other

A priority indicator can itself act as a social determinant of *another*
priority indicator — or not. Example: a locality prioritizing both adolescent
pregnancy and maternal mortality may treat adolescent pregnancy as a
determinant within the maternal-mortality analysis, while the reverse
relationship may not hold. **This is locality-specific epidemiological
judgment.

## Development

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
```

## CI/CD

**Important:** This repository includes two workflows used only for the internal maintenance of the template. After creating a new repository from this template, delete `.github/workflows/publish-to-npm.yml` and `.github/workflows/sync-to-monorepo.yml`. Keep `.github/workflows/deploy-pages.yml`, as it is used to publish the implementation to GitHub Pages.

**Importante:** Este repositorio incluye dos workflows utilizados únicamente para el mantenimiento interno de la plantilla. Después de crear un nuevo repositorio usando esta plantilla, elimina `.github/workflows/publish-to-npm.yml` y `.github/workflows/sync-to-monorepo.yml`. Mantén `.github/workflows/deploy-pages.yml`, ya que este se utiliza para publicar la implementación en GitHub Pages.

## Contributing

Thank you for your interest in contributing! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

Changes made to this repository will be automatically synced back to the main monorepo upon approval.

## License

MIT
