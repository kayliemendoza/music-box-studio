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
})
