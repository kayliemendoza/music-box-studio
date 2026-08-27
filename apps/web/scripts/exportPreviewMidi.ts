/**
 * Generates a preview MIDI (mechanism-mapped, holes-only) from ANY sheet music file -
 * MusicXML (.musicxml/.xml/.mxl) or MIDI (.mid/.midi) - for uploading into Music Box
 * Maniacs' editor (musicboxmaniacs.com/create/) to hear before printing/punching.
 *
 * Usage:
 *   npx tsx scripts/exportPreviewMidi.ts <input-file> [output.mid] [options]
 *
 * Options:
 *   --tempo=NN         Override the tempo (BPM), ignoring whatever the source file says.
 *   --transpose=N       Shift every note by N semitones before mapping onto the mechanism
 *                        (e.g. to move a minor-key piece into a register with fewer gaps).
 *   --voices=melody-only|melody-plus-bass|melody-plus-harmony   (default: melody-plus-harmony,
 *                        i.e. keep everything in the file - narrow it down if it sounds too dense.)
 *
 * Examples:
 *   npx tsx scripts/exportPreviewMidi.ts ~/Desktop/song.musicxml
 *   npx tsx scripts/exportPreviewMidi.ts ~/Desktop/song.mid preview.mid --tempo=80 --transpose=-2
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { JSDOM } from 'jsdom'
import JSZip from 'jszip'
import type { VoiceSelectionMode } from '../src/convert/voiceSelection.ts'

const dom = new JSDOM('')
;(globalThis as unknown as { DOMParser: typeof dom.window.DOMParser }).DOMParser = dom.window.DOMParser

const { parseMusicXmlString } = await import('../src/import/musicxml.ts')
const { parseMidiBuffer } = await import('../src/import/midi.ts')
const { buildY30H2Profile } = await import('../src/model/mechanism.ts')
const { applyMechanismMapping } = await import('../src/convert/playability.ts')
const { selectVoices } = await import('../src/convert/voiceSelection.ts')
const { exportConvertedMidi } = await import('../src/export/midiExport.ts')

interface Args {
  input: string
  output: string
  tempo?: number
  transpose: number
  voices: VoiceSelectionMode
}

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith('--'))
  const input = positional[0]
  if (!input) {
    console.error(
      'Usage: npx tsx scripts/exportPreviewMidi.ts <input-file> [output.mid] [--tempo=NN] [--transpose=N] [--voices=melody-only|melody-plus-bass|melody-plus-harmony]',
    )
    process.exit(1)
  }
  const output = positional[1] ?? input.replace(/\.[^.]+$/, '') + '.preview.mid'
  const tempoArg = argv.find((a) => a.startsWith('--tempo='))
  const transposeArg = argv.find((a) => a.startsWith('--transpose='))
  const voicesArg = argv.find((a) => a.startsWith('--voices='))
  return {
    input,
    output,
    tempo: tempoArg ? Number(tempoArg.split('=')[1]) : undefined,
    transpose: transposeArg ? Number(transposeArg.split('=')[1]) : 0,
    voices: (voicesArg?.split('=')[1] as VoiceSelectionMode) ?? 'melody-plus-harmony',
  }
}

async function extractXmlFromMxl(buf: Buffer): Promise<string> {
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
  if (!entry) throw new Error(`MusicXML entry "${target}" missing from archive.`)
  return entry.async('string')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const buf = readFileSync(args.input)
  const ext = extname(args.input).toLowerCase()
  const title = basename(args.input).replace(/\.[^.]+$/, '')

  let score
  let warnings: string[]
  if (ext === '.mxl') {
    const xmlText = await extractXmlFromMxl(buf)
    ;({ score, warnings } = parseMusicXmlString(xmlText, title))
  } else if (ext === '.musicxml' || ext === '.xml') {
    ;({ score, warnings } = parseMusicXmlString(buf.toString('utf-8'), title))
  } else if (ext === '.mid' || ext === '.midi') {
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    ;({ score, warnings } = parseMidiBuffer(arrayBuffer, title))
  } else {
    throw new Error(`Unsupported file type "${ext}". Use .musicxml, .xml, .mxl, .mid, or .midi.`)
  }

  if (warnings.length > 0) {
    console.log('Import warnings:')
    for (const w of warnings) console.log(`  - ${w}`)
  }

  const profile = buildY30H2Profile()
  const voiceFiltered = selectVoices(score.events, args.voices)
  const transposed = voiceFiltered.map((e) => (e.isRest ? e : { ...e, midiPitch: e.midiPitch + args.transpose }))
  const tempoAdjusted = args.tempo ? transposed.map((e) => ({ ...e, tempoBpm: args.tempo as number })) : transposed

  const mapped = applyMechanismMapping(tempoAdjusted, profile).map((e) => ({
    ...e,
    conversion: e.conversion ? { ...e.conversion, approved: true } : e.conversion,
  }))

  const playable = mapped.filter((e) => !e.isRest && e.conversion?.approved && e.conversion.mappedMidiPitch != null)
  const unresolved = mapped.filter((e) => !e.isRest && (!e.conversion || e.conversion.mappedMidiPitch == null))
  const altered = mapped.filter((e) => !e.isRest && e.conversion && e.conversion.reason !== 'exact-match')

  const bpm = playable[0]?.tempoBpm ?? 100
  const bytes = exportConvertedMidi(mapped, score.title)
  writeFileSync(args.output, bytes)

  console.log(`\nWrote ${args.output}`)
  console.log(`  ${playable.length} playable notes at ${bpm} BPM (mechanism: ${profile.name})`)
  if (altered.length > 0) {
    console.log(
      `  ${altered.length} note(s) were octave-folded or pitch-substituted, not exact matches - open the app and import this file on the Review tab to see exactly which ones.`,
    )
  }
  if (unresolved.length > 0) {
    console.log(`  WARNING: ${unresolved.length} note(s) had no playable pitch on this mechanism and were left out of this preview entirely.`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
