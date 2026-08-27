// Default-import + destructure rather than `import { Midi }`: @tonejs/midi has no
// "exports" map, so a strict Node ESM loader (e.g. running this file directly under
// tsx/node, as the CLI scripts in scripts/ do) only resolves a default export. Bundler
// transforms (Vite/Vitest, this app's real runtime) handle either form identically.
import TonejsMidiPkg from '@tonejs/midi'
import type { NoteEvent } from '../model/types'

const { Midi } = TonejsMidiPkg as unknown as typeof import('@tonejs/midi')

/**
 * Export the converted arrangement as a standard MIDI file. Only includes notes
 * that will actually receive a physical hole (approved + successfully mapped) -
 * this must reflect the real punch pattern, not the original score.
 */
export function exportConvertedMidi(events: NoteEvent[], title = 'Music Box Arrangement'): Uint8Array {
  const playable = events.filter((e) => !e.isRest && e.conversion?.approved && e.conversion.mappedMidiPitch != null)
  const midi = new Midi()
  midi.name = title
  const bpm = playable[0]?.tempoBpm ?? 100
  midi.header.setTempo(bpm)

  const track = midi.addTrack()
  track.name = title
  const secondsPerBeat = 60 / bpm

  for (const ev of playable) {
    track.addNote({
      midi: ev.conversion!.mappedMidiPitch as number,
      time: ev.startBeat * secondsPerBeat,
      duration: Math.max(0.05, ev.durationBeats * secondsPerBeat),
    })
  }

  return midi.toArray()
}
