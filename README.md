# Rel3ase

Welcome to Rel3ase, an open source video ad creator from the team at [Twofold Records](https://twofoldrecords.com).

This is an open source, free to use, self-hosted tool for preparing ads for social media. It uses a browser-based
editor for assembling 10-second social video ads and FFMpeg when generating ads. It means you don't need a
subscription to paid services.

## Run locally

Requires Node.js 24 or later.

```sh
npm install
npm run dev
```

Run the linter with `npm run lint`, the test suite with `npm test` or create a static production build
with `npm run build`.

## Browser-only processing

Files are staged, previewed and encoded in the browser session. Nothing is uploaded to any server. Behind the scenes,
FFMpeg is used to encode output videos to MP4 (using the H264 codec).

## GitHub Pages

The GitHub Actions workflow in `.github/workflows/deploy.yml` builds the app and publishes it to GitHub Pages when
changes are pushed to `main`.
