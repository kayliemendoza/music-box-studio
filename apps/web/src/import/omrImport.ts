import { submitForOmrFull } from './omrClient'
import { parseMusicXmlString } from './musicxml'
import type { ImportedScore } from '../model/types'

export interface OmrImportResult {
  score: ImportedScore
  warnings: string[]
}

/**
 * Submit a scanned PDF/image to the OMR service, parse the recognized MusicXML through
 * the same parser used for direct MusicXML imports, and flag every resulting note as
 * needing manual review - Audiveris' CLI exposes no reliable per-symbol confidence, so
 * this app never claims a specific confidence number for OMR output; it always requires
 * human confirmation before export (enforced by the validation gate).
 */
export async function importFromOmr(file: File, serviceUrl: string): Promise<OmrImportResult> {
  const omr = await submitForOmrFull(file, serviceUrl)
  const { score, warnings } = parseMusicXmlString(omr.musicxml, file.name.replace(/\.[^.]+$/, ''))

  const reviewed: ImportedScore = {
    ...score,
    sourceFormat: 'omr',
    events: score.events.map((e) => ({ ...e, needsReview: omr.needsReview, importConfidence: 0.5 })),
  }

  return { score: reviewed, warnings: [...warnings, ...omr.warnings] }
}
