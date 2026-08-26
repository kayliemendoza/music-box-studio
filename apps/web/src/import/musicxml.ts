import JSZip from 'jszip'
import type { NoteEvent, ImportedScore, PartInfo } from '../model/types'
import { newId } from '../model/types'
import type { NoteLetter, Accidental } from '../music/pitch'
import { spelledToMidi, enharmonicSpellings } from '../music/pitch'
import { directChild, directChildren, textOf, numberOf } from './xmlHelpers'

export interface ImportResult {
  score: ImportedScore
  warnings: string[]
}

const ACCIDENTAL_SUFFIX: Record<Accidental, string> = { [-2]: 'bb', [-1]: 'b', [0]: '', [1]: '#', [2]: '##' }

function spelledName(letter: NoteLetter, accidental: Accidental, octave: number): string {
  return `${letter}${ACCIDENTAL_SUFFIX[accidental]}${octave}`
}

function isZipBuffer(buf: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buf.slice(0, 2))
  return bytes[0] === 0x50 && bytes[1] === 0x4b // 'PK'
}

async function extractXmlFromMxl(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf)
  let target: string | null = null
  const container = zip.file('META-INF/container.xml')
  if (container) {
    const containerXml = await container.async('string')
    const doc = new DOMParser().parseFromString(containerXml, 'application/xml')
    target = doc.querySelector('rootfile')?.getAttribute('full-path') ?? null
  }
  if (!target) {
    target = Object.keys(zip.files).find((n) => /\.(xml|musicxml)$/i.test(n) && !n.startsWith('META-INF/')) ?? null
  }
  if (!target) throw new Error('No MusicXML entry found inside the .mxl archive.')
  const entry = zip.file(target)
  if (!entry) throw new Error(`MusicXML entry "${target}" referenced by container.xml is missing from the archive.`)
  return entry.async('string')
}

export async function parseMusicXmlFile(file: File): Promise<ImportResult> {
  const buf = await file.arrayBuffer()
  const xmlText = isZipBuffer(buf) ? await extractXmlFromMxl(buf) : new TextDecoder('utf-8').decode(buf)
  return parseMusicXmlString(xmlText, file.name.replace(/\.[^.]+$/, ''))
}

interface RawNote {
  partId: string
  voice: number
  staff: number
  measureNumber: number
  startBeatAbs: number
  startBeatInMeasure: number
  durationBeats: number
  midi: number | null // null for rests
  letter: NoteLetter | null
  accidental: Accidental | null
  octave: number | null
  isRest: boolean
  tieStart: boolean
  tieStop: boolean
  tempoBpm: number
  timeSignature: string
}

