# Music Box Studio — web app

See the [top-level README](../../README.md) for the full project overview, workflow,
calibration/export guidance, and licensing/limitations. This directory is the frontend:
Vite + React + TypeScript, tested with Vitest.

## Scripts

```bash
npm run dev       # local dev server
npm run build     # tsc -b && vite build
npm test          # vitest run
npm run lint      # oxlint
npm run preview   # serve the production build locally
```

## Optional: PDF/image import

Copy `.env.example` to `.env.local` and set `VITE_OMR_SERVICE_URL` to a running instance of
`../services/omr-service` if you want to import scanned PDF/image sheet music. Not required
for MusicXML/MIDI import, which work out of the box.

## Layout

```
src/
  model/      NoteEvent, MechanismProfile, PaperProfile, ProjectFile types
  music/      MIDI-pitch <-> note-name utilities
  import/     MusicXML / MIDI / OMR parsers
  convert/    pitch mapping, transposition scoring, conflict detection, validation gate
  export/     SVG / PDF / DXF / CSV / MIDI / MusicXML exporters, page splitting
  state/      zustand store tying it all together
  editor/     the 30-lane punch-strip canvas
  score/      OpenSheetMusicDisplay wrapper
  playback/   Tone.js scheduler
  calibration/ calibration wizard + printable calibration page
  ui/         everything else (import/review/export panels, note table, icons)
```
