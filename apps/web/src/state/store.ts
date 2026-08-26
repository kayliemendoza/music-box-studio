import { create } from 'zustand'
import type { ImportedScore, NoteEvent } from '../model/types'
import type { MechanismProfile } from '../model/mechanism'
import { buildY30H2Profile } from '../model/mechanism'
import type { PaperProfile } from '../model/paper'
import { buildDefaultPaperProfile } from '../model/paper'
import type { StripLayoutConfig } from '../convert/layout'
import { defaultStripLayoutConfig } from '../convert/layout'
import { applyMechanismMapping } from '../convert/playability'
import { selectVoices, type VoiceSelectionMode } from '../convert/voiceSelection'
import { validateForExport, type ValidationResult } from '../convert/validation'

interface ManualOverride {
  mappedMidiPitch: number | null
  lane: number | null
  approved: boolean
  deleted: boolean
}

interface HistoryEntry {
  manualOverrides: Record<string, ManualOverride>
  manualEvents: NoteEvent[]
}

export interface StudioState {
  score: ImportedScore | null
  importWarnings: string[]

  mechanismProfile: MechanismProfile
  paperProfile: PaperProfile
  layoutConfig: StripLayoutConfig

  voiceSelectionMode: VoiceSelectionMode
  customVoiceKeys: string[]
  transpositionSemitones: number
  showPrintedLabels: boolean

  // User edits that survive recomputation (approve/reject/manual pitch/delete), keyed by event id.
  manualOverrides: Record<string, ManualOverride>
  // Notes added directly in the strip editor (manual entry), independent of the imported score.
  manualEvents: NoteEvent[]

  acceptedConflictKeys: string[]
  selectedEventIds: string[]

  history: HistoryEntry[]
  future: HistoryEntry[]

  // Derived (recomputed after every relevant mutation)
  mappedEvents: NoteEvent[]
  validation: ValidationResult | null

  loadScore: (score: ImportedScore, warnings: string[]) => void
  setMechanismProfile: (p: MechanismProfile) => void
  setPaperProfile: (p: PaperProfile) => void
  updateLayoutConfig: (patch: Partial<StripLayoutConfig>) => void
  setVoiceSelectionMode: (mode: VoiceSelectionMode, customKeys?: string[]) => void
  setTransposition: (semitones: number) => void
  setShowPrintedLabels: (v: boolean) => void

  approveEvent: (eventId: string) => void
  rejectEvent: (eventId: string) => void
  setManualPitch: (eventId: string, midi: number) => void
  deleteEvent: (eventId: string) => void
  restoreEvent: (eventId: string) => void
  moveEvent: (eventId: string, newStartBeat: number) => void
  addManualEvent: (partial: Pick<NoteEvent, 'midiPitch' | 'startBeat' | 'durationBeats'>) => void
  /** Insert (deltaBeats > 0) or remove (deltaBeats < 0) time at thresholdBeat, shifting everything at/after it. Used for measure insertion/removal and timeline stretch repairs. */
  shiftFromBeat: (thresholdBeat: number, deltaBeats: number) => void
  confirmOmrReview: (eventId: string) => void
  confirmAllOmrReviews: () => void

  acceptConflict: (key: string) => void
  unacceptConflict: (key: string) => void

  selectEvents: (ids: string[]) => void
  toggleSelectEvent: (id: string) => void
  clearSelection: () => void

  pushHistory: () => void
  undo: () => void
  redo: () => void

  recompute: () => void
}

function cloneEvent(e: NoteEvent): NoteEvent {
  return { ...e, conversion: e.conversion ? { ...e.conversion } : undefined }
}

