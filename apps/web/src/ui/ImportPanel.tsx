import { useRef, useState } from 'react'
import { useStudioStore } from '../state/store'
import { parseMusicXmlFile } from '../import/musicxml'
import { parseMidiFile } from '../import/midi'
import { importFromOmr } from '../import/omrImport'
import { OmrRequestError } from '../import/omrClient'
import { TWINKLE_MUSICXML } from '../fixtures/twinkleTwinkle'
import { parseMusicXmlString } from '../import/musicxml'

const OMR_SERVICE_URL = (import.meta.env.VITE_OMR_SERVICE_URL as string | undefined) ?? ''

export function ImportPanel() {
  const loadScore = useStudioStore((s) => s.loadScore)
  const score = useStudioStore((s) => s.score)
  const importWarnings = useStudioStore((s) => s.importWarnings)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setError(null)
    setBusy(true)
    try {
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.musicxml') || lower.endsWith('.xml') || lower.endsWith('.mxl')) {
        const { score, warnings } = await parseMusicXmlFile(file)
        loadScore(score, warnings)
      } else if (lower.endsWith('.mid') || lower.endsWith('.midi')) {
        const { score, warnings } = await parseMidiFile(file)
        loadScore(score, warnings)
      } else if (lower.endsWith('.pdf') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        if (!OMR_SERVICE_URL) {
          setError(
            'PDF/image import requires Optical Music Recognition, which needs the self-hosted OMR service (see music-box-studio/services/omr-service/README.md) running and configured via VITE_OMR_SERVICE_URL. OMR results are never guaranteed accurate and always require the verification screen (Review tab) before export.',
          )
        } else {
          const { score, warnings } = await importFromOmr(file, OMR_SERVICE_URL)
          loadScore(score, [
            'This score came from Optical Music Recognition - it may contain mistakes. Every note is flagged for review; confirm each one against your original scan on the Review tab before exporting.',
            ...warnings,
          ])
        }
      } else {
        setError(`Unsupported file type: ${file.name}. Supported: .musicxml, .xml, .mxl, .mid, .midi (PDF/image via OMR service, see README).`)
      }
    } catch (e) {
      if (e instanceof OmrRequestError) {
        setError(`OMR service error: ${e.message}`)
      } else {
        setError((e as Error).message)
      }
    } finally {
      setBusy(false)
    }
  }

  function loadSample() {
    const { score, warnings } = parseMusicXmlString(TWINKLE_MUSICXML)
    loadScore(score, warnings)
  }

  return (
    <div className="panel">
      <h2>1. Import sheet music</h2>
      <p className="muted">
        MusicXML (.musicxml/.xml/.mxl) and MIDI (.mid/.midi) are parsed directly in your browser - nothing is uploaded
        anywhere. PDF/image scans go through a separate Optical Music Recognition service and always require manual
        verification before export.
      </p>
      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Parsing...' : 'Click or drop a .musicxml / .mxl / .mid / .pdf / image file here'}
        <input
          ref={inputRef}
          type="file"
          accept=".musicxml,.xml,.mxl,.mid,.midi,.pdf,.png,.jpg,.jpeg"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
        />
      </div>
      <button type="button" onClick={loadSample} className="secondary">
        Load built-in test melody (Twinkle, Twinkle, Little Star - public domain)
      </button>

      {error && <div className="error-box">{error}</div>}

      {score && (
        <div className="import-summary">
          <strong>Loaded:</strong> {score.title} - {score.events.filter((e) => !e.isRest).length} notes,{' '}
          {score.measureCount} measures, source: {score.sourceFormat}
          {importWarnings.length > 0 && (
            <ul className="warnings">
              {importWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
