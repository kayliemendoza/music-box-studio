import { describe, it, expect } from 'vitest'
import { validateForExport, conflictKey } from './validation'
import { buildTestArrangement } from '../export/testHelpers'
import { buildY30H2Profile } from '../model/mechanism'
import { parseNoteName } from '../music/pitch'
import { ev } from '../export/testHelpers'
import { applyMechanismMapping } from './playability'
import { defaultStripLayoutConfig } from './layout'

describe('pre-export validation gate', () => {
  it('blocks export when the paper has not been calibrated', () => {
    const { events, profile, paper, layout } = buildTestArrangement()
    const result = validateForExport(events, profile, { ...paper, isCalibrated: false }, layout, new Set())
    expect(result.canExport).toBe(false)
    expect(result.issues.some((i) => i.code === 'paper-not-calibrated')).toBe(true)
  })

  it('allows export once every gate is satisfied', () => {
    const { events, profile, paper, layout } = buildTestArrangement()
    const result = validateForExport(events, profile, { ...paper, isCalibrated: true }, layout, new Set())
    expect(result.canExport).toBe(true)
    expect(result.issues.filter((i) => i.severity === 'blocking')).toHaveLength(0)
  })

  it('blocks export while a nearest-suggested substitution is still pending approval', () => {
    const profile = buildY30H2Profile()
    const layout = defaultStripLayoutConfig()
    const { paper } = buildTestArrangement()
    const events = applyMechanismMapping([ev({ midiPitch: parseNoteName('G#4').midi })], profile)
    const result = validateForExport(events, profile, { ...paper, isCalibrated: true }, layout, new Set())
    expect(result.canExport).toBe(false)
    expect(result.issues.some((i) => i.code === 'unsupported-pitch-unresolved')).toBe(true)
  })

  it('unblocks a same-lane conflict once its key is in the accepted set', () => {
    const profile = buildY30H2Profile()
    const layout = defaultStripLayoutConfig()
    const { paper } = buildTestArrangement()
    const calibratedPaper = { ...paper, isCalibrated: true }
    const rawEvents = [
      ev({ midiPitch: parseNoteName('C5').midi, startBeat: 0 }),
      ev({ midiPitch: parseNoteName('C5').midi, startBeat: 0.25 }),
    ]
    const mapped = applyMechanismMapping(rawEvents, profile).map((e) => ({ ...e, conversion: e.conversion ? { ...e.conversion, approved: true } : e.conversion }))

    const blocked = validateForExport(mapped, profile, calibratedPaper, layout, new Set())
    expect(blocked.canExport).toBe(false)
    expect(blocked.conflicts).toHaveLength(1)

    const accepted = new Set([conflictKey(blocked.conflicts[0])])
    const unblocked = validateForExport(mapped, profile, calibratedPaper, layout, accepted)
    expect(unblocked.issues.some((i) => i.code === 'same-note-reset-conflict')).toBe(false)
  })

  it('reports an accurate final summary of note counts', () => {
    const { events, profile, paper, layout } = buildTestArrangement(8, 1)
    const result = validateForExport(events, profile, { ...paper, isCalibrated: true }, layout, new Set())
    expect(result.summary.originalNoteCount).toBe(8)
    expect(result.summary.exactRetained).toBe(8)
    expect(result.summary.numberOfSheets).toBe(1)
    expect(result.summary.estimatedPlayingTimeSeconds).toBeGreaterThan(0)
  })

  it('does not flag holes near an internal join as outside the usable region in spliced mode', () => {
    const { events, profile, layout } = buildTestArrangement(40, 4)
    const splicedPaper = {
      ...buildTestArrangement().paper,
      maxSheetLengthMm: 120,
      leadingMarginMm: 20,
      endingMarginMm: 20,
      allowTapedJoins: true,
      spliceClearanceMm: 4,
      isCalibrated: true,
    }
    const result = validateForExport(events, profile, splicedPaper, layout, new Set())
    expect(result.issues.some((i) => i.code === 'hole-outside-usable-region')).toBe(false)
  })

  it('still flags a hole that falls within the true ending margin of the final page', () => {
    const { profile, layout } = buildTestArrangement()
    const paper = {
      ...buildTestArrangement().paper,
      maxSheetLengthMm: 100,
      leadingMarginMm: 20,
      endingMarginMm: 20,
      allowTapedJoins: true,
      spliceClearanceMm: 4,
      isCalibrated: true,
    }
    // Both notes stay on the same (single, final) page under the permissive splice-mode
    // grouping capacity (100 - 4 = 96mm), but the second one's local position (20mm lead +
    // 70mm = 90mm) falls inside the real 20mm ending margin (i.e. past 80mm) - which only
    // matters because this page's trailing edge is a true 'tail', not a 'join'.
    const notes = applyMechanismMapping(
      [ev({ midiPitch: parseNoteName('C5').midi, startBeat: 0 }), ev({ midiPitch: parseNoteName('D5').midi, startBeat: 8.75 })],
      profile,
    ).map((e) => ({ ...e, conversion: e.conversion ? { ...e.conversion, approved: true } : e.conversion }))
    const result = validateForExport(notes, profile, paper, layout, new Set())
    expect(result.issues.some((i) => i.code === 'hole-outside-usable-region')).toBe(true)
  })
})
