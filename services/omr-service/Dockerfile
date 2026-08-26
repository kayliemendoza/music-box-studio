# OMR service for music-box-studio.
#
# This image installs the REAL, official Audiveris OMR engine
# (https://github.com/Audiveris/audiveris) from its official GitHub Releases at build
# time. Audiveris is AGPL-3.0-only licensed -- see README.md "Licensing" section before
# deploying this image as a network-accessible service.
#
# We do NOT vendor/copy any Audiveris source or binaries into this repo; the Dockerfile
# fetches the official prebuilt Linux package on every build.

# ---------------------------------------------------------------------------
# Stage 1: fetch the official Audiveris release package (no build-from-source needed --
# Audiveris publishes jpackage-built, self-contained Linux .deb packages for CLI use).
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/openjdk/jdk:21-ubuntu AS fetch-audiveris

ARG AUDIVERIS_VERSION=5.11.0
# Matches the runtime stage's Ubuntu 22.04 (jammy) base -- Audiveris publishes separate
# .deb builds per Ubuntu release; keep this in sync with the `runtime` stage's base image.
ARG AUDIVERIS_DEB=Audiveris-${AUDIVERIS_VERSION}-ubuntu22.04-x86_64.deb
ARG AUDIVERIS_URL=https://github.com/Audiveris/audiveris/releases/download/${AUDIVERIS_VERSION}/${AUDIVERIS_DEB}

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /fetch
RUN curl -fL --retry 3 -o audiveris.deb "${AUDIVERIS_URL}" \
    && ls -la audiveris.deb

# ---------------------------------------------------------------------------
# Stage 2: runtime image.
#
# Base is a JDK 21 image, Ubuntu 22.04 (jammy) based, matching the Audiveris .deb fetched
# above. (Audiveris' own jpackage bundle ships its own jlink'd runtime under
# /opt/audiveris/lib/runtime and does not strictly need this JDK to run -- it is included
# per the project's requirement of a JDK17+/21 base, and is harmless.)
#
# NOTE: the task suggested `eclipse-temurin` as the JDK base image. In this build
# environment, Docker Hub's CDN (which eclipse-temurin is served from) was blocked by the
# network egress policy (403 from the proxy on cloudfront-hosted registry blobs), while
# mcr.microsoft.com was reachable, so this Dockerfile uses Microsoft's official OpenJDK 21
# image instead. Swap the two FROM lines below for `eclipse-temurin:21-jdk-jammy` (and the
# matching apt package names) in an environment where Docker Hub is reachable.
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/openjdk/jdk:21-ubuntu AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    AUDIVERIS_BIN=/opt/audiveris/bin/Audiveris \
    JAVA_TOOL_OPTIONS="-Djava.awt.headless=true"

# System dependencies:
#  - the shared libs Audiveris' .deb declares (Depends: ...) for its bundled JRE/AWT bits
#  - libgtk-3-0: NOT in the .deb's declared Depends (a normal desktop install already has
#    it), but Audiveris' static startup path (WellKnowns -> getGdkMaxScale, to probe a
#    HiDPI scale factor) unconditionally loads libgtk-3.so via JNA even in `-batch` mode,
#    and throws UnsatisfiedLinkError without it -- confirmed by an actual container run.
#  - tesseract-ocr + English trained data: Audiveris calls into Tesseract (bundled as a
#    native lib via javacpp-presets) for lyrics/free-text recognition on the score; we
#    additionally install the system tesseract-ocr-eng package purely to obtain a real,
#    officially-distributed eng.traineddata file to hand to Audiveris (see entrypoint.sh).
#  - python3/pip to run the FastAPI wrapper around the Audiveris CLI
RUN apt-get update && apt-get install -y --no-install-recommends \
        libasound2 libbsd0 libc6 libmd0 libx11-6 libxau6 libxcb1 libxdmcp6 \
        libxext6 libxi6 libxrender1 libxtst6 xdg-utils zlib1g fontconfig \
        libgtk-3-0 \
        tesseract-ocr tesseract-ocr-eng \
        python3 python3-pip python3-venv \
        ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=fetch-audiveris /fetch/audiveris.deb /tmp/audiveris.deb
# Extract the package payload directly (dpkg-deb -x) rather than `dpkg -i`: the official
# .deb's postinst script tries to register a desktop menu entry (xdg-desktop-menu) and a
# MIME handler, which are meaningless -- and fail -- in a headless container with no
# desktop session. We only need the files under /opt/audiveris.
RUN dpkg-deb -x /tmp/audiveris.deb / \
    && rm -f /tmp/audiveris.deb \
    && rm -rf /var/lib/apt/lists/* \
    && test -x /opt/audiveris/bin/Audiveris

# Python app
WORKDIR /srv/omr-service
COPY requirements.txt ./
RUN python3 -m pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
