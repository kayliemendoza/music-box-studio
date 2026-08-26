/**
 * Generates the reference public-domain test melody's printable test strip
 * (SVG + DXF) using the exact same pipeline the app uses, so the checked-in
 * fixture is guaranteed to match real app output (not hand-authored).
 * Run with: npx tsx scripts/generateTestStrip.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { JSDOM } from 'jsdom'

// The MusicXML importer uses the browser DOMParser global - provide it under Node.
const dom = new JSDOM('')
;(globalThis as unknown as { DOMParser: typeof dom.window.DOMParser }).DOMParser = dom.window.DOMParser

const { parseMusicXmlString } = await import('../src/import/musicxml.ts')
const { buildY30H2Profile } = await import('../src/model/mechanism.ts')
const { buildDefaultPaperProfile } = await import('../src/model/paper.ts')
const { defaultStripLayoutConfig } = await import('../src/convert/layout.ts')
const { applyMechanismMapping } = await import('../src/convert/playability.ts')
const { splitIntoPages } = await import('../src/export/pageSplit.ts')
const { generateStripSvg } = await import('../src/export/svgExport.ts')
const { generateStripDxf } = await import('../src/export/dxfExport.ts')
const { TWINKLE_MUSICXML } = await import('../src/fixtures/twinkleTwinkle.ts')

const { score } = parseMusicXmlString(TWINKLE_MUSICXML)
const profile = buildY30H2Profile()
const paper = { ...buildDefaultPaperProfile(), isCalibrated: true }
const layout = defaultStripLayoutConfig()

const mapped = applyMechanismMapping(score.events, profile).map((e) => ({
  ...e,
  conversion: e.conversion ? { ...e.conversion, approved: true } : e.conversion,
}))

const pages = splitIntoPages(mapped, paper, layout)
if (pages.length !== 1) throw new Error(`Expected the test melody to fit on one strip, got ${pages.length}`)

const svg = generateStripSvg(pages[0], 1, profile, paper, { includeOutlineCut: true, showPrintedLabels: false })
const dxf = generateStripDxf(pages[0], 1, profile, paper, { includeOutlineCut: true })

mkdirSync(new URL('../../../fixtures', import.meta.url), { recursive: true })
writeFileSync(new URL('../../../fixtures/test-strip-twinkle.svg', import.meta.url), svg)
writeFileSync(new URL('../../../fixtures/test-strip-twinkle.dxf', import.meta.url), dxf)

console.log(`Generated test-strip-twinkle.svg/.dxf - ${pages[0].holes.length} holes, mechanism: ${profile.name}, paper: ${paper.name}`)
