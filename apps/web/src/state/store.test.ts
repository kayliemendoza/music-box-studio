import { describe, it, expect, beforeEach } from 'vitest'
import { useStudioStore } from './store'
import { parseMusicXmlString } from '../import/musicxml'
import { TWINKLE_MUSICXML } from '../fixtures/twinkleTwinkle'

describe('studio store integration', () => {
  beforeEach(() => {
    useStudioStore.setState(useStudioStore.getInitialState())
  })

  it('loads a MusicXML score and produces mapped, exact-match events end to end', () => {
    const { score, warnings } = parseMusicXmlString(TWINKLE_MUSICXML)
    useStudioStore.getState().loadScore(score, warnings)
    const state = useStudioStore.getState()
    expect(state.mappedEvents.length).toBeGreaterThan(0)
    expect(state.mappedEvents.every((e) => e.conversion?.reason === 'exact-match')).toBe(true)
    expect(state.validation?.summary.originalNoteCount).toBe(14)
  })

  it('approving a manual override persists across a recompute triggered by voice mode change', () => {
    const { score, warnings } = parseMusicXmlString(TWINKLE_MUSICXML)
    const store = useStudioStore.getState()
    store.loadScore(score, warnings)
    const firstId = useStudioStore.getState().mappedEvents[0].id
    store.setManualPitch(firstId, 72) // C5, still exact-match-capable
    expect(useStudioStore.getState().manualOverrides[firstId]).toBeDefined()
    store.setVoiceSelectionMode('melody-only')
    expect(useStudioStore.getState().manualOverrides[firstId]).toBeDefined()
  })

  it('deleting an event removes it from the playable set without deleting it from history', () => {
    const { score, warnings } = parseMusicXmlString(TWINKLE_MUSICXML)
    const store = useStudioStore.getState()
    store.loadScore(score, warnings)
    const id = useStudioStore.getState().mappedEvents[0].id
    store.deleteEvent(id)
    const after = useStudioStore.getState().mappedEvents.find((e) => e.id === id)
    expect(after?.status).toBe('removed')
    expect(after?.conversion?.approved).toBe(false)
  })

  it('undo restores the previous manual-override state', () => {
    const { score, warnings } = parseMusicXmlString(TWINKLE_MUSICXML)
    const store = useStudioStore.getState()
    store.loadScore(score, warnings)
    const id = useStudioStore.getState().mappedEvents[0].id
    store.deleteEvent(id)
    expect(useStudioStore.getState().manualOverrides[id]?.deleted).toBe(true)
    store.undo()
    expect(useStudioStore.getState().manualOverrides[id]).toBeUndefined()
  })

  it('clearing mechanism-profile-dependent overrides on profile swap keeps mappedEvents consistent', () => {
    const { score, warnings } = parseMusicXmlString(TWINKLE_MUSICXML)
    const store = useStudioStore.getState()
    store.loadScore(score, warnings)
    store.setTransposition(3)
    const state = useStudioStore.getState()
    expect(state.mappedEvents.every((e) => e.isRest || e.midiPitch === score.events.find((se) => se.id === e.id)!.midiPitch + 3)).toBe(true)
  })

  it('melodyTopLine toggle collapses simultaneous chords in mappedEvents down to one note per beat', () => {
    const chordXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`
    const { score, warnings } = parseMusicXmlString(chordXml)
    const store = useStudioStore.getState()
    store.loadScore(score, warnings)

    const withoutReduction = useStudioStore.getState().mappedEvents.filter((e) => !e.isRest)
    expect(withoutReduction).toHaveLength(3)

    store.setMelodyTopLine(true)
    const withReduction = useStudioStore.getState().mappedEvents.filter((e) => !e.isRest)
    expect(withReduction).toHaveLength(1)
    expect(withReduction[0].midiPitch).toBe(score.events.find((e) => e.writtenName === 'G4')!.midiPitch)
  })
})
