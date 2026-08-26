import { useRef, useState } from 'react'
import { useStudioStore } from '../state/store'
import { parseMusicXmlFile } from '../import/musicxml'
import { parseMidiFile } from '../import/midi'
import { TWINKLE_MUSICXML } from '../fixtures/twinkleTwinkle'
import { parseMusicXmlString } from '../import/musicxml'

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
        setError(
          'PDF/image import requires Optical Music Recognition. This needs the self-hosted OMR service (see README: "OMR service") running and configured via VITE_OMR_SERVICE_URL. It is not wired into this build automatically - OMR results are never guaranteed accurate and always require the verification screen before export.',
        )
      } else {
        setError(`Unsupported file type: ${file.name}. Supported: .musicxml, .xml, .mxl, .mid, .midi (PDF/image via OMR service, see README).`)
      }
    } catch (e) {
      setError((e as Error).message)
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
