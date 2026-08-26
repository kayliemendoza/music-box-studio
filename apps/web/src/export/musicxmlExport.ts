import type { NoteEvent } from '../model/types'
import { midiToSharpName, parseNoteName } from '../music/pitch'

const DURATION_TYPE_BY_BEATS: Array<[number, string]> = [
  [4, 'whole'], [2, 'half'], [1, 'quarter'], [0.5, 'eighth'], [0.25, '16th'], [0.125, '32nd'],
]

function beatsToType(beats: number): string | null {
  for (const [b, type] of DURATION_TYPE_BY_BEATS) {
    if (Math.abs(b - beats) < 1e-6) return type
  }
  return null
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Best-effort MusicXML export of the converted (playable) arrangement: single part,
 * single voice, one note per hole in original measure order. This is a re-export of
 * the arrangement for reference/archival, not a guaranteed lossless round-trip of the
 * original score's notation (ties, dynamics, articulations, multiple voices are not
 * reconstructed).
 */
export function exportConvertedMusicXml(events: NoteEvent[], title = 'Music Box Arrangement'): string {
  const playable = events
    .filter((e) => !e.isRest && e.conversion?.approved && e.conversion.mappedMidiPitch != null)
    .sort((a, b) => a.startBeat - b.startBeat || a.sourceMeasure - b.sourceMeasure)

  const divisions = 4 // ticks per quarter note; matches the default 16th-note strip grid (0.25 beats = 1 tick)
  const byMeasure = new Map<number, NoteEvent[]>()
  for (const ev of playable) {
    if (!byMeasure.has(ev.sourceMeasure)) byMeasure.set(ev.sourceMeasure, [])
    byMeasure.get(ev.sourceMeasure)!.push(ev)
  }
  const measureNumbers = [...byMeasure.keys()].sort((a, b) => a - b)
  const firstTimeSig = playable[0]?.timeSignature ?? '4/4'
  const [beats, beatType] = firstTimeSig.split('/').map((s) => parseInt(s, 10))
  const tempo = playable[0]?.tempoBpm ?? 100

  let measuresXml = ''
  measureNumbers.forEach((mNum, idx) => {
    const notes = byMeasure.get(mNum)!.sort((a, b) => a.sourceBeat - b.sourceBeat)
    let attrsXml = ''
    if (idx === 0) {
      attrsXml = `
      <attributes>
        <divisions>${divisions}</divisions>
        <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above">
        <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type>
        <sound tempo="${tempo}"/>
      </direction>`
    }
    let notesXml = ''
    for (const ev of notes) {
      const midi = ev.conversion!.mappedMidiPitch as number
      const name = midiToSharpName(midi)
      const spelled = parseNoteName(name)
      const durationTicks = Math.max(1, Math.round(ev.durationBeats * divisions))
      const type = beatsToType(ev.durationBeats)
      const alterXml = spelled.accidental !== 0 ? `<alter>${spelled.accidental}</alter>` : ''
      notesXml += `
      <note>
        <pitch><step>${spelled.letter}</step>${alterXml}<octave>${spelled.octave}</octave></pitch>
        <duration>${durationTicks}</duration>
        <voice>1</voice>${type ? `\n        <type>${type}</type>` : ''}
      </note>`
    }
    measuresXml += `
    <measure number="${mNum}">${attrsXml}${notesXml}
    </measure>`
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${escapeXml(title)}</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Music Box Arrangement</part-name></score-part>
  </part-list>
  <part id="P1">${measuresXml}
  </part>
</score-partwise>
`
}
