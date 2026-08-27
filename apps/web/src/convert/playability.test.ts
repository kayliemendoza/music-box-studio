import { describe, it, expect } from 'vitest'
import { buildY30H2Profile } from '../model/mechanism'
import { parseNoteName } from '../music/pitch'
import { mapPitchToMechanism, isOutOfRange, applyMechanismMapping, nearestPlayablePitches } from './playability'
import type { NoteEvent } from '../model/types'
import { newId } from '../model/types'

const profile = buildY30H2Profile()

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

describe('pitch mapping onto the mechanism', () => {
  it('keeps an exact-match pitch unchanged', () => {
    const r = mapPitchToMechanism(parseNoteName('C5').midi, profile)
    expect(r.reason).toBe('exact-match')
    expect(r.mappedMidiPitch).toBe(parseNoteName('C5').midi)
    expect(r.autoApproved).toBe(true)
  })

  it('enharmonic equivalents map identically (A#5 == Bb5)', () => {
    const r1 = mapPitchToMechanism(parseNoteName('A#5').midi, profile)
    const r2 = mapPitchToMechanism(parseNoteName('Bb5').midi, profile)
    expect(r1.mappedMidiPitch).toBe(r2.mappedMidiPitch)
    expect(r1.reason).toBe('exact-match')
  })

  it('flags an out-of-range note (below F3)', () => {
    expect(isOutOfRange(parseNoteName('C3').midi, profile)).toBe(true)
    expect(isOutOfRange(parseNoteName('A6').midi, profile)).toBe(false)
  })

  it('folds an out-of-range note to the nearest available octave of the same pitch class', () => {
    // C3 is below range; C4 exists on the mechanism (lane 28).
    const r = mapPitchToMechanism(parseNoteName('C3').midi, profile)
    expect(r.reason).toBe('octave-folded')
    expect(r.mappedMidiPitch).toBe(parseNoteName('C4').midi)
  })

  it('produces a review item with nearest suggestions for a missing pitch class (G#4 / Ab4)', () => {
    // G#4 does not exist at any octave on this mechanism (gap between G4 and A4 lanes).
    const r = mapPitchToMechanism(parseNoteName('G#4').midi, profile)
    expect(r.reason).toBe('nearest-suggested')
    expect(r.autoApproved).toBe(false)
    expect(r.suggestions.length).toBeGreaterThan(0)
    // Nearest playable neighbors to G#4 are G4 and A4.
    expect(r.suggestions).toContain(parseNoteName('G4').midi)
  })

  it('never silently drops events: unresolved notes remain present with status "unresolved" only when truly unsupported', () => {
    const events = [ev({ midiPitch: parseNoteName('G#4').midi })]
    const mapped = applyMechanismMapping(events, profile)
    expect(mapped).toHaveLength(1)
    expect(mapped[0].status).toBe('changed') // has a suggestion, pending approval - not unresolved
    expect(mapped[0].conversion?.approved).toBe(false)
  })

  it('passes rests through untouched', () => {
    const events = [ev({ isRest: true, midiPitch: 0 })]
    const mapped = applyMechanismMapping(events, profile)
    expect(mapped[0].conversion).toBeUndefined()
  })

  it('breaks an equidistant tie toward a chord tone when harmonic context is known', () => {
    // G#4 is equidistant (1 semitone) from both G4 and A4. With no chord context the tie
    // goes to the higher pitch (A4) by convention.
    const noContext = nearestPlayablePitches(parseNoteName('G#4').midi, profile, 2)
    expect(noContext[0]).toBe(parseNoteName('A4').midi)

    // A C-major chord (C=0, E=4, G=7) contains G's pitch class but not A's - the same tie
    // should now favor G4, the consonant choice, over A4.
    const withCMajorContext = nearestPlayablePitches(parseNoteName('G#4').midi, profile, 2, [0, 4, 7])
    expect(withCMajorContext[0]).toBe(parseNoteName('G4').midi)
  })

  it('threads harmonic context from a NoteEvent through applyMechanismMapping', () => {
    const events = [ev({ midiPitch: parseNoteName('G#4').midi, harmonicContextPitchClasses: [0, 4, 7] })]
    const mapped = applyMechanismMapping(events, profile)
    expect(mapped[0].conversion?.mappedMidiPitch).toBe(parseNoteName('G4').midi)
  })
})
