import { describe, it, expect } from 'vitest'
import { chordTonePitchClasses, stepAlterToPitchClass, activeChordAt, type ChordSymbol } from './chords'

describe('chord symbols', () => {
  it('computes pitch classes from step/alter', () => {
    expect(stepAlterToPitchClass('C', 0)).toBe(0)
    expect(stepAlterToPitchClass('A', 0)).toBe(9)
    expect(stepAlterToPitchClass('B', -1)).toBe(10) // Bb
    expect(stepAlterToPitchClass('C', -1)).toBe(11) // Cb wraps to B
  })

  it('builds correct tone sets for common chord qualities', () => {
    const cMajor: ChordSymbol = { rootPitchClass: 0, kindText: 'major', startBeat: 0, sourceMeasure: 1 }
    expect(chordTonePitchClasses(cMajor)).toEqual(new Set([0, 4, 7]))

    const aMinor7: ChordSymbol = { rootPitchClass: 9, kindText: 'minor-seventh', startBeat: 0, sourceMeasure: 1 }
    expect(chordTonePitchClasses(aMinor7)).toEqual(new Set([9, 0, 4, 7])) // A C E G

    const g7: ChordSymbol = { rootPitchClass: 7, kindText: 'dominant', startBeat: 0, sourceMeasure: 1 }
    expect(chordTonePitchClasses(g7)).toEqual(new Set([7, 11, 2, 5])) // G B D F
  })

  it('includes an explicit slash-chord bass note', () => {
    const cOverE: ChordSymbol = { rootPitchClass: 0, kindText: 'major', bassPitchClass: 4, startBeat: 0, sourceMeasure: 1 }
    expect(chordTonePitchClasses(cOverE).has(4)).toBe(true)
  })

  it('falls back to a major triad for an unrecognized kind rather than throwing', () => {
    const weird: ChordSymbol = { rootPitchClass: 2, kindText: 'some-exotic-jazz-thing', startBeat: 0, sourceMeasure: 1 }
    expect(chordTonePitchClasses(weird)).toEqual(new Set([2, 6, 9]))
  })

  it('finds the chord active at a given beat (last one starting at or before it)', () => {
    const chords: ChordSymbol[] = [
      { rootPitchClass: 0, kindText: 'major', startBeat: 0, sourceMeasure: 1 },
      { rootPitchClass: 7, kindText: 'major', startBeat: 4, sourceMeasure: 2 },
    ]
    expect(activeChordAt(chords, 0)?.rootPitchClass).toBe(0)
    expect(activeChordAt(chords, 2)?.rootPitchClass).toBe(0)
    expect(activeChordAt(chords, 4)?.rootPitchClass).toBe(7)
    expect(activeChordAt(chords, 10)?.rootPitchClass).toBe(7)
  })
})
