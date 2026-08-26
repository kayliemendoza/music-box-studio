import { describe, it, expect } from 'vitest'
import { buildY30H2Profile } from '../model/mechanism'
import { buildDefaultPaperProfile } from '../model/paper'
import { parseNoteName } from '../music/pitch'
import { applyMechanismMapping } from './playability'
import { detectSameLaneConflicts, checkTempoWarning } from './conflicts'
import { defaultStripLayoutConfig } from './layout'
import { newId } from '../model/types'
import type { NoteEvent } from '../model/types'

const profile = buildY30H2Profile()
const paper = buildDefaultPaperProfile()
const layout = defaultStripLayoutConfig()

function ev(overrides: Partial<NoteEvent>): NoteEvent {
  return {
    id: newId(),
    sourcePage: 1, sourceStaff: 1, sourceVoice: 1, sourceMeasure: 1, sourceBeat: 1,
    midiPitch: 60, writtenName: 'C4', enharmonicSharp: 'C4', enharmonicFlat: 'C4',
    startBeat: 0, durationBeats: 1, tempoBpm: 90, timeSignature: '4/4',
    isChordMember: false, isRest: false, importConfidence: 1, needsReview: false,
    status: 'original',
    ...overrides,
  }
}

describe('same-lane reset conflict detection', () => {
  it('flags two repeated notes on the same lane that are too close together (grid rule)', () => {
    const events = [
      ev({ midiPitch: parseNoteName('C5').midi, startBeat: 0 }),
      ev({ midiPitch: parseNoteName('C5').midi, startBeat: 0.25 }), // one grid column later - too close
    ]
    const mapped = applyMechanismMapping(events, profile)
    const conflicts = detectSameLaneConflicts(mapped, profile, paper, layout)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].type).toBe('same-note-reset-conflict')
  })

  it('does not flag repeated notes on the same lane once far enough apart', () => {
    const events = [
      ev({ midiPitch: parseNoteName('C5').midi, startBeat: 0 }),
      ev({ midiPitch: parseNoteName('C5').midi, startBeat: 1 }), // 4 grid columns later
    ]
    const mapped = applyMechanismMapping(events, profile)
    const conflicts = detectSameLaneConflicts(mapped, profile, paper, layout)
    expect(conflicts).toHaveLength(0)
  })

  it('does not flag simultaneous notes on different lanes (a chord)', () => {
    const events = [
      ev({ midiPitch: parseNoteName('C5').midi, startBeat: 0 }),
      ev({ midiPitch: parseNoteName('E5').midi, startBeat: 0 }),
      ev({ midiPitch: parseNoteName('G5').midi, startBeat: 0 }),
    ]
    const mapped = applyMechanismMapping(events, profile)
    const conflicts = detectSameLaneConflicts(mapped, profile, paper, layout)
    expect(conflicts).toHaveLength(0)
  })

  it('uses the calibrated mm rule once the paper is calibrated and a minCenterDistanceMm is set', () => {
    const calibratedPaper = { ...paper, isCalibrated: true, timingGridSpacingMm: 2.0 }
    const strictProfile = { ...profile, minCenterDistanceMm: 10 } // needs 10mm, grid gives 2mm/column
    const events = [
      ev({ midiPitch: parseNoteName('C5').midi, startBeat: 0 }),
      ev({ midiPitch: parseNoteName('C5').midi, startBeat: 1 }), // 4 columns * 2mm = 8mm < 10mm required
    ]
    const mapped = applyMechanismMapping(events, strictProfile)
    const conflicts = detectSameLaneConflicts(mapped, strictProfile, calibratedPaper, layout)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].mmGap).toBeCloseTo(8, 5)
  })
})

describe('tempo warnings', () => {
  it('warns above the recommended hand-crank range without forbidding it', () => {
    const warn = checkTempoWarning(120, profile)
    expect(warn.aboveWarningThreshold).toBe(true)
    expect(warn.message).not.toMatch(/not allowed|forbidden|blocked/i)
  })

  it('does not warn within the recommended range', () => {
    const ok = checkTempoWarning(80, profile)
    expect(ok.aboveWarningThreshold).toBe(false)
  })
})
