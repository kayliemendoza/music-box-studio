import { describe, it, expect } from 'vitest'
import { buildY30H2Profile, laneForMidiPitch, midiPitchRange, availablePitchSet } from './mechanism'
import { parseNoteName } from '../music/pitch'

describe('Yunsheng Y30H2 mechanism profile', () => {
  const profile = buildY30H2Profile()

  it('has exactly 30 lanes', () => {
    expect(profile.lanes).toHaveLength(30)
  })

  it('lane 1 is the top/highest note (A6) and lane 30 is the bottom/lowest (F3)', () => {
    expect(profile.lanes[0].lane).toBe(1)
    expect(profile.lanes[0].soundingNoteName).toBe('A6')
    expect(profile.lanes[29].lane).toBe(30)
    expect(profile.lanes[29].soundingNoteName).toBe('F3')
  })

  it('maps every one of the 30 specified sounding pitches to the correct lane number', () => {
    const expected = [
      [1, 'A6'], [2, 'G6'], [3, 'F6'], [4, 'E6'], [5, 'D#6'], [6, 'D6'], [7, 'C#6'], [8, 'C6'],
      [9, 'B5'], [10, 'A#5'], [11, 'A5'], [12, 'G#5'], [13, 'G5'], [14, 'F#5'], [15, 'F5'], [16, 'E5'],
      [17, 'D#5'], [18, 'D5'], [19, 'C#5'], [20, 'C5'], [21, 'B4'], [22, 'A#4'], [23, 'A4'], [24, 'G4'],
      [25, 'F4'], [26, 'E4'], [27, 'D4'], [28, 'C4'], [29, 'G3'], [30, 'F3'],
    ] as const
    for (const [laneNum, name] of expected) {
      const lane = profile.lanes.find((l) => l.lane === laneNum)
      expect(lane, `lane ${laneNum}`).toBeDefined()
      expect(lane!.soundingMidiPitch).toBe(parseNoteName(name).midi)
    }
  })

  it('resolves a lane from a MIDI pitch, independent of enharmonic spelling used', () => {
    const lane = laneForMidiPitch(profile, parseNoteName('Eb6').midi) // enharmonic to D#6
    expect(lane?.lane).toBe(5)
  })

  it('has no duplicate lane numbers and no duplicate pitches', () => {
    const laneNums = profile.lanes.map((l) => l.lane)
    expect(new Set(laneNums).size).toBe(30)
    const pitches = profile.lanes.map((l) => l.soundingMidiPitch)
    expect(new Set(pitches).size).toBe(30)
  })

  it('reports the full playable pitch range', () => {
    const range = midiPitchRange(profile)
    expect(range.min).toBe(parseNoteName('F3').midi)
    expect(range.max).toBe(parseNoteName('A6').midi)
  })

  it('produces a pitch-class-aware available set for range/support checks', () => {
    const set = availablePitchSet(profile)
    expect(set.has(parseNoteName('C4').midi)).toBe(true)
    expect(set.has(parseNoteName('G#4').midi)).toBe(false) // known gap on this mechanism
  })
})
