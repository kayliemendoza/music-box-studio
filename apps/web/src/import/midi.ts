import { Midi } from '@tonejs/midi'
import type { NoteEvent, ImportedScore, PartInfo } from '../model/types'
import { newId } from '../model/types'
import { enharmonicSpellings, midiToSharpName } from '../music/pitch'

export interface ImportResult {
  score: ImportedScore
  warnings: string[]
}

interface TimeSigChange {
  ticks: number
  numerator: number
  denominator: number
}

/** Resolve which measure number + beat-within-measure a tick position falls in, given time signature changes (sorted by ticks). */
function ticksToMeasureBeat(
  ticks: number,
  ppq: number,
  sigChanges: TimeSigChange[],
): { measure: number; beatInMeasure: number; timeSignature: string } {
  let measure = 1
  let cursorTicks = 0
  let active = sigChanges[0] ?? { ticks: 0, numerator: 4, denominator: 4 }

  for (let i = 0; i < sigChanges.length; i++) {
    const change = sigChanges[i]
    const next = sigChanges[i + 1]
    const segmentEndTicks = next ? next.ticks : Infinity
    const measureTicks = change.numerator * ppq * (4 / change.denominator)

    if (ticks < segmentEndTicks) {
      active = change
      const ticksIntoSegment = ticks - Math.max(cursorTicks, change.ticks)
      const measuresIntoSegment = Math.floor(ticksIntoSegment / measureTicks)
      const beatInMeasure = (ticksIntoSegment - measuresIntoSegment * measureTicks) / ppq + 1
      return {
        measure: measure + measuresIntoSegment,
        beatInMeasure,
        timeSignature: `${active.numerator}/${active.denominator}`,
      }
    }
    const measuresInSegment = Math.floor((segmentEndTicks - Math.max(cursorTicks, change.ticks)) / measureTicks)
    measure += measuresInSegment
    cursorTicks = segmentEndTicks
  }
  return { measure, beatInMeasure: 1, timeSignature: `${active.numerator}/${active.denominator}` }
}

export async function parseMidiFile(file: File): Promise<ImportResult> {
  const buf = await file.arrayBuffer()
  return parseMidiBuffer(buf, file.name.replace(/\.[^.]+$/, ''))
}

export function parseMidiBuffer(buf: ArrayBuffer, fallbackTitle = 'Untitled'): ImportResult {
  const warnings: string[] = []
  const midi = new Midi(buf)
  const ppq = midi.header.ppq

  const sigChanges: TimeSigChange[] = (midi.header.timeSignatures.length > 0
    ? midi.header.timeSignatures.map((t) => ({ ticks: t.ticks, numerator: t.timeSignature[0], denominator: t.timeSignature[1] }))
    : [{ ticks: 0, numerator: 4, denominator: 4 }]
  ).sort((a, b) => a.ticks - b.ticks)

  const tempoChanges = (midi.header.tempos.length > 0 ? midi.header.tempos : [{ ticks: 0, bpm: 120 }])
    .slice()
    .sort((a, b) => a.ticks - b.ticks)

  function tempoAtTicks(ticks: number): number {
    let bpm = tempoChanges[0].bpm
    for (const t of tempoChanges) {
      if (t.ticks <= ticks) bpm = t.bpm
      else break
    }
    return Math.round(bpm * 100) / 100
  }

  const events: NoteEvent[] = []
  const parts: PartInfo[] = []
  let maxMeasure = 1

  midi.tracks.forEach((track, trackIndex) => {
    const isPercussion = track.channel === 9 || !!track.instrument?.percussion
    if (track.notes.length === 0) return

    parts.push({
      id: `track-${trackIndex}`,
      name: track.name || track.instrument?.name || `Track ${trackIndex + 1}`,
      staffCount: 1,
      voiceIds: [1],
      isPercussion,
    })

    if (isPercussion) {
      warnings.push(`Track "${track.name || trackIndex + 1}" looks like a percussion/drum channel (MIDI channel 10). It's included but flagged - percussion tracks should usually be excluded before conversion.`)
    }

    for (const note of track.notes) {
      const { measure, beatInMeasure, timeSignature } = ticksToMeasureBeat(note.ticks, ppq, sigChanges)
      maxMeasure = Math.max(maxMeasure, measure)
      const { sharp, flat } = enharmonicSpellings(note.midi)
      events.push({
        id: newId(),
        sourcePage: 1,
        sourceStaff: trackIndex + 1,
        sourceVoice: 1,
        sourceMeasure: measure,
        sourceBeat: beatInMeasure,
        midiPitch: note.midi,
        writtenName: midiToSharpName(note.midi),
        enharmonicSharp: sharp,
        enharmonicFlat: flat,
        startBeat: note.ticks / ppq,
        durationBeats: note.durationTicks / ppq,
        tempoBpm: tempoAtTicks(note.ticks),
        timeSignature,
        isChordMember: false,
        isRest: false,
        importConfidence: 1,
        needsReview: false,
        status: 'original',
      })
    }
  })

  // Mark chord membership: 2+ notes on the same track sharing an identical start tick.
  const chordGroups = new Map<string, NoteEvent[]>()
  for (const ev of events) {
    const key = `${ev.sourceStaff}:${ev.startBeat}`
    if (!chordGroups.has(key)) chordGroups.set(key, [])
    chordGroups.get(key)!.push(ev)
  }
  for (const group of chordGroups.values()) {
    if (group.length > 1) {
      const chordId = newId('chord')
      for (const ev of group) {
        ev.isChordMember = true
        ev.chordId = chordId
      }
    }
  }

  if (events.length === 0) warnings.push('No notes found in any MIDI track.')

  const score: ImportedScore = {
    id: newId('score'),
    title: fallbackTitle,
    events,
    parts,
    measureCount: maxMeasure,
    sourceFormat: 'midi',
  }

  return { score, warnings }
}
