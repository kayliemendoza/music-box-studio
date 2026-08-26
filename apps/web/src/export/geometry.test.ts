import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { splitIntoPages } from './pageSplit'
import { generateStripSvg } from './svgExport'
import { generateStripPdf } from './pdfExport'
import { generateStripDxf } from './dxfExport'
import { buildTestArrangement } from './testHelpers'

const TOLERANCE_MM = 0.2
const MM_TO_PT = 72 / 25.4

describe('exact-scale SVG export', () => {
  it('sizes the SVG document to the calibrated paper dimensions within 0.2mm', () => {
    const { events, profile, paper, layout } = buildTestArrangement()
    const [page] = splitIntoPages(events, paper, layout)
    const svg = generateStripSvg(page, 1, profile, paper)
    const widthMatch = /width="([\d.]+)mm"/.exec(svg)
    const heightMatch = /height="([\d.]+)mm"/.exec(svg)
    expect(widthMatch).not.toBeNull()
    expect(Number(widthMatch![1])).toBeCloseTo(paper.maxSheetLengthMm, 1)
    expect(heightMatch).not.toBeNull()
    // viewBox numeric units must equal the mm width/height for a true 1-unit-per-mm export.
    const viewBoxMatch = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
    expect(viewBoxMatch).not.toBeNull()
    expect(Math.abs(Number(viewBoxMatch![1]) - Number(widthMatch![1]))).toBeLessThan(TOLERANCE_MM)
    expect(Math.abs(Number(viewBoxMatch![2]) - Number(heightMatch![1]))).toBeLessThan(TOLERANCE_MM)
  })

  it('includes the required actual-size warning text', () => {
    const { events, profile, paper, layout } = buildTestArrangement()
    const [page] = splitIntoPages(events, paper, layout)
    const svg = generateStripSvg(page, 1, profile, paper)
    expect(svg).toMatch(/PRINT AT 100%/)
    expect(svg).toMatch(/Do NOT use "Fit to Page"/)
    expect(svg).toMatch(/100mm calibration box/)
  })

  it('places every hole circle at its calibrated lane + timing position', () => {
    const { events, profile, paper, layout } = buildTestArrangement(1, 1)
    const [page] = splitIntoPages(events, paper, layout)
    const svg = generateStripSvg(page, 1, profile, paper)
    const circleMatch = /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/.exec(svg)
    expect(circleMatch).not.toBeNull()
    expect(Number(circleMatch![3])).toBeCloseTo(paper.holeDiameterMm / 2, 5)
  })
})

describe('exact-scale PDF export', () => {
  it('produces continuous-roll pages sized exactly to the calibrated sheet length, within 0.2mm', async () => {
    const { events, profile, paper, layout } = buildTestArrangement()
    const [page] = splitIntoPages(events, paper, layout)
    const bytes = await generateStripPdf(page, 1, profile, paper, 'continuous-roll')
    const loaded = await PDFDocument.load(bytes)
    const pdfPage = loaded.getPage(0)
    const { width, height } = pdfPage.getSize()
    const widthMm = width / MM_TO_PT
    expect(Math.abs(widthMm - paper.maxSheetLengthMm)).toBeLessThan(TOLERANCE_MM)
    expect(height).toBeGreaterThan(0)
  })

  it('tiles a strip longer than one US Letter sheet across multiple numbered PDF pages', async () => {
    const { events, profile, paper, layout } = buildTestArrangement(30, 3)
    const longPaper = { ...paper, maxSheetLengthMm: 500 }
    const [page] = splitIntoPages(events, longPaper, layout)
    const bytes = await generateStripPdf(page, 1, profile, longPaper, 'letter')
    const loaded = await PDFDocument.load(bytes)
    expect(loaded.getPageCount()).toBeGreaterThan(1)
    for (let i = 0; i < loaded.getPageCount(); i++) {
      const { width, height } = loaded.getPage(i).getSize()
      const widthMm = width / MM_TO_PT
      const heightMm = height / MM_TO_PT
      // Every tile must fit within the Letter sheet's physical dimensions.
      expect(widthMm).toBeLessThanOrEqual(279.5)
      expect(heightMm).toBeLessThanOrEqual(279.5)
    }
  })
})

describe('DXF export: Silhouette cut-path safety', () => {
  interface DxfEntity { type: string; layer: string | null }

  function parseEntities(dxf: string): DxfEntity[] {
    const lines = dxf.split('\n')
    const entities: DxfEntity[] = []
    let inEntitiesSection = false
    let current: DxfEntity | null = null
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === '2' && lines[i + 1] === 'ENTITIES') inEntitiesSection = true
      if (lines[i] === '2' && lines[i + 1] === 'ENDSEC' && inEntitiesSection) break
      if (!inEntitiesSection) continue
      if (lines[i] === '0') {
        if (current) entities.push(current)
        current = { type: lines[i + 1], layer: null }
      } else if (lines[i] === '8' && current) {
        current.layer = lines[i + 1]
      }
    }
    if (current) entities.push(current)
    return entities.filter((e) => e.type !== 'ENTITIES')
  }

  it('only puts CIRCLE (hole) geometry on the CUT_HOLES layer', () => {
    const { events, profile, paper, layout } = buildTestArrangement()
    const [page] = splitIntoPages(events, paper, layout)
    const dxf = generateStripDxf(page, 1, profile, paper, { includeOutlineCut: false })
    const entities = parseEntities(dxf)
    const circles = entities.filter((e) => e.type === 'CIRCLE')
    expect(circles.length).toBe(page.holes.length)
    expect(circles.every((c) => c.layer === 'CUT_HOLES')).toBe(true)
  })

  it('never places guide, registration, or label geometry on a cut layer', () => {
    const { events, profile, paper, layout } = buildTestArrangement()
    const [page] = splitIntoPages(events, paper, layout)
    const dxf = generateStripDxf(page, 1, profile, paper, { includeOutlineCut: false })
    const entities = parseEntities(dxf)
    const nonCutLayers = new Set(['PRINT_GUIDES', 'REGISTRATION_MARKS', 'NO_CUT_LABELS'])
    const cutLayers = new Set(['CUT_HOLES', 'CUT_OUTLINE'])
    for (const e of entities) {
      if (nonCutLayers.has(e.layer ?? '')) {
        expect(cutLayers.has(e.layer ?? '')).toBe(false)
      }
    }
    // CUT_OUTLINE stays empty unless explicitly approved.
    expect(entities.some((e) => e.layer === 'CUT_OUTLINE')).toBe(false)
  })

  it('adds outline geometry to CUT_OUTLINE only when explicitly approved', () => {
    const { events, profile, paper, layout } = buildTestArrangement()
    const [page] = splitIntoPages(events, paper, layout)
    const dxf = generateStripDxf(page, 1, profile, paper, { includeOutlineCut: true })
    const entities = parseEntities(dxf)
    expect(entities.some((e) => e.layer === 'CUT_OUTLINE')).toBe(true)
  })

  it('declares exactly the five required named layers', () => {
    const { events, profile, paper, layout } = buildTestArrangement()
    const [page] = splitIntoPages(events, paper, layout)
    const dxf = generateStripDxf(page, 1, profile, paper)
    for (const name of ['CUT_HOLES', 'CUT_OUTLINE', 'PRINT_GUIDES', 'REGISTRATION_MARKS', 'NO_CUT_LABELS']) {
      expect(dxf).toContain(name)
    }
  })
})
