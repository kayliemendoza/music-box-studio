import type { NoteEvent, ConversionReason } from '../model/types'
import type { MechanismProfile } from '../model/mechanism'
import { availablePitchSet, laneForMidiPitch, midiPitchRange } from '../model/mechanism'

export interface PitchMappingResult {
  reason: ConversionReason
  mappedMidiPitch: number | null
  suggestions: number[] // alternative MIDI pitches, nearest first, when reason === 'nearest-suggested'
  autoApproved: boolean
}

/**
 * When choosing among nearest-playable candidates, a chord tone is treated as if it were
 * this many semitones closer than it actually is - close enough that a genuinely nearer
 * non-chord-tone still wins, but a tied or near-tied candidate that's actually consonant
 * with the harmony wins over one that just happens to be numerically closest.
 */
const CHORD_TONE_PREFERENCE_BONUS = 1.5

/**
 * Map a single source pitch onto the mechanism's available pitch set, following the
 * required priority order: exact match -> octave-equivalent -> nearest suggestions.
 * Never returns a silent decision for anything beyond exact-match/octave-fold: the
 * caller is responsible for tracking approval state for 'nearest-suggested' results.
 *
 * `harmonicContextPitchClasses`, when known (the note falls under a lead-sheet chord
 * symbol), steers nearest-pitch suggestions toward a substitute that's still consonant
 * with the active harmony rather than one that's merely numerically closest.
 */
export function mapPitchToMechanism(
  midi: number,
  profile: MechanismProfile,
  harmonicContextPitchClasses?: number[],
): PitchMappingResult {
  const available = availablePitchSet(profile)

  if (available.has(midi)) {
    return { reason: 'exact-match', mappedMidiPitch: midi, suggestions: [], autoApproved: true }
  }

  // Octave-folding only applies when the note is outside the mechanism's range: shift
  // it by whole octaves onto an available copy of the same pitch class. A note that is
  // already in-range but falls in a gap (e.g. G#4 on the Y30H2) is NOT octave-folded -
  // jumping it to a same-named pitch in a different register is a bigger, more audible
  // change, so it goes through nearest-pitch review instead (see below).
  if (isOutOfRange(midi, profile)) {
    const pitchClass = ((midi % 12) + 12) % 12
    const octaveCandidates = [...available]
      .filter((p) => ((p % 12) + 12) % 12 === pitchClass)
      .sort((a, b) => Math.abs(a - midi) - Math.abs(b - midi))
    if (octaveCandidates.length > 0) {
      return {
        reason: 'octave-folded',
        mappedMidiPitch: octaveCandidates[0],
        suggestions: octaveCandidates,
        autoApproved: true,
      }
    }
  }

  // No exact pitch-class match anywhere in range: suggest nearest playable pitches.
  const suggestions = nearestPlayablePitches(midi, profile, 5, harmonicContextPitchClasses)
  if (suggestions.length === 0) {
    return { reason: 'unsupported-no-suggestion', mappedMidiPitch: null, suggestions: [], autoApproved: false }
  }
  return {
    reason: 'nearest-suggested',
    mappedMidiPitch: suggestions[0],
    suggestions,
    autoApproved: false,
  }
}

/**
 * Nearest playable MIDI pitches to `midi`, closest first. When `preferredPitchClasses` is
 * given (the active chord's tones), a candidate belonging to it is treated as
 * CHORD_TONE_PREFERENCE_BONUS semitones closer than it actually is - enough to win a tie
 * or near-tie against an equally-close-but-dissonant option, not enough to override a
 * candidate that's genuinely much closer. Ties after that prefer the higher pitch.
 */
export function nearestPlayablePitches(
  midi: number,
  profile: MechanismProfile,
  maxCount = 5,
  preferredPitchClasses?: number[],
): number[] {
  const preferred = preferredPitchClasses ? new Set(preferredPitchClasses) : null
  const available = [...availablePitchSet(profile)]

  function weightedDistance(p: number): number {
    const raw = Math.abs(p - midi)
    const isPreferred = preferred?.has(((p % 12) + 12) % 12) ?? false
    return isPreferred ? Math.max(0, raw - CHORD_TONE_PREFERENCE_BONUS) : raw
  }

  return available
    .sort((a, b) => {
      const wa = weightedDistance(a)
      const wb = weightedDistance(b)
      if (wa !== wb) return wa - wb
      return b - a // prefer higher pitch on ties
    })
    .slice(0, maxCount)
}

export function isOutOfRange(midi: number, profile: MechanismProfile): boolean {
  const { min, max } = midiPitchRange(profile)
  return midi < min || midi > max
}

/**
 * Apply mechanism mapping to every event, returning new events with `conversion`
 * populated. Rests pass through untouched. Never mutates input events or drops
 * anything from the array — unresolved/removed notes stay present with a status
 * the UI can surface.
 */
export function applyMechanismMapping(events: NoteEvent[], profile: MechanismProfile): NoteEvent[] {
  return events.map((ev) => {
    if (ev.isRest) return ev
    const result = mapPitchToMechanism(ev.midiPitch, profile, ev.harmonicContextPitchClasses)
    const lane = result.mappedMidiPitch !== null ? laneForMidiPitch(profile, result.mappedMidiPitch)?.lane ?? null : null
    return {
      ...ev,
      status: result.reason === 'exact-match' ? 'mapped' : result.reason === 'unsupported-no-suggestion' ? 'unresolved' : 'changed',
      conversion: {
        reason: result.reason,
        mappedMidiPitch: result.mappedMidiPitch,
        lane,
        approved: result.autoApproved,
      },
    } satisfies NoteEvent
  })
}
