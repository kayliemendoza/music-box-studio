import type { NoteEvent } from '../model/types'
import type { PaperProfile } from '../model/paper'
import { usablePlayLengthMm, isWithinUnusableRegion } from '../model/paper'
import type { StripLayoutConfig } from '../convert/layout'
import { beatToTimelineMm, laneToMm } from '../convert/layout'

export interface PlacedHole {
  event: NoteEvent
  pageNumber: number
  localMm: number // horizontal distance from this page's leading edge (0 = start of paper)
  laneMm: number
  inUnusableRegion: boolean
}

export interface StripPage {
  pageNumber: number
  holes: PlacedHole[]
  contentLengthMm: number
}

/**
 * Split the converted, approved arrangement across physical sheets, sized to the
 * calibrated paper's usable length. Each page starts fresh at its own leading margin -
 * the app never assumes strips get taped together. Holes are not moved to avoid
 * configured unusable/join regions automatically; those are flagged for the user
 * (via `inUnusableRegion`) as part of the pre-export validation gate.
 */
export function splitIntoPages(
  events: NoteEvent[],
  paper: PaperProfile,
  layout: StripLayoutConfig,
): StripPage[] {
  const playable = events
    .filter((e) => !e.isRest && e.conversion?.approved && e.conversion.mappedMidiPitch != null && e.conversion.lane != null)
    .sort((a, b) => a.startBeat - b.startBeat)

  if (playable.length === 0) return []

  const usable = usablePlayLengthMm(paper)
  if (usable <= 0) {
    throw new Error('Paper profile has no usable play length after leading/ending margins - check calibration.')
  }

  const pages: StripPage[] = []
  let pageStartRawMm = beatToTimelineMm(playable[0].startBeat, layout, paper)
  let pageIndex = 1
  let current: PlacedHole[] = []

  for (const event of playable) {
    const rawMm = beatToTimelineMm(event.startBeat, layout, paper)
    const relative = rawMm - pageStartRawMm

    if (relative > usable && current.length > 0) {
      pages.push({ pageNumber: pageIndex, holes: current, contentLengthMm: current[current.length - 1].localMm })
      pageIndex++
      pageStartRawMm = rawMm
      current = []
    }

    const localMm = paper.leadingMarginMm + (rawMm - pageStartRawMm)
    current.push({
      event,
      pageNumber: pageIndex,
      localMm,
      laneMm: laneToMm(event.conversion!.lane as number, paper),
      inUnusableRegion: isWithinUnusableRegion(paper, localMm),
    })
  }

  if (current.length > 0) {
    pages.push({ pageNumber: pageIndex, holes: current, contentLengthMm: current[current.length - 1].localMm })
  }

  return pages
}

export function totalPlayingTimeSeconds(events: NoteEvent[]): number {
  const playable = events.filter((e) => !e.isRest && e.conversion?.approved && e.conversion.mappedMidiPitch != null)
  if (playable.length === 0) return 0
  let maxEndBeat = 0
  let bpm = playable[0].tempoBpm
  for (const ev of playable) {
    maxEndBeat = Math.max(maxEndBeat, ev.startBeat + ev.durationBeats)
    bpm = ev.tempoBpm
  }
  return (maxEndBeat / bpm) * 60
}
