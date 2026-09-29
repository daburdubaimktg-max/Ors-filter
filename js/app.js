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
    name: $("name"), city: $("city"), salon: $("salon"),
    crownToggle: $("crown-toggle"), crownY: $("crown-y"), crownPosField: $("crown-pos-field"), crownStatus: $("crown-status"),
    btnDownload: $("btn-download"), btnShare: $("btn-share"), btnHelp: $("btn-help"), help: $("help"), toast: $("toast"),
  };
  const ctx = els.stage.getContext("2d", { alpha: false });

  // ---------- Themes ----------
  const THEMES = {
    olive: { scrimTop: "rgba(10,24,14,0.6)", scrimBottom: "rgba(8,20,12,0.92)", accent: "#C9A227", accent2: "#E5C65A",
             text: "#F7F1E1", muted: "rgba(247,241,225,0.72)", topText: "#F7F1E1", topMuted: "rgba(247,241,225,0.72)",
             leaf: "#C9A227", leafVein: "#7BA05B", frame: "rgba(201,162,39,0.85)" },
    gold:  { scrimTop: "rgba(0,0,0,0.55)", scrimBottom: "rgba(0,0,0,0.92)", accent: "#E5C65A", accent2: "#F3DE8A",
             text: "#FFFFFF", muted: "rgba(255,255,255,0.7)", topText: "#FFFFFF", topMuted: "rgba(255,255,255,0.7)",
             leaf: "#E5C65A", leafVein: "#B8891E", frame: "rgba(229,198,90,0.9)" },
    ivory: { scrimTop: "rgba(10,24,14,0.55)", scrimBottom: "rgba(245,239,224,0.94)", accent: "#2E5A2A", accent2: "#C9A227",
             text: "#17301B", muted: "rgba(23,48,27,0.7)", topText: "#F7F1E1", topMuted: "rgba(247,241,225,0.72)",
             leaf: "#7BA05B", leafVein: "#2E5A2A", frame: "rgba(46,90,42,0.85)" },
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
    name: "", city: "", salon: "",
    crown: true,
    crownY: 0.26,             // manual fallback, fraction of H (center of crown)
    face: null,               // smoothed {cx, cy, w, h} in canvas px
    faceRaw: null,
    faceSupported: false,
    detector: null,
    detecting: false,
    lastDetect: 0,
    raf: 0,
    logos: { ors: null, ghaba: null },
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
    const { s, dx, dy } = coverTransform(sw, sh);
    ctx.save();
    if (state.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, dx, dy, sw * s, sh * s);
    ctx.restore();
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

  function drawCrown(cx, cy, width, t) {
    // Two olive branches meeting at the top, forming a laurel.
    const r = width / 2;
    const leafLen = r * 0.30, leafWid = leafLen * 0.34;
    ctx.save();
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

  // ---------- Drawing: overlay ----------
  function drawOverlay() {
    const t = THEMES[state.theme];
    const M = 44; // inner frame margin

    // Scrims
    let g = ctx.createLinearGradient(0, 0, 0, H * 0.28);
    g.addColorStop(0, t.scrimTop); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H * 0.28);
    g = ctx.createLinearGradient(0, H * 0.50, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.55, t.scrimBottom.replace(/[\d.]+\)$/, "0.75)")); g.addColorStop(1, t.scrimBottom);
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.50, W, H * 0.5);

    // Inner frame with corner ticks
    ctx.strokeStyle = t.frame; ctx.lineWidth = 3;
    roundRect(M, M, W - 2 * M, H - 2 * M, 28); ctx.stroke();
    ctx.lineWidth = 8; const tick = 70;
    for (const [x, y, sx, sy] of [[M, M, 1, 1], [W - M, M, -1, 1], [M, H - M, 1, -1], [W - M, H - M, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x + sx * 28, y); ctx.lineTo(x + sx * tick, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + sy * 28); ctx.lineTo(x, y + sy * tick); ctx.stroke();
    }

    // Top band: GHABA × ORS
    ctx.textBaseline = "middle"; ctx.textAlign = "center"; ctx.fillStyle = t.topText;
    if (state.logos.ghaba) {
      const lg = state.logos.ghaba, lh = 84, lw = lh * (lg.width / lg.height);
      ctx.drawImage(lg, W / 2 - lw / 2 - 150, 128 - lh / 2, lw, lh);
      ctx.font = "800 44px Inter, sans-serif"; ctx.fillText("×", W / 2, 128);
      ctx.font = "800 56px 'Playfair Display', serif"; ctx.fillText("ORS", W / 2 + 130, 128);
    } else {
      ctx.font = "800 46px Inter, sans-serif";
      spacedText("GHABA  ×  ORS", W / 2, 128, 8);
    }
    ctx.font = "600 24px Inter, sans-serif"; ctx.fillStyle = t.topMuted;
    spacedText("GHANA HAIRDRESSERS & BEAUTICIANS ASSOCIATION", W / 2, 180, 3);

    // Kente stripe
    const kx0 = 300, kx1 = W - 300, ky = 216, kh = 10;
    const seg = (kx1 - kx0) / 16;
    for (let i = 0; i < 16; i++) { ctx.fillStyle = KENTE[i % 4]; ctx.fillRect(kx0 + i * seg, ky, seg + 0.5, kh); }

    // Crown
    if (state.crown) {
      let cx = W / 2, cy = H * state.crownY, width = W * 0.52;
      if (state.face) {
        const f = state.face;
        width = clamp(f.w * 1.45, 260, W * 0.8);
        cx = f.cx; cy = f.cy - f.h * 0.62;
      }
      // Keep the laurel clear of the header band (top) and the title block (bottom).
      const crownTop = width / 2 * 0.62 + width * 0.16;
      cy = clamp(cy, 250 + crownTop, H - 700);
      drawCrown(cx, cy, width, t);
    }

    // Bottom block
    const cxT = W / 2;
    let y = H - 640;

    ctx.fillStyle = t.accent2; ctx.font = "700 30px Inter, sans-serif";
    spacedText("STYLIST OF THE", cxT, y, 12); y += 92;

    ctx.fillStyle = t.text; ctx.font = "800 190px 'Playfair Display', serif";
    ctx.fillText("FUTURE", cxT, y); y += 118;

    // gold rule with diamond
    ctx.strokeStyle = t.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cxT - 240, y); ctx.lineTo(cxT - 30, y); ctx.moveTo(cxT + 30, y); ctx.lineTo(cxT + 240, y); ctx.stroke();
    ctx.fillStyle = t.accent; ctx.save(); ctx.translate(cxT, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-9, -9, 18, 18); ctx.restore();
    y += 92;

    // Name
    const name = state.name.trim() || "Your Name";
    ctx.fillStyle = state.name.trim() ? t.text : t.muted;
    fitFont(name, "'Playfair Display', serif", 800, 104, 56, W - 2 * (M + 40), "italic");
    ctx.fillText(name, cxT, y); y += 88;

    // City · Ghana with pin
    const city = (state.city.trim() || "Your City").toUpperCase();
    const cityLine = `${city}  ·  GHANA`;
    ctx.font = "700 36px Inter, sans-serif";
    ctx.fillStyle = state.city.trim() ? t.accent2 : t.muted;
    const tw = spacedText(cityLine, cxT + 22, y, 5);
    // pin icon
    const px = cxT + 22 - tw / 2 - 30, py = y;
    ctx.fillStyle = t.accent2;
    ctx.beginPath(); ctx.arc(px, py - 8, 12, Math.PI, 0); ctx.lineTo(px, py + 16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = state.theme === "ivory" ? "#F5EFE0" : "#0b120d";
    ctx.beginPath(); ctx.arc(px, py - 8, 5, 0, Math.PI * 2); ctx.fill();
    y += 62;

    // Salon / handle
    if (state.salon.trim()) {
      ctx.font = "500 32px Inter, sans-serif"; ctx.fillStyle = t.muted; ctx.fillText(state.salon.trim(), cxT, y);
    }

    // Footer row: ORS Olive Oil (left) · hashtag (right)
    const fy = H - 118;
    ctx.textAlign = "left";
    if (state.logos.ors) {
      const lg = state.logos.ors, lh = 96, lw = lh * (lg.width / lg.height);
      ctx.drawImage(lg, M + 40, fy - lh / 2, lw, lh);
    } else {
      ctx.fillStyle = t.text; ctx.font = "800 64px 'Playfair Display', serif"; ctx.textBaseline = "alphabetic";
      ctx.fillText("ORS", M + 40, fy + 8);
      const orsW = ctx.measureText("ORS").width;
      ctx.font = "700 22px Inter, sans-serif"; ctx.fillStyle = t.accent2;
      ctx.textBaseline = "middle";
      spacedText("OLIVE", M + 40 + orsW + 18, fy - 14, 4, "left");
      spacedText("OIL", M + 40 + orsW + 18, fy + 14, 4, "left");
    }
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.font = "600 30px Inter, sans-serif"; ctx.fillStyle = t.muted;
    ctx.fillText("#StylistOfTheFuture", W - M - 40, fy);
    ctx.textAlign = "center";
  }

  function render() { drawPhoto(); drawOverlay(); }

  // ---------- Face detection ----------
  async function initDetector() {
    if (!("FaceDetector" in window)) { state.faceSupported = false; return; }
    try {
      state.detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      state.faceSupported = true;
    } catch { state.faceSupported = false; }
    updateCrownUI();
  }

  function faceToCanvas(box) {
    const { s, dx, dy } = coverTransform(state.srcW, state.srcH);
    let cx = dx + (box.x + box.width / 2) * s;
    const cy = dy + (box.y + box.height / 2) * s;
    if (state.mirror) cx = W - cx;
    return { cx, cy, w: box.width * s, h: box.height * s };
  }

  async function detectFaces(force = false) {
    if (!state.detector || !state.source || state.detecting) return;
    const now = performance.now();
    if (!force && now - state.lastDetect < 160) return;
    state.lastDetect = now; state.detecting = true;
    try {
      const faces = await state.detector.detect(state.source);
      if (faces && faces.length) {
        const box = faces[0].boundingBox;
        state.faceRaw = faceToCanvas(box);
        if (!state.face) state.face = { ...state.faceRaw };
      } else if (state.mode === "camera") {
        // keep last position briefly, then release
        if (now - state.lastDetect > 1200) state.faceRaw = null;
      }
    } catch { /* ignore detection errors */ }
    state.detecting = false;
    updateCrownUI();
  }

  function smoothFace() {
    if (!state.faceRaw) { if (state.mode !== "photo") state.face = null; return; }
    const f = state.face, r = state.faceRaw, k = state.mode === "photo" ? 1 : 0.25;
    state.face = f ? { cx: lerp(f.cx, r.cx, k), cy: lerp(f.cy, r.cy, k), w: lerp(f.w, r.w, k), h: lerp(f.h, r.h, k) } : { ...r };
  }

  function updateCrownUI() {
    const tracking = state.faceSupported && !!state.face;
    els.crownPosField.hidden = !state.crown || tracking;
    els.crownStatus.textContent = state.faceSupported
      ? (tracking ? "· following your face" : "· no face found, place manually")
      : "· face tracking not available in this browser";
    els.crownStatus.hidden = !state.crown;
  }

  // ---------- Camera ----------
  async function startCamera() {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: state.facing, width: { ideal: 1080 }, height: { ideal: 1920 } },
      });
      state.stream = stream;
      els.video.srcObject = stream;
      await els.video.play();
      state.source = els.video; state.srcW = els.video.videoWidth; state.srcH = els.video.videoHeight;
      state.mirror = state.facing === "user";
      state.mode = "camera"; state.face = null; state.faceRaw = null;
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
      detectFaces(); smoothFace(); render();
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
    state.mode = "photo"; setMode("photo");
    if (state.face) state.faceRaw = { ...state.face };
    await detectFaces(true); smoothFace(); render();
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
      state.mode = "photo"; state.face = null; state.faceRaw = null;
      setMode("photo");
      render();
      await detectFaces(true); smoothFace(); render();
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
        await navigator.share({ files: [file], title: "GHABA × ORS · Stylist of the Future", text: "#StylistOfTheFuture" });
      } catch (err) { if (err && err.name !== "AbortError") download(); }
    } else download();
  }

  // ---------- Persistence ----------
  const LS = "crowncam.v1";
  function save() {
    try { localStorage.setItem(LS, JSON.stringify({ name: state.name, city: state.city, salon: state.salon, theme: state.theme })); } catch {}
  }
  function restore() {
    try {
      const d = JSON.parse(localStorage.getItem(LS) || "{}");
      if (d.name) { state.name = d.name; els.name.value = d.name; }
      if (d.city) { state.city = d.city; els.city.value = d.city; }
      if (d.salon) { state.salon = d.salon; els.salon.value = d.salon; }
      if (d.theme && THEMES[d.theme]) { state.theme = d.theme; const r = document.querySelector(`input[name=theme][value=${d.theme}]`); if (r) r.checked = true; }
    } catch {}
  }

  // ---------- Optional brand logos ----------
  function loadLogo(key, src) {
    const img = new Image();
    img.onload = () => { state.logos[key] = img; if (state.mode === "photo") render(); };
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
    if (state.face) { state.face.cx = W - state.face.cx; if (state.faceRaw) state.faceRaw.cx = W - state.faceRaw.cx; }
    render();
  });
  els.file.addEventListener("change", (e) => { loadFile(e.target.files[0]); e.target.value = ""; });

  for (const key of ["name", "city", "salon"]) {
    els[key].addEventListener("input", () => { state[key] = els[key].value; save(); if (state.mode === "photo") render(); });
  }
  document.querySelectorAll("input[name=theme]").forEach((r) => r.addEventListener("change", () => {
    state.theme = r.value; save(); if (state.mode === "photo") render();
  }));
  els.crownToggle.addEventListener("change", () => { state.crown = els.crownToggle.checked; updateCrownUI(); if (state.mode === "photo") render(); });
  els.crownY.addEventListener("input", () => { state.crownY = parseFloat(els.crownY.value); if (state.mode === "photo") render(); });
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
    initDetector();
    loadLogo("ors", "assets/ors-logo.png");
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
  window.CrownCam = { state, render, loadFile };
})();
