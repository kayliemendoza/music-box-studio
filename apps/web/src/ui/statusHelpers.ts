import type { NoteEvent } from '../model/types'
import type { SameLaneConflict } from '../convert/conflicts'
import type { NoteStatusIcon } from './icons'

export function eventStatusIcon(ev: NoteEvent, conflicts: SameLaneConflict[]): NoteStatusIcon {
  if (ev.needsReview) return 'omr-uncertain'
  const inConflict = conflicts.some((c) => c.firstEventId === ev.id || c.secondEventId === ev.id)
  if (inConflict) return 'conflict'
  if (!ev.conversion || ev.conversion.mappedMidiPitch === null) return 'unresolved'
  if (ev.conversion.reason === 'exact-match') return 'exact'
  return 'changed'
}

export function eventStatusLabel(kind: NoteStatusIcon): string {
  switch (kind) {
    case 'exact': return 'Exact playable note'
    case 'changed': return 'Changed note'
    case 'unresolved': return 'Unavailable / unresolved'
    case 'conflict': return 'Mechanical conflict (same-note reset)'
    case 'omr-uncertain': return 'OMR uncertainty - needs review'
  }
}