export function parseMusicXmlString(xmlText: string, fallbackTitle = 'Untitled'): ImportResult {
  const warnings: string[] = []
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) throw new Error(`Invalid MusicXML: ${parseError.textContent}`)

  const root = doc.documentElement
  if (root.tagName === 'score-timewise') {
    throw new Error('score-timewise MusicXML is not supported yet - please re-export as score-partwise (the default in nearly all notation software).')
  }
  if (root.tagName !== 'score-partwise') {
    throw new Error(`Unsupported MusicXML root element "${root.tagName}" - expected score-partwise.`)
  }

  const title =
    textOf(doc.querySelector('work > work-title')) ?? textOf(doc.querySelector('movement-title')) ?? fallbackTitle
  const composer = textOf(doc.querySelector('identification > creator[type="composer"]')) ?? undefined

  const partListEl = doc.querySelector('part-list')
  const scorePartEls = partListEl ? directChildren(partListEl, 'score-part') : []
  const partNames = new Map<string, string>()
  for (const p of scorePartEls) {
    const id = p.getAttribute('id') ?? ''
    partNames.set(id, textOf(directChild(p, 'part-name')) ?? id)
  }

  const partEls = directChildren(root, 'part')
  if (partEls.length === 0) throw new Error('No <part> elements found in this MusicXML file.')
  const rawNotes: RawNote[] = []
  const parts: PartInfo[] = []
  let maxMeasure = 0

  for (const partEl of partEls) {
    const partId = partEl.getAttribute('id') ?? `part-${parts.length + 1}`
    const partName = partNames.get(partId) ?? partId
    const voiceSet = new Set<number>()
    let isPercussion = false
    const staffSet = new Set<number>()

    let divisions = 1
    let beatsPerMeasure = 4
    let beatType = 4
    let tempoBpm = 120

    const measureEls = directChildren(partEl, 'measure')
    let measureStartBeatAbs = 0
    // Ticks-based cursor tracked independently per voice - this naturally handles
    // <backup>/<forward> for the common "backup to measure start, write next voice"
    // pattern without needing to interpret those elements explicitly.
    const voiceCursorTicks = new Map<number, number>()
    const voicePrevDurationTicks = new Map<number, number>()
    let lastVoiceSeen = 1

    measureEls.forEach((measureEl, idx) => {
      const numAttr = measureEl.getAttribute('number')
      const measureNumber = numAttr && /^\d+$/.test(numAttr) ? parseInt(numAttr, 10) : idx + 1
      maxMeasure = Math.max(maxMeasure, measureNumber)
      voiceCursorTicks.clear()
      voicePrevDurationTicks.clear()

      for (const child of Array.from(measureEl.children)) {
        if (child.tagName === 'attributes') {
          const divEl = directChild(child, 'divisions')
          if (divEl) divisions = numberOf(divEl) ?? divisions
          const timeEl = directChild(child, 'time')
          if (timeEl) {
            beatsPerMeasure = numberOf(directChild(timeEl, 'beats')) ?? beatsPerMeasure
            beatType = numberOf(directChild(timeEl, 'beat-type')) ?? beatType
          }
          for (const clefEl of directChildren(child, 'clef')) {
            if (textOf(directChild(clefEl, 'sign')) === 'percussion') isPercussion = true
          }
        } else if (child.tagName === 'direction') {
          const sound = directChild(child, 'sound')
          const tempoAttr = sound?.getAttribute('tempo')
          if (tempoAttr) {
            const parsed = parseFloat(tempoAttr)
            if (Number.isFinite(parsed) && parsed > 0) tempoBpm = parsed
          }
        } else if (child.tagName === 'sound') {
          const tempoAttr = child.getAttribute('tempo')
          if (tempoAttr) {
            const parsed = parseFloat(tempoAttr)
            if (Number.isFinite(parsed) && parsed > 0) tempoBpm = parsed
          }
        } else if (child.tagName === 'note') {
          const noteEl = child
          const isChordFlag = !!directChild(noteEl, 'chord')
          const isRest = !!directChild(noteEl, 'rest')
          const isGrace = !!directChild(noteEl, 'grace')
          const voice = numberOf(directChild(noteEl, 'voice')) ?? 1
          const staff = numberOf(directChild(noteEl, 'staff')) ?? 1
          voiceSet.add(voice)
          staffSet.add(staff)
          lastVoiceSeen = voice

          const durationTicks = isGrace ? 0 : numberOf(directChild(noteEl, 'duration')) ?? 0
          if (isGrace) warnings.push(`Part "${partName}" measure ${measureNumber}: grace note approximated with zero duration and kept as a very short event.`)

          if (!voiceCursorTicks.has(voice)) voiceCursorTicks.set(voice, 0)
          let cursor = voiceCursorTicks.get(voice)!
          let startTicks: number
          if (isChordFlag) {
            const prevDur = voicePrevDurationTicks.get(voice) ?? 0
            startTicks = cursor - prevDur
          } else {
            startTicks = cursor
            cursor += durationTicks
            voiceCursorTicks.set(voice, cursor)
            voicePrevDurationTicks.set(voice, durationTicks || 0.0001)
          }

          const startBeatInMeasure = startTicks / divisions
          const durationBeats = durationTicks / divisions

          let letter: NoteLetter | null = null
          let accidental: Accidental | null = null
          let octave: number | null = null
          let midi: number | null = null
          if (!isRest) {
            const pitchEl = directChild(noteEl, 'pitch')
            if (pitchEl) {
              letter = (textOf(directChild(pitchEl, 'step')) ?? 'C') as NoteLetter
              const alter = numberOf(directChild(pitchEl, 'alter')) ?? 0
              accidental = Math.max(-2, Math.min(2, Math.round(alter))) as Accidental
              octave = numberOf(directChild(pitchEl, 'octave')) ?? 4
              midi = spelledToMidi({ letter, accidental, octave, midi: 0 })
            } else {
              warnings.push(`Part "${partName}" measure ${measureNumber}: note missing <pitch> and <rest> - skipped.`)
              continue
            }
          }

          const tieEls = directChildren(noteEl, 'tie')
          const tieStart = tieEls.some((t) => t.getAttribute('type') === 'start')
          const tieStop = tieEls.some((t) => t.getAttribute('type') === 'stop')

          rawNotes.push({
            partId,
            voice,
            staff,
            measureNumber,
            startBeatAbs: measureStartBeatAbs + startBeatInMeasure,
            startBeatInMeasure,
            durationBeats,
            midi,
            letter,
            accidental,
            octave,
            isRest,
            tieStart,
            tieStop,
            tempoBpm,
            timeSignature: `${beatsPerMeasure}/${beatType}`,
          })
        } else if (child.tagName === 'forward') {
          const durationTicks = numberOf(directChild(child, 'duration')) ?? 0
          const cursor = (voiceCursorTicks.get(lastVoiceSeen) ?? 0) + durationTicks
          voiceCursorTicks.set(lastVoiceSeen, cursor)
        } else if (child.tagName === 'backup') {
          const durationTicks = numberOf(directChild(child, 'duration')) ?? 0
          const cursor = (voiceCursorTicks.get(lastVoiceSeen) ?? 0) - durationTicks
          voiceCursorTicks.set(lastVoiceSeen, cursor)
        }
      }

      const measureBeats = beatsPerMeasure * (4 / beatType)
      measureStartBeatAbs += measureBeats
    })

    parts.push({
      id: partId,
      name: partName,
      staffCount: staffSet.size || 1,
      voiceIds: [...voiceSet].sort((a, b) => a - b),
      isPercussion,
    })
  }

  // Merge tie-stop continuations into their tie-start note (one physical hole, not a re-trigger).
  const merged: RawNote[] = []
  const openTies = new Map<string, RawNote>() // key: partId:voice:midi

  for (const n of rawNotes) {
    const key = `${n.partId}:${n.voice}:${n.midi}`
    if (n.tieStop && !n.isRest) {
      const open = openTies.get(key)
      if (open) {
        open.durationBeats += n.durationBeats
        if (!n.tieStart) openTies.delete(key)
        continue // absorbed into the tied-from note, not emitted separately
      }
    }
    merged.push(n)
    if (n.tieStart && !n.isRest) openTies.set(key, n)
    else if (!n.tieStart) openTies.delete(key)
  }

  const events: NoteEvent[] = merged.map((n) => {
    const midi = n.midi ?? 0
    const { sharp, flat } = n.isRest ? { sharp: '', flat: '' } : enharmonicSpellings(midi)
    const writtenName = n.isRest || n.letter === null || n.accidental === null || n.octave === null
      ? 'rest'
      : spelledName(n.letter, n.accidental, n.octave)
    return {
      id: newId(),
      sourcePage: 1,
      sourceStaff: n.staff,
      sourceVoice: n.voice,
      sourceMeasure: n.measureNumber,
      sourceBeat: n.startBeatInMeasure + 1,
      midiPitch: midi,
      writtenName,
      enharmonicSharp: sharp,
      enharmonicFlat: flat,
      startBeat: n.startBeatAbs,
      durationBeats: n.durationBeats,
      tempoBpm: n.tempoBpm,
      timeSignature: n.timeSignature,
      isChordMember: false,
      isRest: n.isRest,
      importConfidence: 1,
      needsReview: false,
      status: 'original',
    }
  })

  // Mark chord membership: 2+ non-rest notes sharing (staff, voice, startBeat).
  const chordGroups = new Map<string, NoteEvent[]>()
  for (const ev of events) {
    if (ev.isRest) continue
    const key = `${ev.sourceStaff}:${ev.sourceVoice}:${ev.startBeat}`
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

  if (events.filter((e) => !e.isRest).length === 0) {
    warnings.push('No pitched notes were found in this file.')
  }

  const score: ImportedScore = {
    id: newId('score'),
    title,
    composer,
    events,
    parts,
    measureCount: maxMeasure,
    sourceFormat: 'musicxml',
    sourceMusicXml: xmlText,
  }

  return { score, warnings }
}
