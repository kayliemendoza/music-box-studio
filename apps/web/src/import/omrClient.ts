// Client for the music-box-studio OMR (Optical Music Recognition) backend service.
//
// This talks to a real Audiveris-backed service (see
// music-box-studio/services/omr-service) that performs genuine optical music
// recognition on a scanned/printed sheet-music file and returns MusicXML -- it is not a
// mock and does not fabricate results. See that service's README.md for the full API
// contract, and for licensing notes (Audiveris is AGPL-3.0-only).
//
// Configuring `serviceUrl`:
// This module takes `serviceUrl` as an explicit argument rather than reading env vars
// itself, so callers control how it's resolved. In a Vite app the conventional source is
// an env var prefixed `VITE_`, e.g.:
//
//   // .env.local (not committed)
//   VITE_OMR_SERVICE_URL=http://localhost:8000
//
//   // calling code
//   import { submitForOmr } from './import/omrClient'
//   const musicxml = await submitForOmr(file, import.meta.env.VITE_OMR_SERVICE_URL)
//
// See .env.example in this app's root for a template.

export interface OmrWarning {
  message: string
  context: string | null
}

export interface OmrResponse {
  musicxml: string
  warnings: string[]
  /** Number of sheets/pages Audiveris actually processed. */
  pages: number
  /**
   * Always true in the current service contract: OMR output is never guaranteed correct
   * and must be confirmed by a human before being treated as a final export. Surfaced
   * here so callers don't have to special-case a boolean that never varies today, but
   * also don't have to hardcode `true` themselves if the contract ever changes.
   */
  needsReview: boolean
}

export class OmrRequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'OmrRequestError'
    this.status = status
  }
}

interface RawOmrWarning {
  message?: unknown
  context?: unknown
}

interface RawOmrResponse {
  musicxml?: unknown
  warnings?: unknown
  pages?: unknown
  needsReview?: unknown
}

function normalizeWarning(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const w = raw as RawOmrWarning
    const message = typeof w.message === 'string' ? w.message : JSON.stringify(raw)
    const context = typeof w.context === 'string' && w.context.length > 0 ? w.context : null
    return context ? `[${context}] ${message}` : message
  }
  return String(raw)
}

/**
 * Submit a scanned sheet-music file (PDF/PNG/JPG) to the OMR service and return the
 * recognized MusicXML.
 *
 * @param file       The scan to recognize, as a browser File (from an <input type="file">
 *                   or drag-and-drop).
 * @param serviceUrl Base URL of the OMR service, e.g. "http://localhost:8000". No
 *                   trailing slash required; one is added if missing.
 */
export async function submitForOmr(
  file: File,
  serviceUrl: string,
): Promise<{ musicxml: string; warnings: string[] }> {
  if (!serviceUrl) {
    throw new Error('submitForOmr: serviceUrl is required (e.g. VITE_OMR_SERVICE_URL)')
  }

  const base = serviceUrl.endsWith('/') ? serviceUrl.slice(0, -1) : serviceUrl
  const endpoint = `${base}/omr`

  const formData = new FormData()
  formData.append('file', file, file.name)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new OmrRequestError(0, `Could not reach OMR service at ${endpoint}: ${reason}`)
  }

  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = typeof body?.detail === 'string' ? body.detail : JSON.stringify(body)
    } catch {
      detail = await response.text().catch(() => '')
    }
    throw new OmrRequestError(
      response.status,
      `OMR service returned ${response.status}${detail ? `: ${detail}` : ''}`,
    )
  }

  const raw = (await response.json()) as RawOmrResponse

  if (typeof raw.musicxml !== 'string' || raw.musicxml.length === 0) {
    throw new OmrRequestError(response.status, 'OMR service response had no musicxml content')
  }

  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map(normalizeWarning) : []

  return {
    musicxml: raw.musicxml,
    warnings,
  }
}

/**
 * Like `submitForOmr`, but returns the full response shape (including `pages` and
 * `needsReview`) for callers that want that detail rather than the trimmed
 * `{ musicxml, warnings }` pair.
 */
export async function submitForOmrFull(file: File, serviceUrl: string): Promise<OmrResponse> {
  const base = serviceUrl.endsWith('/') ? serviceUrl.slice(0, -1) : serviceUrl
  const endpoint = `${base}/omr`

  const formData = new FormData()
  formData.append('file', file, file.name)

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new OmrRequestError(0, `Could not reach OMR service at ${endpoint}: ${reason}`)
  }

  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = typeof body?.detail === 'string' ? body.detail : JSON.stringify(body)
    } catch {
      detail = await response.text().catch(() => '')
    }
    throw new OmrRequestError(
      response.status,
      `OMR service returned ${response.status}${detail ? `: ${detail}` : ''}`,
    )
  }

  const raw = (await response.json()) as RawOmrResponse

  if (typeof raw.musicxml !== 'string' || raw.musicxml.length === 0) {
    throw new OmrRequestError(response.status, 'OMR service response had no musicxml content')
  }

  return {
    musicxml: raw.musicxml,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(normalizeWarning) : [],
    pages: typeof raw.pages === 'number' ? raw.pages : 1,
    needsReview: raw.needsReview !== false, // default true if absent/malformed
  }
}
