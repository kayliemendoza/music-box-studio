import type { ImportedScore } from './types'
import type { MechanismProfile } from './mechanism'
import type { PaperProfile } from './paper'
import type { StripLayoutConfig } from '../convert/layout'

export const PROJECT_FILE_VERSION = 1

/** Full round-trippable project state: everything needed to reopen and keep editing. */
export interface ProjectFile {
  formatVersion: number
  savedAt: string
  score: ImportedScore
  mechanismProfile: MechanismProfile
  paperProfile: PaperProfile
  layoutConfig: StripLayoutConfig
  voiceSelectionMode: string
  selectedTranspositionSemitones: number
  acceptedConflictIds: string[]
}

export function serializeProject(project: ProjectFile): string {
  return JSON.stringify(project, null, 2)
}

export function deserializeProject(json: string): ProjectFile {
  const parsed = JSON.parse(json) as ProjectFile
  if (parsed.formatVersion !== PROJECT_FILE_VERSION) {
    throw new Error(`Unsupported project file version ${parsed.formatVersion}; expected ${PROJECT_FILE_VERSION}.`)
  }
  return parsed
}
