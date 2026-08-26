import { useState } from 'react'
import { useStudioStore } from '../state/store'
import { playArrangement, stopPlayback } from '../playback/playback'

export function PlaybackControls() {
  const events = useStudioStore((s) => s.mappedEvents)
  const score = useStudioStore((s) => s.score)
  const selectedEventIds = useStudioStore((s) => s.selectedEventIds)
  const [playing, setPlaying] = useState<'original' | 'converted' | null>(null)
  const [tempo, setTempo] = useState<number | null>(null)
  const [metronome, setMetronome] = useState(false)
  const [loopSelection, setLoopSelection] = useState(false)
  const [cursorBeat, setCursorBeat] = useState<number | null>(null)

  const defaultBpm = events.find((e) => !e.isRest)?.tempoBpm ?? 100

  async function play(source: 'original' | 'converted') {
    const selected = events.filter((e) => selectedEventIds.includes(e.id))
    const loopStartBeat = loopSelection && selected.length > 0 ? Math.min(...selected.map((e) => e.startBeat)) : undefined
    const loopEndBeat = loopSelection && selected.length > 0 ? Math.max(...selected.map((e) => e.startBeat + e.durationBeats)) : undefined
    await playArrangement(events, source, {
      tempoBpm: tempo ?? defaultBpm,
      metronome,
      loopStartBeat,
      loopEndBeat,
      onNote: (beat) => setCursorBeat(beat),
    })
    setPlaying(source)
  }

  function stop() {
    stopPlayback()
    setPlaying(null)
  }

  return (
    <div className="panel">
      <h2>5. Playback</h2>
      <p className="muted">
        A synthetic music-box-like tone approximates pitch and timing accurately. This does NOT prove the physical
        strip is playable - only the mechanical validation (conflict checks, calibration) does that.
      </p>
      <div className="toolbar">
        <button type="button" onClick={() => play('original')} disabled={!score}>Play original score</button>
        <button type="button" onClick={() => play('converted')} disabled={!score}>Play converted arrangement (holes only)</button>
        <button type="button" onClick={stop} disabled={!playing}>Stop</button>
        <label>Tempo <input type="number" min={10} max={300} value={tempo ?? defaultBpm} onChange={(e) => setTempo(Number(e.target.value))} /> BPM</label>
        <label><input type="checkbox" checked={metronome} onChange={(e) => setMetronome(e.target.checked)} /> Metronome</label>
        <label><input type="checkbox" checked={loopSelection} onChange={(e) => setLoopSelection(e.target.checked)} /> Loop selected notes</label>
      </div>
      {playing && cursorBeat != null && <div className="muted">Playing {playing} - cursor at beat {cursorBeat.toFixed(2)}</div>}
    </div>
  )
}
