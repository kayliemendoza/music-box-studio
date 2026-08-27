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
  /** 'insert' = a true leading margin, sized for feeding into the mechanism. 'join' = spliced onto the previous sheet, sized for spliceClearanceMm instead. */
  leadingEdgeKind: 'insert' | 'join'
  /** 'tail' = a true ending margin, the final sheet of the song. 'join' = spliced onto the next sheet, sized for spliceClearanceMm instead. */
  trailingEdgeKind: 'join' | 'tail'
}

function placeHole(event: NoteEvent, pageNumber: number, localMm: number, paper: PaperProfile): PlacedHole {
  return {
    event,
    pageNumber,
    localMm,
    laneMm: laneToMm(event.conversion!.lane as number, paper),
    inUnusableRegion: isWithinUnusableRegion(paper, localMm),
  }
}

function finishPage(
  pageNumber: number,
  holes: PlacedHole[],
  leadingEdgeKind: StripPage['leadingEdgeKind'],
  trailingEdgeKind: StripPage['trailingEdgeKind'],
): StripPage {
  return {
    pageNumber,
    holes,
    contentLengthMm: holes.length > 0 ? holes[holes.length - 1].localMm : 0,
    leadingEdgeKind,
    trailingEdgeKind,
  }
}

/**
 * Split the converted, approved arrangement across physical sheets, sized to the
 * calibrated paper's usable length. Two modes:
 *
 * - Independent (default, paper.allowTapedJoins = false): every page starts fresh at its
 *   own full leading margin and ends at its own full ending margin - the app never
 *   assumes strips get taped together. This is the safe default from the community guide
 *   (taping can jam a 30-note mechanism if done imprecisely).
 * - Joined (paper.allowTapedJoins = true): only the very first sheet gets the real
 *   leadingMarginMm and only the very last gets the real endingMarginMm; every internal
 *   join between spliced sheets uses the much smaller spliceClearanceMm on each side
 *   instead, fitting more music per physical sheet. Opt-in, for a splicing technique
 *   (e.g. a precise zigzag cut) the user has already verified works on their mechanism.
 *
 * Either way, holes are never moved to avoid configured unusable/join regions
 * automatically; those are flagged (via `inUnusableRegion`) for the pre-export validation
 * gate, which is also what catches the rare case where content genuinely doesn't fit even
 * under the real edge margins.
 */
export function splitIntoPages(events: NoteEvent[], paper: PaperProfile, layout: StripLayoutConfig): StripPage[] {
  const playable = events
    .filter((e) => !e.isRest && e.conversion?.approved && e.conversion.mappedMidiPitch != null && e.conversion.lane != null)
    .sort((a, b) => a.startBeat - b.startBeat)

  if (playable.length === 0) return []

  return paper.allowTapedJoins ? splitIntoJoinedPages(playable, paper, layout) : splitIntoIndependentPages(playable, paper, layout)
}

function splitIntoIndependentPages(playable: NoteEvent[], paper: PaperProfile, layout: StripLayoutConfig): StripPage[] {
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
      pages.push(finishPage(pageIndex, current, 'insert', 'tail'))
      pageIndex++
      pageStartRawMm = rawMm
      current = []
    }

    const localMm = paper.leadingMarginMm + (rawMm - pageStartRawMm)
    current.push(placeHole(event, pageIndex, localMm, paper))
  }

  if (current.length > 0) pages.push(finishPage(pageIndex, current, 'insert', 'tail'))
  return pages
}

function splitIntoJoinedPages(playable: NoteEvent[], paper: PaperProfile, layout: StripLayoutConfig): StripPage[] {
  const capacity = paper.maxSheetLengthMm - paper.spliceClearanceMm
  if (capacity <= 0) {
    throw new Error('Paper profile has no usable length after the splice clearance - check calibration.')
  }

  // Pass 1: group events into pages using the permissive per-join capacity - every page
  // is assumed to possibly be followed by another until we know the real page count.
  const groups: NoteEvent[][] = []
  let pageStartRawMm = beatToTimelineMm(playable[0].startBeat, layout, paper)
  let current: NoteEvent[] = []

  for (const event of playable) {
    const rawMm = beatToTimelineMm(event.startBeat, layout, paper)
    const relative = rawMm - pageStartRawMm
    if (relative > capacity && current.length > 0) {
      groups.push(current)
      pageStartRawMm = rawMm
      current = []
    }
    current.push(event)
  }
  if (current.length > 0) groups.push(current)

  // Pass 2: now that the page count is known, assign final positions with the correct
  // edge treatment per page - only page 1's leading edge and the last page's trailing
  // edge get the real margins; everything else is a join.
  const pages: StripPage[] = groups.map((group, i) => {
    const isFirst = i === 0
    const isLast = i === groups.length - 1
    const leadingEdgeMm = isFirst ? paper.leadingMarginMm : paper.spliceClearanceMm
    const groupStartRawMm = beatToTimelineMm(group[0].startBeat, layout, paper)

    const holes = group.map((event) => {
      const rawMm = beatToTimelineMm(event.startBeat, layout, paper)
      const localMm = leadingEdgeMm + (rawMm - groupStartRawMm)
      return placeHole(event, i + 1, localMm, paper)
    })

    return finishPage(i + 1, holes, isFirst ? 'insert' : 'join', isLast ? 'tail' : 'join')
  })

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
