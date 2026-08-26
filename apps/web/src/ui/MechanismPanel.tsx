import { useStudioStore } from '../state/store'

export function MechanismPanel() {
  const profile = useStudioStore((s) => s.mechanismProfile)
  const showPrintedLabels = useStudioStore((s) => s.showPrintedLabels)
  const setShowPrintedLabels = useStudioStore((s) => s.setShowPrintedLabels)

  return (
    <div className="panel">
      <h2>Mechanism profile</h2>
      <p className="muted">{profile.description}</p>
      <label><input type="checkbox" checked={showPrintedLabels} onChange={(e) => setShowPrintedLabels(e.target.checked)} /> Show printed strip labels alongside actual sounding notes</label>
      <table className="lane-table">
        <thead><tr><th>Lane</th><th>Sounding note</th><th>Printed label</th></tr></thead>
        <tbody>
          {profile.lanes.map((l) => (
            <tr key={l.lane}>
              <td>{l.lane}</td>
              <td>{l.soundingNoteName}</td>
              <td>{showPrintedLabels ? l.printedLabel : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Printed labels on many 30-note strips do NOT match the pitch the mechanism actually plays. This app always
        maps songs using the sounding pitch (right column meaning), never the printed label alone.
      </p>
    </div>
  )
}
