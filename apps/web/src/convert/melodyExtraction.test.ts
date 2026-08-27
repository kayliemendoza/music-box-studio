import { describe, it, expect } from 'vitest'
import { extractTopLineMelody } from './melodyExtraction'
import { ev } from '../export/testHelpers'
import { parseNoteName } from '../music/pitch'

describe('top-line melody extraction', () => {
  it('keeps only the highest note of each simultaneous chord', () => {
    const events = [
      ev({ id: 'a', midiPitch: parseNoteName('C4').midi, startBeat: 0, sourceStaff: 1, sourceVoice: 1 }),
      ev({ id: 'b', midiPitch: parseNoteName('E4').midi, startBeat: 0, sourceStaff: 1, sourceVoice: 1 }),
      ev({ id: 'c', midiPitch: parseNoteName('G4').midi, startBeat: 0, sourceStaff: 1, sourceVoice: 1 }),
    ]
    const result = extractTopLineMelody(events)
    expect(result).toHaveLength(1)
    expect(result[0].midiPitch).toBe(parseNoteName('G4').midi)
    expect(result[0].isChordMember).toBe(false)
  })

  it('leaves single (non-chord) notes and rests untouched', () => {
    const events = [
      ev({ id: 'a', midiPitch: parseNoteName('C4').midi, startBeat: 0 }),
      ev({ id: 'b', isRest: true, startBeat: 1 }),
      ev({ id: 'c', midiPitch: parseNoteName('D4').midi, startBeat: 2 }),
    ]
    const result = extractTopLineMelody(events)
    expect(result.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('treats different staves/voices at the same beat as independent (does not cross-merge left and right hand)', () => {
    const events = [
      ev({ id: 'rh', midiPitch: parseNoteName('C5').midi, startBeat: 0, sourceStaff: 1, sourceVoice: 1 }),
      ev({ id: 'lh', midiPitch: parseNoteName('C3').midi, startBeat: 0, sourceStaff: 2, sourceVoice: 1 }),
    ]
    const result = extractTopLineMelody(events)
    expect(result).toHaveLength(2)
  })

  it('reduces a dense multi-beat chordal part to one note per beat', () => {
    const events = [0, 1, 2].flatMap((beat) => [
      ev({ id: `${beat}-low`, midiPitch: parseNoteName('C4').midi, startBeat: beat, sourceStaff: 1, sourceVoice: 1 }),
      ev({ id: `${beat}-mid`, midiPitch: parseNoteName('E4').midi, startBeat: beat, sourceStaff: 1, sourceVoice: 1 }),
      ev({ id: `${beat}-high`, midiPitch: parseNoteName('G4').midi, startBeat: beat, sourceStaff: 1, sourceVoice: 1 }),
    ])
    const result = extractTopLineMelody(events)
    expect(result).toHaveLength(3)
    expect(result.every((e) => e.midiPitch === parseNoteName('G4').midi)).toBe(true)
  })
})
