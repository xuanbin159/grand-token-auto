#!/usr/bin/env bash
# Rebuild assets/runtime/** from scratch: download (2 MB/s) -> process -> headless checks -> manifest.
#   GTA_RAW=/tmp/gta_raw bash scripts/assets/run_all.sh        (raw files default to assets/_raw/, self-ignored)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
export GTA_RAW="${GTA_RAW:-$REPO/assets/_raw}"
[ -d "$HERE/node_modules" ] || npm ci --prefix "$HERE" || npm install --prefix "$HERE"
bash "$HERE/fetch.sh"
mkdir -p "$GTA_RAW/vrm"
for z in "$GTA_RAW"/chars/*.zip; do unzip -oq "$z" -d "$GTA_RAW/vrm"; done
cp "$GTA_RAW"/chars/*.vrm "$GTA_RAW/vrm/"
for z in "$GTA_RAW"/tex/acg/*.zip; do id="$(basename "$z")"; id="${id%%_*}"; mkdir -p "$GTA_RAW/tex/acg/$id"
  unzip -oqj "$z" '*_Color.jpg' '*_NormalGL.jpg' '*_Roughness.jpg' '*_AmbientOcclusion.jpg' '*_Metalness.jpg' '*_Opacity.jpg' '*_Emission.jpg' -d "$GTA_RAW/tex/acg/$id" 2>/dev/null || true; done
node "$HERE/process_vrm.mjs"
node "$HERE/bake_anims.mjs"
node "$HERE/process_textures.mjs"
# only the 1k skies ship (the game never asks for the 2k copies or zhengyang_gate: they stay in the raw download)
mkdir -p "$REPO/assets/runtime/hdri" && for f in "$GTA_RAW"/hdri/*_1k.hdr; do case "$f" in *zhengyang_gate*) ;; *) cp "$f" "$REPO/assets/runtime/hdri/";; esac; done
node "$HERE/gen_trees.mjs"
node "$HERE/process_props.mjs"
node "$HERE/process_props.mjs" --set furniture
node "$HERE/check_vrm.mjs"; node "$HERE/check_anims.mjs"; node "$HERE/check_models.mjs"
node "$HERE/build_manifest.mjs"
