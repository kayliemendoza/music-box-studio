import { describe, it, expect } from 'vitest'
import { buildCsvRows, rowsToCsvString } from './csv'
import { buildTestArrangement } from './testHelpers'

describe('CSV note/hole-position export', () => {
  it('lists one row per pitched note with lane and mm position', () => {
    const { events, paper, layout } = buildTestArrangement(4, 1)
    const rows = buildCsvRows(events, paper, layout)
    expect(rows).toHaveLength(4)
    expect(rows[0].lane).not.toBe('')
    expect(typeof rows[0].positionMm).toBe('number')
  })

  it('renders a well-formed CSV string with a header row', () => {
    const { events, paper, layout } = buildTestArrangement(2, 1)
    const csv = rowsToCsvString(buildCsvRows(events, paper, layout))
    const lines = csv.split('\n')
    expect(lines[0]).toContain('Measure')
    expect(lines).toHaveLength(3) // header + 2 notes
  })
})
