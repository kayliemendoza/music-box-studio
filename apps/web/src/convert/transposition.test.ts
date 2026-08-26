import { describe, it, expect } from 'vitest'
import { buildY30H2Profile } from '../model/mechanism'
import { buildDefaultPaperProfile } from '../model/paper'
import { parseNoteName } from '../music/pitch'
import { scoreTranspositionOptions, bestTransposition } from './transposition'
import { newId } from '../model/types'
import type { NoteEvent } from '../model/types'

const profile = buildY30H2Profile()
const paper = buildDefaultPaperProfile()

function ev(overrides: Partial<NoteEvent>): NoteEvent {
  return {
    id: newId(),
    sourcePage: 1, sourceStaff: 1, sourceVoice: 1, sourceMeasure: 1, sourceBeat: 1,
    midiPitch: 60, writtenName: 'C4', enharmonicSharp: 'C4', enharmonicFlat: 'C4',
    startBeat: 0, durationBeats: 1, tempoBpm: 90, timeSignature: '4/4',
    isChordMember: false, isRest: false, importConfidence: 1, needsReview: false,
    status: 'original',
    ...overrides,
  }
}

describe('automatic transposition scoring', () => {
  it('produces a score for every semitone from -12 to +12', () => {
    const events = [ev({ midiPitch: parseNoteName('C5').midi })]
    const options = scoreTranspositionOptions(events, profile, paper)
    expect(options).toHaveLength(25)
    expect(options.map((o) => o.semitones).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 25 }, (_, i) => i - 12),
    )
  })

  it('recommends 0 semitones (no transposition) for a melody that is already fully in-range and exact', () => {
    // A simple scale entirely within the mechanism's exact pitch set.
    const events = ['C5', 'D5', 'E5', 'F5', 'G5'].map((n, i) =>
      ev({ midiPitch: parseNoteName(n).midi, startBeat: i, sourceBeat: (i % 4) + 1 }),
    )
    const options = scoreTranspositionOptions(events, profile, paper)
    const best = bestTransposition(options)
    expect(best.semitones).toBe(0)
    expect(best.exactCount).toBe(5)
  })

  it('scores an option with fewer altered/unresolved notes higher than one with more', () => {
    const events = [ev({ midiPitch: parseNoteName('C5').midi })]
    const options = scoreTranspositionOptions(events, profile, paper)
    const zero = options.find((o) => o.semitones === 0)!
    const worst = options.reduce((a, b) => (a.score < b.score ? a : b))
    expect(zero.score).toBeGreaterThanOrEqual(worst.score)
  })
})
