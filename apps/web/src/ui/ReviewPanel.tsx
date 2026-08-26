import { useStudioStore } from '../state/store'
import { nearestPlayablePitches } from '../convert/playability'
import { midiToSharpName } from '../music/pitch'
import { NoteTable } from './NoteTable'

/** Pending nearest-pitch substitutions requiring explicit user approve/reject/manual choice, plus a plain-language note list. */
export function ReviewPanel() {
  const events = useStudioStore((s) => s.mappedEvents)
  const profile = useStudioStore((s) => s.mechanismProfile)
  const approveEvent = useStudioStore((s) => s.approveEvent)
  const deleteEvent = useStudioStore((s) => s.deleteEvent)
  const restoreEvent = useStudioStore((s) => s.restoreEvent)
  const setManualPitch = useStudioStore((s) => s.setManualPitch)
  const manualOverrides = useStudioStore((s) => s.manualOverrides)
  const confirmOmrReview = useStudioStore((s) => s.confirmOmrReview)
  const confirmAllOmrReviews = useStudioStore((s) => s.confirmAllOmrReviews)

  const pending = events.filter((e) => !e.isRest && e.conversion && !e.conversion.approved && !manualOverrides[e.id]?.deleted && e.status !== 'removed')
  const deleted = events.filter((e) => manualOverrides[e.id]?.deleted)
  const omrPending = events.filter((e) => e.needsReview)

  return (
    <div className="panel">
      <h2>3. Review &amp; verify</h2>

      {omrPending.length > 0 && (
        <section>
          <h3>Optical Music Recognition uncertainty ({omrPending.length})</h3>
          <p className="muted">
            These notes came from OMR (scanned PDF/image), not MusicXML/MIDI. Recognition is never guaranteed accurate -
            compare each one against your original scan before confirming. Export is blocked until every OMR note is confirmed.
          </p>
          <button type="button" onClick={confirmAllOmrReviews}>Confirm all OMR notes as reviewed</button>
          <ul className="review-list">
            {omrPending.map((ev) => (
              <li key={ev.id}>
                Measure {ev.sourceMeasure}, beat {ev.sourceBeat.toFixed(2)}: recognized as {ev.writtenName}
                <button type="button" onClick={() => confirmOmrReview(ev.id)}>Confirm</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <h3>Notes that need your decision ({pending.length})</h3>
          <p className="muted">These pitches don't exist anywhere on the mechanism. Choose a nearest substitute, edit manually, or delete the note. Nothing is changed silently.</p>
          <ul className="review-list">
            {pending.map((ev) => {
              const suggestions = nearestPlayablePitches(ev.midiPitch, profile, 4)
              return (
                <li key={ev.id}>
                  <strong>Measure {ev.sourceMeasure}, beat {ev.sourceBeat.toFixed(2)}:</strong> {ev.writtenName} is not available on this mechanism.
                  <div className="suggestion-row">
                    {suggestions.map((s) => (
                      <button key={s} type="button" onClick={() => setManualPitch(ev.id, s)}>
                        Use {midiToSharpName(s)}
                      </button>
                    ))}
                    <button type="button" className="secondary" onClick={() => deleteEvent(ev.id)}>Delete note</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {deleted.length > 0 && (
        <section>
          <h3>Deleted notes ({deleted.length})</h3>
          <ul className="review-list">
            {deleted.map((ev) => (
              <li key={ev.id}>
                Measure {ev.sourceMeasure}, beat {ev.sourceBeat.toFixed(2)}: {ev.writtenName}
                <button type="button" className="secondary" onClick={() => restoreEvent(ev.id)}>Restore</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Octave-adjusted &amp; auto-mapped notes</h3>
        <p className="muted">These were shifted by whole octaves to bring them into range, or matched exactly - both auto-applied but always reviewable/reversible below and in the strip editor.</p>
        <div className="approve-row">
          {events
            .filter((e) => !e.isRest && e.conversion?.reason === 'octave-folded')
            .map((ev) => (
              <span key={ev.id} className="chip">
                {ev.writtenName} -&gt; {ev.conversion?.mappedMidiPitch != null ? midiToSharpName(ev.conversion.mappedMidiPitch) : '?'}
                {!ev.conversion?.approved && <button type="button" onClick={() => approveEvent(ev.id)}>Confirm</button>}
              </span>
            ))}
        </div>
      </section>

      <section>
        <h3>Plain-language note list (original -&gt; converted)</h3>
        <NoteTable />
      </section>
    </div>
  )
}
