# OMR service (music-box-studio)

A small HTTP microservice that converts scanned/printed sheet music (PDF, PNG, JPG) into
MusicXML using **real Optical Music Recognition** — [Audiveris](https://github.com/Audiveris/audiveris),
via its official batch/headless CLI, invoked as a subprocess. This service does **not**
use generic text OCR to guess musical notes; Audiveris performs actual staff/clef/notehead/
stem/beam/rhythm analysis and emits MusicXML.

This is the backend adapter that `music-box-studio`'s import flow calls before turning a
score into a 30-note punch-strip layout.

## Build & run

### Docker (recommended)

```bash
cd music-box-studio/services/omr-service
docker build -t music-box-studio/omr-service:local .
docker run --rm -p 8000:8000 music-box-studio/omr-service:local
```

or with Compose:

```bash
docker compose up --build
```

The image fetches the **official** Audiveris 5.11.0 Linux release package directly from
Audiveris' GitHub Releases at build time (`Audiveris-5.11.0-ubuntu24.04-x86_64.deb`). No
Audiveris source or binary is vendored in this repo. To pin a different release, override
the build arg:

```bash
docker build --build-arg AUDIVERIS_VERSION=5.11.0 -t music-box-studio/omr-service:local .
```

Once running:

```bash
curl http://localhost:8000/health

curl -F "file=@/path/to/score.pdf" http://localhost:8000/omr
```

### Without Docker

You need: Java 17+ (Audiveris' own package actually bundles its own jlink'd JRE, so a
system JDK is not strictly required if you install Audiveris' official `.deb`/`.dmg`/`.msi`
yourself), a real Audiveris install with `bin/Audiveris` on disk, Tesseract's `eng.traineddata`
copied into `$HOME/.config/AudiverisLtd/audiveris/tessdata/` (see `entrypoint.sh` for exactly
what the container does), and Python 3.11+:

```bash
pip install -r requirements.txt
export AUDIVERIS_BIN=/opt/audiveris/bin/Audiveris
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## API contract

### `GET /health`

```json
{ "status": "ok", "audiveris_binary": "/opt/audiveris/bin/Audiveris", "audiveris_installed": true }
```

`status` is `"degraded"` if the Audiveris binary is missing (e.g. someone ran the Python
app outside the provided image).

### `POST /omr`

`multipart/form-data`:

| field        | required | notes                                                                 |
|--------------|----------|------------------------------------------------------------------------|
| `file`       | yes      | PDF, PNG, or JPG scan of printed sheet music                          |
| `page_start` | no       | 1-based first page/sheet to process                                   |
| `page_end`   | no       | 1-based last page/sheet to process                                    |
| `dpi`        | no       | DPI hint; currently logged only — see note below                      |

```bash
curl -F "file=@score.pdf" -F "page_start=1" -F "page_end=1" http://localhost:8000/omr
```

Response `200`:

```json
{
  "musicxml": "<?xml version=\"1.0\" ...?><score-partwise ...>...</score-partwise>",
  "warnings": [
    { "message": "ScaleBuilder: No reliable beam height found, guessed value: 12", "context": "smoke" }
  ],
  "pages": 1,
  "needsReview": true
}
```

- `musicxml` — the raw MusicXML text Audiveris exported (uncompressed `.xml`, extracted
  from Audiveris' `.mxl` container if it produced one).
- `warnings` — genuine `WARN`/`ERROR` lines Audiveris itself logged during recognition
  (with whatever sheet/book context Audiveris attached), filtered to drop pure noise
  (e.g. a missing-OCR-language notice unrelated to note recognition). **Nothing here is a
  fabricated confidence score** — Audiveris' CLI does not expose reliable per-symbol
  confidence, so we only ever pass through log signals that genuinely exist.
- `pages` — number of sheets Audiveris actually loaded from the input.
- `needsReview` — **always `true`**. OMR is never guaranteed correct; every result must be
  confirmed by a human before being treated as a final export. This is intentionally not a
  computed/probabilistic value.

Errors: `400` (bad file type/empty file/bad page range), `413` (file too large, 50 MB cap),
`502` (Audiveris itself failed — the error message includes the tail of Audiveris' log).

Multi-page note: if the input produces more than one MusicXML export (Audiveris treats a
multi-page PDF as multiple "sheets"), this endpoint currently returns only the **first**
sheet's MusicXML and adds a `warnings` entry saying so. Pass `page_start`/`page_end` to
target a specific page for now; merging multiple sheets into one MusicXML document is not
implemented.

## Licensing — read before deploying this publicly

**Audiveris is licensed under AGPL-3.0-only.** This service's Docker image installs an
unmodified official Audiveris release binary and invokes it as a subprocess; this service's
own code (this directory) is a thin adapter around it.

The AGPL's defining term (§13, "Remote Network Interaction") extends the GPL's
source-availability obligations to **network use**: if you run an AGPL-licensed program on
a server and let other people interact with it over a network (an API call counts), you
must offer those users a way to get the **complete corresponding source code** of the
program *as you are running it* — not just the unmodified upstream source, but including
any modifications you've made, under the AGPL, with no additional restrictions.

What this means concretely for whoever operates this OMR service:

- If this service is **only run locally** (a developer's machine, a CI job, or a private
  network the operator alone can reach) — nobody outside the operator is "interacting with
  it remotely," so §13 does not add an obligation beyond ordinary AGPL redistribution rules.
- If this service is exposed to **other people over a network** — including as a backend
  behind `music-box-studio`'s web frontend used by other users — the operator must make the
  corresponding source available to those users, per AGPL §13. That includes this adapter
  code and the exact Audiveris source/version in use (which, since we install the official
  unmodified release, is just "point people at the official Audiveris repository and the
  exact release tag/version this image pins" — but the *obligation to actually offer that
  source access* is on the operator, and doesn't happen automatically).
- Bundling this service into a larger product, wrapping it, or fronting it with a
  proprietary API layer does **not** avoid the AGPL obligation for the Audiveris component
  itself — AGPL's copyleft is specifically designed to survive that.

**Recommendation:** keep this service **self-hosted / local-only** (a developer tool, an
internal service, or something each user runs themselves against their own machine) unless
the operator is genuinely prepared to comply with AGPL §13 (e.g. publish this adapter's
source, which the whole `music-box-studio` repo you're reading already does if public, and
clearly link the exact Audiveris version/source in use from the running service). This is
not a substitute for legal advice — if `music-box-studio` is heading toward being run as a
public SaaS with this service in the request path, get that reviewed properly before launch.

## What's genuinely verified vs. not

**Verified end-to-end in the environment this was built in:** `docker build` on this exact
Dockerfile succeeded; the resulting container's `/health` reported the Audiveris binary
installed; a real LilyPond-rendered PNG of a one-octave C-major scale (C D E F G A B C on
a treble staff) was POSTed to `/omr` over real HTTP, and the response was `HTTP 200` with
`needsReview: true`, `pages: 1`, and MusicXML whose `<pitch><step>` values were exactly
`C D E F G A B C` — i.e. Audiveris actually read the notes correctly, not a mock. See the
top-level task report for the full trace.

**Known limitation, not fixed (out of scope for the time budget):** the container logs a
warning `Could not initialize TessBaseAPI languages: eng in legacy mode` — the
`tesseract-ocr-eng` package's `eng.traineddata` is the LSTM-only variant, and Audiveris'
bundled Tesseract wants a legacy-compatible trained-data file for full OCR support. This
only affects lyrics/free-text recognition on a score, not note/pitch/rhythm recognition
(which was verified working). A `tessdata` file with legacy support (e.g. from
tesseract-ocr's `tessdata` GitHub repo, `eng.traineddata` "best"/legacy build) would
resolve it if lyric OCR quality matters for a given deployment.

**Not exercised:** multi-page PDF handling beyond the single-sheet code path, the `dpi`
hint parameter (intentionally not wired to any Audiveris flag — see the field's docstring
in `app/main.py`), and the `page_start`/`page_end` → `-sheets` parameter passthrough
(implemented per Audiveris' documented `-sheets int[]` CLI flag, but not run against a
real multi-page input in this session).

**Base image substitution:** the task suggested `eclipse-temurin` as the JDK base. In this
build environment, Docker Hub (which serves `eclipse-temurin`) returned `403 Forbidden`
through the network egress policy on every image pull attempted (`debian`, `ubuntu`,
`quay.io`, `ghcr.io` were all blocked the same way); `mcr.microsoft.com` was reachable, so
this Dockerfile uses `mcr.microsoft.com/openjdk/jdk:21-ubuntu` (Ubuntu 22.04, OpenJDK 21)
instead. Functionally equivalent for this purpose; swap it back if your environment can
reach Docker Hub and you prefer Eclipse Temurin specifically.
