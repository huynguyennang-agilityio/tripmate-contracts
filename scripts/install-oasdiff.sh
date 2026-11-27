#!/usr/bin/env bash
# Installs oasdiff for the breaking-change check (EPIC-11 spec, section 2.10): the version and the
# checksum live here and nowhere else. Downloads the linux_amd64 release tarball, verifies its
# SHA-256 before extracting, and puts the binary in <dir> (default: a new temporary directory).
# On GitHub Actions it sets OASDIFF to the binary for the later steps.
#
#   scripts/install-oasdiff.sh [dir]
set -euo pipefail

VERSION="1.37.0"
SHA256="eac87307d31d08c36800c58a409c247f1c5db37fbb72e2544402f22a87cbca3c"
ARCHIVE="oasdiff_${VERSION}_linux_amd64.tar.gz"
URL="https://github.com/oasdiff/oasdiff/releases/download/v${VERSION}/${ARCHIVE}"

dest="${1:-$(mktemp -d)}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$dest"

curl --fail --silent --show-error --location --retry 3 --output "$work/$ARCHIVE" "$URL"
echo "${SHA256}  ${work}/${ARCHIVE}" | sha256sum --check --strict -
tar -xzf "$work/$ARCHIVE" -C "$dest" oasdiff

bin="$(cd "$dest" && pwd)/oasdiff"
"$bin" --version
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "OASDIFF=$bin" >> "$GITHUB_ENV"
fi
echo "$bin"