export const useStudioStore = create<StudioState>((set, get) => ({
  score: null,
  importWarnings: [],

  mechanismProfile: buildY30H2Profile(),
  paperProfile: buildDefaultPaperProfile(),
  layoutConfig: defaultStripLayoutConfig(),

  voiceSelectionMode: 'melody-only',
  customVoiceKeys: [],
  transpositionSemitones: 0,
  showPrintedLabels: false,

  manualOverrides: {},
  manualEvents: [],

  acceptedConflictKeys: [],
  selectedEventIds: [],

  history: [],
  future: [],

  mappedEvents: [],
  validation: null,

  loadScore: (score, warnings) => {
    set({ score, importWarnings: warnings, manualOverrides: {}, manualEvents: [], acceptedConflictKeys: [], selectedEventIds: [], history: [], future: [] })
    get().recompute()
  },

  setMechanismProfile: (p) => {
    set({ mechanismProfile: p, manualOverrides: {} })
    get().recompute()
  },

  setPaperProfile: (p) => {
    set({ paperProfile: p })
    get().recompute()
  },

  updateLayoutConfig: (patch) => {
    set((s) => ({ layoutConfig: { ...s.layoutConfig, ...patch } }))
    get().recompute()
  },

  setVoiceSelectionMode: (mode, customKeys) => {
    set({ voiceSelectionMode: mode, customVoiceKeys: customKeys ?? get().customVoiceKeys })
    get().recompute()
  },

  setTransposition: (semitones) => {
    set({ transpositionSemitones: semitones, manualOverrides: {} })
    get().recompute()
  },

  setShowPrintedLabels: (v) => set({ showPrintedLabels: v }),

  approveEvent: (eventId) => {
    get().pushHistory()
    const current = get().mappedEvents.find((e) => e.id === eventId)
    if (!current?.conversion) return
    set((s) => ({
      manualOverrides: {
        ...s.manualOverrides,
        [eventId]: { mappedMidiPitch: current.conversion!.mappedMidiPitch, lane: current.conversion!.lane, approved: true, deleted: false },
      },
    }))
    get().recompute()
  },

  rejectEvent: (eventId) => {
    get().pushHistory()
    set((s) => ({
      manualOverrides: { ...s.manualOverrides, [eventId]: { mappedMidiPitch: null, lane: null, approved: false, deleted: false } },
    }))
    get().recompute()
  },

  setManualPitch: (eventId, midi) => {
    get().pushHistory()
    const lane = get().mechanismProfile.lanes.find((l) => l.soundingMidiPitch === midi)?.lane ?? null
    set((s) => ({
      manualOverrides: { ...s.manualOverrides, [eventId]: { mappedMidiPitch: midi, lane, approved: true, deleted: false } },
    }))
    get().recompute()
  },

  deleteEvent: (eventId) => {
    get().pushHistory()
    set((s) => ({
      manualOverrides: { ...s.manualOverrides, [eventId]: { mappedMidiPitch: null, lane: null, approved: false, deleted: true } },
    }))
    get().recompute()
  },

  restoreEvent: (eventId) => {
    get().pushHistory()
    set((s) => {
      const next = { ...s.manualOverrides }
      delete next[eventId]
      return { manualOverrides: next }
    })
    get().recompute()
  },

  moveEvent: (eventId, newStartBeat) => {
    get().pushHistory()
    set((s) => ({
      manualEvents: s.manualEvents.map((e) => (e.id === eventId ? { ...e, startBeat: newStartBeat } : e)),
      score: s.score
        ? { ...s.score, events: s.score.events.map((e) => (e.id === eventId ? { ...e, startBeat: newStartBeat } : e)) }
        : s.score,
    }))
    get().recompute()
  },

  addManualEvent: (partial) => {
    get().pushHistory()
    const profile = get().mechanismProfile
    const lane = profile.lanes.find((l) => l.soundingMidiPitch === partial.midiPitch)?.lane ?? null
    const id = `manual_${Math.random().toString(36).slice(2, 10)}`
    const newEvent: NoteEvent = {
      id,
      sourcePage: 1, sourceStaff: 1, sourceVoice: 1, sourceMeasure: 1, sourceBeat: 1,
      midiPitch: partial.midiPitch,
      writtenName: '',
      enharmonicSharp: '', enharmonicFlat: '',
      startBeat: partial.startBeat,
      durationBeats: partial.durationBeats,
      tempoBpm: 100,
      timeSignature: '4/4',
      isChordMember: false,
      isRest: false,
      importConfidence: 1,
      needsReview: false,
      status: 'original',
      conversion: { reason: 'exact-match', mappedMidiPitch: partial.midiPitch, lane, approved: lane != null },
    }
    set((s) => ({ manualEvents: [...s.manualEvents, newEvent] }))
    get().recompute()
  },

  shiftFromBeat: (thresholdBeat, deltaBeats) => {
    get().pushHistory()
    set((s) => ({
      score: s.score
        ? { ...s.score, events: s.score.events.map((e) => (e.startBeat >= thresholdBeat ? { ...e, startBeat: e.startBeat + deltaBeats } : e)) }
        : s.score,
      manualEvents: s.manualEvents.map((e) => (e.startBeat >= thresholdBeat ? { ...e, startBeat: e.startBeat + deltaBeats } : e)),
    }))
    get().recompute()
  },

  confirmOmrReview: (eventId) => {
    set((s) => ({
      score: s.score ? { ...s.score, events: s.score.events.map((e) => (e.id === eventId ? { ...e, needsReview: false } : e)) } : s.score,
    }))
    get().recompute()
  },
  confirmAllOmrReviews: () => {
    set((s) => ({
      score: s.score ? { ...s.score, events: s.score.events.map((e) => ({ ...e, needsReview: false })) } : s.score,
    }))
    get().recompute()
  },

  acceptConflict: (key) => set((s) => ({ acceptedConflictKeys: [...new Set([...s.acceptedConflictKeys, key])] })),
  unacceptConflict: (key) => set((s) => ({ acceptedConflictKeys: s.acceptedConflictKeys.filter((k) => k !== key) })),

  selectEvents: (ids) => set({ selectedEventIds: ids }),
  toggleSelectEvent: (id) =>
    set((s) => ({
      selectedEventIds: s.selectedEventIds.includes(id) ? s.selectedEventIds.filter((x) => x !== id) : [...s.selectedEventIds, id],
    })),
  clearSelection: () => set({ selectedEventIds: [] }),

  pushHistory: () => {
    const s = get()
    set({
      history: [...s.history, { manualOverrides: s.manualOverrides, manualEvents: s.manualEvents }].slice(-50),
      future: [],
    })
  },
  undo: () => {
    const s = get()
    if (s.history.length === 0) return
    const prev = s.history[s.history.length - 1]
    set({
      manualOverrides: prev.manualOverrides,
      manualEvents: prev.manualEvents,
      history: s.history.slice(0, -1),
      future: [{ manualOverrides: s.manualOverrides, manualEvents: s.manualEvents }, ...s.future],
    })
    get().recompute()
  },
  redo: () => {
    const s = get()
    if (s.future.length === 0) return
    const next = s.future[0]
    set({
      manualOverrides: next.manualOverrides,
      manualEvents: next.manualEvents,
      history: [...s.history, { manualOverrides: s.manualOverrides, manualEvents: s.manualEvents }],
      future: s.future.slice(1),
    })
    get().recompute()
  },

  recompute: () => {
    const s = get()
    const baseEvents = s.score ? s.score.events : []
    const voiceFiltered = selectVoices(baseEvents, s.voiceSelectionMode, new Set(s.customVoiceKeys))
    const transposed = [...voiceFiltered, ...s.manualEvents].map((e) =>
      e.isRest || s.manualEvents.includes(e) ? e : { ...e, midiPitch: e.midiPitch + s.transpositionSemitones },
    )
    const mapped = applyMechanismMapping(transposed, s.mechanismProfile).map((e) => {
      const override = s.manualOverrides[e.id]
      if (!override) return e
      if (override.deleted) return { ...e, status: 'removed' as const, conversion: e.conversion ? { ...e.conversion, mappedMidiPitch: null, lane: null, approved: false } : e.conversion }
      return {
        ...e,
        status: override.approved ? ('changed' as const) : e.status,
        conversion: e.conversion
          ? { ...e.conversion, mappedMidiPitch: override.mappedMidiPitch, lane: override.lane, approved: override.approved }
          : e.conversion,
      }
    })

    const validation = validateForExport(mapped, s.mechanismProfile, s.paperProfile, s.layoutConfig, new Set(s.acceptedConflictKeys))
    set({ mappedEvents: mapped, validation })
  },
}))

export function cloneEventList(events: NoteEvent[]): NoteEvent[] {
  return events.map(cloneEvent)
}
