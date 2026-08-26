import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { MechanismProfile } from '../model/mechanism'
import type { PaperProfile } from '../model/paper'
import type { StripPage } from './pageSplit'
import { laneToMm } from '../convert/layout'

export type PdfPageFormat = 'letter' | 'legal' | 'a4' | 'a3' | 'continuous-roll'

const PAGE_SIZES_MM: Record<Exclude<PdfPageFormat, 'continuous-roll'>, { w: number; h: number }> = {
  letter: { w: 215.9, h: 279.4 },
  legal: { w: 215.9, h: 355.6 },
  a4: { w: 210, h: 297 },
  a3: { w: 297, h: 420 },
}

const MM_TO_PT = 72 / 25.4
const TOP_BAND_MM = 18
const FOOTER_BAND_MM = 42
const TILE_PRINT_MARGIN_MM = 8

function mm(n: number): number {
  return n * MM_TO_PT
}

export interface PdfExportOptions {
  includeOutlineCut: boolean
}

interface TileSpec {
  startMm: number
  widthMm: number
  tileWidthMm: number
  pageHeightMm: number
  tileIndex: number
  tileCount: number
}

export async function generateStripPdf(
  page: StripPage,
  totalPages: number,
  profile: MechanismProfile,
  paper: PaperProfile,
  format: PdfPageFormat,
  opts: PdfExportOptions = { includeOutlineCut: false },
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const contentWidthMm = paper.maxSheetLengthMm
  const contentHeightMm = TOP_BAND_MM + paper.widthMm + FOOTER_BAND_MM

  const tiles: TileSpec[] = []
  if (format === 'continuous-roll') {
    tiles.push({ startMm: 0, widthMm: contentWidthMm, tileWidthMm: contentWidthMm, pageHeightMm: contentHeightMm, tileIndex: 1, tileCount: 1 })
  } else {
    const printable = PAGE_SIZES_MM[format]
    const tileWidthMm = Math.max(printable.w, printable.h) - TILE_PRINT_MARGIN_MM * 2
    const pageHeightMm = Math.min(printable.w, printable.h)
    const tileCount = Math.max(1, Math.ceil(contentWidthMm / tileWidthMm))
    for (let i = 0; i < tileCount; i++) {
      const startMm = i * tileWidthMm
      const widthMm = Math.min(tileWidthMm, contentWidthMm - startMm)
      tiles.push({ startMm, widthMm, tileWidthMm, pageHeightMm, tileIndex: i + 1, tileCount })
    }
  }

  for (const tile of tiles) {
    const pdfPage = pdfDoc.addPage([mm(tile.tileWidthMm), mm(tile.pageHeightMm)])
    drawTile(pdfPage, font, fontBold, page, totalPages, profile, paper, opts, tile)
  }

  return pdfDoc.save()
}

function flipY(mmY: number, pageHeightMm: number): number {
  return mm(pageHeightMm - mmY)
}

