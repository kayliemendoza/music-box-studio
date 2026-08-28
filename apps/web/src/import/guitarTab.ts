import type { NoteEvent, ImportedScore, PartInfo } from '../model/types'
import { newId } from '../model/types'
import { enharmonicSpellings, midiToSharpName } from '../music/pitch'

export interface ImportResult {
  score: ImportedScore
  warnings: string[]
}

/** MIDI pitch of each open string, standard tuning, top line (high e) to bottom line (low E). */
const STANDARD_TUNING = [64, 59, 55, 50, 45, 40] // e B G D A E

/** Beats represented by one tab character column. ASCII tab has no explicit duration
 * markup, so this is a fixed, documented assumption (a common convention: dashes give
 * sixteenth-note resolution) rather than a guess presented as fact. */
const BEATS_PER_COLUMN = 0.25

const STRING_LABEL_RE = /^\s*([eEbBgGdDaA]|[A-Ga-g]#?)\s*[|:]/

interface TabBlock {
  /** 6 raw string lines, index 0 = top (highest string) .. 5 = bottom (lowest string). */
  lines: string[]
}

function looksLikeTabLine(line: string): boolean {
  if (STRING_LABEL_RE.test(line)) return true
  const bodyChars = line.replace(/\s/g, '')
  if (bodyChars.length < 4) return false
  const tabChars = (bodyChars.match(/[-0-9|hpb/\\~^xX]/g) ?? []).length
  return tabChars / bodyChars.length > 0.8
}

/** Group consecutive tab-like lines into blocks of exactly 6 (one per string). */
function findTabBlocks(text: string): TabBlock[] {
  const lines = text.split(/\r?\n/)
  const blocks: TabBlock[] = []
  let current: string[] = []

  function flush() {
    if (current.length === 6) blocks.push({ lines: current })
    else if (current.length > 0) {
      // Not a clean sextet (e.g. a 7-string tab, or noise) - skip rather than misread.
    }
    current = []
  }

  for (const line of lines) {
    if (looksLikeTabLine(line)) {
      current.push(line)
    } else {
      flush()
    }
  }
  flush()
  return blocks
}

/** Strip a leading string-name label (e.g. "e|", "D:") so column positions start at the tab body. */
function stripLabel(line: string): string {
  const m = STRING_LABEL_RE.exec(line)
  return m ? line.slice(m[0].length) : line
}

interface RawHit {
  column: number
  stringIndex: number // 0 = top/highest string
  fret: number
}

export function parseGuitarTabText(text: string, title = 'Untitled', tuning: number[] = STANDARD_TUNING): ImportResult {
  const warnings: string[] = []
  const blocks = findTabBlocks(text)
  if (blocks.length === 0) {
    throw new Error(
      'No 6-line tab block found. Expected standard ASCII tab: 6 string lines (e/B/G/D/A/E), each made mostly of dashes and fret numbers, e.g. "e|--0---2--|".',
    )
  }
  if (tuning.length !== 6) {
    throw new Error(`Custom tuning must have exactly 6 strings, got ${tuning.length}.`)
  }

  const hits: RawHit[] = []
  let blockStartColumnOffset = 0

  for (const block of blocks) {
    const bodies = block.lines.map(stripLabel)
    const blockWidth = Math.max(...bodies.map((b) => b.length))

    for (let stringIndex = 0; stringIndex < 6; stringIndex++) {
      const body = bodies[stringIndex]
      let col = 0
      while (col < body.length) {
        const ch = body[col]
        if (ch >= '0' && ch <= '9') {
          // Consume a (possibly multi-digit) fret number.
          let end = col + 1
          while (end < body.length && body[end] >= '0' && body[end] <= '9') end++
          const fret = parseInt(body.slice(col, end), 10)
          if (fret > 24) {
            warnings.push(`Column ${blockStartColumnOffset + col}, string ${stringIndex + 1}: fret ${fret} is unusually high - kept as-is, please verify.`)
          }
          hits.push({ column: blockStartColumnOffset + col, stringIndex, fret })
          col = end
        } else {
          col++
        }
      }
    }
    blockStartColumnOffset += blockWidth + 1 // +1 so back-to-back blocks don't collide at the seam
  }

  if (hits.length === 0) {
    warnings.push('No fret numbers found in the tab - the file matched the 6-line shape but contained no notes.')
  }

  // Group simultaneous hits (same column = a chord/strum) into NoteEvents.
  const byColumn = new Map<number, RawHit[]>()
  for (const h of hits) {
    if (!byColumn.has(h.column)) byColumn.set(h.column, [])
    byColumn.get(h.column)!.push(h)
  }
  const columns = [...byColumn.keys()].sort((a, b) => a - b)

  const events: NoteEvent[] = []
  const beatsPerMeasure = 4 // ASCII tab carries no time signature; 4/4 is the safest default and is editable afterward.

  columns.forEach((col, i) => {
    const startBeat = col * BEATS_PER_COLUMN
    const nextCol = columns[i + 1]
    const durationBeats = nextCol != null ? (nextCol - col) * BEATS_PER_COLUMN : BEATS_PER_COLUMN
    const chordId = byColumn.get(col)!.length > 1 ? newId('chord') : undefined

    for (const hit of byColumn.get(col)!) {
      const midi = tuning[hit.stringIndex] + hit.fret
      const { sharp, flat } = enharmonicSpellings(midi)
      const measureNumber = Math.floor(startBeat / beatsPerMeasure) + 1
      const beatInMeasure = (startBeat % beatsPerMeasure) + 1
      events.push({
        id: newId(),
        sourcePage: 1,
        sourceStaff: 1,
        sourceVoice: 1,
        sourceMeasure: measureNumber,
        sourceBeat: beatInMeasure,
        midiPitch: midi,
        writtenName: midiToSharpName(midi),
        enharmonicSharp: sharp,
        enharmonicFlat: flat,
        startBeat,
        durationBeats,
        tempoBpm: 100, // ASCII tab never carries tempo - a placeholder the user must confirm, like any other unstated value in this app.
        timeSignature: '4/4',
        isChordMember: byColumn.get(col)!.length > 1,
        chordId,
        isRest: false,
        importConfidence: 0.6, // rhythm is inferred from character spacing, not explicit - lower than MusicXML/MIDI's 1.0, higher than OMR's uncertainty
        needsReview: true,
        status: 'original',
      })
    }
  })

  warnings.push(
    'Guitar tab has no explicit rhythm or tempo notation - durations were inferred from character spacing (one column = a 16th note) and tempo defaults to 100 BPM. Confirm both against the actual recording before exporting.',
  )

  const maxMeasure = events.length > 0 ? Math.max(...events.map((e) => e.sourceMeasure)) : 0
  const parts: PartInfo[] = [{ id: 'tab', name: 'Guitar', staffCount: 1, voiceIds: [1], isPercussion: false }]

  const score: ImportedScore = {
    id: newId('score'),
    title,
    events,
    parts,
    measureCount: maxMeasure,
    sourceFormat: 'manual',
  }

  return { score, warnings }
}
