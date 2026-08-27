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

  it('marks every independent-mode page as insert/tail (no joins) - the safe default', () => {
    const { events, paper, layout } = buildTestArrangement(40, 4)
    const shortPaper = { ...paper, maxSheetLengthMm: 120, leadingMarginMm: 5, endingMarginMm: 5 }
    const pages = splitIntoPages(events, shortPaper, layout)
    expect(pages.length).toBeGreaterThan(1)
    for (const page of pages) {
      expect(page.leadingEdgeKind).toBe('insert')
      expect(page.trailingEdgeKind).toBe('tail')
    }
  })

  describe('taped-join (spliced) mode', () => {
    it('only the first page gets the real leading margin and only the last gets the real ending margin', () => {
      const { events, paper, layout } = buildTestArrangement(40, 4)
      const splicedPaper = { ...paper, maxSheetLengthMm: 120, leadingMarginMm: 20, endingMarginMm: 20, allowTapedJoins: true, spliceClearanceMm: 4 }
      const pages = splitIntoPages(events, splicedPaper, layout)
      expect(pages.length).toBeGreaterThan(1)

      expect(pages[0].leadingEdgeKind).toBe('insert')
      expect(pages[0].trailingEdgeKind).toBe('join')
      expect(pages[pages.length - 1].leadingEdgeKind).toBe('join')
      expect(pages[pages.length - 1].trailingEdgeKind).toBe('tail')
      for (const page of pages.slice(1, -1)) {
        expect(page.leadingEdgeKind).toBe('join')
        expect(page.trailingEdgeKind).toBe('join')
      }

      // First hole on every internal/last page starts at spliceClearanceMm, not the full leading margin.
      for (const page of pages.slice(1)) {
        expect(page.holes[0].localMm).toBeGreaterThanOrEqual(splicedPaper.spliceClearanceMm)
        expect(page.holes[0].localMm).toBeLessThan(splicedPaper.leadingMarginMm)
      }
    })

    it('fits more music per sheet than independent mode, given the same paper', () => {
      const { events, paper, layout } = buildTestArrangement(40, 4)
      const basePaper = { ...paper, maxSheetLengthMm: 120, leadingMarginMm: 20, endingMarginMm: 20 }
      const independentPages = splitIntoPages(events, basePaper, layout)
      const splicedPages = splitIntoPages(events, { ...basePaper, allowTapedJoins: true, spliceClearanceMm: 4 }, layout)
      expect(splicedPages.length).toBeLessThanOrEqual(independentPages.length)
    })

    it('every original note still appears on exactly one page in spliced mode', () => {
      const { events, paper, layout } = buildTestArrangement(40, 4)
      const splicedPaper = { ...paper, maxSheetLengthMm: 120, allowTapedJoins: true, spliceClearanceMm: 4 }
      const pages = splitIntoPages(events, splicedPaper, layout)
      const totalHoles = pages.reduce((sum, p) => sum + p.holes.length, 0)
      expect(totalHoles).toBe(events.filter((e) => !e.isRest).length)
    })
  })
})
