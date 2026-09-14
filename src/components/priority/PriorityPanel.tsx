'use client'

import { useState, useMemo } from 'react'
import { PriorityChart } from './PriorityChart'
import { PriorityGapsChart } from './PriorityGapsChart'
import type { PriorityRow } from '@/lib/parquet'
import { app } from '@/config/general'
import { priorities } from '@/config/general'
import type { IndicatorStratifier } from '@/config/general'

interface PriorityPanelProps {
  data: PriorityRow[]
  csvPath?: string
}

export const PriorityPanel = ({ data, csvPath }: PriorityPanelProps) => {
  const priority = priorities[0]
  const stratifierFields = priority.stratifiers ?? []

  // The unstratified ("total") view: every configured stratifier column must
  // sit at its aggregate sentinel value (or be absent from the row).
  const availableYears = useMemo(() => {
    const rows = data.filter((r) => {
      if (r.territorio !== app.local) return false
      return stratifierFields.every((s) => {
        const value = r[s]
        if (value === undefined) return true
        const total =
          priority.scheme?.find((c) => c.name === s)?.aggregate ?? 'Total'
        return value === total
      })
    })
    return [...new Set(rows.map((r) => r.anio))].sort((a, b) => b - a)
  }, [data, priority, stratifierFields])

  const lastYear = availableYears[0] ?? null
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const effectiveYear = selectedYear ?? lastYear

  const [stratifier, setStratifier] = useState<IndicatorStratifier>('total')

  const gapsSpec = stratifier !== 'total' ? priority.gaps?.[stratifier] : undefined

  return (
    <div className="flex flex-col gap-10">
      {availableYears.length > 1 && (
        <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm py-2 border-b border-gray-100 -mx-2 px-2 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 overflow-x-auto">
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm w-fit">
            {availableYears.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => setSelectedYear(yr === lastYear ? null : yr)}
                className={`px-3 py-1 transition-colors ${
                  yr === effectiveYear
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>
      )}

      <PriorityChart
        data={data}
        priority={priority}
        csvPath={csvPath}
        highlightYear={effectiveYear ?? undefined}
        stratifier={stratifier}
        onStratifierChange={setStratifier}
      />

      {gapsSpec && (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold">Análisis de brechas</h2>
            <p className="text-sm text-gray-500 mt-1">
              Brecha absoluta y relativa
            </p>
          </div>
          <PriorityGapsChart
            data={data}
            selectedYear={effectiveYear}
            priority={priority}
            dimension={stratifier}
          />
        </section>
      )}
    </div>
  )
}
