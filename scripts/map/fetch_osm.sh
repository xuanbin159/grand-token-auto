#!/bin/bash
# fetch.sh <out.json> <overpass-ql-file> : tries endpoints with retries, rate limited to 2MB/s
OUT="$1"; Q="$2"
UA="grand-token-auto-mapbuilder/1.0 (hobby game; contact via github xuanbin159)"
for attempt in 1 2 3 4 5 6; do
  for ep in https://overpass-api.de/api/interpreter https://maps.mail.ru/osm/tools/overpass/api/interpreter; do
    code=$(curl -s --limit-rate 2m --max-time 400 -A "$UA" -H "Accept: application/json" -o "$OUT.part" -w "%{http_code}" --data-urlencode "data@$Q" "$ep")
    if [ "$code" = "200" ] && head -c 50 "$OUT.part" | grep -q '{'; then mv "$OUT.part" "$OUT"; echo "ok $ep $(wc -c < "$OUT")B"; exit 0; fi
    echo "attempt $attempt $ep -> $code"; sleep 8
  done
done
exit 1
