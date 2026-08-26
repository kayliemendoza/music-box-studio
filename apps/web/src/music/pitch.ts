/**
 * Pitch utilities. MIDI pitch (0-127) is the canonical identity for a physical
 * pitch: enharmonic spellings (A#4 vs Bb4) share the same MIDI number and are
 * therefore the same lane on the mechanism.
 */

export type NoteLetter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
export type Accidental = -2 | -1 | 0 | 1 | 2 // double-flat..double-sharp

export interface SpelledPitch {
  letter: NoteLetter
  accidental: Accidental
  octave: number
  midi: number
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

/** Preferred spelling (sharps) for a MIDI pitch, e.g. 61 -> "C#5". */
export function midiToSharpName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${SHARP_NAMES[pc]}${octave}`
}

/** Flat spelling for a MIDI pitch, e.g. 61 -> "Db5". */
export function midiToFlatName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${FLAT_NAMES[pc]}${octave}`
}

/** Both common enharmonic spellings for a MIDI pitch. Equal when pitch is natural. */
export function enharmonicSpellings(midi: number): { sharp: string; flat: string } {
  return { sharp: midiToSharpName(midi), flat: midiToFlatName(midi) }
}

const LETTER_SEMITONE: Record<NoteLetter, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
}

/** Parse a note name like "C#5", "Db4", "F3", "A##6", "Cbb2" into a SpelledPitch. */
export function parseNoteName(name: string): SpelledPitch {
  const m = /^([A-Ga-g])(#{1,2}|b{1,2}|x)?(-?\d+)$/.exec(name.trim())
  if (!m) throw new Error(`Invalid note name: ${name}`)
  const letter = m[1].toUpperCase() as NoteLetter
  const accStr = m[2] ?? ''
  let accidental: Accidental = 0
  if (accStr === '#' || accStr === 'x') accidental = accStr === 'x' ? 2 : 1
  else if (accStr === '##') accidental = 2
  else if (accStr === 'b') accidental = -1
  else if (accStr === 'bb') accidental = -2
  const octave = parseInt(m[3], 10)
  const midi = (octave + 1) * 12 + LETTER_SEMITONE[letter] + accidental
  return { letter, accidental, octave, midi }
}

/** MIDI pitch from a SpelledPitch. */
export function spelledToMidi(p: SpelledPitch): number {
  return (p.octave + 1) * 12 + LETTER_SEMITONE[p.letter] + p.accidental
}

/** True if two note names represent the same physical pitch (enharmonic equivalence). */
export function isEnharmonicEquivalent(a: string, b: string): boolean {
  return parseNoteName(a).midi === parseNoteName(b).midi
}

/** Shift a MIDI pitch by whole octaves (12 semitones each). */
export function transposeOctaves(midi: number, octaves: number): number {
  return midi + 12 * octaves
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}
