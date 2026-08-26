import type { NoteEvent } from '../model/types'

export type VoiceSelectionMode = 'melody-only' | 'melody-plus-bass' | 'melody-plus-harmony' | 'custom'

export interface VoiceGroup {
  key: string // `${staff}:${voice}`
  staff: number
  voice: number
  eventCount: number
  averageMidiPitch: number
  role: 'melody' | 'bass' | 'harmony'
}

/** Group events by staff+voice and classify by average pitch (highest = melody, lowest = bass). */
export function analyzeVoices(events: NoteEvent[]): VoiceGroup[] {
  const groups = new Map<string, NoteEvent[]>()
  for (const ev of events) {
    if (ev.isRest) continue
    const key = `${ev.sourceStaff}:${ev.sourceVoice}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(ev)
  }

  const withAverages = [...groups.entries()].map(([key, evs]) => {
    const [staff, voice] = key.split(':').map(Number)
    const avg = evs.reduce((s, e) => s + e.midiPitch, 0) / evs.length
    return { key, staff, voice, eventCount: evs.length, averageMidiPitch: avg }
  })

  withAverages.sort((a, b) => b.averageMidiPitch - a.averageMidiPitch)

  return withAverages.map((g, i) => ({
    ...g,
    role: i === 0 ? 'melody' : i === withAverages.length - 1 && withAverages.length > 1 ? 'bass' : 'harmony',
  }))
}

export function selectVoices(
  events: NoteEvent[],
  mode: VoiceSelectionMode,
  customKeys?: Set<string>,
): NoteEvent[] {
  const groups = analyzeVoices(events)
  const keep = new Set<string>()

  if (mode === 'custom') {
    for (const k of customKeys ?? []) keep.add(k)
  } else {
    for (const g of groups) {
      if (mode === 'melody-only' && g.role === 'melody') keep.add(g.key)
      if (mode === 'melody-plus-bass' && (g.role === 'melody' || g.role === 'bass')) keep.add(g.key)
      if (mode === 'melody-plus-harmony') keep.add(g.key)
    }
  }

  return events.filter((ev) => ev.isRest || keep.has(`${ev.sourceStaff}:${ev.sourceVoice}`))
}
