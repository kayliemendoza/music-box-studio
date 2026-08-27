/**
 * Chord symbols (as printed on lead sheets: "Am7", "C", "G/B") give the harmonic context
 * a note lives in. When a note's exact pitch isn't available on the mechanism, knowing the
 * active chord lets a substitute be picked for consonance (a chord tone) rather than pure
 * numeric distance - the difference between a substitution that still sounds "right" and
 * one that just happens to be close.
 */

export interface ChordSymbol {
  /** Pitch class of the chord root, 0 (C) - 11 (B). */
  rootPitchClass: number
  /** Raw MusicXML <kind> text, e.g. "major", "minor-seventh", "dominant". */
  kindText: string
  /** Pitch class of an explicit bass note for a slash chord (e.g. "C/E"), if present. */
  bassPitchClass?: number
  startBeat: number
  sourceMeasure: number
}

/** Semitone intervals above the root for common MusicXML chord <kind> values. Falls back to a plain major triad for anything unrecognized, rather than guessing wildly or throwing. */
const KIND_INTERVALS: Record<string, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  augmented: [0, 4, 8],
  diminished: [0, 3, 6],
  dominant: [0, 4, 7, 10],
  'major-seventh': [0, 4, 7, 11],
  'minor-seventh': [0, 3, 7, 10],
  'diminished-seventh': [0, 3, 6, 9],
  'half-diminished': [0, 3, 6, 10],
  'major-minor': [0, 3, 7, 11],
  'major-sixth': [0, 4, 7, 9],
  'minor-sixth': [0, 3, 7, 9],
  'dominant-ninth': [0, 4, 7, 10, 2],
  'major-ninth': [0, 4, 7, 11, 2],
  'minor-ninth': [0, 3, 7, 10, 2],
  'dominant-11th': [0, 4, 7, 10, 2, 5],
  'major-11th': [0, 4, 7, 11, 2, 5],
  'minor-11th': [0, 3, 7, 10, 2, 5],
  'dominant-13th': [0, 4, 7, 10, 2, 5, 9],
  'major-13th': [0, 4, 7, 11, 2, 5, 9],
  'minor-13th': [0, 3, 7, 10, 2, 5, 9],
  'suspended-second': [0, 2, 7],
  'suspended-fourth': [0, 5, 7],
  power: [0, 7],
  none: [],
}

/** All pitch classes (0-11) belonging to a chord: its notated tones plus an explicit bass, if any. */
export function chordTonePitchClasses(chord: ChordSymbol): Set<number> {
  const intervals = KIND_INTERVALS[chord.kindText] ?? KIND_INTERVALS.major
  const classes = new Set(intervals.map((i) => (chord.rootPitchClass + i + 12) % 12))
  if (chord.bassPitchClass != null) classes.add(((chord.bassPitchClass % 12) + 12) % 12)
  return classes
}

const STEP_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** Pitch class from MusicXML <root-step>/<root-alter> or <bass-step>/<bass-alter> text values. */
export function stepAlterToPitchClass(step: string, alter: number): number {
  const base = STEP_SEMITONE[step.toUpperCase()] ?? 0
  return ((base + alter) % 12 + 12) % 12
}

/** Find whichever chord symbol (if any) is active at a given beat - the last one starting at or before it. */
export function activeChordAt(chords: ChordSymbol[], beat: number): ChordSymbol | undefined {
  let active: ChordSymbol | undefined
  for (const c of chords) {
    if (c.startBeat <= beat + 1e-9) {
      if (!active || c.startBeat > active.startBeat) active = c
    }
  }
  return active
}
