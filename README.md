# Music Box Studio

A working web application that converts standard sheet music into playable, printable
punch-strip layouts for a **30-note Yunsheng Y30H2-style hand-cranked paper-strip music
box**, with a Silhouette Curio 2 producing the finished hole pattern.

This is a real, functional tool — not a mockup. Import, conversion, the mechanical-conflict
checker, the calibration wizard, the punch-strip editor, playback, and every export format
(PDF/SVG/DXF/CSV/JSON/MIDI/MusicXML) run for real against the code in this repo. See
[Limitations](#limitations) below for the one area (Optical Music Recognition) that needs
a separately-run backend service, and exactly what has and hasn't been verified there.

This app lives in its own subfolder and does not touch the COGS108 coursework at the
repository root.

## Contents

- `apps/web/` — the frontend (Vite + React + TypeScript). This is the whole app for
  MusicXML/MIDI workflows; everything runs client-side, in your browser.
- `services/omr-service/` — an optional backend microservice that wraps the real
  [Audiveris](https://github.com/Audiveris/audiveris) OMR engine, needed only if you want
  to import scanned PDF/image sheet music (as opposed to MusicXML/MIDI).
- `fixtures/` — a generated, ready-to-print test strip (`test-strip-twinkle.svg/.dxf`) for
  the built-in public-domain test melody, produced by the app's own export pipeline.

## Quick start

```bash
cd apps/web
npm install
npm run dev
```

Open the printed local URL. Click **"Load built-in test melody"** on the Import tab to try
the whole workflow immediately with no files of your own.

## The workflow

1. **Import** — MusicXML (`.musicxml`/`.xml`/`.mxl`) and MIDI (`.mid`/`.midi`) are parsed
   entirely in your browser; nothing is uploaded anywhere. PDF/image import requires the
   separate OMR service (see below) and always routes through a verification step.
2. **Convert** — choose which voices to keep (melody only / melody+bass / melody+reduced
   harmony / custom), and compare the automatic transposition scoring (−12..+12 semitones)
   before applying one.
3. **Review** — every note that isn't an exact match on the mechanism is visibly flagged.
   Approve, reject, manually reassign, or delete each one. Nothing is changed silently.
4. **Score** — the imported MusicXML renders as conventional notation (via
   OpenSheetMusicDisplay), with changed/unresolved notes highlighted.
5. **Strip Editor** — a zoomable, scrollable 30-lane canvas at physical scale. Drag holes,
   multi-select, copy/paste, undo/redo, insert/remove measures, and see mechanical
   conflicts recomputed live.
6. **Playback** — hear the original score or the converted (holes-only) arrangement with a
   synthetic music-box-like tone. This is *not* proof of physical playability — only the
   conflict checker and calibration are.
7. **Calibration** — a wizard for every physical paper/mechanism dimension (lane spacing,
   hole diameter, margins, trigger-edge offset, printer/cutter correction, etc.), plus a
   printable calibration page (100 mm box, lane marks, test holes, feed arrow) to measure
   against your real blank strip and instruction sheet before trusting any export.
8. **Export & Summary** — a final validation gate blocks export until every OMR
   uncertainty, unsupported pitch, and mechanical conflict is resolved or explicitly
   accepted, the paper is calibrated, and every hole falls in the usable region. Then
   export print-ready PDF (US Letter/Legal/A4/A3/continuous-roll), mm-accurate SVG,
   Silhouette-ready DXF, a CSV hole list, MIDI/MusicXML of the arrangement, and a JSON
   project file you can reopen later.

## The mechanism: sounding pitch vs. printed label

The `MechanismProfile` for the Yunsheng Y30H2-style 30-note mechanism encodes the **actual
sounding pitch** of each of the 30 physical lanes (lane 1 = top = A6 down to lane 30 =
bottom = F3), independently of whatever label happens to be silkscreened on a given batch
of paper strips. The app always converts a song using the sounding pitch; the "show printed
strip labels" toggle (Mechanism tab, Strip Editor, exports) is for *display* only, and the
label values themselves are editable placeholders in `mechanism.ts` — enter your instruction
sheet's real printed labels there if they differ from the sounding note (they often do on
these mechanisms). You can also define a wholly custom `MechanismProfile` for a different
tuning/batch.

## Physical calibration

Nothing about paper width, lane spacing, hole diameter, margins, or the trigger-edge offset
is hardcoded as truth — every `PaperProfile` field starts as an editable placeholder
(3.175 mm/⅛" hole diameter, etc.) that the calibration wizard exists specifically to let you
override from a real measured scan and test print. **Export stays blocked until you mark the
paper profile as calibrated.**

## Silhouette Curio 2 export

Prefer the **DXF** export for the Curio 2: it carries true CAD layers
(`CUT_HOLES`, `CUT_OUTLINE`, `PRINT_GUIDES`, `REGISTRATION_MARKS`, `NO_CUT_LABELS`) that
Silhouette Studio maps directly to its own cut/no-cut layers on import — verified in this
repo's tests to never place guide/label/registration geometry on a cut layer. The SVG
export uses the same five named groups/colors for printing and general reference, but SVG
layer semantics aren't universally respected by every tool the way DXF layers are, so if you
import the SVG into cutter software instead of the PDF/DXF, double-check cut-layer
assignment there. Outline cutting is opt-in (`includeOutlineCut`) — only hole circles are
cut paths by default.

## Optical Music Recognition (PDF/image import)

MusicXML and MIDI are the reliable import paths and need nothing extra. PDF/image import
uses a **real** OMR engine — [Audiveris](https://github.com/Audiveris/audiveris) — running
as a separate backend service in `services/omr-service/`, because Audiveris is a JVM
application and can't run inside a static browser app. See that directory's README for:

- build/run instructions (Docker),
- the exact API contract,
- **what was actually verified end-to-end** (a real scan → real recognized pitches, not a
  mocked response) versus what wasn't exercised,
- the Audiveris **AGPL-3.0** licensing implications for anyone deploying this service
  publicly (read before you deploy it as anything more than a local dev tool).

Every OMR-recognized note is flagged `needsReview` and the Review tab requires confirming
each one (or bulk-confirming) before export — this app never claims OMR recognition is
guaranteed accurate.

## Running the tests

```bash
cd apps/web
npm test          # vitest run
npm run build     # tsc -b && vite build
npm run lint      # oxlint
```

65 tests cover: all 30 lane↔pitch mappings, enharmonic equivalence, out-of-range handling,
octave folding, a genuine missing-pitch-class case (G#4) producing a review item,
automatic transposition scoring, same-lane reset-conflict detection (and that simultaneous
different-lane chords are *not* flagged), MusicXML import (including compressed `.mxl`),
MIDI import (including percussion-track flagging), exact-physical-size SVG/PDF geometry
(within the required 0.2 mm tolerance), DXF layer safety (no guide/label geometry ever
lands on a cut layer), page splitting across multiple physical sheets, JSON project
export/reopen round-tripping, the pre-export validation gate, and OMR-service integration
(mocked at the HTTP boundary for the frontend test; the OMR service itself was verified
separately with a real Audiveris run — see its README).

## Limitations (read honestly, not just the happy path)

- **No physical strip has been tested.** All physical-geometry math (mm positions, hole
  diameters, DXF/SVG/PDF exact-size export) is implemented and unit-tested to be internally
  consistent and dimensionally accurate, but no real Yunsheng Y30H2 mechanism or blank strip
  was available to calibrate against or physically punch-test in this session. The
  calibration wizard exists specifically so you supply those real measurements before
  trusting an export — do that before cutting anything.
- **Printed strip labels are placeholders.** `mechanism.ts`'s `printedLabel` field defaults
  to mirror the sounding note name; enter your instruction sheet's real printed labels if
  they differ (very likely on real 30-note strips).
- **OSMD note-highlighting is best-effort.** Changed/unresolved notes are colored in the
  Score tab by matching (measure number, MIDI pitch) heuristically against OSMD's internal
  model; this can occasionally mis-highlight in scores with unusual voicing. The Strip
  Editor and Note Table are the authoritative, precise views.
- **Click-to-select sync** is fully wired between the Note Table and the Strip Editor.
  Clicking a note *in the rendered score* to select it elsewhere is not implemented (OSMD's
  click-to-note API integration was cut for scope) — selection currently flows one
  direction into the score (highlighting), not out of it.
- **PDF tiling across standard paper sizes** (when one physical mechanism strip is longer
  than a single Letter/Legal/A4/A3 sheet) draws alignment-mark text so you can trim and
  join printed sheets by hand; it doesn't generate a separate assembly diagram.
- **Measure insert/remove** in the Strip Editor shifts note timing but does not renumber
  `sourceMeasure`/`sourceBeat` display fields precisely afterward — functionally correct for
  layout, cosmetically approximate for measure numbering after such an edit.
- **Strip-editor drag** shows the moved note only after you release the mouse (no live
  preview mid-drag) — a scope cut for time, not a correctness issue.
- **OMR service**: see its own README for exactly what's verified vs. not (multi-page PDF
  handling and the `dpi` hint parameter are implemented per Audiveris' documented CLI flags
  but weren't exercised against a real multi-page input in this session).

## Licensing of dependencies

- **OpenSheetMusicDisplay** — BSD-3-Clause.
- **Tone.js** — MIT.
- **@tonejs/midi** — MIT.
- **JSZip** — MIT/GPLv3 dual license (used here under MIT terms).
- **pdf-lib** — MIT.
- **zustand** — MIT.
- **Audiveris** (OMR service only) — **AGPL-3.0-only**. See
  `services/omr-service/README.md` for the full licensing discussion — this is the one
  dependency in this project with real obligations attached to how you deploy it.
