# CrownCam — GHABA × ORS Olive Oil · Stylist of the Future

A browser-based AR photo frame for ORS Olive Oil Ghana's **GHABA × ORS "Stylist of the Future"** programme.
Stylists open it on their phone, take a selfie or upload a work photo, type their name, and save a
1080 × 1920 image ready for Instagram, WhatsApp or TikTok Stories.

No app install, no backend, nothing uploaded — the camera feed and the final image never leave the phone.

## What it does

1. **Start** — one button opens the camera (or upload a photo instead).
2. **Scan** — when a face is found, a gold scan sweeps it and a 3D olive wreath spins down onto the head. Leaves
   of different sizes pop in from the back to the front, olives appear, and it lands with a sparkle burst. The
   reveal takes about four seconds; tap the picture to replay it.
3. **Pose** — the wreath is a real 3D ring around the head: it turns with the head (yaw), nods with it (pitch) and
   tilts with it (roll), and the near side covers the far side.
4. **Look** — pick one of six looks: Olive, Gold, Ivory, Kente, Noir (black-and-white) or Golden (warm grade).
5. **Save** — after the shot, add your name and tap **Save to Stories** (PNG, 1080 × 1920), or **Share** on phones
   that support it. The saved image shows the finished wreath.

Other details:

- The camera is asked for its full 4:3 picture, and the whole photo is shown with a soft blurred fill. The corner
  button switches to filling the 9:16 frame.
- The frame keeps text light: name, "Stylist of the Future", a kente stripe and the GHABA × ORS Olive Oil lockup.
- If no face is found in an uploaded photo, drag the wreath into place and set its size with the slider.
- Name and chosen look are remembered on the device.

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
