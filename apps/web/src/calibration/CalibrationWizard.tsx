import { useMemo } from 'react'
import { useStudioStore } from '../state/store'
import type { PaperProfile } from '../model/paper'
import { generateCalibrationPageSvg } from './calibrationPage'
import { downloadBlob } from '../export/download'

type NumericField = Exclude<
  keyof PaperProfile,
  'id' | 'name' | 'isCalibrated' | 'feedDirection' | 'highNoteSide' | 'unusableRegionsMm' | 'allowTapedJoins'
>

const FIELDS: Array<{ key: NumericField; label: string; hint: string }> = [
  { key: 'widthMm', label: 'Paper width (mm)', hint: 'Full width of the strip, edge to edge' },
  { key: 'maxSheetLengthMm', label: 'Max sheet length (mm)', hint: 'Longest length one physical sheet/roll segment can be' },
  { key: 'firstLaneOffsetMm', label: 'First lane offset (mm)', hint: 'Distance from top edge to lane 1 center' },
  { key: 'laneSpacingMm', label: 'Lane spacing (mm)', hint: 'Center-to-center distance between adjacent lanes' },
  { key: 'laneCount', label: 'Lane count', hint: 'Should match the mechanism profile (30)' },
  { key: 'timingGridSpacingMm', label: 'Timing-grid spacing (mm)', hint: 'Horizontal distance between grid columns' },
  { key: 'holeDiameterMm', label: 'Hole diameter (mm)', hint: 'Starting value ~3.175mm (1/8in) - override after your test print' },
  { key: 'leadingMarginMm', label: 'Leading feed margin (mm)', hint: 'Blank leader before the first hole' },
  { key: 'endingMarginMm', label: 'Ending margin (mm)', hint: 'Blank trailer after the last hole' },
  { key: 'triggerEdgeOffsetMm', label: 'Trigger edge offset (mm)', hint: 'Hook reads an edge of the hole, not its center' },
  { key: 'printerCalibrationCorrectionMm', label: 'Printer calibration correction (mm)', hint: 'From your 100mm test box measurement' },
  { key: 'silhouetteCuttingOffsetMm', label: 'Silhouette cutting offset (mm)', hint: 'From a Curio 2 test cut' },
  { key: 'spliceClearanceMm', label: 'Splice clearance (mm)', hint: 'Hole-free zone on each side of a taped join - only matters if "Allow taped joins" is on below' },
]

export function CalibrationWizard() {
  const paper = useStudioStore((s) => s.paperProfile)
  const profile = useStudioStore((s) => s.mechanismProfile)
  const setPaperProfile = useStudioStore((s) => s.setPaperProfile)

  const calibrationSvg = useMemo(() => generateCalibrationPageSvg(paper, profile), [paper, profile])

  function updateField(key: NumericField, value: number) {
    setPaperProfile({ ...paper, [key]: value, isCalibrated: false })
  }

  return (
    <div className="panel">
      <h2>Paper calibration wizard</h2>
      <p className="muted">
        These values start as reasonable placeholders. Print the calibration page below at 100% / actual size, hold it
        against your real blank strip and instruction sheet, measure everything, and enter your measured values here
        before exporting anything physical.
      </p>

      <div className="calibration-grid">
        <div>
          <h3>Geometry</h3>
          {FIELDS.map((f) => (
            <label key={f.key} className="field-row">
              <span>{f.label}<br /><small className="muted">{f.hint}</small></span>
              <input
                type="number"
                step="0.01"
                value={paper[f.key] as number}
                onChange={(e) => updateField(f.key, Number(e.target.value))}
              />
            </label>
          ))}

          <label className="field-row">
            <span>Feed direction</span>
            <select value={paper.feedDirection} onChange={(e) => setPaperProfile({ ...paper, feedDirection: e.target.value as PaperProfile['feedDirection'], isCalibrated: false })}>
              <option value="left-to-right">Left to right</option>
              <option value="right-to-left">Right to left</option>
              <option value="top-to-bottom">Top to bottom</option>
              <option value="bottom-to-top">Bottom to top</option>
            </select>
          </label>
          <label className="field-row">
            <span>High-note side (lane 1)</span>
            <select value={paper.highNoteSide} onChange={(e) => setPaperProfile({ ...paper, highNoteSide: e.target.value as PaperProfile['highNoteSide'], isCalibrated: false })}>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </label>

          <h3>Multi-sheet joins</h3>
          <label className="field-row">
            <span>
              Allow taped joins between sheets
              <br />
              <small className="muted">
                Off (default) = every sheet is fully independent, per the community guide's caution about jamming. Turn
                this on only if you've verified your own splicing technique (e.g. a precise zigzag cut) works reliably -
                it lets a long song use fewer sheets by spending only "splice clearance" at internal joins instead of a
                full leading + ending margin at every break.
              </small>
            </span>
            <input
              type="checkbox"
              checked={paper.allowTapedJoins}
              onChange={(e) => setPaperProfile({ ...paper, allowTapedJoins: e.target.checked, isCalibrated: false })}
            />
          </label>

          <h3>Unusable / join regions</h3>
          {paper.unusableRegionsMm.map((region, i) => (
            <div key={i} className="unusable-row">
              <input type="number" value={region.startMm} onChange={(e) => {
                const next = [...paper.unusableRegionsMm]
                next[i] = { ...region, startMm: Number(e.target.value) }
                setPaperProfile({ ...paper, unusableRegionsMm: next, isCalibrated: false })
              }} /> to
              <input type="number" value={region.endMm} onChange={(e) => {
                const next = [...paper.unusableRegionsMm]
                next[i] = { ...region, endMm: Number(e.target.value) }
                setPaperProfile({ ...paper, unusableRegionsMm: next, isCalibrated: false })
              }} /> mm
              <input value={region.label} placeholder="label" onChange={(e) => {
                const next = [...paper.unusableRegionsMm]
                next[i] = { ...region, label: e.target.value }
                setPaperProfile({ ...paper, unusableRegionsMm: next, isCalibrated: false })
              }} />
              <button type="button" onClick={() => setPaperProfile({ ...paper, unusableRegionsMm: paper.unusableRegionsMm.filter((_, idx) => idx !== i), isCalibrated: false })}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={() => setPaperProfile({ ...paper, unusableRegionsMm: [...paper.unusableRegionsMm, { startMm: 0, endMm: 10, label: 'splice' }], isCalibrated: false })}>
            Add unusable/join region
          </button>

          <div className="calibration-status">
            <strong>Status: {paper.isCalibrated ? 'Calibrated' : 'NOT yet calibrated'}</strong>
            <p className="muted">Only confirm this once you've measured a real printout/test cut against your physical paper and mechanism.</p>
            <button type="button" onClick={() => setPaperProfile({ ...paper, isCalibrated: true })} disabled={paper.isCalibrated}>
              I measured everything above against my real strip - mark as calibrated
            </button>
          </div>
        </div>

        <div>
          <h3>Calibration page preview</h3>
          <button
            type="button"
            onClick={() => downloadBlob(new Blob([calibrationSvg], { type: 'image/svg+xml' }), 'calibration-page.svg')}
          >
            Download printable calibration page (SVG)
          </button>
          <div className="calibration-preview" dangerouslySetInnerHTML={{ __html: calibrationSvg }} />
        </div>
      </div>
    </div>
  )
}
