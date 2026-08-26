import { describe, it, expect, vi, afterEach } from 'vitest'
import { importFromOmr } from './omrImport'
import { TWINKLE_MUSICXML } from '../fixtures/twinkleTwinkle'
import { validateForExport } from '../convert/validation'
import { buildY30H2Profile } from '../model/mechanism'
import { buildDefaultPaperProfile } from '../model/paper'
import { defaultStripLayoutConfig } from '../convert/layout'
import { applyMechanismMapping } from '../convert/playability'

describe('OMR import (client + verification requirement)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('flags every recognized note as needing review and never claims a confidence guarantee', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ musicxml: TWINKLE_MUSICXML, warnings: ['low contrast on page 1'], pages: 1, needsReview: true }),
      })),
    )

    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'scan.pdf', { type: 'application/pdf' })
    const { score, warnings } = await importFromOmr(file, 'http://localhost:8000')

    expect(score.sourceFormat).toBe('omr')
    expect(score.events.filter((e) => !e.isRest).every((e) => e.needsReview)).toBe(true)
    expect(warnings.some((w) => w.includes('low contrast'))).toBe(true)
  })

  it('blocks export until OMR-flagged notes are confirmed, matching the pre-export validation gate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ musicxml: TWINKLE_MUSICXML, warnings: [], pages: 1, needsReview: true }),
      })),
    )
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'scan.pdf')
    const { score } = await importFromOmr(file, 'http://localhost:8000')

    const profile = buildY30H2Profile()
    const paper = { ...buildDefaultPaperProfile(), isCalibrated: true }
    const layout = defaultStripLayoutConfig()
    const mapped = applyMechanismMapping(score.events, profile)

    const blocked = validateForExport(mapped, profile, paper, layout, new Set())
    expect(blocked.canExport).toBe(false)
    expect(blocked.issues.some((i) => i.code === 'omr-unconfirmed')).toBe(true)

    const confirmed = mapped.map((e) => ({ ...e, needsReview: false, conversion: e.conversion ? { ...e.conversion, approved: true } : e.conversion }))
    const unblocked = validateForExport(confirmed, profile, paper, layout, new Set())
    expect(unblocked.issues.some((i) => i.code === 'omr-unconfirmed')).toBe(false)
  })
})
