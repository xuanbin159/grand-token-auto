#!/usr/bin/env bash
# Download raw source assets listed in sources/*.tsv (dest<TAB>url), one at a time, rate-limited to 2 MB/s.
#   GTA_RAW=/path/to/raw bash scripts/assets/fetch.sh [sources/chars.tsv ...]
# Raw files are NOT committed: default dir assets/_raw/ (self-ignored). Existing complete files are skipped.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
RAW="${GTA_RAW:-$REPO/assets/_raw}"; mkdir -p "$RAW"; [ -f "$RAW/.gitignore" ] || echo '*' > "$RAW/.gitignore"
UA="GrandTokenAuto-assets/1.0 (offline build script)"   # Poly Haven asks for a unique User-Agent
LISTS=("$@"); [ ${#LISTS[@]} -eq 0 ] && LISTS=("$HERE"/sources/*.tsv)
fail=0
for L in "${LISTS[@]}"; do
  while IFS=$'\t' read -r dest url; do
    [ -z "${dest// }" ] && continue; case "$dest" in \#*) continue;; esac
    out="$RAW/$dest"; mkdir -p "$(dirname "$out")"
    if [ -s "$out" ] && [ ! -f "$out.part" ]; then continue; fi
    echo "[fetch] $dest"
    for try in 1 2 3 4 5; do
      touch "$out.part"
      if curl -fsSL -A "$UA" --limit-rate 2m --connect-timeout 30 --retry 3 -C - -o "$out" "$url"; then rm -f "$out.part"; break; fi
      echo "  retry $try ($dest)"; sleep 3
    done
    [ -f "$out.part" ] && { echo "  FAILED $dest"; fail=$((fail+1)); }
  done < "$L"
done
echo "fetch done, failures=$fail"
