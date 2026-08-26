import { describe, it, expect } from 'vitest'
import { splitIntoPages, totalPlayingTimeSeconds } from './pageSplit'
import { buildTestArrangement } from './testHelpers'

describe('page splitting', () => {
  it('keeps a short song on a single page', () => {
    const { events, paper, layout } = buildTestArrangement(8, 1)
    const pages = splitIntoPages(events, paper, layout)
    expect(pages).toHaveLength(1)
    expect(pages[0].holes).toHaveLength(8)
  })

  it('splits a song longer than one calibrated sheet into multiple numbered strips', () => {
    const { events, paper, layout } = buildTestArrangement(40, 4) // spaced far enough apart to exceed maxSheetLengthMm
    const shortPaper = { ...paper, maxSheetLengthMm: 120, leadingMarginMm: 5, endingMarginMm: 5 }
    const pages = splitIntoPages(events, shortPaper, layout)
    expect(pages.length).toBeGreaterThan(1)
    // Every page is numbered sequentially starting at 1.
    expect(pages.map((p) => p.pageNumber)).toEqual(pages.map((_, i) => i + 1))
    // No hole exceeds this page's usable length (localMm bounded by leading + usable + a hair of tolerance).
    for (const page of pages) {
      for (const hole of page.holes) {
        expect(hole.localMm).toBeGreaterThanOrEqual(0)
        expect(hole.localMm).toBeLessThanOrEqual(shortPaper.maxSheetLengthMm)
      }
    }
    // Every original note appears on exactly one page.
    const totalHoles = pages.reduce((sum, p) => sum + p.holes.length, 0)
    expect(totalHoles).toBe(events.filter((e) => !e.isRest).length)
  })

  it('computes a non-zero estimated playing time', () => {
    const { events } = buildTestArrangement(8, 1)
    const seconds = totalPlayingTimeSeconds(events)
    expect(seconds).toBeGreaterThan(0)
  })
})
