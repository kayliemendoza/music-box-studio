"""
Thin wrapper around the real Audiveris OMR engine (https://github.com/Audiveris/audiveris,
AGPL-3.0-only), invoked as an external batch/headless subprocess.

This module does NOT implement any music recognition itself and does NOT use text OCR
to guess musical content. It shells out to the actual Audiveris Java CLI, which performs
real optical *music* recognition (staff/clef/notehead/stem/beam/rhythm analysis) and emits
MusicXML. We only parse Audiveris' own log output and result files.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger("omr-service.audiveris")

# Path to the Audiveris launcher script, as installed by the official .deb / app-image.
AUDIVERIS_BIN = os.environ.get("AUDIVERIS_BIN", "/opt/audiveris/bin/Audiveris")

# Wall-clock ceiling for a single Audiveris invocation. OMR on a multi-page scan can be
# slow; this is intentionally generous rather than tuned for any particular deployment.
AUDIVERIS_TIMEOUT_SECONDS = int(os.environ.get("AUDIVERIS_TIMEOUT_SECONDS", "600"))

# Lines emitted by Audiveris at WARN/ERROR level that are pure noise for an API consumer
# (missing OCR language packs unrelated to note recognition, etc.) and would otherwise
# flood the `warnings` array with things that are not genuine recognition-quality signals.
_NOISE_WARNING_PATTERNS = [
    re.compile(r"No installed OCR languages"),
    re.compile(r"Missing support for .* language"),
    re.compile(r"collection of supported languages is empty", re.IGNORECASE),
]

# Matches Audiveris' own log line format, e.g.:
#   WARN  [smoke]              ScaleBuilder 300  | No reliable beam height found, guessed value: 12
# Group 1 = level, group 2 = sheet/book tag (Audiveris' own per-sheet context, often the
# book/file basename), group 3 = source class, group 4 = message.
_LOG_LINE_RE = re.compile(
    r"^(WARN|ERROR)\s+\[(?P<tag>[^\]]*)\]\s*(?P<cls>\S+)\s+\d*\s*\|\s*(?P<msg>.*)$"
)


class AudiverisError(RuntimeError):
    """Raised when the Audiveris subprocess fails or produces no usable output."""


@dataclass
class OmrWarning:
    message: str
    context: str | None = None  # e.g. sheet/book tag Audiveris logged, if any

    def to_dict(self) -> dict:
        return {"message": self.message, "context": self.context}


@dataclass
class OmrResult:
    musicxml: str
    warnings: list[OmrWarning] = field(default_factory=list)
    pages: int = 1
    additional_pages_skipped: bool = False


def _parse_sheet_range(page_start: int | None, page_end: int | None) -> str | None:
    """Build an Audiveris `-sheets` selector (e.g. "1", "2-4") from a 1-based page range."""
    if page_start is None and page_end is None:
        return None
    start = page_start or 1
    end = page_end or start
    if start < 1 or end < start:
        raise ValueError("Invalid page range")
    return str(start) if start == end else f"{start}-{end}"


def _extract_warnings(log_text: str) -> list[OmrWarning]:
    warnings: list[OmrWarning] = []
    for line in log_text.splitlines():
        m = _LOG_LINE_RE.match(line.strip())
        if not m:
            continue
        msg = m.group("msg").strip()
        if any(p.search(msg) for p in _NOISE_WARNING_PATTERNS):
            continue
        tag = m.group("tag").strip() or None
        cls = m.group("cls").strip()
        warnings.append(OmrWarning(message=f"{cls}: {msg}", context=tag))
    return warnings


def _count_loaded_sheets(log_text: str) -> int:
    # Audiveris logs one "Loaded image #N ..." (or "Loaded book ...") line per sheet it
    # actually processed. This is a genuine count of pages Audiveris saw, not a guess.
    count = len(re.findall(r"Loaded image #\d+", log_text))
    return count or 1


async def run_audiveris(
    input_path: Path,
    *,
    page_start: int | None = None,
    page_end: int | None = None,
) -> OmrResult:
    """
    Run the real Audiveris CLI in headless batch mode against `input_path` (a PDF, PNG,
    or JPG on disk) and return the resulting MusicXML plus any genuine warnings Audiveris
    itself logged.

    Raises AudiverisError if the binary is missing, times out, exits non-zero, or produces
    no MusicXML export.
    """
    if not Path(AUDIVERIS_BIN).exists():
        raise AudiverisError(
            f"Audiveris binary not found at {AUDIVERIS_BIN}. This service must run inside "
            "the provided Docker image, which installs the official Audiveris release."
        )

    sheets_arg = _parse_sheet_range(page_start, page_end)

    with tempfile.TemporaryDirectory(prefix="omr-out-") as out_dir:
        cmd = [AUDIVERIS_BIN, "-batch", "-export", "-output", out_dir]
        if sheets_arg:
            cmd += ["-sheets", sheets_arg]
        cmd += ["--", str(input_path)]

        logger.info("Running Audiveris: %s", " ".join(cmd))

        env = dict(os.environ)
        # Audiveris insists on a display-capable toolkit unless told otherwise; -batch
        # already disables the GUI, but force AWT headless too for safety in containers
        # with no X server.
        env["JAVA_TOOL_OPTIONS"] = (env.get("JAVA_TOOL_OPTIONS", "") + " -Djava.awt.headless=true").strip()

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                env=env,
            )
            stdout_bytes, _ = await asyncio.wait_for(
                proc.communicate(), timeout=AUDIVERIS_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError as exc:
            proc.kill()
            await proc.wait()
            raise AudiverisError(
                f"Audiveris did not finish within {AUDIVERIS_TIMEOUT_SECONDS}s"
            ) from exc

        log_text = stdout_bytes.decode("utf-8", errors="replace")

        if proc.returncode != 0:
            raise AudiverisError(
                f"Audiveris exited with code {proc.returncode}. Log tail:\n"
                + "\n".join(log_text.splitlines()[-40:])
            )

        mxl_files = sorted(Path(out_dir).rglob("*.mxl"))
        xml_files = sorted(Path(out_dir).rglob("*.xml"))
        # Ignore Audiveris' own book.xml / sheet#N.xml bookkeeping files, which live in
        # the .omr book directory structure, not the MusicXML export itself.
        xml_files = [
            p for p in xml_files if p.name not in ("book.xml",) and "sheet#" not in p.name
        ]

        musicxml_text: str | None = None
        extra_export_count = 0

        if mxl_files:
            primary = mxl_files[0]
            extra_export_count = len(mxl_files) - 1
            with zipfile.ZipFile(primary) as zf:
                container_names = [n for n in zf.namelist() if n.endswith(".xml") and "META-INF" not in n]
                if not container_names:
                    raise AudiverisError(f"{primary.name} contained no MusicXML entry")
                musicxml_text = zf.read(container_names[0]).decode("utf-8", errors="replace")
        elif xml_files:
            primary = xml_files[0]
            extra_export_count = len(xml_files) - 1
            musicxml_text = primary.read_text(encoding="utf-8", errors="replace")

        if not musicxml_text:
            raise AudiverisError(
                "Audiveris completed but produced no MusicXML export. Log tail:\n"
                + "\n".join(log_text.splitlines()[-40:])
            )

        warnings = _extract_warnings(log_text)
        pages = _count_loaded_sheets(log_text)

        if extra_export_count > 0:
            warnings.append(
                OmrWarning(
                    message=(
                        f"Input produced {extra_export_count + 1} separate MusicXML exports "
                        "(one per sheet/movement); only the first is returned. Pass "
                        "page_start/page_end to select a specific page."
                    ),
                    context=None,
                )
            )

        return OmrResult(
            musicxml=musicxml_text,
            warnings=warnings,
            pages=pages,
            additional_pages_skipped=extra_export_count > 0,
        )
