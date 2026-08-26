import * as Tone from 'tone'
import type { NoteEvent } from '../model/types'
import { midiToFrequency } from '../music/pitch'

export type PlaybackSource = 'original' | 'converted'

export interface PlaybackHandle {
  stop: () => void
}

let synth: Tone.PolySynth | null = null
let metronomeSynth: Tone.MembraneSynth | null = null
let activePart: Tone.Part | null = null
let metronomePart: Tone.Loop | null = null

function ensureSynths() {
  if (!synth) {
    // A bright, decaying pluck approximates a music-box tine strike - accurate pitch/timing, not a claim of physical-playability proof.
    synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle8' },
      envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.3 },
      volume: -6,
    }).toDestination()
  }
  if (!metronomeSynth) {
    metronomeSynth = new Tone.MembraneSynth({ volume: -14 }).toDestination()
  }
}

function eventsForPlayback(events: NoteEvent[], source: PlaybackSource): Array<{ time: number; midi: number; duration: number }> {
  const bpm = events.find((e) => !e.isRest)?.tempoBpm ?? 100
  const secondsPerBeat = 60 / bpm
  if (source === 'original') {
    return events
      .filter((e) => !e.isRest)
      .map((e) => ({ time: e.startBeat * secondsPerBeat, midi: e.midiPitch, duration: Math.max(0.05, e.durationBeats * secondsPerBeat) }))
  }
  return events
    .filter((e) => !e.isRest && e.conversion?.approved && e.conversion.mappedMidiPitch != null)
    .map((e) => ({ time: e.startBeat * secondsPerBeat, midi: e.conversion!.mappedMidiPitch as number, duration: Math.max(0.05, e.durationBeats * secondsPerBeat) }))
}

export async function playArrangement(
  events: NoteEvent[],
  source: PlaybackSource,
  opts: { loopStartBeat?: number; loopEndBeat?: number; tempoBpm?: number; metronome?: boolean; onNote?: (beat: number) => void } = {},
): Promise<PlaybackHandle> {
  await Tone.start()
  ensureSynths()
  stopPlayback()

  const bpm = opts.tempoBpm ?? events.find((e) => !e.isRest)?.tempoBpm ?? 100
  Tone.getTransport().bpm.value = bpm
  const notes = eventsForPlayback(events, source)

  activePart = new Tone.Part((time, note: { midi: number; duration: number; beat: number }) => {
    synth!.triggerAttackRelease(midiToFrequency(note.midi), note.duration, time)
    if (opts.onNote) Tone.getDraw().schedule(() => opts.onNote!(note.beat), time)
  }, notes.map((n) => [n.time, { midi: n.midi, duration: n.duration, beat: n.time }] as [number, { midi: number; duration: number; beat: number }]))
  activePart.start(0)

  if (opts.metronome) {
    const secondsPerBeat = 60 / bpm
    metronomePart = new Tone.Loop((time) => {
      metronomeSynth!.triggerAttackRelease('C2', 0.05, time)
    }, secondsPerBeat).start(0)
  }

  if (opts.loopStartBeat != null && opts.loopEndBeat != null) {
    const secondsPerBeat = 60 / bpm
    Tone.getTransport().loop = true
    Tone.getTransport().loopStart = opts.loopStartBeat * secondsPerBeat
    Tone.getTransport().loopEnd = opts.loopEndBeat * secondsPerBeat
    Tone.getTransport().seconds = opts.loopStartBeat * secondsPerBeat
  } else {
    Tone.getTransport().loop = false
  }

  Tone.getTransport().start()

  return { stop: stopPlayback }
}

export function stopPlayback(): void {
  Tone.getTransport().stop()
  Tone.getTransport().cancel()
  activePart?.dispose()
  activePart = null
  metronomePart?.dispose()
  metronomePart = null
}

export function seekToBeat(beat: number, bpm: number): void {
  Tone.getTransport().seconds = beat * (60 / bpm)
}

export function currentBeat(bpm: number): number {
  return Tone.getTransport().seconds / (60 / bpm)
}
