/**
 * Generates a standalone MIDI file of the converted (mechanism-mapped, holes-only)
 * arrangement, for uploading into Music Box Maniacs' editor (musicboxmaniacs.com/create/)
 * to hear a preview before committing to printing/punching a physical strip.
 *
 * Run with: npx tsx scripts/generatePreviewMidi.ts [output.mid]
 */
import { writeFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
// @tonejs/midi has no "exports" map, so under plain Node ESM (this script) only a
// default export is visible - unlike in the app's real runtime (Vite/browser), where
// esbuild's CJS interop synthesizes the named export `Midi` that src/export/midiExport.ts
// uses directly. Same library, same output; just a Node-vs-bundler loader difference.
import TonejsMidiPkg from '@tonejs/midi'
const { Midi } = TonejsMidiPkg as unknown as typeof import('@tonejs/midi')

const dom = new JSDOM('')
;(globalThis as unknown as { DOMParser: typeof dom.window.DOMParser }).DOMParser = dom.window.DOMParser

const { parseMusicXmlString } = await import('../src/import/musicxml.ts')
const { buildY30H2Profile } = await import('../src/model/mechanism.ts')
const { applyMechanismMapping } = await import('../src/convert/playability.ts')
const { TWINKLE_MUSICXML } = await import('../src/fixtures/twinkleTwinkle.ts')

const { score } = parseMusicXmlString(TWINKLE_MUSICXML)
const profile = buildY30H2Profile()

const mapped = applyMechanismMapping(score.events, profile).map((e) => ({
  ...e,
  conversion: e.conversion ? { ...e.conversion, approved: true } : e.conversion,
}))

const unresolved = mapped.filter((e) => !e.isRest && (!e.conversion || e.conversion.mappedMidiPitch == null))
if (unresolved.length > 0) {
  console.warn(`Warning: ${unresolved.length} note(s) had no playable pitch and are excluded from the MIDI.`)
}

// Mirrors src/export/midiExport.ts's exportConvertedMidi exactly - only notes that will
// actually receive a physical hole (approved + successfully mapped) are included.
const playable = mapped.filter((e) => !e.isRest && e.conversion?.approved && e.conversion.mappedMidiPitch != null)
const midi = new Midi()
midi.name = score.title
const bpm = playable[0]?.tempoBpm ?? 100
midi.header.setTempo(bpm)
const track = midi.addTrack()
track.name = score.title
const secondsPerBeat = 60 / bpm
for (const ev of playable) {
  track.addNote({
    midi: ev.conversion!.mappedMidiPitch as number,
    time: ev.startBeat * secondsPerBeat,
    duration: Math.max(0.05, ev.durationBeats * secondsPerBeat),
  })
}
const bytes = midi.toArray()

const outPath = process.argv[2] ?? new URL('../../../fixtures/preview-twinkle-y30h2.mid', import.meta.url).pathname
writeFileSync(outPath, bytes)

console.log(`Wrote ${outPath} - ${playable.length} playable notes, mechanism: ${profile.name}`)
