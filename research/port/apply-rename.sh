#!/usr/bin/env bash
# Apply the OME rename map to a checkout of upstream Epiq.
#
# Usage: from the repo root, `bash research/port/apply-rename.sh`
# Run once on a fresh checkout at an upstream tag (e.g. d66d1db7 / v1.17.1).
# The map mirrors what the fork did at v1.12.4 (see research/baseline docs):
#   __epiq_state__ -> __ome_state__
#   EPIQ_* (env)   -> OME_*
#   epiq-global    -> ome-global
#   .epiq (dirs)   -> .ome
#   EpiqApp        -> OmeApp
#   Epiq (word)    -> OME
#   epiq (word)    -> ome   (tool prefix, package name, skills)
# Attribution is protected: ljtn/epiq URLs and LICENSE files are untouched.
set -euo pipefail
cd "$(cd "$(dirname "$0")/../.." && pwd)"

# Text files only, minus attribution.
files=$(git ls-files | grep -vE '(^|/)LICENSE|\.(gif|png|jpg|jpeg|webp|zip|node|wasm)$')

perl -i -pe '
  s{ljtn/epiq}{\x01UPSTREAM_URL\x01}g;
  s{__epiq_state__}{__ome_state__}g;
  s{EPIQ_}{OME_}g;
  s{epiq-global}{ome-global}g;
  s{\.epiq}{\.ome}g;
  s{EpiqApp}{OmeApp}g;
  s{Epiq}{OME}g;
  s{epiq}{ome}g;
  s{\x01UPSTREAM_URL\x01}{ljtn/epiq}g;
' $files

# File and directory names.
git ls-files | grep -iE 'epiq' | while read -r f; do
  nf=$(printf '%s' "$f" | sed -E 's/epiq/ome/g; s/EpiqApp/OmeApp/g; s/\.epiq/\.ome/g')
  if [ "$nf" != "$f" ]; then
    mkdir -p "$(dirname "$nf")"
    git mv "$f" "$nf" || echo "skip: $f"
  fi
done

echo "rename applied"
