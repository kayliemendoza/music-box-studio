import type { MechanismProfile } from '../model/mechanism'
import type { PaperProfile } from '../model/paper'
import type { StripPage } from './pageSplit'
import { laneToMm } from '../convert/layout'
import { DxfDocument } from './dxfBuilder'
import { SILHOUETTE_LAYERS } from './layers'

export interface DxfExportOptions {
  includeOutlineCut: boolean
}

/**
 * Silhouette Curio 2 cut file: DXF with true CAD layers (Silhouette Studio maps DXF
 * layers directly to its own cut/no-cut layers on import). Only CUT_HOLES and, when
 * explicitly approved, CUT_OUTLINE contain cuttable geometry - everything else lives
 * on non-cut reference layers so guides/labels/measure marks can never be cut by
 * mistake. All coordinates in millimeters.
 */
export function generateStripDxf(
  page: StripPage,
  totalPages: number,
  profile: MechanismProfile,
  paper: PaperProfile,
  opts: DxfExportOptions = { includeOutlineCut: false },
): string {
  const doc = new DxfDocument()
  for (const layer of Object.values(SILHOUETTE_LAYERS)) doc.addLayer(layer)

  for (const hole of page.holes) {
    doc.addCircle(SILHOUETTE_LAYERS.CUT_HOLES.name, hole.localMm, hole.laneMm, paper.holeDiameterMm / 2)
  }

  if (opts.includeOutlineCut) {
    doc.addRectOutline(SILHOUETTE_LAYERS.CUT_OUTLINE.name, 0, 0, paper.maxSheetLengthMm, paper.widthMm)
  }

  for (const lane of profile.lanes) {
    const y = laneToMm(lane.lane, paper)
    doc.addLine(SILHOUETTE_LAYERS.PRINT_GUIDES.name, 0, y, paper.maxSheetLengthMm, y)
  }
  doc.addLine(SILHOUETTE_LAYERS.PRINT_GUIDES.name, paper.leadingMarginMm, 0, paper.leadingMarginMm, paper.widthMm)
  doc.addLine(SILHOUETTE_LAYERS.PRINT_GUIDES.name, paper.maxSheetLengthMm - paper.endingMarginMm, 0, paper.maxSheetLengthMm - paper.endingMarginMm, paper.widthMm)

  const crossSize = 3
  const corners: Array<[number, number]> = [[3, 3], [paper.maxSheetLengthMm - 3, 3], [3, paper.widthMm - 3], [paper.maxSheetLengthMm - 3, paper.widthMm - 3]]
  for (const [cx, cy] of corners) {
    doc.addLine(SILHOUETTE_LAYERS.REGISTRATION_MARKS.name, cx - crossSize / 2, cy, cx + crossSize / 2, cy)
    doc.addLine(SILHOUETTE_LAYERS.REGISTRATION_MARKS.name, cx, cy - crossSize / 2, cx, cy + crossSize / 2)
  }
  doc.addRectOutline(SILHOUETTE_LAYERS.REGISTRATION_MARKS.name, 5, paper.widthMm + 10, 100, 8)

  doc.addText(SILHOUETTE_LAYERS.NO_CUT_LABELS.name, 2, paper.widthMm + 4, 3, 'PRINT/CUT AT 100% - ACTUAL SIZE - DO NOT SCALE TO FIT')
  doc.addText(SILHOUETTE_LAYERS.NO_CUT_LABELS.name, 2, paper.widthMm + 1, 2, `${profile.name} | ${paper.name} | Strip ${page.pageNumber} of ${totalPages} | Feed: ${paper.feedDirection}`)

  return doc.toDxfString()
}
