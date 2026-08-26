import { describe, it, expect } from 'vitest'
import { serializeProject, deserializeProject, PROJECT_FILE_VERSION, type ProjectFile } from '../model/project'
import { buildY30H2Profile } from '../model/mechanism'
import { buildDefaultPaperProfile } from '../model/paper'
import { defaultStripLayoutConfig } from '../convert/layout'
import { buildTestArrangement } from './testHelpers'
import { newId } from '../model/types'

describe('JSON project export/reopen', () => {
  it('round-trips a full project (score + mechanism + paper + layout) through serialize/deserialize', () => {
    const { events, profile, paper, layout } = buildTestArrangement()
    const project: ProjectFile = {
      formatVersion: PROJECT_FILE_VERSION,
      savedAt: new Date().toISOString(),
      score: { id: newId('score'), title: 'Test Song', events, parts: [], measureCount: 2, sourceFormat: 'manual' },
      mechanismProfile: profile,
      paperProfile: paper,
      layoutConfig: layout,
      voiceSelectionMode: 'melody-only',
      selectedTranspositionSemitones: 0,
      acceptedConflictIds: [],
    }

    const json = serializeProject(project)
    const reopened = deserializeProject(json)

    expect(reopened.score.title).toBe('Test Song')
    expect(reopened.score.events).toHaveLength(events.length)
    expect(reopened.mechanismProfile.lanes).toHaveLength(30)
    expect(reopened.paperProfile.holeDiameterMm).toBe(paper.holeDiameterMm)
    expect(reopened.score.events[0].midiPitch).toBe(events[0].midiPitch)
    expect(reopened.score.events[0].conversion?.lane).toBe(events[0].conversion?.lane)
  })

  it('rejects a project file with an unsupported format version', () => {
    const bogus = JSON.stringify({ formatVersion: 999 })
    expect(() => deserializeProject(bogus)).toThrow(/version/i)
  })
})
