import type { NoteEvent } from '../model/types'

/**
 * Reduce a chordal part to its top-line melody: for every group of notes that sound
 * together (same staff, voice, and start beat - i.e. a chord, whether written with
 * MusicXML's <chord/> flag or just multiple simultaneous notes), keep only the
 * highest-pitched note and drop the rest. This is the standard way a musician extracts
 * a singable/playable lead line out of a thickly-voiced piano/guitar chord part - useful
 * when a source only notates the melody as the top note of a chord rather than as its
 * own separate voice (common in pop-piano arrangements), which the mechanical
 * voice-selection step (by staff/voice) can't see or fix on its own.
 *
 * Rests and notes that are already the sole occupant of their beat pass through
 * unchanged. Duration is taken from the kept (highest) note.
 */
export function extractTopLineMelody(events: NoteEvent[]): NoteEvent[] {
  const groups = new Map<string, NoteEvent[]>()
  const order: string[] = []

  for (const ev of events) {
    if (ev.isRest) {
      order.push(`rest:${ev.id}`)
      groups.set(`rest:${ev.id}`, [ev])
      continue
    }
    const key = `${ev.sourceStaff}:${ev.sourceVoice}:${ev.startBeat}`
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)!.push(ev)
  }

  const result: NoteEvent[] = []
  for (const key of order) {
    const group = groups.get(key)!
    if (group.length === 1) {
      result.push(group[0])
      continue
    }
    const top = group.reduce((highest, ev) => (ev.midiPitch > highest.midiPitch ? ev : highest))
    result.push({ ...top, isChordMember: false, chordId: undefined })
  }
  return result
}
