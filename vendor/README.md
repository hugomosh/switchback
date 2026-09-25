# Vendored libraries

Kept as plain ES modules so the app still runs from a static server with no
build step, and so `build.mjs` can inline them into the single-file bundle.

| File | What | Source |
| --- | --- | --- |
| `three.module.min.js` | three.js r186 (0.186.1), MIT — `three.LICENSE` | `build/three.module.js` from the npm package, bundled with its `three.core.js` into one file |

Regenerate:

```sh
npm pack three@0.186.1 && tar xzf three-0.186.1.tgz
npx esbuild package/build/three.module.js --bundle --format=esm --minify \
  --legal-comments=none --outfile=vendor/three.module.min.js
```
