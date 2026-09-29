# CrownCam — GHABA × ORS Olive Oil · Stylist of the Future

A browser-based AR photo frame for ORS Olive Oil Ghana's **GHABA × ORS "Stylist of the Future"** programme.
Stylists open it on their phone, take a selfie or upload a work photo, type their name, and save a
1080 × 1920 image ready for Instagram, WhatsApp or TikTok Stories.

No app install, no backend, nothing uploaded — the camera feed and the final image never leave the phone.

## What it does

- **Live camera** (front/back, 3-second timer, mirror) or **photo upload**.
- **Frame overlay**: "GHABA × ORS" wordmark with a kente-inspired stripe, "Stylist of the Future" title,
  the stylist's name, and an ORS Olive Oil sign-off with the hashtag.
- **Olive-leaf crown** that follows the face where the browser supports face detection
  (Chrome/Edge on Android; Safari falls back to a manual position slider).
- **Six looks**: Olive, Gold, Ivory, Kente (woven kente-strip border), Noir (black-and-white portrait with gold
  type) and Golden Hour (warm sunset grade). Photo grades use canvas blend modes, so they work in Safari too.
- **Save for Stories** (PNG, 9:16) and native **Share** on phones that support it.
- Remembers the name and chosen look on the device for repeat use.

## Run it

It is a static site. Any of these work:

```bash
# Python
python3 -m http.server 8080
# or Node
npx serve .
```

Then open `http://localhost:8080`. Camera access requires HTTPS or `localhost`.

## Deploy

Pushing to `main` deploys to GitHub Pages via `.github/workflows/pages.yml` (enable Pages → Source: GitHub Actions in
the repo settings). Any static host (Netlify, Vercel, Cloudflare Pages, S3) works too — just upload the folder.

## Brand assets

The wordmarks are drawn in code so the app works with zero assets. To use the official logos instead, drop these
files in `assets/` and the app picks them up automatically (falls back to text if missing):

| File | Used for |
|---|---|
| `assets/ors-logo.png` | ORS Olive Oil lock-up, bottom-left of the frame (white/transparent version recommended) |
| `assets/ghaba-logo.png` | GHABA logo, top band (replaces the "GHABA" text) |

## Project layout

```
index.html            app shell
css/styles.css        UI styling
js/app.js             camera, face detection, canvas renderer, export
assets/icon.svg       app icon
manifest.webmanifest  PWA manifest (Add to Home Screen)
```

## Browser support

Chrome / Edge / Samsung Internet on Android, Safari on iOS 15+, and desktop browsers. Face detection uses the
Shape Detection API where available; everything else works everywhere.
