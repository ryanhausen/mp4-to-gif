# MP4 → GIF

Browser-only tool: upload an MP4, set a range on the timeline, export a GIF. Nothing leaves your machine. Encoding uses [gif.js](https://github.com/jnordberg/gif.js) (vendored in `vendor/`).

## Quick start

```bash
python3 -m http.server
# open http://localhost:8000
```

Serve over http; web workers don't run from `file://`. No build step.

## Deploy

Repo Settings → Pages → Source: **GitHub Actions**. Pushes to `main` deploy.
