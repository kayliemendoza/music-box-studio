import type { NoteEvent } from '../model/types'
import { newId } from '../model/types'
import { buildY30H2Profile } from '../model/mechanism'
import { buildDefaultPaperProfile } from '../model/paper'
import { defaultStripLayoutConfig } from '../convert/layout'
import { applyMechanismMapping } from '../convert/playability'
import { parseNoteName } from '../music/pitch'

export function ev(overrides: Partial<NoteEvent>): NoteEvent {
  return {
    id: newId(),
    sourcePage: 1, sourceStaff: 1, sourceVoice: 1, sourceMeasure: 1, sourceBeat: 1,
    midiPitch: parseNoteName('C5').midi, writtenName: 'C5', enharmonicSharp: 'C5', enharmonicFlat: 'C5',
    startBeat: 0, durationBeats: 1, tempoBpm: 90, timeSignature: '4/4',
    isChordMember: false, isRest: false, importConfidence: 1, needsReview: false,
    status: 'original',
    ...overrides,
  }
}

/** A short, fully-playable, already-approved arrangement for export tests. */
export function buildTestArrangement(noteCount = 8, beatSpacing = 1) {
  const profile = buildY30H2Profile()
  const paper = buildDefaultPaperProfile()
  const layout = defaultStripLayoutConfig()
  const names = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6']
  const events = Array.from({ length: noteCount }, (_, i) =>
    ev({ midiPitch: parseNoteName(names[i % names.length]).midi, startBeat: i * beatSpacing, sourceMeasure: Math.floor(i / 4) + 1, sourceBeat: (i % 4) + 1 }),
  )
  const mapped = applyMechanismMapping(events, profile).map((e) => ({
    ...e,
    conversion: e.conversion ? { ...e.conversion, approved: true } : e.conversion,
  }))
  return { profile, paper, layout, events: mapped }
}
