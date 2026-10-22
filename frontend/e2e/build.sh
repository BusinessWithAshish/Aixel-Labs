#!/usr/bin/env bash
# Production build the e2e servers run (`next start`), in .next-e2e so it never meets `next dev`'s .next.
# A build takes ~2 min on the VPS, so it is skipped while the app source (frontend minus e2e/, plus
# backend/src it imports) is the same as at the last build. FORCE=1 rebuilds anyway.
set -euo pipefail
cd "$(dirname "$0")/.."

DIST=.next-e2e
paths=(. ../backend/src ':!e2e')
stamp=$(
    {
        git ls-files -s -- "${paths[@]}"
        git diff -- "${paths[@]}"
        git ls-files -o --exclude-standard -z -- "${paths[@]}" | xargs -0 -r sha1sum
    } | sha1sum
)

if [[ "${FORCE:-}" != 1 && -f "$DIST/BUILD_ID" && "$(cat "$DIST/e2e-source-stamp" 2>/dev/null)" == "$stamp" ]]; then
    echo "e2e build is up to date ($DIST)"
    exit 0
fi

NEXT_DIST_DIR="$DIST" pnpm exec next build
echo "$stamp" > "$DIST/e2e-source-stamp"
