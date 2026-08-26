import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { parseMusicXmlString, parseMusicXmlFile } from './musicxml'
import { TWINKLE_MUSICXML } from '../fixtures/twinkleTwinkle'
import { parseNoteName } from '../music/pitch'

describe('MusicXML import', () => {
  it('parses title, composer, tempo, time signature, and measure count', () => {
    const { score, warnings } = parseMusicXmlString(TWINKLE_MUSICXML)
    expect(score.title).toContain('Twinkle')
    expect(score.composer).toContain('Traditional')
    expect(score.measureCount).toBe(4)
    expect(warnings).toHaveLength(0)
    const pitched = score.events.filter((e) => !e.isRest)
    expect(pitched[0].tempoBpm).toBe(100)
    expect(pitched[0].timeSignature).toBe('4/4')
  })

  it('extracts the correct sequence of pitches and durations', () => {
    const { score } = parseMusicXmlString(TWINKLE_MUSICXML)
    const pitched = score.events.filter((e) => !e.isRest).sort((a, b) => a.startBeat - b.startBeat)
    const names = pitched.map((e) => e.writtenName)
    expect(names).toEqual(['C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4'])
    expect(pitched[0].midiPitch).toBe(parseNoteName('C4').midi)
    // The half note (G4 in measure 2) should have duration 2 beats.
    const halfNote = pitched.find((e) => e.sourceMeasure === 2 && e.durationBeats === 2)
    expect(halfNote).toBeDefined()
  })

  it('places measure 2 notes starting at absolute beat 4 (after one 4/4 measure)', () => {
    const { score } = parseMusicXmlString(TWINKLE_MUSICXML)
    const firstOfMeasure2 = score.events.find((e) => e.sourceMeasure === 2 && !e.isRest)
    expect(firstOfMeasure2?.startBeat).toBe(4)
  })

  it('rejects score-timewise documents with a clear error', () => {
    const timewise = TWINKLE_MUSICXML.replace(/score-partwise/g, 'score-timewise')
    expect(() => parseMusicXmlString(timewise)).toThrow(/score-timewise/i)
  })

  it('detects simultaneous chord notes sharing a staff/voice/beat', () => {
    const chordXml = TWINKLE_MUSICXML.replace(
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>\n      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>',
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>\n      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>',
    )
    const { score } = parseMusicXmlString(chordXml)
    const chordNotes = score.events.filter((e) => e.isChordMember)
    expect(chordNotes.length).toBe(2)
    expect(chordNotes[0].chordId).toBe(chordNotes[1].chordId)
  })

  it('reads a compressed .mxl archive via container.xml', async () => {
    const zip = new JSZip()
    zip.file('META-INF/container.xml', `<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>`)
    zip.file('score.musicxml', TWINKLE_MUSICXML)
    const blob = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([blob], 'test.mxl')
    const { score } = await parseMusicXmlFile(file)
    expect(score.title).toContain('Twinkle')
    expect(score.events.filter((e) => !e.isRest).length).toBe(14)
  })
})
