import { describe, it, expect } from 'vitest'
import { parseGuitarTabText } from './guitarTab'
import { parseNoteName } from '../music/pitch'

describe('guitar tab import', () => {
  it('parses a single-string melody line into notes at the right pitches and order', () => {
    const tab = [
      'e|--0---2---3---5--|',
      'B|------------------|',
      'G|------------------|',
      'D|------------------|',
      'A|------------------|',
      'E|------------------|',
    ].join('\n')
    const { score, warnings } = parseGuitarTabText(tab, 'Test Riff')
    expect(score.events).toHaveLength(4)
    const sorted = [...score.events].sort((a, b) => a.startBeat - b.startBeat)
    // Open high e = E4 (midi 64); frets 0,2,3,5 -> E4, F#4, G4, A4
    expect(sorted.map((e) => e.midiPitch)).toEqual([64, 66, 67, 69])
    expect(sorted.every((e) => e.isChordMember === false)).toBe(true)
    expect(warnings.some((w) => /no explicit rhythm/i.test(w))).toBe(true)
  })

  it('groups fret numbers in the same column into a chord', () => {
    const tab = [
      'e|--0--|',
      'B|--1--|',
      'G|--0--|',
      'D|--2--|',
      'A|--3--|',
      'E|-----|',
    ].join('\n')
    const { score } = parseGuitarTabText(tab)
    expect(score.events).toHaveLength(5)
    expect(score.events.every((e) => e.isChordMember)).toBe(true)
    const chordIds = new Set(score.events.map((e) => e.chordId))
    expect(chordIds.size).toBe(1)
    expect([...chordIds][0]).toBeTruthy()
    // Open A (fret 3 on A string, midi 45+3=48) should be present alongside others.
    const midis = score.events.map((e) => e.midiPitch).sort((a, b) => a - b)
    expect(midis).toContain(48)
  })

  it('parses multi-digit fret numbers correctly', () => {
    const tab = [
      'e|--12---7--|',
      'B|----------|',
      'G|----------|',
      'D|----------|',
      'A|----------|',
      'E|----------|',
    ].join('\n')
    const { score } = parseGuitarTabText(tab)
    const sorted = [...score.events].sort((a, b) => a.startBeat - b.startBeat)
    expect(sorted.map((e) => e.midiPitch)).toEqual([64 + 12, 64 + 7])
  })

  it('respects a custom tuning', () => {
    // Drop D: low string tuned down a whole step from E to D (midi 38 instead of 40).
    const dropD = [64, 59, 55, 50, 45, 38]
    const tab = ['e|-----|', 'B|-----|', 'G|-----|', 'D|-----|', 'A|-----|', 'E|--0--|'].join('\n')
    const { score } = parseGuitarTabText(tab, 'Untitled', dropD)
    expect(score.events).toHaveLength(1)
    expect(score.events[0].midiPitch).toBe(38)
  })

  it('rejects a custom tuning that does not have exactly 6 strings', () => {
    const tab = ['e|--0--|', 'B|-----|', 'G|-----|', 'D|-----|', 'A|-----|', 'E|-----|'].join('\n')
    expect(() => parseGuitarTabText(tab, 'Untitled', [64, 59, 55, 50, 45])).toThrow(/exactly 6 strings/)
  })

  it('throws a descriptive error when no 6-line tab block is found', () => {
    expect(() => parseGuitarTabText('This is just lyrics, not a tab.\nVerse 1\nChorus')).toThrow(/No 6-line tab block/)
  })

  it('warns but does not throw when a tab block has no fret numbers', () => {
    const tab = ['e|-----|', 'B|-----|', 'G|-----|', 'D|-----|', 'A|-----|', 'E|-----|'].join('\n')
    const { score, warnings } = parseGuitarTabText(tab)
    expect(score.events).toHaveLength(0)
    expect(warnings.some((w) => /no notes/i.test(w))).toBe(true)
  })

  it('marks every event with reduced import confidence and needsReview since rhythm is inferred', () => {
    const tab = ['e|--0--|', 'B|-----|', 'G|-----|', 'D|-----|', 'A|-----|', 'E|-----|'].join('\n')
    const { score } = parseGuitarTabText(tab)
    expect(score.events[0].importConfidence).toBeLessThan(1)
    expect(score.events[0].needsReview).toBe(true)
  })

  it('tolerates a leading string-name label using note-letter form (e.g. "D:")', () => {
    const tab = [
      'e:--0--|',
      'B:-----|',
      'G:-----|',
      'D:--2--|',
      'A:-----|',
      'E:-----|',
    ].join('\n')
    const { score } = parseGuitarTabText(tab)
    const midis = score.events.map((e) => e.midiPitch).sort((a, b) => a - b)
    // D string open + fret 2 -> D4(50)+2=52 ; high e open -> 64
    expect(midis).toEqual([52, 64])
    expect(midis).toContain(parseNoteName('E4').midi)
  })
})
