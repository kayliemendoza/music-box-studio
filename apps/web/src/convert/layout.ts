import type { PaperProfile } from '../model/paper'

export interface StripLayoutConfig {
  /** Smallest rhythmic subdivision represented by one timing-grid column, in beats (quarter-note = 1 beat). */
  gridUnitBeats: number
}

export function defaultStripLayoutConfig(): StripLayoutConfig {
  return { gridUnitBeats: 0.25 } // sixteenth-note grid
}

/** Snap a beat position to the nearest timing-grid column index (0-based). */
export function beatToGridColumn(startBeat: number, layout: StripLayoutConfig): number {
  return Math.round(startBeat / layout.gridUnitBeats)
}

/** Physical horizontal distance (mm) from the leading edge of playable area for a grid column. */
export function gridColumnToMm(column: number, paper: PaperProfile): number {
  return paper.leadingMarginMm + column * paper.timingGridSpacingMm
}

export function beatToMm(startBeat: number, layout: StripLayoutConfig, paper: PaperProfile): number {
  return gridColumnToMm(beatToGridColumn(startBeat, layout), paper)
}

/** Vertical center (mm from paper edge carrying lane 1) of a given lane number (1-based). */
export function laneToMm(lane: number, paper: PaperProfile): number {
  return paper.firstLaneOffsetMm + (lane - 1) * paper.laneSpacingMm
}
