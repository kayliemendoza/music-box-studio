/** Normalized note-event model shared by every import path (MusicXML, MIDI, OMR, manual entry). */
import type { ChordSymbol } from '../music/chords'

export type EventStatus = 'original' | 'mapped' | 'changed' | 'removed' | 'unresolved'

/** Reason a note's playable pitch differs from its source pitch, if any. */
export type ConversionReason =
  | 'exact-match'
  | 'octave-folded'
  | 'nearest-suggested'
  | 'user-manual-edit'
  | 'user-deleted'
  | 'unsupported-no-suggestion'

export interface NoteEvent {
  id: string

  // Provenance
  sourcePage: number
  sourceStaff: number
  sourceVoice: number
  sourceMeasure: number
  sourceBeat: number // beat position within the measure (1-based, fractional allowed)

  // Pitch identity (MIDI is canonical; sharp/flat kept for display + OMR round-trip)
  midiPitch: number
  writtenName: string // e.g. "C#5" as originally spelled
  enharmonicSharp: string
  enharmonicFlat: string

  // Timing (in beats, absolute from start of piece, at the piece's declared time signature)
  startBeat: number
  durationBeats: number

  tempoBpm: number
  timeSignature: string // e.g. "4/4"

  isChordMember: boolean
  chordId?: string

  isRest: boolean

  /**
   * Pitch classes (0-11) of the harmony active at this note's beat, when the source
   * carries chord symbols (lead-sheet style: <harmony> in MusicXML). Used to prefer a
   * consonant substitute over a purely nearest one when the note's own pitch isn't
   * available on the mechanism. Absent when the source has no chord symbols.
   */
  harmonicContextPitchClasses?: number[]

  // Import provenance
  importConfidence: number // 0..1. 1.0 for MusicXML/MIDI (deterministic). OMR sets <1 and flags for review.
  needsReview: boolean

  status: EventStatus

  // Populated by the conversion engine
  conversion?: {
    reason: ConversionReason
    mappedMidiPitch: number | null // null when removed/unresolved
    lane: number | null // 1..30, top-to-bottom, null if unmapped
    approved: boolean // user has confirmed this specific change
  }
}

export interface ImportedScore {
  id: string
  title: string
  composer?: string
  events: NoteEvent[]
  parts: PartInfo[]
  measureCount: number
  divisionsPerQuarter?: number
  sourceFormat: 'musicxml' | 'midi' | 'omr' | 'manual'
  omrPageImages?: string[] // data URLs, only for OMR-sourced scores
  /** Original MusicXML text, when the source format carries engraved notation (musicxml/omr). Used to render conventional notation via OSMD. */
  sourceMusicXml?: string
  /** Chord symbols (lead-sheet <harmony>), when the source carries them. */
  chordSymbols?: ChordSymbol[]
}

export interface PartInfo {
  id: string
  name: string
  staffCount: number
  voiceIds: number[]
  isPercussion: boolean
}

export function newId(prefix = 'ev'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}
