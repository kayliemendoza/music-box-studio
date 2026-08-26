import { useRef, useState, useCallback, useMemo } from 'react'
import { useStudioStore } from '../state/store'
import { beatToMm, laneToMm, beatToGridColumn } from '../convert/layout'
import { eventStatusIcon } from '../ui/statusHelpers'
import type { NoteEvent } from '../model/types'

const STATUS_COLOR: Record<string, string> = {
  exact: '#16a34a',
  changed: '#d97706',
  unresolved: '#dc2626',
  conflict: '#7f1d1d',
  'omr-uncertain': '#7c3aed',
}

/** Horizontally scrollable, zoomable 30-lane punch-strip editor. Circles are drawn at physical (mm) scale, magnified by `pxPerMm`. */
export function StripEditor() {
  const events = useStudioStore((s) => s.mappedEvents)
  const profile = useStudioStore((s) => s.mechanismProfile)
  const paper = useStudioStore((s) => s.paperProfile)
  const layout = useStudioStore((s) => s.layoutConfig)
  const showPrintedLabels = useStudioStore((s) => s.showPrintedLabels)
  const setShowPrintedLabels = useStudioStore((s) => s.setShowPrintedLabels)
  const validation = useStudioStore((s) => s.validation)
  const selectedEventIds = useStudioStore((s) => s.selectedEventIds)
  const selectEvents = useStudioStore((s) => s.selectEvents)
  const toggleSelectEvent = useStudioStore((s) => s.toggleSelectEvent)
  const clearSelection = useStudioStore((s) => s.clearSelection)
  const moveEvent = useStudioStore((s) => s.moveEvent)
  const deleteEvent = useStudioStore((s) => s.deleteEvent)
  const addManualEvent = useStudioStore((s) => s.addManualEvent)
  const undo = useStudioStore((s) => s.undo)
  const redo = useStudioStore((s) => s.redo)
  const updateLayoutConfig = useStudioStore((s) => s.updateLayoutConfig)
  const shiftFromBeat = useStudioStore((s) => s.shiftFromBeat)

  const [pxPerMm, setPxPerMm] = useState(4)
  const [addMode, setAddMode] = useState(false)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const dragState = useRef<{ id: string; startX: number; originalBeat: number } | null>(null)
  const clipboard = useRef<NoteEvent[]>([])
  const svgRef = useRef<SVGSVGElement>(null)

  const conflicts = validation?.conflicts ?? []
  const pitched = useMemo(() => events.filter((e) => !e.isRest), [events])

  const contentWidthMm = paper.maxSheetLengthMm
  const contentHeightMm = 20 + paper.widthMm

  function mmToPx(v: number) { return v * pxPerMm }
  function pxToMm(v: number) { return v / pxPerMm }

  const beatFromMm = useCallback(
    (mmX: number) => {
      const col = (mmX - paper.leadingMarginMm) / paper.timingGridSpacingMm
      const snappedCol = snapToGrid ? Math.round(col) : col
      return snappedCol * layout.gridUnitBeats
    },
    [paper.leadingMarginMm, paper.timingGridSpacingMm, layout.gridUnitBeats, snapToGrid],
  )

  function laneFromMm(mmY: number): number {
    const rel = (mmY - paper.firstLaneOffsetMm) / paper.laneSpacingMm
    return Math.max(1, Math.min(profile.lanes.length, Math.round(rel) + 1))
  }

  function handleCircleMouseDown(e: React.MouseEvent, ev: NoteEvent) {
    e.stopPropagation()
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      toggleSelectEvent(ev.id)
      return
    }
    if (!selectedEventIds.includes(ev.id)) selectEvents([ev.id])
    dragState.current = { id: ev.id, startX: e.clientX, originalBeat: ev.startBeat }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragState.current || !svgRef.current) return
    const dxPx = e.clientX - dragState.current.startX
    const dxMm = pxToMm(dxPx)
    const dxBeats = dxMm / paper.timingGridSpacingMm * layout.gridUnitBeats
    const newBeat = Math.max(0, dragState.current.originalBeat + dxBeats)
    const snapped = snapToGrid ? beatToGridColumn(newBeat, layout) * layout.gridUnitBeats : newBeat
    if (Math.abs(snapped - dragState.current.originalBeat) > 1e-6) {
      // live-preview via direct move (cheap enough for typical song sizes; committed to history on mouseup)
    }
    ;(dragState.current as unknown as { pendingBeat: number }).pendingBeat = snapped
  }

  function handleMouseUp() {
    const d = dragState.current as (typeof dragState.current & { pendingBeat?: number }) | null
    if (d?.pendingBeat != null && Math.abs(d.pendingBeat - d.originalBeat) > 1e-6) {
      moveEvent(d.id, d.pendingBeat)
    }
    dragState.current = null
  }

  function handleBackgroundClick(e: React.MouseEvent) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const mmX = pxToMm(e.clientX - rect.left)
    const mmY = pxToMm(e.clientY - rect.top) - 20
    if (addMode) {
      const lane = laneFromMm(mmY)
      const laneInfo = profile.lanes.find((l) => l.lane === lane)
      if (laneInfo) {
        addManualEvent({ midiPitch: laneInfo.soundingMidiPitch, startBeat: Math.max(0, beatFromMm(mmX)), durationBeats: layout.gridUnitBeats })
      }
    } else {
      clearSelection()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEventIds.length > 0) {
      e.preventDefault()
      for (const id of selectedEventIds) deleteEvent(id)
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedEventIds.length > 0) {
      clipboard.current = pitched.filter((ev) => selectedEventIds.includes(ev.id))
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard.current.length > 0) {
      const minBeat = Math.min(...clipboard.current.map((c) => c.startBeat))
      const offset = pitched.length > 0 ? Math.max(...pitched.map((p) => p.startBeat + p.durationBeats)) - minBeat : 0
      for (const c of clipboard.current) {
        addManualEvent({ midiPitch: c.midiPitch, startBeat: c.startBeat + offset, durationBeats: c.durationBeats })
      }
    }
  }

  return (
    <div className="panel">
      <h2>4. Punch-strip editor</h2>
      <div className="toolbar">
        <label>Zoom <input type="range" min={1} max={12} step={0.5} value={pxPerMm} onChange={(e) => setPxPerMm(Number(e.target.value))} /></label>
        <label><input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} /> Snap to grid</label>
        <label><input type="checkbox" checked={showPrintedLabels} onChange={(e) => setShowPrintedLabels(e.target.checked)} /> Show printed strip labels</label>
        <label><input type="checkbox" checked={addMode} onChange={(e) => setAddMode(e.target.checked)} /> Add-note mode (click a lane to add a hole)</label>
        <label>Timeline stretch (beats/grid-column)
          <input type="number" min={0.0625} max={1} step={0.0625} value={layout.gridUnitBeats} onChange={(e) => updateLayoutConfig({ gridUnitBeats: Number(e.target.value) })} />
        </label>
        <button type="button" onClick={undo}>Undo</button>
        <button type="button" onClick={redo}>Redo</button>
        <button
          type="button"
          onClick={() => {
            const beat = selectedEventIds.length > 0 ? pitched.find((p) => p.id === selectedEventIds[0])?.startBeat ?? 0 : 0
            shiftFromBeat(beat, 4)
          }}
        >
          Insert measure (4 beats) before selection
        </button>
        <button
          type="button"
          onClick={() => {
            const beat = selectedEventIds.length > 0 ? pitched.find((p) => p.id === selectedEventIds[0])?.startBeat ?? 0 : 0
            shiftFromBeat(beat, -4)
          }}
        >
          Remove measure (4 beats) at selection
        </button>
      </div>

      <div className="strip-scroll" tabIndex={0} onKeyDown={handleKeyDown}>
        <svg
          ref={svgRef}
          width={mmToPx(contentWidthMm)}
          height={mmToPx(contentHeightMm)}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={handleBackgroundClick}
        >
          <rect x={0} y={0} width={mmToPx(contentWidthMm)} height={mmToPx(contentHeightMm)} fill="#fafafa" />
          {/* Feed direction arrow */}
          <line x1={mmToPx(5)} y1={mmToPx(8)} x2={mmToPx(25)} y2={mmToPx(8)} stroke="#16a34a" strokeWidth={2} markerEnd="url(#arrow)" />
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#16a34a" />
            </marker>
          </defs>

          {/* Lane lines + labels */}
          {profile.lanes.map((lane) => {
            const y = 20 + laneToMm(lane.lane, paper)
            const label = showPrintedLabels && lane.printedLabel !== lane.soundingNoteName
              ? `${lane.soundingNoteName} (${lane.printedLabel})`
              : lane.soundingNoteName
            return (
              <g key={lane.lane}>
                <line x1={0} y1={mmToPx(y)} x2={mmToPx(contentWidthMm)} y2={mmToPx(y)} stroke="#ddd" strokeWidth={1} />
                <text x={2} y={mmToPx(y) - 2} fontSize={10} fill="#666">{label}</text>
              </g>
            )
          })}

          {/* Margin markers */}
          <line x1={mmToPx(paper.leadingMarginMm)} y1={mmToPx(20)} x2={mmToPx(paper.leadingMarginMm)} y2={mmToPx(20 + paper.widthMm)} stroke="#93c5fd" strokeDasharray="4,4" />
          <line x1={mmToPx(contentWidthMm - paper.endingMarginMm)} y1={mmToPx(20)} x2={mmToPx(contentWidthMm - paper.endingMarginMm)} y2={mmToPx(20 + paper.widthMm)} stroke="#93c5fd" strokeDasharray="4,4" />

          {/* Holes */}
          {pitched.map((ev) => {
            if (!ev.conversion?.lane) return null
            const x = beatToMm(ev.startBeat, layout, paper)
            const y = 20 + laneToMm(ev.conversion.lane, paper)
            const kind = eventStatusIcon(ev, conflicts)
            const isSelected = selectedEventIds.includes(ev.id)
            const r = Math.max(2, mmToPx(paper.holeDiameterMm / 2))
            const trigX = x + (paper.feedDirection === 'right-to-left' ? -1 : 1) * paper.triggerEdgeOffsetMm
            return (
              <g key={ev.id} onMouseDown={(e) => handleCircleMouseDown(e, ev)} style={{ cursor: 'grab' }}>
                <circle
                  cx={mmToPx(x)} cy={mmToPx(y)} r={r}
                  fill={STATUS_COLOR[kind]} fillOpacity={0.85}
                  stroke={isSelected ? '#111' : 'white'} strokeWidth={isSelected ? 2 : 1}
                />
                <line x1={mmToPx(trigX)} y1={mmToPx(y) - r - 2} x2={mmToPx(trigX)} y2={mmToPx(y) + r + 2} stroke="#111" strokeWidth={0.75} />
              </g>
            )
          })}
        </svg>
      </div>
      <p className="muted">Click to select (shift/ctrl-click for multi-select), drag to move, Delete to remove, Ctrl+C/V to copy-paste, Ctrl+Z/Shift+Ctrl+Z to undo/redo.</p>
    </div>
  )
}
