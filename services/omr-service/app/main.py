"""
OMR (Optical Music Recognition) backend microservice for music-box-studio.

Wraps the real Audiveris OMR engine (https://github.com/Audiveris/audiveris,
AGPL-3.0-only) as a subprocess and exposes it over a small HTTP API. This service
performs genuine optical *music* recognition (staff lines, clefs, noteheads, stems,
beams, rhythm) via Audiveris and returns MusicXML. It deliberately does not use
plain text OCR to guess musical notes.

See README.md in this directory for the API contract, build/run instructions, and
an important AGPL-3.0 licensing note for anyone deploying this service.
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from .audiveris_runner import AUDIVERIS_BIN, AudiverisError, run_audiveris

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("omr-service")

app = FastAPI(
    title="music-box-studio OMR service",
    description="Audiveris-backed Optical Music Recognition adapter: scans -> MusicXML.",
    version="0.1.0",
)

ALLOWED_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


@app.get("/health")
async def health() -> dict:
    """Liveness/readiness probe. Reports whether the Audiveris binary is actually present,
    since a running FastAPI process with a missing Audiveris install is not actually healthy
    for this service's purpose."""
    audiveris_present = Path(AUDIVERIS_BIN).exists()
    return {
        "status": "ok" if audiveris_present else "degraded",
        "audiveris_binary": AUDIVERIS_BIN,
        "audiveris_installed": audiveris_present,
    }


@app.post("/omr")
async def omr(
    file: UploadFile = File(..., description="Scanned sheet music: PDF, PNG, or JPG"),
    page_start: Optional[int] = Form(
        None, description="1-based first page/sheet to process (optional)"
    ),
    page_end: Optional[int] = Form(
        None, description="1-based last page/sheet to process (optional)"
    ),
    dpi: Optional[int] = Form(
        None,
        description=(
            "Optional DPI hint for the scan. Audiveris estimates scale automatically from "
            "staff-line spacing in the image itself, so this is currently recorded for "
            "diagnostics/logging only and is not force-fed into the recognizer as a magic "
            "flag that does not exist in Audiveris' CLI."
        ),
    ),
) -> JSONResponse:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{suffix or '(none)'}'. Allowed: {sorted(ALLOWED_SUFFIXES)}",
        )

    if page_start is not None and page_start < 1:
        raise HTTPException(status_code=400, detail="page_start must be >= 1")
    if page_end is not None and page_start is not None and page_end < page_start:
        raise HTTPException(status_code=400, detail="page_end must be >= page_start")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit",
        )

    if dpi is not None:
        logger.info("Received dpi hint=%s for %s (not passed to Audiveris; see field docs)", dpi, file.filename)

    with tempfile.TemporaryDirectory(prefix="omr-in-") as tmp_dir:
        input_path = Path(tmp_dir) / f"upload{suffix}"
        input_path.write_bytes(contents)

        try:
            result = await run_audiveris(
                input_path, page_start=page_start, page_end=page_end
            )
        except AudiverisError as exc:
            logger.exception("Audiveris run failed")
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    return JSONResponse(
        {
            "musicxml": result.musicxml,
            "warnings": [w.to_dict() for w in result.warnings],
            "pages": result.pages,
            # Always true: Audiveris' CLI exposes no reliable per-symbol confidence score,
            # and OMR output is never guaranteed correct. Every result requires human
            # confirmation before it is treated as final in the punch-strip export.
            "needsReview": True,
        }
    )
