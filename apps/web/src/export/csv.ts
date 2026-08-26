import type { NoteEvent } from '../model/types'
import type { PaperProfile } from '../model/paper'
import type { StripLayoutConfig } from '../convert/layout'
import { beatToMm, laneToMm } from '../convert/layout'

export interface CsvRow {
  measure: number
  beat: number
  originalPitch: string
  convertedPitch: string
  lane: number | ''
  positionMm: number | ''
  laneMm: number | ''
  reason: string
  playabilityStatus: string
  omrConfidence: number
}

function playabilityStatus(ev: NoteEvent): string {
  if (ev.isRest) return 'rest'
  if (!ev.conversion) return 'unmapped'
  if (ev.conversion.mappedMidiPitch === null) return 'unresolved'
  if (!ev.conversion.approved) return 'pending-approval'
  return 'playable'
}

export function buildCsvRows(events: NoteEvent[], paper: PaperProfile, layout: StripLayoutConfig): CsvRow[] {
  return events
    .filter((e) => !e.isRest)
    .sort((a, b) => a.startBeat - b.startBeat)
    .map((ev) => {
      const lane = ev.conversion?.lane ?? ''
      return {
        measure: ev.sourceMeasure,
        beat: Math.round(ev.sourceBeat * 1000) / 1000,
        originalPitch: ev.writtenName,
        convertedPitch:
          ev.conversion?.mappedMidiPitch != null
            ? // Display name from lane's sounding note when available is done by caller; keep raw MIDI-derived here.
              String(ev.conversion.mappedMidiPitch)
            : '(unresolved)',
        lane,
        positionMm: lane !== '' ? Math.round(beatToMm(ev.startBeat, layout, paper) * 100) / 100 : '',
        laneMm: lane !== '' ? Math.round(laneToMm(lane as number, paper) * 100) / 100 : '',
        reason: ev.conversion?.reason ?? 'n/a',
        playabilityStatus: playabilityStatus(ev),
        omrConfidence: ev.importConfidence,
      }
    })
}

export function rowsToCsvString(rows: CsvRow[]): string {
  const headers = [
    'Measure', 'Beat', 'Original Pitch', 'Converted Pitch (MIDI)', 'Lane', 'Horizontal Position (mm)',
    'Lane Center (mm)', 'Conversion Reason', 'Playability Status', 'Import Confidence',
  ]
  const lines = [headers.join(',')]
  for (const r of rows) {
    lines.push(
      [r.measure, r.beat, csvEscape(r.originalPitch), csvEscape(r.convertedPitch), r.lane, r.positionMm, r.laneMm, csvEscape(r.reason), csvEscape(r.playabilityStatus), r.omrConfidence].join(','),
    )
  }
  return lines.join('\n')
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function exportCsv(events: NoteEvent[], paper: PaperProfile, layout: StripLayoutConfig): string {
  return rowsToCsvString(buildCsvRows(events, paper, layout))
}
