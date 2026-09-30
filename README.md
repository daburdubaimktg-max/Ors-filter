# CrownCam — GHABA × ORS Olive Oil · Stylist of the Future

A browser-based AR photo frame for ORS Olive Oil Ghana's **GHABA × ORS "Stylist of the Future"** programme.
Stylists open it on their phone, take a selfie or upload a work photo, type their name, and save a
1080 × 1920 image ready for Instagram, WhatsApp or TikTok Stories.

No app install, no backend, nothing uploaded — the camera feed and the final image never leave the phone.

## What it does

- **Live camera** (front/back, 3-second timer, mirror) or **photo upload**.
- **Frame overlay**, kept light: the stylist's name, "Stylist of the Future", a kente stripe, and a
  "GHABA × ORS Olive Oil" lockup using the official ORS mark. The top of the frame stays clear for the head.
- **Olive-leaf crown with head tracking.** MediaPipe Face Landmarker follows the head live in the camera and
  finds it in uploaded photos. The crown sizes itself to the head, sits at temple height, and tilts with it.
  A size slider fine-tunes the fit. If tracking can't load, a position slider places the crown by hand.
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

`assets/ors-mark.svg` is the ORS wordmark with the olive-drop "O", taken from the header logo on
orshaircare.com. The app recolours it to suit each look and sets "OLIVE OIL" beneath it.

Optional files the app picks up automatically if you add them:

| File | Used for |
|---|---|
| `assets/ors-olive-oil-logo.png` | Official ORS Olive Oil lockup; replaces the drawn mark + "OLIVE OIL" (transparent PNG) |
| `assets/ghaba-logo.png` | GHABA logo; replaces the "GHABA" text in the bottom lockup |

## Head tracking

The tracker loads on first visit from jsDelivr (`@mediapipe/tasks-vision` 1.0.1, about 11 MB of WebAssembly)
and Google's model host (`face_landmarker.task`, about 3.7 MB); browsers cache both after that. It runs on the
GPU where available and falls back to the CPU. Everything runs on the phone; no image is uploaded.

## Project layout

```
index.html            app shell
css/styles.css        UI styling
js/app.js             camera, face detection, canvas renderer, export
assets/icon.svg       app icon
manifest.webmanifest  PWA manifest (Add to Home Screen)
```

## Browser support

Chrome / Edge / Samsung Internet on Android, Safari on iOS 15+, and desktop browsers. Head tracking needs
WebAssembly and works in all of these.
