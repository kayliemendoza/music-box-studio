import { parseNoteName } from '../music/pitch'

/**
 * One physical lane on the strip. `lane` (1 = top / highest note by default feed
 * orientation) is the permanent source of truth — never re-derive it from pitch
 * order, since custom profiles may not be monotonic.
 *
 * `printedLabel` is deliberately separate from `soundingNoteName`: many 30-note
 * strips are silkscreened with labels that do NOT match the pitch the mechanism
 * actually plays. Never map a song using printedLabel alone.
 */
export interface MechanismLane {
  lane: number
  soundingMidiPitch: number
  soundingNoteName: string
  printedLabel: string
}

export interface MechanismProfile {
  id: string
  name: string
  description: string
  lanes: MechanismLane[]
  /** Minimum number of empty timing-grid slots required between two holes on the same lane. */
  minGridGapSameLane: number
  /** Minimum physical center-to-center distance (mm) between two holes on the same lane, once calibrated. */
  minCenterDistanceMm: number | null
  recommendedTempoMinBpm: number
  recommendedTempoMaxBpm: number
  tempoWarningBpm: number
}

/** Sounding pitches, top lane (1) to bottom lane (30), for the Yunsheng Y30H2 / Grand Illusions 30-note mechanism. */
const Y30H2_SOUNDING_NOTES_TOP_TO_BOTTOM = [
  'A6', 'G6', 'F6', 'E6', 'D#6', 'D6', 'C#6', 'C6', 'B5', 'A#5',
  'A5', 'G#5', 'G5', 'F#5', 'F5', 'E5', 'D#5', 'D5', 'C#5', 'C5',
  'B4', 'A#4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4', 'G3', 'F3',
]

export function buildY30H2Profile(): MechanismProfile {
  const lanes: MechanismLane[] = Y30H2_SOUNDING_NOTES_TOP_TO_BOTTOM.map((name, i) => {
    const midi = parseNoteName(name).midi
    return {
      lane: i + 1,
      soundingMidiPitch: midi,
      soundingNoteName: name,
      // Default: printed label mirrors the sounding note. This is a placeholder —
      // real 30-note strips often print different labels than what actually sounds.
      // Override via the calibration wizard once the instruction sheet is scanned.
      printedLabel: name,
    }
  })
  return {
    id: 'yunsheng-y30h2',
    name: 'Yunsheng Y30H2-style 30-note (F-scale)',
    description:
      'Hand-cranked 30-note paper-strip mechanism, physical F-scale layout. Lane 1 = top/highest sounding pitch (A6), lane 30 = bottom/lowest (F3).',
    lanes,
    minGridGapSameLane: 1,
    minCenterDistanceMm: null,
    recommendedTempoMinBpm: 60,
    recommendedTempoMaxBpm: 95,
    tempoWarningBpm: 95,
  }
}

export function laneForMidiPitch(profile: MechanismProfile, midi: number): MechanismLane | undefined {
  return profile.lanes.find((l) => l.soundingMidiPitch === midi)
}

export function midiPitchRange(profile: MechanismProfile): { min: number; max: number } {
  const pitches = profile.lanes.map((l) => l.soundingMidiPitch)
  return { min: Math.min(...pitches), max: Math.max(...pitches) }
}

/** All sounding MIDI pitches available on this mechanism, sorted ascending. */
export function availablePitchSet(profile: MechanismProfile): Set<number> {
  return new Set(profile.lanes.map((l) => l.soundingMidiPitch))
}

export function cloneMechanismProfile(profile: MechanismProfile): MechanismProfile {
  return JSON.parse(JSON.stringify(profile))
}
