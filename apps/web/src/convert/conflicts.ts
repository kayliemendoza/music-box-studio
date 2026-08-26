import type { NoteEvent } from '../model/types'
import type { MechanismProfile } from '../model/mechanism'
import type { PaperProfile } from '../model/paper'
import type { StripLayoutConfig } from './layout'
import { beatToGridColumn, gridColumnToMm } from './layout'

export interface SameLaneConflict {
  type: 'same-note-reset-conflict'
  lane: number
  firstEventId: string
  secondEventId: string
  gridColumnGap: number
  mmGap: number | null
  requiredGridGap: number
  requiredMmGap: number | null
  message: string
}

export interface RepairSuggestion {
  action: 'nudge-later-note-forward' | 'stretch-timeline' | 'simplify-repeat' | 'remove-duplicate'
  description: string
}

/**
 * Detect notes sharing the same physical lane too closely together for the hook to
 * reset. Uses the calibrated mm rule when available (paper calibrated + mechanism
 * minCenterDistanceMm set); otherwise falls back to the conservative editable
 * grid-position rule. Never auto-resolves — callers surface these for user action.
 */
export function detectSameLaneConflicts(
  events: NoteEvent[],
  profile: MechanismProfile,
  paper: PaperProfile,
  layout: StripLayoutConfig,
): SameLaneConflict[] {
  const conflicts: SameLaneConflict[] = []
  const byLane = new Map<number, NoteEvent[]>()

  for (const ev of events) {
    if (ev.isRest || !ev.conversion || ev.conversion.lane === null) continue
    const lane = ev.conversion.lane
    if (!byLane.has(lane)) byLane.set(lane, [])
    byLane.get(lane)!.push(ev)
  }

  const useMmRule = paper.isCalibrated && profile.minCenterDistanceMm !== null

  for (const [lane, laneEvents] of byLane) {
    const sorted = [...laneEvents].sort((a, b) => a.startBeat - b.startBeat)
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]
      const b = sorted[i + 1]
      const colA = beatToGridColumn(a.startBeat, layout)
      const colB = beatToGridColumn(b.startBeat, layout)
      const gap = colB - colA
      if (gap === 0) continue // simultaneous notes on the same lane are a data issue elsewhere, not a reset conflict

      const mmGap = useMmRule ? gridColumnToMm(colB, paper) - gridColumnToMm(colA, paper) : null

      const violatesGridRule = gap - 1 < profile.minGridGapSameLane
      const violatesMmRule = useMmRule && mmGap !== null && mmGap < (profile.minCenterDistanceMm as number)

      if ((useMmRule && violatesMmRule) || (!useMmRule && violatesGridRule)) {
        conflicts.push({
          type: 'same-note-reset-conflict',
          lane,
          firstEventId: a.id,
          secondEventId: b.id,
          gridColumnGap: gap,
          mmGap,
          requiredGridGap: profile.minGridGapSameLane,
          requiredMmGap: profile.minCenterDistanceMm,
          message: useMmRule
            ? `Lane ${lane}: repeated hole ${mmGap?.toFixed(2)}mm apart, needs >= ${profile.minCenterDistanceMm}mm for the hook to reset.`
            : `Lane ${lane}: repeated hole only ${gap} grid column(s) apart, needs >= ${profile.minGridGapSameLane + 1}.`,
        })
      }
    }
  }
  return conflicts
}

export function suggestConflictRepairs(_conflict: SameLaneConflict): RepairSuggestion[] {
  return [
    { action: 'nudge-later-note-forward', description: 'Move the second note later by one grid column.' },
    { action: 'stretch-timeline', description: 'Stretch the whole timeline (slower reference tempo) to widen all gaps proportionally.' },
    { action: 'simplify-repeat', description: 'Merge the repeat into a single longer-sounding hole (loses the re-articulation).' },
    { action: 'remove-duplicate', description: 'Delete the second, closer-in note.' },
  ]
}

export interface TempoWarning {
  bpm: number
  recommendedMin: number
  recommendedMax: number
  aboveWarningThreshold: boolean
  message: string
}

export function checkTempoWarning(bpm: number, profile: MechanismProfile): TempoWarning {
  const above = bpm > profile.tempoWarningBpm
  return {
    bpm,
    recommendedMin: profile.recommendedTempoMinBpm,
    recommendedMax: profile.recommendedTempoMaxBpm,
    aboveWarningThreshold: above,
    message: above
      ? `${bpm} BPM is above the recommended hand-crank range (${profile.recommendedTempoMinBpm}-${profile.recommendedTempoMaxBpm} BPM). Still playable by hand-cranking faster, but tight passages may be hard to turn evenly.`
      : `${bpm} BPM is within the recommended hand-crank range (${profile.recommendedTempoMinBpm}-${profile.recommendedTempoMaxBpm} BPM).`,
  }
}
