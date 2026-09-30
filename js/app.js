/* CrownCam — GHABA × ORS Olive Oil · Stylist of the Future
 * Browser-only Stories frame: camera / upload → canvas overlay → 1080×1920 PNG.
 */
(() => {
  "use strict";

  const W = 1080, H = 1920;
  const $ = (id) => document.getElementById(id);

  const els = {
    stage: $("stage"), video: $("video"), countdown: $("countdown"), empty: $("stage-empty"),
    cameraControls: $("camera-controls"), photoControls: $("photo-controls"),
    btnCamera: $("btn-camera"), btnFlip: $("btn-flip"), btnShutter: $("btn-shutter"), btnTimer: $("btn-timer"),
    btnRetake: $("btn-retake"), btnMirror: $("btn-mirror"), file: $("file-input"),
    name: $("name"),
    crownToggle: $("crown-toggle"), crownY: $("crown-y"), crownPosField: $("crown-pos-field"), crownStatus: $("crown-status"),
    crownSize: $("crown-size"), crownSizeField: $("crown-size-field"), zoom: $("zoom"), zoomRow: $("zoom-row"),
    btnDownload: $("btn-download"), btnShare: $("btn-share"), btnHelp: $("btn-help"), help: $("help"), toast: $("toast"),
  };
  const ctx = els.stage.getContext("2d", { alpha: false });

  // ---------- Themes ----------
  const THEMES = {
    olive: { scrimBottom: "rgba(8,20,12,0.92)", accent: "#C9A227", accent2: "#E5C65A",
             text: "#F7F1E1", muted: "rgba(247,241,225,0.72)",
             leaf: "#C9A227", leafVein: "#7BA05B", frame: "rgba(201,162,39,0.85)" },
    gold:  { scrimBottom: "rgba(0,0,0,0.92)", accent: "#E5C65A", accent2: "#F3DE8A",
             text: "#FFFFFF", muted: "rgba(255,255,255,0.7)",
             leaf: "#E5C65A", leafVein: "#B8891E", frame: "rgba(229,198,90,0.9)" },
    ivory: { scrimBottom: "rgba(245,239,224,0.94)", accent: "#2E5A2A", accent2: "#7A5C0E",
             text: "#17301B", muted: "rgba(23,48,27,0.7)",
             leaf: "#7BA05B", leafVein: "#2E5A2A", frame: "rgba(46,90,42,0.85)" },
    // Kente: woven-strip border in Ghana's kente colours, bold and celebratory.
    kente: { scrimBottom: "rgba(10,10,10,0.9)", accent: "#C9A227", accent2: "#F2C230",
             text: "#FFFFFF", muted: "rgba(255,255,255,0.75)",
             leaf: "#F2C230", leafVein: "#006B3F", frame: "rgba(242,194,48,0.9)", border: "kente" },
    // Noir: black-and-white portrait, gold type. Editorial.
    noir:  { scrimBottom: "rgba(0,0,0,0.94)", accent: "#D4AF37", accent2: "#D4AF37",
             text: "#FFFFFF", muted: "rgba(255,255,255,0.7)",
             leaf: "#D4AF37", leafVein: "#8A6D1E", frame: "rgba(255,255,255,0.75)", grade: "mono" },
    // Golden Hour: warm sunset grade, amber and cream.
    golden:{ scrimBottom: "rgba(58,20,8,0.93)", accent: "#F2994A", accent2: "#FFD27A",
             text: "#FFF6E6", muted: "rgba(255,246,230,0.75)",
             leaf: "#FFD27A", leafVein: "#C8651B", frame: "rgba(255,210,122,0.85)", grade: "warm" },
  };
  const KENTE = ["#C9A227", "#C8102E", "#006B3F", "#111111"];

  // ---------- State ----------
  const state = {
    mode: "empty",            // empty | camera | photo
    source: null,             // HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
    srcW: 0, srcH: 0,
    mirror: false,
    facing: "user",
    stream: null,
    timer: false,
    theme: "olive",
    name: "",
    crown: true,
    crownY: 0.26,             // manual placement, fraction of H (base of crown)
    zoom: 0,                  // 0 = whole photo visible (fit), 1 = photo fills the frame (cover)
    crownScale: 1,            // user size multiplier
    face: null,               // smoothed head pose in canvas px: {x, y, w, angle} (crown base centre, head width, roll)
    faceRaw: null,            // latest detected pose
    lastSeen: 0,              // time the head was last detected (camera mode)
    tracker: null,            // MediaPipe FaceLandmarker once loaded
    trackerStatus: "loading", // loading | ready | unavailable
    lastVideoTime: -1,
    raf: 0,
    logos: { orsLockup: null, ghaba: null, orsMark: null },
    tinted: new Map(),
  };

  // ---------- Utilities ----------
  let toastTimer = 0;
  function toast(msg, ms = 2400) {
    els.toast.textContent = msg; els.toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove("show"), ms);
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function coverTransform(sw, sh) {
    // Scale + offset so the source covers the W×H canvas (centered).
    const s = Math.max(W / sw, H / sh);
    return { s, dx: (W - sw * s) / 2, dy: (H - sh * s) / 2 };
  }

  // Where the photo sits on the canvas: between "whole photo visible" (zoom 0) and "fills the frame" (zoom 1).
  // Cameras rarely deliver 9:16, so filling the frame crops the sides or top; fitting shows everything.
  function photoTransform(sw, sh) {
    const fit = Math.min(W / sw, H / sh), fill = Math.max(W / sw, H / sh);
    const s = lerp(fit, fill, state.zoom);
    return { s, dx: (W - sw * s) / 2, dy: (H - sh * s) / 2 };
  }

  // Soft backdrop behind a fitted photo: the same image shrunk to a few pixels and stretched back up.
  // Cheap enough for every video frame and works in every browser (no canvas filter needed).
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = 27; blurCanvas.height = 48;
  const blurCtx = blurCanvas.getContext("2d");
  function drawBackdrop(src, sw, sh) {
    const { s, dx, dy } = coverTransform(sw, sh);
    blurCtx.drawImage(src, dx / W * 27, dy / H * 48, sw * s / W * 27, sh * s / H * 48);
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(blurCanvas, 0, 0, W, H);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function fitFont(text, family, weight, maxPx, minPx, maxWidth, style = "") {
    let px = maxPx;
    while (px > minPx) {
      ctx.font = `${style} ${weight} ${px}px ${family}`.trim();
      if (ctx.measureText(text).width <= maxWidth) break;
      px -= 2;
    }
    ctx.font = `${style} ${weight} ${px}px ${family}`.trim();
    return px;
  }

  function spacedText(text, x, y, spacing, align = "center") {
    // Letter-spaced text (canvas letterSpacing is not universal yet).
    const chars = [...text];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
    const prevAlign = ctx.textAlign; ctx.textAlign = "left";
    chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + spacing; });
    ctx.textAlign = prevAlign;
    return total;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- Drawing: photo ----------
  function drawPhoto() {
    ctx.fillStyle = "#0b120d"; ctx.fillRect(0, 0, W, H);
    const src = state.source; if (!src) return;
    const sw = state.srcW, sh = state.srcH; if (!sw || !sh) return;
    const { s, dx, dy } = photoTransform(sw, sh);
    ctx.save();
    if (state.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    if (sw * s < W - 1 || sh * s < H - 1) drawBackdrop(src, sw, sh);
    ctx.drawImage(src, dx, dy, sw * s, sh * s);
    ctx.restore();
    // Photo grade via composite ops (supported in every browser, including Safari).
    const grade = THEMES[state.theme].grade;
    if (grade) {
      ctx.save();
      if (grade === "mono") {
        ctx.globalCompositeOperation = "saturation"; ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(0, 0, W, H);
      } else if (grade === "warm") {
        ctx.globalCompositeOperation = "soft-light"; ctx.fillStyle = "rgba(255,140,40,0.55)"; ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W * 0.8, H * 0.1, 0, W * 0.8, H * 0.1, H * 0.7);
        g.addColorStop(0, "rgba(255,190,90,0.35)"); g.addColorStop(1, "rgba(255,190,90,0)");
        ctx.globalCompositeOperation = "screen"; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }
  }

  // ---------- Drawing: crown ----------
  function drawLeaf(x, y, len, wid, angle, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.5, wid, 0, 0);
    ctx.closePath();
    ctx.fillStyle = t.leaf; ctx.fill();
    ctx.strokeStyle = t.leafVein; ctx.lineWidth = Math.max(1.5, wid * 0.12);
    ctx.beginPath(); ctx.moveTo(len * 0.1, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke();
    ctx.restore();
  }

  function drawCrown(x, y, width, angle, t) {
    // Two olive branches meeting at the top, forming a laurel. (x, y) is the centre of the crown's base.
    const r = width / 2, cx = 0, cy = 0;
    const leafLen = r * 0.30, leafWid = leafLen * 0.34;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    for (const side of [-1, 1]) {
      // stem arc from side-bottom (angle ~ 165°) to top (angle ~ 95°)
      const a0 = Math.PI * (side < 0 ? 1.0 : 0.0), a1 = Math.PI * 0.5;
      ctx.strokeStyle = t.leafVein; ctx.lineWidth = Math.max(3, r * 0.03); ctx.lineCap = "round";
      ctx.beginPath();
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const a = lerp(a0, a1 + side * 0.08, i / steps);
        const px = cx + Math.cos(a) * r, py = cy - Math.sin(a) * r * 0.62;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = lerp(a0 + side * 0.02, a1 + side * 0.18, (i + 0.5) / n);
        const px = cx + Math.cos(a) * r, py = cy - Math.sin(a) * r * 0.62;
        // tangent direction along the arc toward the top
        const tang = Math.atan2(-Math.cos(a) * r * 0.62 * -1 * side, -Math.sin(a) * r * side);
        const scale = 0.75 + 0.25 * Math.sin((i + 1) / n * Math.PI);
        drawLeaf(px, py, leafLen * scale, leafWid * scale, tang - 0.55 * side, t);
        drawLeaf(px, py, leafLen * scale * 0.9, leafWid * scale * 0.9, tang + 0.55 * side, t);
      }
    }
    // small gold berry at the apex
    ctx.fillStyle = t.leaf; ctx.beginPath(); ctx.arc(cx, cy - r * 0.62 - leafLen * 0.05, leafWid * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------- Drawing: kente border ----------
  function drawKenteBorder() {
    const band = 34, block = 56;
    const colours = ["#F2C230", "#C8102E", "#006B3F", "#111111", "#F2C230", "#006B3F"];
    const strip = (x, y, w, h, vertical) => {
      const len = vertical ? h : w, n = Math.ceil(len / block);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = colours[i % colours.length];
        if (vertical) ctx.fillRect(x, y + i * block, w, block + 0.5); else ctx.fillRect(x + i * block, y, block + 0.5, h);
        // woven detail: thin cross-threads
        ctx.fillStyle = i % 2 ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.25)";
        for (let k = 1; k < 4; k++) {
          if (vertical) ctx.fillRect(x, y + i * block + k * (block / 4) - 2, w, 4);
          else ctx.fillRect(x + i * block + k * (block / 4) - 2, y, 4, h);
        }
      }
    };
    strip(0, 0, band, H, true); strip(W - band, 0, band, H, true);
    strip(0, 0, W, band, false); strip(0, H - band, W, band, false);
  }

  // ---------- Drawing: brand marks ----------
  // Returns the ORS mark recoloured to `color` at height `h` (cached).
  function tintedMark(color, h) {
    const img = state.logos.orsMark; if (!img) return null;
    const key = color + "|" + h;
    if (state.tinted.has(key)) return state.tinted.get(key);
    const w = Math.round(h * (img.width / img.height));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0, w, h);
    x.globalCompositeOperation = "source-in"; x.fillStyle = color; x.fillRect(0, 0, w, h);
    state.tinted.set(key, c);
    return c;
  }

  // "GHABA × ORS OLIVE OIL" lockup, centred on (cx, cy).
  function drawLockup(cx, cy, t) {
    ctx.save();
    ctx.textBaseline = "middle";
    const gap = 34;
    // Left: GHABA (logo if supplied, else wordmark)
    let ghabaW, ghabaDraw;
    if (state.logos.ghaba) {
      const lg = state.logos.ghaba, lh = 92, lw = lh * (lg.width / lg.height);
      ghabaW = lw; ghabaDraw = (x) => ctx.drawImage(lg, x, cy - lh / 2, lw, lh);
    } else {
      ctx.font = "800 50px Inter, sans-serif";
      const letters = [..."GHABA"], sp = 6;
      ghabaW = letters.reduce((a, c) => a + ctx.measureText(c).width, 0) + sp * (letters.length - 1);
      ghabaDraw = (x) => { ctx.fillStyle = t.text; ctx.font = "800 50px Inter, sans-serif"; spacedText("GHABA", x, cy + 2, sp, "left"); };
    }
    // Right: ORS Olive Oil (official lockup if supplied, else ORS mark + OLIVE OIL)
    let orsW, orsDraw;
    if (state.logos.orsLockup) {
      const lg = state.logos.orsLockup, lh = 110, lw = lh * (lg.width / lg.height);
      orsW = lw; orsDraw = (x) => ctx.drawImage(lg, x, cy - lh / 2, lw, lh);
    } else {
      const markH = 74, mark = tintedMark(t.text, markH);
      const markW = mark ? mark.width : 150;
      ctx.font = "700 21px Inter, sans-serif";
      const sub = "OLIVE OIL", sp = 7;
      const subW = [...sub].reduce((a, c) => a + ctx.measureText(c).width, 0) + sp * (sub.length - 1);
      orsW = Math.max(markW, subW);
      orsDraw = (x) => {
        const mx = x + (orsW - markW) / 2, top = cy - (markH + 30) / 2;
        if (mark) ctx.drawImage(mark, mx, top);
        else { ctx.fillStyle = t.text; ctx.font = "800 70px 'Playfair Display', serif"; ctx.textAlign = "center"; ctx.fillText("ORS", x + orsW / 2, top + markH / 2); ctx.textAlign = "left"; }
        ctx.fillStyle = t.accent2; ctx.font = "700 21px Inter, sans-serif";
        spacedText(sub, x + orsW / 2, top + markH + 22, sp, "center");
      };
    }
    ctx.font = "300 46px Inter, sans-serif";
    const xW = ctx.measureText("×").width;
    const total = ghabaW + gap + xW + gap + orsW;
    let x = cx - total / 2;
    ghabaDraw(x); x += ghabaW + gap;
    ctx.fillStyle = t.muted; ctx.font = "300 46px Inter, sans-serif"; ctx.textAlign = "left"; ctx.fillText("×", x, cy); x += xW + gap;
    orsDraw(x);
    ctx.restore();
  }

  // ---------- Drawing: overlay ----------
  function drawOverlay() {
    const t = THEMES[state.theme];
    const M = 44; // inner frame margin

    // Crown first, so the frame and title sit on top of any part that runs off the head.
    if (state.crown) {
      const pose = crownPose();
      if (pose) drawCrown(pose.x, pose.y, pose.w, pose.angle, t);
    }

    // Bottom scrim only; the top of the frame stays clear for the head and crown.
    const g = ctx.createLinearGradient(0, H * 0.6, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, t.scrimBottom.replace(/[\d.]+\)$/, "0.7)")); g.addColorStop(1, t.scrimBottom);
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.6, W, H * 0.4);

    if (t.border === "kente") drawKenteBorder();

    // Inner frame with corner ticks
    ctx.strokeStyle = t.frame; ctx.lineWidth = 3;
    roundRect(M, M, W - 2 * M, H - 2 * M, 28); ctx.stroke();
    ctx.lineWidth = 8; const tick = 70;
    for (const [x, y, sx, sy] of [[M, M, 1, 1], [W - M, M, -1, 1], [M, H - M, 1, -1], [W - M, H - M, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x + sx * 28, y); ctx.lineTo(x + sx * tick, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + sy * 28); ctx.lineTo(x, y + sy * tick); ctx.stroke();
    }

    // Bottom block: name, title, kente stripe, GHABA × ORS Olive Oil lockup.
    const cxT = W / 2;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const name = state.name.trim();
    if (name) {
      ctx.fillStyle = t.text;
      fitFont(name, "'Playfair Display', serif", 800, 112, 56, W - 2 * (M + 50), "italic");
      ctx.fillText(name, cxT, H - 440);
    }
    ctx.fillStyle = t.accent2; ctx.font = "700 34px Inter, sans-serif";
    spacedText("STYLIST OF THE FUTURE", cxT, H - 345, 9);

    const kw = 360, kx0 = cxT - kw / 2, ky = H - 290, seg = kw / 12;
    for (let i = 0; i < 12; i++) { ctx.fillStyle = KENTE[i % 4]; ctx.fillRect(kx0 + i * seg, ky, seg + 0.5, 8); }

    drawLockup(cxT, H - 175, t);
  }

  // Where to draw the crown: the tracked head, or the manual position.
  function crownPose() {
    const k = state.crownScale;
    if (state.face) {
      const f = state.face;
      return { x: f.x, y: f.y, w: f.w * 1.42 * k, angle: f.angle };
    }
    if (state.mode === "camera" && state.trackerStatus === "ready") return null; // tracking but no head in view
    return { x: W / 2, y: H * state.crownY + W * 0.2, w: W * 0.6 * k, angle: 0 };
  }

  function render() { drawPhoto(); drawOverlay(); }

  // ---------- Head tracking (MediaPipe Face Landmarker) ----------
  const MP_VERSION = "1.0.1";
  const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
  const MP_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  // Face-mesh landmark indices.
  const LM = { forehead: 10, chin: 152, faceLeft: 234, faceRight: 454, eyeA: 33, eyeB: 263 };

  async function initTracker() {
    state.trackerStatus = "loading"; updateCrownUI();
    try {
      const vision = await import(`${MP_BASE}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const make = (delegate) => vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP_MODEL, delegate },
        runningMode: "VIDEO", numFaces: 1,
        minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      try { state.tracker = await make("GPU"); } catch { state.tracker = await make("CPU"); }
      state.trackerStatus = "ready";
      if (state.mode === "photo") { detectStill(); render(); }
    } catch (err) {
      console.warn("Head tracking unavailable:", err);
      state.trackerStatus = "unavailable";
    }
    updateCrownUI();
  }

  // Convert normalised landmarks on the current source into a crown pose in canvas px.
  function poseFromLandmarks(lm) {
    const { s, dx, dy } = photoTransform(state.srcW, state.srcH);
    const P = (i) => {
      let x = dx + lm[i].x * state.srcW * s; const y = dy + lm[i].y * state.srcH * s;
      if (state.mirror) x = W - x;
      return { x, y };
    };
    const top = P(LM.forehead), chin = P(LM.chin), fl = P(LM.faceLeft), fr = P(LM.faceRight);
    let e1 = P(LM.eyeA), e2 = P(LM.eyeB);
    if (e1.x > e2.x) [e1, e2] = [e2, e1];
    const faceW = Math.hypot(fr.x - fl.x, fr.y - fl.y);
    const faceH = Math.hypot(top.x - chin.x, top.y - chin.y);
    const ux = (top.x - chin.x) / (faceH || 1), uy = (top.y - chin.y) / (faceH || 1); // "up" along the head
    // Base of the laurel sits at temple height, so the branches wrap the sides of the head and meet above it.
    const drop = faceH * 0.16;
    return { x: top.x - ux * drop, y: top.y - uy * drop, w: faceW, angle: Math.atan2(e2.y - e1.y, e2.x - e1.x) };
  }

  function detectVideo() {
    const v = els.video;
    if (!state.tracker || v.readyState < 2 || v.currentTime === state.lastVideoTime) return;
    state.lastVideoTime = v.currentTime;
    try {
      const res = state.tracker.detectForVideo(v, performance.now());
      if (res.faceLandmarks && res.faceLandmarks.length) {
        state.faceRaw = poseFromLandmarks(res.faceLandmarks[0]);
        state.lastSeen = performance.now();
      } else if (performance.now() - state.lastSeen > 500) {
        state.faceRaw = null;
      }
    } catch (err) { console.warn(err); }
  }

  function detectStill() {
    state.face = null; state.faceRaw = null;
    if (!state.tracker || !state.source) { updateCrownUI(); return; }
    try {
      // In video mode the tracker first looks where the previous face was; a new photo can need a second pass.
      for (let i = 0; i < 3 && !state.face; i++) {
        const res = state.tracker.detectForVideo(state.source, performance.now() + i);
        if (res.faceLandmarks && res.faceLandmarks.length) { state.faceRaw = poseFromLandmarks(res.faceLandmarks[0]); state.face = { ...state.faceRaw }; }
      }
    } catch (err) { console.warn(err); }
    updateCrownUI();
  }

  function smoothFace() {
    const r = state.faceRaw;
    if (!r) { state.face = null; return; }
    const f = state.face;
    if (!f) { state.face = { ...r }; return; }
    const k = 0.45;
    state.face = { x: lerp(f.x, r.x, k), y: lerp(f.y, r.y, k), w: lerp(f.w, r.w, k), angle: lerp(f.angle, r.angle, 0.35) };
  }

  let lastStatus = "";
  function updateCrownUI() {
    const tracking = state.trackerStatus === "ready";
    const found = !!state.face;
    els.crownPosField.hidden = !state.crown || (tracking && (found || state.mode === "camera"));
    els.crownSizeField.hidden = !state.crown;
    const status = !state.crown ? "" :
      state.trackerStatus === "loading" ? "Loading head tracking…" :
      state.trackerStatus === "unavailable" ? "Head tracking is off here. Place the crown with the slider." :
      found ? "Crown is following your head." : state.mode === "camera" ? "Look at the camera to place the crown." : "No face found. Place the crown with the slider.";
    if (status !== lastStatus) { els.crownStatus.textContent = status; lastStatus = status; }
  }

  // ---------- Camera ----------
  async function startCamera() {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        // Ask for the sensor's full 4:3 picture. A 1080p (16:9) request makes many phones crop the sensor,
        // which narrows the view before the app does anything.
        video: { facingMode: state.facing, aspectRatio: { ideal: 4 / 3 }, width: { ideal: 1440 }, height: { ideal: 1080 } },
      });
      state.stream = stream;
      els.video.srcObject = stream;
      await els.video.play();
      state.source = els.video; state.srcW = els.video.videoWidth; state.srcH = els.video.videoHeight;
      state.mirror = state.facing === "user";
      state.mode = "camera"; state.face = null; state.faceRaw = null; state.lastVideoTime = -1;
      setMode("camera");
      loop();
    } catch (err) {
      console.error(err);
      toast(location.protocol === "http:" && location.hostname !== "localhost"
        ? "Camera needs HTTPS. Try uploading a photo instead."
        : "Couldn't open the camera. Check permissions or upload a photo.");
      setMode(state.source ? "photo" : "empty");
    }
  }

  function stopCamera() {
    cancelAnimationFrame(state.raf); state.raf = 0;
    if (state.stream) { state.stream.getTracks().forEach((tr) => tr.stop()); state.stream = null; }
    els.video.srcObject = null;
  }

  function loop() {
    cancelAnimationFrame(state.raf);
    const tick = () => {
      if (state.mode !== "camera") return;
      if (els.video.videoWidth) { state.srcW = els.video.videoWidth; state.srcH = els.video.videoHeight; }
      detectVideo(); smoothFace(); updateCrownUI(); render();
      state.raf = requestAnimationFrame(tick);
    };
    state.raf = requestAnimationFrame(tick);
  }

  async function capture() {
    if (state.mode !== "camera") return;
    if (state.timer) {
      els.countdown.hidden = false;
      for (let n = 3; n > 0; n--) { els.countdown.textContent = n; await new Promise((r) => setTimeout(r, 1000)); }
      els.countdown.hidden = true;
    }
    const off = document.createElement("canvas");
    off.width = els.video.videoWidth; off.height = els.video.videoHeight;
    off.getContext("2d").drawImage(els.video, 0, 0);
    cancelAnimationFrame(state.raf);
    stopCamera();
    state.source = off; state.srcW = off.width; state.srcH = off.height;
    const livePose = state.face;
    state.mode = "photo"; setMode("photo");
    detectStill();
    if (!state.face && livePose) { state.face = livePose; state.faceRaw = { ...livePose }; } // keep the live pose if the still misses
    updateCrownUI(); render();
    toast("Captured. Add your name and save.");
  }

  // ---------- Upload ----------
  function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) { toast("Please choose an image file."); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      stopCamera();
      state.source = img; state.srcW = img.naturalWidth; state.srcH = img.naturalHeight;
      state.mirror = false; els.btnMirror.setAttribute("aria-pressed", "false");
      state.mode = "photo";
      setMode("photo");
      detectStill(); render();
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast("Couldn't read that image."); };
    img.src = url;
  }

  // ---------- UI mode ----------
  function setMode(mode) {
    state.mode = mode;
    els.empty.hidden = mode !== "empty";
    els.cameraControls.hidden = mode !== "camera";
    els.photoControls.hidden = mode !== "photo";
    els.zoomRow.hidden = mode === "empty";
    els.btnDownload.disabled = mode !== "photo";
    els.btnShare.disabled = mode !== "photo";
    updateCrownUI();
  }

  // ---------- Export ----------
  function fileName() {
    const slug = (state.name.trim() || "stylist").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return `crowncam-${slug || "stylist"}.png`;
  }
  function toBlob() {
    render();
    return new Promise((resolve) => els.stage.toBlob(resolve, "image/png"));
  }
  async function download() {
    if (state.mode !== "photo") return;
    const blob = await toBlob(); if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("Saved. Open your gallery and post to Stories.");
  }
  async function share() {
    if (state.mode !== "photo") return;
    const blob = await toBlob(); if (!blob) return;
    const file = new File([blob], fileName(), { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "GHABA × ORS Olive Oil · Stylist of the Future", text: "#StylistOfTheFuture" });
      } catch (err) { if (err && err.name !== "AbortError") download(); }
    } else download();
  }

  // ---------- Persistence ----------
  const LS = "crowncam.v1";
  function save() {
    try { localStorage.setItem(LS, JSON.stringify({ name: state.name, theme: state.theme })); } catch {}
  }
  function restore() {
    try {
      const d = JSON.parse(localStorage.getItem(LS) || "{}");
      if (d.name) { state.name = d.name; els.name.value = d.name; }
      if (d.theme && THEMES[d.theme]) { state.theme = d.theme; const r = document.querySelector(`input[name=theme][value=${d.theme}]`); if (r) r.checked = true; }
    } catch {}
  }

  // ---------- Optional brand logos ----------
  function loadLogo(key, src) {
    const img = new Image();
    img.onload = () => { state.logos[key] = img; state.tinted.clear(); if (state.mode !== "camera") render(); };
    img.onerror = () => {};
    img.src = src;
  }

  // ---------- Events ----------
  els.btnCamera.addEventListener("click", startCamera);
  els.btnFlip.addEventListener("click", () => { state.facing = state.facing === "user" ? "environment" : "user"; startCamera(); });
  els.btnShutter.addEventListener("click", capture);
  els.btnTimer.addEventListener("click", () => { state.timer = !state.timer; els.btnTimer.setAttribute("aria-pressed", String(state.timer)); });
  els.btnRetake.addEventListener("click", startCamera);
  els.btnMirror.addEventListener("click", () => {
    state.mirror = !state.mirror; els.btnMirror.setAttribute("aria-pressed", String(state.mirror));
    const flip = (p) => p && Object.assign(p, { x: W - p.x, angle: -p.angle });
    flip(state.face); if (state.faceRaw !== state.face) flip(state.faceRaw);
    render();
  });
  els.file.addEventListener("change", (e) => { loadFile(e.target.files[0]); e.target.value = ""; });

  for (const key of ["name"]) {
    els[key].addEventListener("input", () => { state[key] = els[key].value; save(); if (state.mode === "photo") render(); });
  }
  document.querySelectorAll("input[name=theme]").forEach((r) => r.addEventListener("change", () => {
    state.theme = r.value; save(); if (state.mode === "photo") render();
  }));
  els.crownToggle.addEventListener("change", () => { state.crown = els.crownToggle.checked; updateCrownUI(); if (state.mode === "photo") render(); });
  els.crownY.addEventListener("input", () => { state.crownY = parseFloat(els.crownY.value); if (state.mode === "photo") render(); });
  els.crownSize.addEventListener("input", () => { state.crownScale = parseFloat(els.crownSize.value); if (state.mode === "photo") render(); });
  els.zoom.addEventListener("input", () => {
    // The crown pose is stored in canvas pixels, so re-map it to the new zoom.
    const before = state.source ? photoTransform(state.srcW, state.srcH) : null;
    state.zoom = parseFloat(els.zoom.value);
    if (before && state.face) {
      const after = photoTransform(state.srcW, state.srcH);
      const remap = (p) => {
        if (!p) return;
        const k = after.s / before.s;
        const x0 = state.mirror ? W - p.x : p.x;
        const x1 = after.dx + (x0 - before.dx) * k;
        p.x = state.mirror ? W - x1 : x1;
        p.y = after.dy + (p.y - before.dy) * k;
        p.w *= k;
      };
      remap(state.face); if (state.faceRaw !== state.face) remap(state.faceRaw);
    }
    if (state.mode === "photo") render();
  });
  els.btnDownload.addEventListener("click", download);
  els.btnShare.addEventListener("click", share);
  els.btnHelp.addEventListener("click", () => els.help.showModal());

  // Drag & drop upload onto the stage
  const frame = els.stage.parentElement;
  frame.addEventListener("dragover", (e) => { e.preventDefault(); });
  frame.addEventListener("drop", (e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });

  window.addEventListener("pagehide", stopCamera);
  document.addEventListener("visibilitychange", () => { if (document.hidden && state.mode === "camera") { stopCamera(); setMode(state.source && state.source !== els.video ? "photo" : "empty"); } });

  // ---------- Boot ----------
  function boot() {
    restore();
    initTracker();
    loadLogo("orsMark", "assets/ors-mark.svg");
    loadLogo("orsLockup", "assets/ors-olive-oil-logo.png"); // optional official lockup overrides the drawn one
    loadLogo("ghaba", "assets/ghaba-logo.png");
    if (navigator.share) els.btnShare.hidden = false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      els.btnCamera.disabled = true; els.btnCamera.textContent = "Camera unavailable";
    }
    setMode("empty");
    // Placeholder render so the stage isn't black behind the empty state.
    render();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (state.mode === "photo") render(); });
    }
  }
  boot();

  // Expose a tiny hook for testing.
  window.CrownCam = { state, render, loadFile, detectStill };
})();
