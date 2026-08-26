#!/bin/sh
# Entrypoint for the OMR service container.
#
# Audiveris keeps its own private OCR-language folder at
# $HOME/.config/AudiverisLtd/audiveris/tessdata and looks there for *.traineddata files
# (it does not use $TESSDATA_PREFIX or the system tesseract binary directly -- it calls
# into libtesseract via a bundled JNI wrapper, but still expects trained-data files on
# disk). We seed that folder from the real eng.traineddata installed by the system
# tesseract-ocr-eng package, so lyric/text recognition inside Audiveris actually has a
# language available instead of silently degrading (see the "No installed OCR languages"
# warning this avoids).
set -eu

AUDIVERIS_HOME="${HOME:-/root}/.config/AudiverisLtd/audiveris/tessdata"
mkdir -p "${AUDIVERIS_HOME}"

SYSTEM_TESSDATA=$(find /usr/share/tesseract-ocr -name "eng.traineddata" 2>/dev/null | head -n1 || true)
if [ -n "${SYSTEM_TESSDATA}" ] && [ ! -f "${AUDIVERIS_HOME}/eng.traineddata" ]; then
    cp "${SYSTEM_TESSDATA}" "${AUDIVERIS_HOME}/eng.traineddata"
fi

exec "$@"
