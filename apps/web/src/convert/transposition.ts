import type { NoteEvent } from '../model/types'
import type { MechanismProfile } from '../model/mechanism'
import type { PaperProfile } from '../model/paper'
import { applyMechanismMapping } from './playability'
import { detectSameLaneConflicts } from './conflicts'
import { defaultStripLayoutConfig, type StripLayoutConfig } from './layout'

export interface TranspositionOption {
  semitones: number
  exactCount: number
  octaveAdjustedCount: number
  alteredCount: number
  unresolvedCount: number
  conflictCount: number
  contourPreservationScore: number // 0..1, 1 = every melodic direction preserved
  downbeatPreservationScore: number // 0..1, 1 = every strong downbeat stayed exact/octave-only
  score: number
}

function range(min: number, max: number): number[] {
  const a: number[] = []
  for (let i = min; i <= max; i++) a.push(i)
  return a
}

/** Score every transposition from -12..+12 semitones (default) so the user can compare and pick. */
export function scoreTranspositionOptions(
  events: NoteEvent[],
  profile: MechanismProfile,
  paper: PaperProfile,
  layout: StripLayoutConfig = defaultStripLayoutConfig(),
  semitoneRange: number[] = range(-12, 12),
): TranspositionOption[] {
  const pitchedEvents = events.filter((e) => !e.isRest)
  return semitoneRange
    .map((semitones) => scoreOne(pitchedEvents, profile, paper, layout, semitones))
    .sort((a, b) => b.score - a.score || Math.abs(a.semitones) - Math.abs(b.semitones))
}

export function bestTransposition(options: TranspositionOption[]): TranspositionOption {
  return options[0]
}

function scoreOne(
  events: NoteEvent[],
  profile: MechanismProfile,
  paper: PaperProfile,
  layout: StripLayoutConfig,
  semitones: number,
): TranspositionOption {
  const transposed = events.map((e) => ({ ...e, midiPitch: e.midiPitch + semitones }))
  const mapped = applyMechanismMapping(transposed, profile)

  let exact = 0
  let octave = 0
  let altered = 0
  let unresolved = 0
  for (const ev of mapped) {
    switch (ev.conversion?.reason) {
      case 'exact-match': exact++; break
      case 'octave-folded': octave++; break
      case 'nearest-suggested': altered++; break
      case 'unsupported-no-suggestion': unresolved++; break
    }
  }

  const conflicts = detectSameLaneConflicts(mapped, profile, paper, layout)
  const contour = contourPreservationScore(events, mapped)
  const downbeat = downbeatPreservationScore(events, mapped)

  const score =
    exact * 3 +
    octave * 1 -
    altered * 4 -
    unresolved * 6 -
    conflicts.length * 5 +
    contour * 10 +
    downbeat * 8

  return {
    semitones,
    exactCount: exact,
    octaveAdjustedCount: octave,
    alteredCount: altered,
    unresolvedCount: unresolved,
    conflictCount: conflicts.length,
    contourPreservationScore: contour,
    downbeatPreservationScore: downbeat,
    score,
  }
}

function contourPreservationScore(original: NoteEvent[], mapped: NoteEvent[]): number {
  const origSorted = [...original].sort((a, b) => a.startBeat - b.startBeat)
  const mappedById = new Map(mapped.map((e) => [e.id, e]))
  let total = 0
  let matches = 0
  for (let i = 0; i < origSorted.length - 1; i++) {
    const a = origSorted[i]
    const b = origSorted[i + 1]
    if (a.startBeat === b.startBeat) continue // simultaneous (chord) - no melodic direction
    const origDir = Math.sign(b.midiPitch - a.midiPitch)
    const ma = mappedById.get(a.id)
    const mb = mappedById.get(b.id)
    const pa = ma?.conversion?.mappedMidiPitch
    const pb = mb?.conversion?.mappedMidiPitch
    total++
    if (pa == null || pb == null) continue
    if (Math.sign(pb - pa) === origDir) matches++
  }
  return total === 0 ? 1 : matches / total
}

function downbeatPreservationScore(original: NoteEvent[], mapped: NoteEvent[]): number {
  const mappedById = new Map(mapped.map((e) => [e.id, e]))
  const downbeats = original.filter((e) => e.sourceBeat === 1 && e.durationBeats >= 1)
  if (downbeats.length === 0) return 1
  let preserved = 0
  for (const ev of downbeats) {
    const m = mappedById.get(ev.id)
    if (m?.conversion && (m.conversion.reason === 'exact-match' || m.conversion.reason === 'octave-folded')) preserved++
  }
  return preserved / downbeats.length
}
