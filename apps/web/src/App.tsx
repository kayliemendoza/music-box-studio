import { useState } from 'react'
import { useStudioStore } from './state/store'
import { ImportPanel } from './ui/ImportPanel'
import { ConvertPanel } from './ui/ConvertPanel'
import { ReviewPanel } from './ui/ReviewPanel'
import { StripEditor } from './editor/StripEditor'
import { PlaybackControls } from './ui/PlaybackControls'
import { ExportPanel } from './ui/ExportPanel'
import { ValidationSummary } from './ui/ValidationSummary'
import { CalibrationWizard } from './calibration/CalibrationWizard'
import { MechanismPanel } from './ui/MechanismPanel'
import { ScoreView } from './score/ScoreView'
import './App.css'

const TABS = ['Import', 'Convert', 'Review', 'Score', 'Strip Editor', 'Playback', 'Calibration', 'Mechanism', 'Export & Summary'] as const
type Tab = (typeof TABS)[number]

export default function App() {
  const [tab, setTab] = useState<Tab>('Import')
  const score = useStudioStore((s) => s.score)

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Music Box Studio</h1>
        <p>Sheet music -&gt; 30-note punch-strip layouts for Yunsheng Y30H2-style paper-strip music boxes</p>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <main className="app-main">
        {tab === 'Import' && <ImportPanel />}
        {tab === 'Convert' && <ConvertPanel />}
        {tab === 'Review' && <ReviewPanel />}
        {tab === 'Score' && (
          <div className="panel">
            <h2>Conventional notation</h2>
            <ScoreView musicXml={score?.sourceMusicXml ?? null} />
          </div>
        )}
        {tab === 'Strip Editor' && <StripEditor />}
        {tab === 'Playback' && <PlaybackControls />}
        {tab === 'Calibration' && <CalibrationWizard />}
        {tab === 'Mechanism' && <MechanismPanel />}
        {tab === 'Export & Summary' && (
          <>
            <ValidationSummary />
            <ExportPanel />
          </>
        )}
      </main>
    </div>
  )
}
