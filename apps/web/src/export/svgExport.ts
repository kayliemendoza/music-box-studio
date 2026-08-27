import type { MechanismProfile } from '../model/mechanism'
import type { PaperProfile } from '../model/paper'
import type { StripPage } from './pageSplit'
import { laneToMm } from '../convert/layout'
import { SILHOUETTE_LAYERS } from './layers'

export interface SvgExportOptions {
  includeOutlineCut: boolean
  showPrintedLabels: boolean
}

const TOP_BAND_MM = 18
const FOOTER_BAND_MM = 42

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Exact-physical-size, layered, print-ready SVG for one strip page (mm units == SVG user units). */
export function generateStripSvg(
  page: StripPage,
  totalPages: number,
  profile: MechanismProfile,
  paper: PaperProfile,
  opts: SvgExportOptions = { includeOutlineCut: false, showPrintedLabels: false },
): string {
  const widthMm = paper.maxSheetLengthMm
  const heightMm = TOP_BAND_MM + paper.widthMm + FOOTER_BAND_MM
  const stripTop = TOP_BAND_MM

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">`,
  )
  parts.push(`<rect x="0" y="0" width="${widthMm}" height="${heightMm}" fill="white"/>`)

  // --- PRINT_GUIDES: lane lines, strip outline preview, measure/beat context, trigger markers ---
  parts.push(`<g id="${SILHOUETTE_LAYERS.PRINT_GUIDES.name}" stroke="${SILHOUETTE_LAYERS.PRINT_GUIDES.cssColor}" fill="none" stroke-width="0.1">`)
  parts.push(`<rect x="0" y="${stripTop}" width="${widthMm}" height="${paper.widthMm}" stroke-dasharray="1,1"/>`)
  for (const lane of profile.lanes) {
    const y = stripTop + laneToMm(lane.lane, paper)
    parts.push(`<line x1="0" y1="${y}" x2="${widthMm}" y2="${y}"/>`)
    const label = opts.showPrintedLabels && lane.printedLabel !== lane.soundingNoteName
      ? `${lane.soundingNoteName} (printed: ${lane.printedLabel})`
      : lane.soundingNoteName
    parts.push(`<text x="1" y="${y - 0.3}" font-size="1.6" fill="${SILHOUETTE_LAYERS.PRINT_GUIDES.cssColor}" stroke="none">${esc(label)}</text>`)
  }
  const leadingEdgeMm = page.leadingEdgeKind === 'insert' ? paper.leadingMarginMm : paper.spliceClearanceMm
  const trailingEdgeMm = page.trailingEdgeKind === 'tail' ? paper.endingMarginMm : paper.spliceClearanceMm
  parts.push(`<line x1="${leadingEdgeMm}" y1="${stripTop}" x2="${leadingEdgeMm}" y2="${stripTop + paper.widthMm}" stroke-dasharray="${page.leadingEdgeKind === 'join' ? '0.3,0.3' : '0.5,0.5'}"/>`)
  parts.push(`<line x1="${widthMm - trailingEdgeMm}" y1="${stripTop}" x2="${widthMm - trailingEdgeMm}" y2="${stripTop + paper.widthMm}" stroke-dasharray="${page.trailingEdgeKind === 'join' ? '0.3,0.3' : '0.5,0.5'}"/>`)
  for (const region of paper.unusableRegionsMm) {
    parts.push(
      `<rect x="${region.startMm}" y="${stripTop}" width="${region.endMm - region.startMm}" height="${paper.widthMm}" fill="${SILHOUETTE_LAYERS.PRINT_GUIDES.cssColor}" fill-opacity="0.15" stroke="none"/>`,
    )
  }
  // Trigger-edge markers: short tick at the hole's actual trigger point, offset from center per calibration.
  for (const hole of page.holes) {
    const cx = hole.localMm
    const cy = stripTop + hole.laneMm
    const dir = paper.feedDirection === 'right-to-left' ? -1 : 1
    const tx = cx + dir * paper.triggerEdgeOffsetMm
    parts.push(`<line x1="${tx}" y1="${cy - 1}" x2="${tx}" y2="${cy + 1}" stroke-width="0.15"/>`)
  }
  parts.push('</g>')

  // --- REGISTRATION_MARKS: 100mm calibration box + corner alignment crosses ---
  parts.push(`<g id="${SILHOUETTE_LAYERS.REGISTRATION_MARKS.name}" stroke="${SILHOUETTE_LAYERS.REGISTRATION_MARKS.cssColor}" fill="none" stroke-width="0.15">`)
  const calX = 5
  const calY = heightMm - FOOTER_BAND_MM + 22
  parts.push(`<rect x="${calX}" y="${calY}" width="100" height="8"/>`)
  for (let i = 0; i <= 100; i += 10) {
    parts.push(`<line x1="${calX + i}" y1="${calY}" x2="${calX + i}" y2="${calY + (i % 50 === 0 ? 8 : 3)}"/>`)
  }
  parts.push(`<text x="${calX}" y="${calY - 1}" font-size="2" fill="${SILHOUETTE_LAYERS.REGISTRATION_MARKS.cssColor}" stroke="none">100mm calibration box - measure after printing; it MUST equal exactly 100mm.</text>`)
  const crossSize = 3
  const corners: Array<[number, number]> = [[3, stripTop + 3], [widthMm - 3, stripTop + 3], [3, stripTop + paper.widthMm - 3], [widthMm - 3, stripTop + paper.widthMm - 3]]
  for (const [cx, cy] of corners) {
    parts.push(`<line x1="${cx - crossSize / 2}" y1="${cy}" x2="${cx + crossSize / 2}" y2="${cy}"/>`)
    parts.push(`<line x1="${cx}" y1="${cy - crossSize / 2}" x2="${cx}" y2="${cy + crossSize / 2}"/>`)
  }
  // Feed direction arrow
  const arrowY = stripTop + paper.widthMm + 6
  const arrowDir = paper.feedDirection === 'right-to-left' ? -1 : 1
  const arrowStart = arrowDir === 1 ? 10 : widthMm - 10
  const arrowEnd = arrowDir === 1 ? 30 : widthMm - 30
  parts.push(`<line x1="${arrowStart}" y1="${arrowY}" x2="${arrowEnd}" y2="${arrowY}" stroke-width="0.4"/>`)
  parts.push(`<polygon points="${arrowEnd},${arrowY - 2} ${arrowEnd},${arrowY + 2} ${arrowEnd + arrowDir * 4},${arrowY}" fill="${SILHOUETTE_LAYERS.REGISTRATION_MARKS.cssColor}"/>`)
  parts.push('</g>')

  // --- NO_CUT_LABELS: required informational text ---
  parts.push(`<g id="${SILHOUETTE_LAYERS.NO_CUT_LABELS.name}" fill="${SILHOUETTE_LAYERS.NO_CUT_LABELS.cssColor}" stroke="none" font-family="sans-serif">`)
  parts.push(`<text x="2" y="5" font-size="4" font-weight="bold">PRINT AT 100% / ACTUAL SIZE</text>`)
  parts.push(`<text x="2" y="10" font-size="3">Do NOT use "Fit to Page" - scaling will misalign every hole.</text>`)
  parts.push(`<text x="2" y="14" font-size="2.4">Mechanism: ${esc(profile.name)} | Paper: ${esc(paper.name)} | Strip ${page.pageNumber} of ${totalPages} | Feed: ${esc(paper.feedDirection)}</text>`)
  parts.push(`<text x="2" y="${arrowY + 5}" font-size="2.2">Feed direction -&gt; (arrow above). High-note side: ${esc(paper.highNoteSide)}.</text>`)
  if (page.leadingEdgeKind === 'join') {
    parts.push(`<text x="${leadingEdgeMm + 1}" y="${stripTop - 1}" font-size="2.2" fill="${SILHOUETTE_LAYERS.NO_CUT_LABELS.cssColor}">JOIN - zigzag-cut splice to previous sheet here, keep clear of holes</text>`)
  }
  if (page.trailingEdgeKind === 'join') {
    parts.push(`<text x="${widthMm - trailingEdgeMm - 60}" y="${stripTop - 1}" font-size="2.2" fill="${SILHOUETTE_LAYERS.NO_CUT_LABELS.cssColor}">JOIN - zigzag-cut splice to next sheet here, keep clear of holes</text>`)
  }
  parts.push('</g>')

  // --- CUT_OUTLINE: only when explicitly approved ---
  if (opts.includeOutlineCut) {
    parts.push(`<g id="${SILHOUETTE_LAYERS.CUT_OUTLINE.name}" stroke="${SILHOUETTE_LAYERS.CUT_OUTLINE.cssColor}" fill="none" stroke-width="0.1">`)
    parts.push(`<rect x="0" y="${stripTop}" width="${widthMm}" height="${paper.widthMm}"/>`)
    parts.push('</g>')
  }

  // --- CUT_HOLES: the actual punch geometry ---
  parts.push(`<g id="${SILHOUETTE_LAYERS.CUT_HOLES.name}" stroke="${SILHOUETTE_LAYERS.CUT_HOLES.cssColor}" fill="none" stroke-width="0.1">`)
  for (const hole of page.holes) {
    const cx = hole.localMm
    const cy = stripTop + hole.laneMm
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${paper.holeDiameterMm / 2}"/>`)
  }
  parts.push('</g>')

  parts.push('</svg>')
  return parts.join('\n')
}
