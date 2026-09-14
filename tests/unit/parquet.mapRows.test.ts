import { describe, expect, it } from 'vitest'
import { mapRows } from '@/lib/parquet'
import type { DatasetScheme } from '@/config/general'

const scheme: DatasetScheme = [
  { name: 'territorio', type: 'string', role: 'territory', index: 0 },
  { name: 'anio', type: 'number', role: 'year', index: 1 },
  { name: 'sexo', type: 'string', index: 2 },
  { name: 'valor', type: 'number', role: 'value', index: 3 },
]

describe('mapRows', () => {
  it('maps positional cells to named fields by scheme index', () => {
    const rows = mapRows([['Suaza', 2020, 'Hombres', 5]], scheme)

    expect(rows).toEqual([
      { territorio: 'Suaza', anio: 2020, sexo: 'Hombres', valor: 5 },
    ])
  })

  it('filters rows by the territory column when a territory is given', () => {
    const rows = mapRows(
      [
        ['Suaza', 2020, 'Hombres', 5],
        ['Otro Municipio', 2020, 'Hombres', 9],
      ],
      scheme,
      { territory: 'Suaza' }
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].territorio).toBe('Suaza')
  })

  it('keeps every territory when no territory filter is given', () => {
    const rows = mapRows(
      [
        ['Suaza', 2020, 'Hombres', 5],
        ['Otro Municipio', 2020, 'Hombres', 9],
      ],
      scheme
    )

    expect(rows).toHaveLength(2)
  })

  it('drops rows whose year or value is missing or non-numeric', () => {
    const rows = mapRows(
      [
        ['Suaza', 2020, 'Hombres', 5],
        ['Suaza', null, 'Hombres', 5],
        ['Suaza', 2021, 'Hombres', 'not-a-number'],
        ['Suaza', 2022, 'Hombres', null],
      ],
      scheme
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].anio).toBe(2020)
  })

  it('defaults a missing string cell to an empty string', () => {
    const rows = mapRows([['Suaza', 2020, null, 5]], scheme)

    expect(rows[0].sexo).toBe('')
  })

  it('sorts rows by the year column ascending', () => {
    const rows = mapRows(
      [
        ['Suaza', 2022, 'Hombres', 1],
        ['Suaza', 2020, 'Hombres', 2],
        ['Suaza', 2021, 'Hombres', 3],
      ],
      scheme
    )

    expect(rows.map((r) => r.anio)).toEqual([2020, 2021, 2022])
  })

  it('leaves row order untouched when the scheme has no year column', () => {
    const schemeWithoutYear: DatasetScheme = [
      { name: 'territorio', type: 'string', role: 'territory', index: 0 },
      { name: 'valor', type: 'number', role: 'value', index: 1 },
    ]

    const rows = mapRows(
      [
        ['B', 2],
        ['A', 1],
      ],
      schemeWithoutYear
    )

    expect(rows.map((r) => r.territorio)).toEqual(['B', 'A'])
  })
})
