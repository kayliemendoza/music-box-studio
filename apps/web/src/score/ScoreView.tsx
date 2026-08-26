import { useEffect, useRef, useState } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { useStudioStore } from '../state/store'

/**
 * Renders the imported MusicXML as conventional notation via OpenSheetMusicDisplay.
 * Only available when the source score actually has MusicXML behind it (MusicXML
 * imports natively; MIDI imports don't carry notation source, so this view is
 * skipped for those - the strip editor + note table remain the source of truth).
 */
export function ScoreView({ musicXml }: { musicXml: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mappedEvents = useStudioStore((s) => s.mappedEvents)

  useEffect(() => {
    if (!musicXml || !containerRef.current) return
    let cancelled = false
    async function render() {
      try {
        if (!osmdRef.current && containerRef.current) {
          osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
            autoResize: true,
            drawTitle: true,
          })
        }
        await osmdRef.current!.load(musicXml as string)
        if (cancelled) return

        // Best-effort highlighting: color noteheads for events whose conversion changed
        // or is still unresolved, matched heuristically by (measure, MIDI pitch).
        const changedByMeasurePitch = new Set(
          mappedEvents
            .filter((e) => !e.isRest && e.conversion && (e.conversion.reason !== 'exact-match' || !e.conversion.approved))
            .map((e) => `${e.sourceMeasure}:${e.midiPitch}`),
        )
        const sheet = osmdRef.current!.Sheet
        for (const part of sheet.Instruments) {
          for (const voice of part.Voices) {
            for (const ve of voice.VoiceEntries) {
              for (const note of ve.Notes) {
                const measureNum = note.SourceMeasure?.MeasureNumber
                const midi = note.halfTone + 12 // OSMD halfTone is MIDI-60-relative-ish in some versions; best-effort only
                if (measureNum != null && changedByMeasurePitch.has(`${measureNum}:${midi}`)) {
                  note.NoteheadColor = '#d97706'
                }
              }
            }
          }
        }

        osmdRef.current!.render()
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    }
    render()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicXml])

  if (!musicXml) {
    return <div className="muted">No notation source available for this import (e.g. MIDI files don't carry engraved notation) - use the strip editor and note table instead.</div>
  }

  return (
    <div>
      {error && <div className="error-box">Score rendering failed: {error}</div>}
      <div ref={containerRef} className="osmd-container" />
    </div>
  )
}
