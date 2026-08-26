import { useStudioStore } from '../state/store'
import { beatToMm } from '../convert/layout'
import { StatusIcon } from './icons'
import { eventStatusIcon, eventStatusLabel } from './statusHelpers'
import { midiToSharpName } from '../music/pitch'

/** Synchronized note table: measure/beat, original vs converted pitch, lane, mm position, reason, status, OMR confidence. */
export function NoteTable() {
  const events = useStudioStore((s) => s.mappedEvents)
  const paper = useStudioStore((s) => s.paperProfile)
  const layout = useStudioStore((s) => s.layoutConfig)
  const validation = useStudioStore((s) => s.validation)
  const selectedEventIds = useStudioStore((s) => s.selectedEventIds)
  const selectEvents = useStudioStore((s) => s.selectEvents)
  const toggleSelectEvent = useStudioStore((s) => s.toggleSelectEvent)

  const pitched = events.filter((e) => !e.isRest).sort((a, b) => a.startBeat - b.startBeat)
  const conflicts = validation?.conflicts ?? []

  return (
    <div className="table-wrap">
      <table className="note-table">
        <thead>
          <tr>
            <th></th><th>Meas.</th><th>Beat</th><th>Original</th><th>Converted</th><th>Lane</th><th>Position (mm)</th><th>Reason</th><th>Status</th><th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {pitched.map((ev) => {
            const kind = eventStatusIcon(ev, conflicts)
            const isSelected = selectedEventIds.includes(ev.id)
            return (
              <tr
                key={ev.id}
                className={isSelected ? 'selected' : ''}
                onClick={(e) => (e.shiftKey || e.ctrlKey || e.metaKey ? toggleSelectEvent(ev.id) : selectEvents([ev.id]))}
                title={eventStatusLabel(kind)}
              >
                <td><StatusIcon kind={kind} /></td>
                <td>{ev.sourceMeasure}</td>
                <td>{ev.sourceBeat.toFixed(2)}</td>
                <td>{ev.writtenName}</td>
                <td>{ev.conversion?.mappedMidiPitch != null ? midiToSharpName(ev.conversion.mappedMidiPitch) : '-'}</td>
                <td>{ev.conversion?.lane ?? '-'}</td>
                <td>{ev.conversion?.lane != null ? beatToMm(ev.startBeat, layout, paper).toFixed(1) : '-'}</td>
                <td>{ev.conversion?.reason ?? '-'}</td>
                <td>{ev.status}</td>
                <td>{(ev.importConfidence * 100).toFixed(0)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
