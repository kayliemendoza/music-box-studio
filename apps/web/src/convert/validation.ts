import type { NoteEvent } from '../model/types'
import type { MechanismProfile } from '../model/mechanism'
import type { PaperProfile } from '../model/paper'
import type { StripLayoutConfig } from './layout'
import { detectSameLaneConflicts, type SameLaneConflict } from './conflicts'
import { splitIntoPages, totalPlayingTimeSeconds } from '../export/pageSplit'

export interface ValidationIssue {
  code: string
  message: string
  severity: 'blocking' | 'warning'
}

export interface ExportSummary {
  originalNoteCount: number
  exactRetained: number
  octaveAdjusted: number
  replaced: number
  removed: number
  unresolved: number
  mechanicalConflicts: number
  totalStripLengthMm: number
  numberOfSheets: number
  estimatedPlayingTimeSeconds: number
}

export interface ValidationResult {
  canExport: boolean
  issues: ValidationIssue[]
  summary: ExportSummary
  conflicts: SameLaneConflict[]
}

export function conflictKey(c: Pick<SameLaneConflict, 'lane' | 'firstEventId' | 'secondEventId'>): string {
  return `${c.lane}:${c.firstEventId}:${c.secondEventId}`
}

export function validateForExport(
  events: NoteEvent[],
  profile: MechanismProfile,
  paper: PaperProfile,
  layout: StripLayoutConfig,
  acceptedConflictIds: Set<string>,
): ValidationResult {
  const issues: ValidationIssue[] = []
  const pitched = events.filter((e) => !e.isRest)

  const stillNeedsOmrReview = events.filter((e) => e.needsReview)
  if (stillNeedsOmrReview.length > 0) {
    issues.push({
      code: 'omr-unconfirmed',
      message: `${stillNeedsOmrReview.length} note(s) imported from optical music recognition still need manual confirmation.`,
      severity: 'blocking',
    })
  }

  const pendingApproval = pitched.filter((e) => e.conversion && !e.conversion.approved)
  if (pendingApproval.length > 0) {
    issues.push({
      code: 'unsupported-pitch-unresolved',
      message: `${pendingApproval.length} note(s) have a suggested pitch substitution awaiting your approval, rejection, or manual edit.`,
      severity: 'blocking',
    })
  }

  const trulyUnresolved = pitched.filter((e) => e.status === 'unresolved')
  if (trulyUnresolved.length > 0) {
    issues.push({
      code: 'unresolved-pitch',
      message: `${trulyUnresolved.length} note(s) have no playable pitch on this mechanism and no accepted resolution yet.`,
      severity: 'blocking',
    })
  }

  if (!paper.isCalibrated) {
    issues.push({
      code: 'paper-not-calibrated',
      message: 'The paper profile has not been confirmed against a real scan/test print via the calibration wizard.',
      severity: 'blocking',
    })
  }

  const conflicts = detectSameLaneConflicts(events, profile, paper, layout)
  const unacceptedConflicts = conflicts.filter((c) => !acceptedConflictIds.has(conflictKey(c)))
  if (unacceptedConflicts.length > 0) {
    issues.push({
      code: 'same-note-reset-conflict',
      message: `${unacceptedConflicts.length} same-lane reset conflict(s) are not yet resolved or explicitly accepted.`,
      severity: 'blocking',
    })
  }

  const invalidLanes = pitched.filter((e) => e.conversion?.approved && e.conversion.lane != null && (e.conversion.lane < 1 || e.conversion.lane > profile.lanes.length))
  if (invalidLanes.length > 0) {
    issues.push({ code: 'invalid-lane', message: `${invalidLanes.length} hole(s) resolve to a lane outside the mechanism's 1-${profile.lanes.length} range.`, severity: 'blocking' })
  }

  let pages: ReturnType<typeof splitIntoPages> = []
  let outOfRegionCount = 0
  try {
    pages = splitIntoPages(events, paper, layout)
    for (const page of pages) {
      for (const hole of page.holes) {
        const overEnd = hole.localMm > paper.maxSheetLengthMm - paper.endingMarginMm
        const underStart = hole.localMm < paper.leadingMarginMm - 1e-6
        if (overEnd || underStart || hole.inUnusableRegion) outOfRegionCount++
      }
    }
  } catch (err) {
    issues.push({ code: 'no-usable-length', message: (err as Error).message, severity: 'blocking' })
  }
  if (outOfRegionCount > 0) {
    issues.push({
      code: 'hole-outside-usable-region',
      message: `${outOfRegionCount} hole(s) fall outside the usable paper region (margins or a configured unusable/join area).`,
      severity: 'blocking',
    })
  }

  const summary: ExportSummary = {
    originalNoteCount: pitched.length,
    exactRetained: pitched.filter((e) => e.conversion?.reason === 'exact-match').length,
    octaveAdjusted: pitched.filter((e) => e.conversion?.reason === 'octave-folded').length,
    replaced: pitched.filter((e) => e.conversion?.reason === 'nearest-suggested' && e.conversion.approved).length,
    removed: pitched.filter((e) => e.status === 'removed').length,
    unresolved: pitched.filter((e) => e.status === 'unresolved' || (e.conversion && !e.conversion.approved)).length,
    mechanicalConflicts: unacceptedConflicts.length,
    totalStripLengthMm: pages.reduce((sum, p) => sum + Math.min(paper.maxSheetLengthMm, p.contentLengthMm + paper.endingMarginMm), 0),
    numberOfSheets: pages.length,
    estimatedPlayingTimeSeconds: totalPlayingTimeSeconds(events),
  }

  return {
    canExport: issues.every((i) => i.severity !== 'blocking'),
    issues,
    summary,
    conflicts,
  }
}
