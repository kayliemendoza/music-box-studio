import { useStudioStore } from '../state/store'
import { conflictKey } from '../convert/validation'

export function ValidationSummary() {
  const validation = useStudioStore((s) => s.validation)
  const acceptConflict = useStudioStore((s) => s.acceptConflict)
  const acceptedConflictKeys = useStudioStore((s) => s.acceptedConflictKeys)

  if (!validation) return null
  const { summary, issues, conflicts } = validation

  return (
    <div className="panel">
      <h2>Final summary &amp; validation</h2>

      <table className="summary-table">
        <tbody>
          <tr><td>Original notes</td><td>{summary.originalNoteCount}</td></tr>
          <tr><td>Exact matches retained</td><td>{summary.exactRetained}</td></tr>
          <tr><td>Octave-adjusted</td><td>{summary.octaveAdjusted}</td></tr>
          <tr><td>Replaced (nearest-pitch)</td><td>{summary.replaced}</td></tr>
          <tr><td>Removed</td><td>{summary.removed}</td></tr>
          <tr><td>Unresolved</td><td>{summary.unresolved}</td></tr>
          <tr><td>Mechanical conflicts (outstanding)</td><td>{summary.mechanicalConflicts}</td></tr>
          <tr><td>Total strip length</td><td>{summary.totalStripLengthMm.toFixed(1)} mm</td></tr>
          <tr><td>Number of physical sheets</td><td>{summary.numberOfSheets}</td></tr>
          <tr><td>Estimated playing time</td><td>{summary.estimatedPlayingTimeSeconds.toFixed(1)} s</td></tr>
        </tbody>
      </table>

      {conflicts.length > 0 && (
        <section>
          <h3>Same-note reset conflicts</h3>
          <ul className="review-list">
            {conflicts.map((c) => {
              const key = conflictKey(c)
              const accepted = acceptedConflictKeys.includes(key)
              return (
                <li key={key}>
                  {c.message}
                  {!accepted && <button type="button" onClick={() => acceptConflict(key)}>Accept anyway</button>}
                  {accepted && <span className="chip">Accepted</span>}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {issues.length > 0 && (
        <section>
          <h3>Blocking issues before export</h3>
          <ul className="issue-list">
            {issues.map((i) => (
              <li key={i.code} className={i.severity}>{i.message}</li>
            ))}
          </ul>
        </section>
      )}

      <div className={validation.canExport ? 'status-ok' : 'status-blocked'}>
        {validation.canExport ? 'Ready to export.' : 'Export is blocked until the issues above are resolved.'}
      </div>
    </div>
  )
}
