import { describe, it, expect } from 'vitest'
import { parseNoteName, isEnharmonicEquivalent, midiToSharpName, midiToFlatName, transposeOctaves } from './pitch'

describe('pitch parsing', () => {
  it('parses natural notes to correct MIDI', () => {
    expect(parseNoteName('C4').midi).toBe(60)
    expect(parseNoteName('A4').midi).toBe(69)
    expect(parseNoteName('A6').midi).toBe(93)
    expect(parseNoteName('F3').midi).toBe(53)
  })

  it('parses sharps and flats', () => {
    expect(parseNoteName('C#5').midi).toBe(73)
    expect(parseNoteName('Db5').midi).toBe(73)
    expect(parseNoteName('D#6').midi).toBe(87)
  })

  it('treats enharmonic spellings as the same MIDI pitch', () => {
    expect(isEnharmonicEquivalent('A#5', 'Bb5')).toBe(true)
    expect(isEnharmonicEquivalent('C#5', 'Db5')).toBe(true)
    expect(isEnharmonicEquivalent('C5', 'D5')).toBe(false)
  })

  it('round-trips sharp/flat names from MIDI', () => {
    expect(midiToSharpName(61)).toBe('C#4')
    expect(midiToFlatName(61)).toBe('Db4')
  })

  it('transposes by whole octaves', () => {
    expect(transposeOctaves(60, 1)).toBe(72)
    expect(transposeOctaves(60, -2)).toBe(36)
  })
})
