#!/usr/bin/env bash
# Optimize a GLB for the web: dedupe, weld, meshopt compression, WebP textures (max 2048).
# Usage: optimize.sh in.glb out.glb [--ktx2]
# --ktx2 needs the `toktx` binary (KTX-Software) on PATH; it gives the best GPU memory use.
set -euo pipefail
IN="$1"; OUT="$2"; MODE="${3:-}"
if [ "$MODE" = "--ktx2" ]; then
  npx -y @gltf-transform/cli optimize "$IN" "$OUT" --compress meshopt --simplify false --palette false --texture-compress ktx2 --texture-size 2048
else
  npx -y @gltf-transform/cli optimize "$IN" "$OUT" --compress meshopt --simplify false --palette false --texture-compress webp --texture-size 2048
fi
# simplify and palette are off: simplification can distort baked lightmap UVs,
# and palette merging would discard the per-object materials the bake relies on.
ls -lh "$IN" "$OUT"
