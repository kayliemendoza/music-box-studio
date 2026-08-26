import { describe, it, expect } from 'vitest'
import { Midi } from '@tonejs/midi'
import { parseMidiBuffer } from './midi'
import { parseNoteName } from '../music/pitch'

function buildTestMidi(): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(100)
  midi.header.timeSignatures[0] = { ticks: 0, timeSignature: [4, 4] }
  midi.header.update()

  const track = midi.addTrack()
  track.name = 'Melody'
  const ppq = midi.header.ppq
  const secondsPerBeat = 60 / 100
  const notes = [
    parseNoteName('C4').midi, parseNoteName('C4').midi,
    parseNoteName('G4').midi, parseNoteName('G4').midi,
  ]
  notes.forEach((midiNum, i) => {
    track.addNote({ midi: midiNum, time: i * secondsPerBeat, duration: secondsPerBeat })
  })
  void ppq
  return midi.toArray()
}

function buildDrumTrackMidi(): Uint8Array {
  const midi = new Midi()
  const track = midi.addTrack()
  track.channel = 9 // GM percussion channel
  track.name = 'Drums'
  track.addNote({ midi: 36, time: 0, duration: 0.25 }) // kick
  return midi.toArray()
}

describe('MIDI import', () => {
  it('parses notes, tempo, and time signature from a generated MIDI file', () => {
    const bytes = buildTestMidi()
    const { score, warnings } = parseMidiBuffer(bytes.buffer as ArrayBuffer, 'Test Song')
    expect(warnings).toHaveLength(0)
    expect(score.events).toHaveLength(4)
    const sorted = [...score.events].sort((a, b) => a.startBeat - b.startBeat)
    expect(sorted.map((e) => e.midiPitch)).toEqual([
      parseNoteName('C4').midi, parseNoteName('C4').midi, parseNoteName('G4').midi, parseNoteName('G4').midi,
    ])
    expect(sorted[0].tempoBpm).toBeCloseTo(100, 0)
    expect(sorted[0].timeSignature).toBe('4/4')
  })

  it('spaces notes one beat apart in startBeat, matching the seconds-based input at 100 BPM', () => {
    const bytes = buildTestMidi()
    const { score } = parseMidiBuffer(bytes.buffer as ArrayBuffer)
    const sorted = [...score.events].sort((a, b) => a.startBeat - b.startBeat)
    expect(sorted[1].startBeat - sorted[0].startBeat).toBeCloseTo(1, 1)
  })

  it('flags a channel-10 percussion track for review', () => {
    const bytes = buildDrumTrackMidi()
    const { score, warnings } = parseMidiBuffer(bytes.buffer as ArrayBuffer)
    expect(score.parts[0].isPercussion).toBe(true)
    expect(warnings.some((w) => /percussion/i.test(w))).toBe(true)
  })
})