function drawTile(
  pdfPage: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  page: StripPage,
  totalPages: number,
  profile: MechanismProfile,
  paper: PaperProfile,
  opts: PdfExportOptions,
  tile: TileSpec,
): void {
  const stripTop = TOP_BAND_MM
  const black = rgb(0.05, 0.05, 0.05)
  const red = rgb(0.88, 0.11, 0.11)
  const cyan = rgb(0.03, 0.57, 0.7)
  const green = rgb(0.09, 0.64, 0.29)

  // PRINT_GUIDES: lane lines within this tile's slice
  for (const lane of profile.lanes) {
    const y = stripTop + laneToMm(lane.lane, paper)
    pdfPage.drawLine({ start: { x: 0, y: flipY(y, tile.pageHeightMm) }, end: { x: mm(tile.widthMm), y: flipY(y, tile.pageHeightMm) }, thickness: 0.3, color: cyan, opacity: 0.6 })
    pdfPage.drawText(lane.soundingNoteName, { x: 2, y: flipY(y, tile.pageHeightMm) + 1, size: 5, font, color: cyan })
  }

  // CUT_HOLES within this tile's mm range [startMm, startMm+widthMm)
  for (const hole of page.holes) {
    if (hole.localMm < tile.startMm || hole.localMm >= tile.startMm + tile.widthMm) continue
    const x = hole.localMm - tile.startMm
    const y = stripTop + hole.laneMm
    pdfPage.drawCircle({ x: mm(x), y: flipY(y, tile.pageHeightMm), size: mm(paper.holeDiameterMm / 2), borderColor: red, borderWidth: 0.4, color: undefined })
  }

  if (opts.includeOutlineCut) {
    pdfPage.drawRectangle({
      x: 0, y: flipY(stripTop + paper.widthMm, tile.pageHeightMm),
      width: mm(tile.widthMm), height: mm(paper.widthMm),
      borderColor: red, borderWidth: 0.4, color: undefined,
    })
  }

  // REGISTRATION_MARKS: 100mm calibration box (first tile only, to avoid repeating), corner crosses (every tile)
  if (tile.tileIndex === 1) {
    const calY = tile.pageHeightMm - FOOTER_BAND_MM + 22
    pdfPage.drawRectangle({ x: mm(5), y: flipY(calY + 8, tile.pageHeightMm), width: mm(100), height: mm(8), borderColor: green, borderWidth: 0.4, color: undefined })
    pdfPage.drawText('100mm calibration box - measure after printing; it MUST equal exactly 100mm.', { x: mm(5), y: flipY(calY - 1, tile.pageHeightMm), size: 6, font, color: green })
  }
  const crossSize = 3
  const corners: Array<[number, number]> = [[3, stripTop + 3], [tile.widthMm - 3, stripTop + 3], [3, stripTop + paper.widthMm - 3], [tile.widthMm - 3, stripTop + paper.widthMm - 3]]
  for (const [cx, cy] of corners) {
    pdfPage.drawLine({ start: { x: mm(cx - crossSize / 2), y: flipY(cy, tile.pageHeightMm) }, end: { x: mm(cx + crossSize / 2), y: flipY(cy, tile.pageHeightMm) }, thickness: 0.4, color: green })
    pdfPage.drawLine({ start: { x: mm(cx), y: flipY(cy - crossSize / 2, tile.pageHeightMm) }, end: { x: mm(cx), y: flipY(cy + crossSize / 2, tile.pageHeightMm) }, thickness: 0.4, color: green })
  }

  // Tile-to-tile alignment marks when a printed sheet must be joined to its neighbor
  if (tile.tileCount > 1) {
    if (tile.tileIndex > 1) {
      pdfPage.drawText('<- ALIGN with previous sheet\'s right edge mark', { x: mm(2), y: flipY(stripTop - 3, tile.pageHeightMm), size: 5, font, color: black })
    }
    if (tile.tileIndex < tile.tileCount) {
      pdfPage.drawText('ALIGN with next sheet\'s left edge mark ->', { x: mm(tile.widthMm - 70), y: flipY(stripTop - 3, tile.pageHeightMm), size: 5, font, color: black })
    }
  }

  // Feed direction arrow
  const arrowY = stripTop + paper.widthMm + 6
  pdfPage.drawLine({ start: { x: mm(10), y: flipY(arrowY, tile.pageHeightMm) }, end: { x: mm(30), y: flipY(arrowY, tile.pageHeightMm) }, thickness: 1, color: green })
  pdfPage.drawText('>', { x: mm(29), y: flipY(arrowY + 1.5, tile.pageHeightMm), size: 6, font: fontBold, color: green })

  // NO_CUT_LABELS: required text
  pdfPage.drawText('PRINT AT 100% / ACTUAL SIZE', { x: mm(2), y: flipY(5, tile.pageHeightMm), size: 9, font: fontBold, color: black })
  pdfPage.drawText('Do not use "Fit to Page" - scaling will misalign every hole.', { x: mm(2), y: flipY(9.5, tile.pageHeightMm), size: 6, font, color: black })
  const tileLabel = tile.tileCount > 1 ? ` | Print sheet ${tile.tileIndex} of ${tile.tileCount}` : ''
  pdfPage.drawText(
    `Mechanism: ${profile.name} | Paper: ${paper.name} | Strip ${page.pageNumber} of ${totalPages}${tileLabel} | Feed: ${paper.feedDirection}`,
    { x: mm(2), y: flipY(13, tile.pageHeightMm), size: 5, font, color: black },
  )
  pdfPage.drawText(`High-note side: ${paper.highNoteSide}`, { x: mm(2), y: flipY(arrowY + 5, tile.pageHeightMm), size: 5, font, color: black })
}
