/**
 * Physical geometry of the paper strip, kept separate from the arrangement so the
 * same converted song can later be re-exported for a different batch of paper.
 * ALL of these are placeholder starting values — they must be confirmed or replaced
 * via the calibration wizard against a real scan/test print before physical export.
 */
export interface PaperProfile {
  id: string
  name: string
  isCalibrated: boolean

  widthMm: number
  /** Maximum usable length of one physical sheet/roll segment, in mm. */
  maxSheetLengthMm: number

  /** Distance from the paper's top edge to lane 1's center line, in mm. */
  firstLaneOffsetMm: number
  /** Center-to-center distance between adjacent lanes, in mm. */
  laneSpacingMm: number
  /** Number of lanes this paper is printed/punched for (should match the mechanism profile). */
  laneCount: number

  /** Distance in mm between adjacent timing-grid columns (horizontal = feed direction). */
  timingGridSpacingMm: number

  holeDiameterMm: number

  /** Blank leader before the first playable column, in mm. */
  leadingMarginMm: number
  /** Blank trailer after the last playable column, in mm. */
  endingMarginMm: number

  /** Regions (by distance range from the leading edge) that must stay hole-free: splices, joins, sprocket areas. */
  unusableRegionsMm: Array<{ startMm: number; endMm: number; label: string }>

  feedDirection: 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top'
  /** Which physical edge of the paper carries the highest-pitched lane (lane 1). */
  highNoteSide: 'top' | 'bottom' | 'left' | 'right'

  /**
   * The mechanism reads a hole at one edge of it (in the feed direction), not its
   * geometric center. Positive = trigger point is downstream of the hole center,
   * i.e. later in the feed direction, by this many mm.
   */
  triggerEdgeOffsetMm: number

  printerCalibrationCorrectionMm: number
  silhouetteCuttingOffsetMm: number

  /**
   * If true, a song spanning multiple physical sheets is exported assuming you'll
   * physically join them (e.g. a precise zigzag-cut splice, taped seamless) rather than
   * treating every sheet as fully independent. Off by default - taping strips together is
   * a real risk of jamming the mechanism (see the community guide) unless done carefully,
   * so this is opt-in for someone who has verified their own splicing technique works.
   */
  allowTapedJoins: boolean
  /**
   * Hole-free clearance kept on each side of an internal join, in mm, when
   * allowTapedJoins is true. Much smaller than leadingMarginMm/endingMarginMm - a join
   * doesn't need room to feed the strip into the mechanism, just room for the splice
   * itself (the cut + taped seam) to pass the trigger point without a hole sitting on it.
   */
  spliceClearanceMm: number
}

export function buildDefaultPaperProfile(): PaperProfile {
  return {
    id: 'default-y30h2-paper',
    name: 'Y30H2 30-note paper (uncalibrated defaults)',
    isCalibrated: false,
    widthMm: 70,
    maxSheetLengthMm: 900,
    firstLaneOffsetMm: 3,
    laneSpacingMm: 2.1,
    laneCount: 30,
    timingGridSpacingMm: 2.0,
    holeDiameterMm: 3.175, // 1/8 in — editable starting value only, per calibration requirements
    leadingMarginMm: 20,
    endingMarginMm: 20,
    unusableRegionsMm: [],
    feedDirection: 'left-to-right',
    highNoteSide: 'top',
    triggerEdgeOffsetMm: 0,
    printerCalibrationCorrectionMm: 0,
    silhouetteCuttingOffsetMm: 0,
    allowTapedJoins: false,
    spliceClearanceMm: 4, // roughly one or two grid columns at default spacing - editable placeholder, confirm against your own splice technique
  }
}

/** Usable length for playable holes on one sheet, after leader/trailer margins (independent-sheets mode). */
export function usablePlayLengthMm(paper: PaperProfile): number {
  return Math.max(0, paper.maxSheetLengthMm - paper.leadingMarginMm - paper.endingMarginMm)
}

export function isWithinUnusableRegion(paper: PaperProfile, distanceMm: number): boolean {
  return paper.unusableRegionsMm.some((r) => distanceMm >= r.startMm && distanceMm <= r.endMm)
}

export function clonePaperProfile(paper: PaperProfile): PaperProfile {
  return JSON.parse(JSON.stringify(paper))
}
