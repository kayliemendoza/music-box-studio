import { useState } from 'react'
import { useStudioStore } from '../state/store'
import { splitIntoPages } from '../export/pageSplit'
import { generateStripSvg } from '../export/svgExport'
import { generateStripDxf } from '../export/dxfExport'
import { generateStripPdf, type PdfPageFormat } from '../export/pdfExport'
import { exportCsv } from '../export/csv'
import { exportConvertedMidi } from '../export/midiExport'
import { exportConvertedMusicXml } from '../export/musicxmlExport'
import { serializeProject, PROJECT_FILE_VERSION, type ProjectFile } from '../model/project'
import { downloadBlob, downloadText } from '../export/download'

export function ExportPanel() {
  const score = useStudioStore((s) => s.score)
  const events = useStudioStore((s) => s.mappedEvents)
  const profile = useStudioStore((s) => s.mechanismProfile)
  const paper = useStudioStore((s) => s.paperProfile)
  const layout = useStudioStore((s) => s.layoutConfig)
  const validation = useStudioStore((s) => s.validation)
  const voiceSelectionMode = useStudioStore((s) => s.voiceSelectionMode)
  const transpositionSemitones = useStudioStore((s) => s.transpositionSemitones)
  const acceptedConflictKeys = useStudioStore((s) => s.acceptedConflictKeys)

  const [includeOutlineCut, setIncludeOutlineCut] = useState(false)
  const [pdfFormat, setPdfFormat] = useState<PdfPageFormat>('letter')

  const canExport = validation?.canExport ?? false
  const pages = canExport ? splitIntoPages(events, paper, layout) : []

  function exportAllSvg() {
    pages.forEach((page) => {
      const svg = generateStripSvg(page, pages.length, profile, paper, { includeOutlineCut, showPrintedLabels: false })
      downloadText(svg, `strip-${page.pageNumber}-of-${pages.length}.svg`, 'image/svg+xml')
    })
  }

  function exportAllDxf() {
    pages.forEach((page) => {
      const dxf = generateStripDxf(page, pages.length, profile, paper, { includeOutlineCut })
      downloadText(dxf, `strip-${page.pageNumber}-of-${pages.length}.dxf`, 'application/dxf')
    })
  }

  async function exportAllPdf() {
    for (const page of pages) {
      const bytes = await generateStripPdf(page, pages.length, profile, paper, pdfFormat, { includeOutlineCut })
      downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }), `strip-${page.pageNumber}-of-${pages.length}.pdf`)
    }
  }

  function exportCsvFile() {
    downloadText(exportCsv(events, paper, layout), 'music-box-holes.csv', 'text/csv')
  }

  function exportMidiFile() {
    const bytes = exportConvertedMidi(events, score?.title)
    downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' }), 'music-box-arrangement.mid')
  }

  function exportMusicXmlFile() {
    downloadText(exportConvertedMusicXml(events, score?.title), 'music-box-arrangement.musicxml', 'application/vnd.recordare.musicxml+xml')
  }

  function exportJsonFile() {
    if (!score) return
    const project: ProjectFile = {
      formatVersion: PROJECT_FILE_VERSION,
      savedAt: new Date().toISOString(),
      score: { ...score, events },
      mechanismProfile: profile,
      paperProfile: paper,
      layoutConfig: layout,
      voiceSelectionMode,
      selectedTranspositionSemitones: transpositionSemitones,
      acceptedConflictIds: acceptedConflictKeys,
    }
    downloadText(serializeProject(project), 'music-box-project.json', 'application/json')
  }

  return (
    <div className="panel">
      <h2>6. Export</h2>
      {!canExport && <div className="error-box">Export is blocked - resolve the issues in the Final Summary panel first.</div>}

      <div className="toolbar">
        <label><input type="checkbox" checked={includeOutlineCut} onChange={(e) => setIncludeOutlineCut(e.target.checked)} /> Include strip outline as a cut path</label>
        <label>PDF page format
          <select value={pdfFormat} onChange={(e) => setPdfFormat(e.target.value as PdfPageFormat)}>
            <option value="letter">US Letter</option>
            <option value="legal">US Legal</option>
            <option value="a4">A4</option>
            <option value="a3">A3</option>
            <option value="continuous-roll">Continuous roll</option>
          </select>
        </label>
      </div>

      <div className="export-grid">
        <button type="button" disabled={!canExport} onClick={exportAllPdf}>Export PDF (print-ready, exact size) - {pages.length} sheet(s)</button>
        <button type="button" disabled={!canExport} onClick={exportAllSvg}>Export SVG (mm-accurate vector)</button>
        <button type="button" disabled={!canExport} onClick={exportAllDxf}>Export DXF for Silhouette Curio 2</button>
        <button type="button" disabled={!canExport} onClick={exportCsvFile}>Export CSV note/hole list</button>
        <button type="button" disabled={!canExport} onClick={exportMidiFile}>Export converted arrangement MIDI</button>
        <button type="button" disabled={!canExport} onClick={exportMusicXmlFile}>Export converted arrangement MusicXML</button>
        <button type="button" onClick={exportJsonFile} disabled={!score}>Export JSON project file (reopen later)</button>
      </div>

      <p className="muted">
        For the Silhouette Curio 2, prefer the DXF export - it carries true CAD layers (CUT_HOLES, CUT_OUTLINE,
        PRINT_GUIDES, REGISTRATION_MARKS, NO_CUT_LABELS) that Silhouette Studio maps directly to cut/no-cut. The SVG
        is for printing and general reference; only assign cut settings to the CUT_HOLES/CUT_OUTLINE layers if you
        import the SVG into cutter software instead.
      </p>
    </div>
  )
}
