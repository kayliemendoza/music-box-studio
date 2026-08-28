import { useMemo } from 'react'
import { useStudioStore } from '../state/store'
import { analyzeVoices, selectVoices, type VoiceSelectionMode } from '../convert/voiceSelection'
import { extractTopLineMelody } from '../convert/melodyExtraction'
import { scoreTranspositionOptions } from '../convert/transposition'

const MODES: { value: VoiceSelectionMode; label: string }[] = [
  { value: 'melody-only', label: 'Melody only' },
  { value: 'melody-plus-bass', label: 'Melody + simplified bass' },
  { value: 'melody-plus-harmony', label: 'Melody + reduced harmony (all voices)' },
  { value: 'custom', label: 'Custom selected voices' },
]

export function ConvertPanel() {
  const score = useStudioStore((s) => s.score)
  const mode = useStudioStore((s) => s.voiceSelectionMode)
  const customKeys = useStudioStore((s) => s.customVoiceKeys)
  const setVoiceSelectionMode = useStudioStore((s) => s.setVoiceSelectionMode)
  const melodyTopLine = useStudioStore((s) => s.melodyTopLine)
  const setMelodyTopLine = useStudioStore((s) => s.setMelodyTopLine)
  const transposition = useStudioStore((s) => s.transpositionSemitones)
  const setTransposition = useStudioStore((s) => s.setTransposition)
  const profile = useStudioStore((s) => s.mechanismProfile)
  const paper = useStudioStore((s) => s.paperProfile)
  const layout = useStudioStore((s) => s.layoutConfig)

  const voiceGroups = useMemo(() => (score ? analyzeVoices(score.events) : []), [score])

  // Mirrors the store's recompute() pipeline (voice selection -> optional top-line
  // reduction), so this preview scores the notes that will actually be converted -
  // not the raw, unfiltered score. Scoring transposition on the wrong note set (e.g. a
  // dense chordal part before reduction) gives a recommendation that doesn't hold once
  // the real reduction is applied.
  const reducedForPreview = useMemo(() => {
    if (!score) return []
    const voiceFiltered = selectVoices(score.events, mode, new Set(customKeys))
    return melodyTopLine ? extractTopLineMelody(voiceFiltered) : voiceFiltered
  }, [score, mode, customKeys, melodyTopLine])

  const transpositionOptions = useMemo(() => {
    if (!score) return []
    return scoreTranspositionOptions(reducedForPreview, profile, paper, layout)
  }, [score, reducedForPreview, profile, paper, layout])

  if (!score) return <div className="panel muted">Import a score first.</div>

  return (
    <div className="panel">
      <h2>2. Convert for the mechanism</h2>

      <section>
        <h3>Which voices to keep</h3>
        <div className="radio-group">
          {MODES.map((m) => (
            <label key={m.value}>
              <input type="radio" checked={mode === m.value} onChange={() => setVoiceSelectionMode(m.value)} />
              {m.label}
            </label>
          ))}
        </div>
        {mode === 'custom' && (
          <div className="voice-list">
            {voiceGroups.map((g) => (
              <label key={g.key}>
                <input
                  type="checkbox"
                  checked={customKeys.includes(g.key)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...customKeys, g.key] : customKeys.filter((k) => k !== g.key)
                    setVoiceSelectionMode('custom', next)
                  }}
                />
                Staff {g.staff} / Voice {g.voice} - {g.role} ({g.eventCount} notes)
              </label>
            ))}
          </div>
        )}
        <label className="field-row" style={{ marginTop: 8 }}>
          <span>
            Reduce chords to top-line melody
            <br />
            <small className="muted">
              For parts where the melody is written as the top note of a chord rather than its own voice (common in
              pop-piano arrangements) - collapses every simultaneous chord in the selected voice(s) down to its
              highest note. Voice selection alone can't separate "melody note" from "chord tone" within one voice.
            </small>
          </span>
          <input type="checkbox" checked={melodyTopLine} onChange={(e) => setMelodyTopLine(e.target.checked)} />
        </label>
      </section>

      <section>
        <h3>Automatic transposition preview (-12 to +12 semitones)</h3>
        <p className="muted">Recommended option is highlighted. Scores favor exact matches, melody contour, and downbeat preservation, and penalize substitutions and mechanical conflicts.</p>
        <div className="transposition-table-wrap">
          <table className="transposition-table">
            <thead>
              <tr>
                <th>Semitones</th><th>Exact</th><th>Octave</th><th>Altered</th><th>Unresolved</th><th>Conflicts</th><th>Contour</th><th>Downbeats</th><th>Score</th><th></th>
              </tr>
            </thead>
            <tbody>
              {transpositionOptions.map((o, i) => (
                <tr key={o.semitones} className={o.semitones === transposition ? 'selected' : ''}>
                  <td>{o.semitones > 0 ? `+${o.semitones}` : o.semitones}</td>
                  <td>{o.exactCount}</td>
                  <td>{o.octaveAdjustedCount}</td>
                  <td>{o.alteredCount}</td>
                  <td>{o.unresolvedCount}</td>
                  <td>{o.conflictCount}</td>
                  <td>{(o.contourPreservationScore * 100).toFixed(0)}%</td>
                  <td>{(o.downbeatPreservationScore * 100).toFixed(0)}%</td>
                  <td>{o.score.toFixed(1)}</td>
                  <td>
                    <button type="button" onClick={() => setTransposition(o.semitones)}>
                      {o.semitones === transposition ? 'Applied' : 'Apply'}
                    </button>
                    {i === 0 && <span className="badge">Recommended</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
