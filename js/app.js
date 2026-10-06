/* CrownCam — GHABA × ORS Olive Oil · Stylist of the Future
 * Camera-first Stories filter: a head-tracked 3D olive wreath with a short reveal animation,
 * drawn on a 1080×1920 canvas and saved as a PNG for Stories. Everything runs on the device.
 */
(() => {
  "use strict";

  const W = 1080, H = 1920;
  const $ = (id) => document.getElementById(id);

  const els = {
    app: $("app"), stage: $("stage"), video: $("video"), status: $("status"), toast: $("toast"),
    btnStart: $("btn-start"), btnBack: $("btn-back"), btnFlip: $("btn-flip"), btnFit: $("btn-fit"),
    btnShutter: $("btn-shutter"), btnSave: $("btn-save"), btnShare: $("btn-share"),
    file: $("file-input"), name: $("name"), looks: $("looks"),
    sizeRow: $("size-row"), crownSize: $("crown-size"),
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


  // Swatch shown in the look picker for each theme.
  const LOOKS = [
    ["olive", "Olive", "linear-gradient(135deg,#14261a 45%,#c9a227 46%)"],
    ["gold", "Gold", "linear-gradient(135deg,#000 45%,#e5c65a 46%)"],
    ["ivory", "Ivory", "linear-gradient(135deg,#f5efe0 45%,#2e5a2a 46%)"],
    ["kente", "Kente", "repeating-linear-gradient(90deg,#f2c230 0 6px,#c8102e 6px 12px,#006b3f 12px 18px,#111 18px 24px)"],
    ["noir", "Noir", "linear-gradient(135deg,#111 45%,#bbb 46%)"],
    ["golden", "Golden", "linear-gradient(135deg,#3a1408 45%,#f2994a 46%)"],
  ];

  // Reveal timeline, in seconds from the moment a face is found.
  const T = { scanEnd: 1.15, dropStart: 0.6, dropEnd: 2.5, growStart: 0.85, growSpan: 1.6, leafGrow: 0.5,
              oliveStart: 2.3, popStart: 3.0, popEnd: 3.6, burst: 3.05, done: 4.0 };

  // ---------- State ----------
  const state = {
    mode: "start",            // start | camera | result
    from: "camera",           // where the current result came from: camera | upload
    source: null, srcW: 0, srcH: 0,
    mirror: false, facing: "user", stream: null,
    theme: "olive", name: "",
    zoom: 0,                  // 0 = whole photo visible, 1 = photo fills the frame
    face: null, faceRaw: null, lastSeen: 0,
    manual: { x: W / 2, y: H * 0.3, w: W * 0.4 }, manualScale: 1,
    tracker: null, trackerStatus: "loading", lastVideoTime: -1,
    intro: null,              // { start: ms, scan: bool } while the reveal plays
    particles: [], lastFrame: 0, lastTwinkle: 0,
    logos: { orsLockup: null, ghaba: null, orsMark: null }, tinted: new Map(),
  };

  // ---------- Utilities ----------
  let toastTimer = 0;
  function toast(msg, ms = 2600) {
    els.toast.textContent = msg; els.toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove("show"), ms);
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const clamp01 = (v) => clamp(v, 0, 1);
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
  const easeOutBack = (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  // Deterministic "random" per index so every leaf keeps its own size.
  const rand = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const shade = (rgb, k, a = 1) => `rgba(${Math.round(rgb[0] * k)},${Math.round(rgb[1] * k)},${Math.round(rgb[2] * k)},${a})`;
  const lighten = (rgb, k) => rgb.map((c) => c + (255 - c) * k);

  function coverTransform(sw, sh) {
    const s = Math.max(W / sw, H / sh);
    return { s, dx: (W - sw * s) / 2, dy: (H - sh * s) / 2 };
  }
  // Between "whole photo visible" (zoom 0) and "fills the frame" (zoom 1).
  function photoTransform(sw, sh) {
    const fit = Math.min(W / sw, H / sh), fill = Math.max(W / sw, H / sh);
    const s = lerp(fit, fill, state.zoom);
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

  function drawPhoto() {
    ctx.fillStyle = "#0b120d"; ctx.fillRect(0, 0, W, H);
    const src = state.source, sw = state.srcW, sh = state.srcH;
    if (!src || !sw || !sh) return;
    const { s, dx, dy } = photoTransform(sw, sh);
    ctx.save();
    if (state.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    if (sw * s < W - 1 || sh * s < H - 1) drawBackdrop(src, sw, sh);
    ctx.drawImage(src, dx, dy, sw * s, sh * s);
    ctx.restore();
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

  // ---------- Drawing: 3D olive wreath ----------
  // The wreath is a ring of leaves around the head in 3D (x right, y down, z away from the camera).
  // It is turned by the head's yaw, tilted by its pitch, projected with perspective and rolled in 2D,
  // and every leaf, olive and stem piece is depth-sorted so the near side covers the far side.
  const PER_SIDE = 12, GAP = 0.18;
  function wreathElements(R, yaw, tilt, a, now, final) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt), f = R * 4.2;
    const P = (x, y, z) => {
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      const k = f / (f + z2);
      return { x: x1 * k, y: y2 * k, z: z2, k };
    };
    const items = [];
    for (const side of [1, -1]) {
      let prev = null;
      for (let i = 0; i < PER_SIDE; i++) {
        const s = i / (PER_SIDE - 1);                       // 0 at the back, 1 at the front
        const th = Math.PI / 2 - side * (Math.PI - GAP) * s;
        const rx = Math.cos(th), rz = Math.sin(th);
        const base = { x: R * rx, y: 0, z: R * rz };
        const pb = P(base.x, base.y, base.z);
        const idx = (side > 0 ? 0 : PER_SIDE) + i;
        // grow order: back first, both sides together, toward the front
        const g0 = T.growStart + T.growSpan * s;
        const grow = final ? 1 : clamp01((a.t - g0) / T.leafGrow);
        // stem piece back to the previous position, drawn as it grows
        const p0 = prev; prev = pb;
        if (p0 && grow > 0) {
          const e = { x: lerp(p0.x, pb.x, Math.min(1, grow * 2)), y: lerp(p0.y, pb.y, Math.min(1, grow * 2)), k: pb.k };
          items.push({ z: (p0.z + pb.z) / 2, kind: "stem", a: p0, b: e });
        }
        if (grow <= 0) continue;
        const growK = final ? 1 : easeOutBack(grow);         // overshoots past full size, then settles
        // tangent along the branch toward the front
        const tx = side * rz, tz = -side * rx;
        const size = R * 0.31 * (0.72 + 0.55 * rand(idx)) * (1.08 - 0.3 * s) * growK; // smaller toward the face
        const sway = final ? 0 : Math.sin(now / 1000 * 1.7 + idx * 0.9) * 0.07;
        for (let j = 0; j < 2; j++) {
          const lean = 0.45 + 0.25 * rand(idx * 3 + j) + sway;
          // leaf j=0 lifts up off the ring, j=1 fans outward
          const nx = j ? rx : 0, ny = j ? 0.08 : -1, nz = j ? rz : 0;
          let dx = tx * Math.cos(lean) + nx * Math.sin(lean), dy = ny * Math.sin(lean), dz = tz * Math.cos(lean) + nz * Math.sin(lean);
          const L = size * (j ? 1 : 0.9), m = Math.hypot(dx, dy, dz); dx /= m; dy /= m; dz /= m;
          const tip = P(base.x + dx * L, base.y + dy * L, base.z + dz * L);
          items.push({ z: (pb.z + tip.z) / 2, kind: "leaf", a: pb, b: tip });
        }
        // olives hang below every third position
        if (i % 3 === 1) {
          const og = final ? 1 : clamp01((a.t - (T.oliveStart + 0.4 * s)) / 0.35);
          if (og > 0) {
            const po = P(base.x + rx * R * 0.06, base.y + R * 0.075, base.z + rz * R * 0.06);
            items.push({ z: po.z - 1, kind: "olive", p: po, r: R * 0.055 * (final ? 1 : easeOutBack(og)) * po.k });
          }
        }
      }
    }
    // gold bead where the two branches meet at the front
    const gem = final ? 1 : clamp01((a.t - T.popStart) / 0.3);
    if (gem > 0) {
      const pg = P(0, -R * 0.02, -R);
      items.push({ z: pg.z - 2, kind: "gem", p: pg, r: R * 0.05 * (final ? 1 : easeOutBack(gem)) * pg.k });
    }
    return items.sort((u, v) => v.z - u.z);
  }

  function drawWreath(pose, t, a, now, final) {
    const R = pose.w * 0.62 * pose.scale;
    const tilt = clamp(0.22 + pose.pitch * 0.5, 0.08, 0.55); // seen almost edge-on, so it sits on the head
    const items = wreathElements(R, pose.yaw + a.spin, tilt, a, now, final);
    const leaf = hexRgb(t.leaf), vein = hexRgb(t.leafVein);
    const depth = (z) => 1 - 0.42 * clamp01((z / R + 1) / 2);   // near side bright, far side dimmer
    ctx.save();
    ctx.translate(pose.x, pose.y + a.drop);
    ctx.rotate(pose.roll);
    ctx.globalAlpha = a.alpha;
    ctx.lineCap = "round";
    for (const it of items) {
      if (it.kind === "stem") {
        const k = depth(it.z);
        ctx.strokeStyle = shade(vein, k); ctx.lineWidth = Math.max(2, R * 0.022 * it.a.k);
        ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke();
      } else if (it.kind === "leaf") {
        const k = depth(it.z), ax = it.a.x, ay = it.a.y, bx = it.b.x, by = it.b.y;
        const len = Math.hypot(bx - ax, by - ay); if (len < 1) continue;
        const nx = -(by - ay) / len, ny = (bx - ax) / len, wdt = len * 0.36;
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const g = ctx.createLinearGradient(ax, ay, bx, by);
        g.addColorStop(0, shade(leaf, k * 0.72)); g.addColorStop(1, shade(lighten(leaf, 0.25), k));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(mx + nx * wdt, my + ny * wdt, bx, by);
        ctx.quadraticCurveTo(mx - nx * wdt, my - ny * wdt, ax, ay);
        ctx.fill();
        ctx.strokeStyle = shade(vein, k * 0.9); ctx.lineWidth = Math.max(1, len * 0.05);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(lerp(ax, bx, 0.85), lerp(ay, by, 0.85)); ctx.stroke();
        if (it.z < 0) { // a glint on near leaves
          ctx.strokeStyle = `rgba(255,255,255,${0.35 * k})`; ctx.lineWidth = Math.max(1, len * 0.03);
          ctx.beginPath(); ctx.moveTo(lerp(ax, bx, 0.25) + nx * wdt * 0.35, lerp(ay, by, 0.25) + ny * wdt * 0.35);
          ctx.quadraticCurveTo(mx + nx * wdt * 0.55, my + ny * wdt * 0.55, lerp(ax, bx, 0.8) + nx * wdt * 0.2, lerp(ay, by, 0.8) + ny * wdt * 0.2);
          ctx.stroke();
        }
      } else if (it.kind === "olive") {
        const k = depth(it.z), r = it.r; if (r < 0.5) continue;
        const g = ctx.createRadialGradient(it.p.x - r * 0.35, it.p.y - r * 0.4, r * 0.1, it.p.x, it.p.y, r * 1.1);
        g.addColorStop(0, shade([150, 170, 80], k)); g.addColorStop(0.55, shade([72, 92, 30], k)); g.addColorStop(1, shade([28, 38, 10], k));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(it.p.x, it.p.y, r * 0.82, r, 0.2, 0, Math.PI * 2); ctx.fill();
      } else if (it.kind === "gem") {
        const r = it.r; if (r < 0.5) continue;
        const g = ctx.createRadialGradient(it.p.x - r * 0.3, it.p.y - r * 0.35, r * 0.1, it.p.x, it.p.y, r);
        g.addColorStop(0, "#fff7d6"); g.addColorStop(0.45, t.accent2); g.addColorStop(1, shade(hexRgb(t.accent), 0.6));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(it.p.x, it.p.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    // where sparkles may appear, in canvas space
    return { x: pose.x, y: pose.y + a.drop, r: R };
  }

  // ---------- Drawing: reveal effects ----------
  function introState(now, final) {
    if (final || !state.intro) return { t: 99, drop: 0, spin: 0, alpha: 1, pop: 0 };
    const t = (now - state.intro.start) / 1000;
    const pd = clamp01((t - T.dropStart) / (T.dropEnd - T.dropStart));
    const pp = clamp01((t - T.popStart) / (T.popEnd - T.popStart));
    return {
      t,
      drop: -(1 - easeOutBack(pd)) * H * 0.35,
      spin: (1 - easeOutCubic(pd)) * Math.PI * 2.5,
      alpha: clamp01((t - T.dropStart) / 0.3),
      pop: Math.sin(Math.PI * pp) * 0.16,
    };
  }

  function drawScan(pose, t) {
    if (!state.intro || !state.intro.scan || !pose || !pose.pts || t > T.scanEnd + 0.3) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pose.pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const pad = (maxX - minX) * 0.18; minX -= pad; maxX += pad; minY -= pad; maxY += pad * 0.5;
    const fade = 1 - clamp01((t - T.scanEnd) / 0.3);
    const sy = lerp(minY, maxY, easeOutCubic(clamp01(t / 0.95)));
    const t0 = THEMES[state.theme];
    ctx.save();
    ctx.globalAlpha = fade;
    // corner brackets
    ctx.strokeStyle = t0.accent2; ctx.lineWidth = 6; const c = (maxX - minX) * 0.14;
    for (const [x, y, dx, dy] of [[minX, minY, 1, 1], [maxX, minY, -1, 1], [minX, maxY, 1, -1], [maxX, maxY, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x, y + dy * c); ctx.lineTo(x, y); ctx.lineTo(x + dx * c, y); ctx.stroke();
    }
    // mesh dots appear behind the scan line
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = t0.accent2;
    for (const p of pose.pts) if (p.y < sy) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }
    // the scan line itself
    if (t < 1.0) {
      const g = ctx.createLinearGradient(0, sy - 60, 0, sy + 6);
      g.addColorStop(0, "rgba(255,215,120,0)"); g.addColorStop(1, "rgba(255,215,120,0.55)");
      ctx.fillStyle = g; ctx.fillRect(minX, sy - 60, maxX - minX, 66);
      ctx.fillStyle = "rgba(255,240,190,0.95)"; ctx.fillRect(minX, sy - 2, maxX - minX, 4);
    }
    ctx.restore();
  }

  function spawnSparkles(at, n, burst) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, rr = at.r * (0.6 + Math.random() * 0.6);
      const x = at.x + Math.cos(ang) * rr, y = at.y + Math.sin(ang) * rr * 0.45 - at.r * 0.15;
      const sp = burst ? 250 + Math.random() * 500 : 20;
      state.particles.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.6 - (burst ? 150 : 30),
        life: 0, max: burst ? 0.9 + Math.random() * 0.6 : 0.7 + Math.random() * 0.5, size: burst ? 10 + Math.random() * 16 : 8 + Math.random() * 10 });
    }
  }
  function star(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill();
  }
  function drawSparkles(dt, color) {
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = color;
    state.particles = state.particles.filter((p) => (p.life += dt) < p.max);
    for (const p of state.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.vx *= 0.97;
      const q = p.life / p.max; ctx.globalAlpha = Math.sin(Math.PI * q);
      star(p.x, p.y, p.size * (1 - q * 0.4));
    }
    ctx.restore();
  }
  function drawStaticSparkles(at, color) {
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = color;
    [[-0.95, -0.35, 22], [0.9, -0.5, 16], [-0.55, -0.85, 12], [0.4, -0.95, 18], [1.05, 0.05, 10]].forEach(([u, v, s]) => {
      ctx.globalAlpha = 0.9; star(at.x + u * at.r, at.y + v * at.r * 0.6, s);
    });
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


  // ---------- Drawing: frame and title ----------
  function drawFrame(t) {
    const M = 44;
    const g = ctx.createLinearGradient(0, H * 0.6, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.5, t.scrimBottom.replace(/[\d.]+\)$/, "0.7)")); g.addColorStop(1, t.scrimBottom);
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.6, W, H * 0.4);
    if (t.border === "kente") drawKenteBorder();
    ctx.strokeStyle = t.frame; ctx.lineWidth = 3;
    roundRect(M, M, W - 2 * M, H - 2 * M, 28); ctx.stroke();
    ctx.lineWidth = 8; const tick = 70;
    for (const [x, y, sx, sy] of [[M, M, 1, 1], [W - M, M, -1, 1], [M, H - M, 1, -1], [W - M, H - M, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(x + sx * 28, y); ctx.lineTo(x + sx * tick, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + sy * 28); ctx.lineTo(x, y + sy * tick); ctx.stroke();
    }
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

  // The pose the wreath is drawn at: the tracked head, or the hand-placed one.
  function wreathPose() {
    if (state.face) return { ...state.face, scale: 1 };
    if (state.mode === "camera" && state.trackerStatus === "ready") return null; // waiting for a face
    const m = state.manual;
    return { x: m.x, y: m.y, w: m.w * state.manualScale, roll: 0, yaw: 0, pitch: 0, scale: 1 };
  }

  function render(now = performance.now(), final = false) {
    const dt = state.lastFrame ? Math.min(0.05, (now - state.lastFrame) / 1000) : 0;
    state.lastFrame = now;
    const t = THEMES[state.theme];
    drawPhoto();
    const pose = wreathPose();
    const a = introState(now, final);
    if (pose) {
      drawScan(state.face, a.t);
      const at = drawWreath({ ...pose, scale: pose.scale * (1 + a.pop) }, t, a, now, final);
      if (final) drawStaticSparkles(at, t.accent2);
      else {
        if (state.intro && !state.intro.burst && a.t >= T.burst) { state.intro.burst = true; spawnSparkles(at, 40, true); }
        if (a.t >= T.done && now - state.lastTwinkle > 380) { state.lastTwinkle = now; spawnSparkles(at, 1, false); }
      }
      if (state.intro && a.t > T.done + 1) state.intro = null;
    }
    if (!final) drawSparkles(dt, t.accent2);
    drawFrame(t);
  }

  function startIntro(scan) {
    state.intro = { start: performance.now(), scan, burst: false };
    state.particles = [];
  }

  // ---------- Head tracking (MediaPipe Face Landmarker) ----------
  const MP_VERSION = "1.0.1";
  const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
  const MP_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  const LM = { forehead: 10, chin: 152, faceLeft: 234, faceRight: 454, eyeA: 33, eyeB: 263 };

  async function initTracker() {
    state.trackerStatus = "loading"; updateStatus();
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
      if (state.mode === "result" && !state.face) detectStill(true);
    } catch (err) {
      console.warn("Head tracking unavailable:", err);
      state.trackerStatus = "unavailable";
    }
    updateStatus(); updateResultUI();
  }

  // Head pose in canvas pixels from the face mesh: wreath centre, head width, roll, yaw and pitch.
  function poseFromLandmarks(lm) {
    const { s, dx, dy } = photoTransform(state.srcW, state.srcH);
    const P = (i) => {
      let x = dx + lm[i].x * state.srcW * s; const y = dy + lm[i].y * state.srcH * s;
      if (state.mirror) x = W - x;
      return { x, y, z: lm[i].z * state.srcW * s };
    };
    const top = P(LM.forehead), chin = P(LM.chin);
    let fl = P(LM.faceLeft), fr = P(LM.faceRight); if (fl.x > fr.x) [fl, fr] = [fr, fl];
    let e1 = P(LM.eyeA), e2 = P(LM.eyeB); if (e1.x > e2.x) [e1, e2] = [e2, e1];
    const faceW = Math.hypot(fr.x - fl.x, fr.y - fl.y), faceH = Math.hypot(top.x - chin.x, top.y - chin.y) || 1;
    const ux = (top.x - chin.x) / faceH, uy = (top.y - chin.y) / faceH;
    const lift = faceW * 0.12; // ring centre just above the hairline, so the front arc rests on it
    const pts = [];
    for (let i = 0; i < 468; i += 9) { const p = P(i); pts.push({ x: p.x, y: p.y }); }
    return {
      x: top.x + ux * lift, y: top.y + uy * lift, w: faceW,
      roll: Math.atan2(e2.y - e1.y, e2.x - e1.x),
      yaw: Math.atan2(fr.z - fl.z, fr.x - fl.x),
      pitch: Math.atan2(chin.z - top.z, faceH),
      pts,
    };
  }

  function detectVideo() {
    const v = els.video;
    if (!state.tracker || v.readyState < 2 || v.currentTime === state.lastVideoTime) return;
    state.lastVideoTime = v.currentTime;
    const now = performance.now();
    try {
      const res = state.tracker.detectForVideo(v, now);
      if (res.faceLandmarks && res.faceLandmarks.length) {
        if (!state.faceRaw && now - state.lastSeen > 1200) startIntro(true); // new face: play the reveal
        state.faceRaw = poseFromLandmarks(res.faceLandmarks[0]);
        state.lastSeen = now;
      } else if (now - state.lastSeen > 600) {
        state.faceRaw = null;
      }
    } catch (err) { console.warn(err); }
    updateStatus();
  }

  function detectStill(replay) {
    state.face = null; state.faceRaw = null;
    if (state.tracker && state.source) {
      try {
        // In video mode the tracker first looks where the previous face was; a new photo can need a second pass.
        for (let i = 0; i < 3 && !state.face; i++) {
          const res = state.tracker.detectForVideo(state.source, performance.now() + i);
          if (res.faceLandmarks && res.faceLandmarks.length) { state.faceRaw = poseFromLandmarks(res.faceLandmarks[0]); state.face = { ...state.faceRaw }; }
        }
      } catch (err) { console.warn(err); }
    }
    if (replay) startIntro(!!state.face);
    updateResultUI();
  }

  function smoothFace() {
    const r = state.faceRaw;
    if (!r) { state.face = null; return; }
    const f = state.face;
    if (!f) { state.face = { ...r }; return; }
    const k = 0.45, ka = 0.35;
    state.face = { x: lerp(f.x, r.x, k), y: lerp(f.y, r.y, k), w: lerp(f.w, r.w, k),
      roll: lerp(f.roll, r.roll, ka), yaw: lerp(f.yaw, r.yaw, ka), pitch: lerp(f.pitch, r.pitch, ka), pts: r.pts };
  }

  // ---------- Camera ----------
  async function startCamera() {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        // Ask for the sensor's full 4:3 picture; a 1080p request makes many phones crop the sensor.
        video: { facingMode: state.facing, aspectRatio: { ideal: 4 / 3 }, width: { ideal: 1440 }, height: { ideal: 1080 } },
      });
      state.stream = stream;
      els.video.srcObject = stream;
      await els.video.play();
      state.source = els.video; state.srcW = els.video.videoWidth; state.srcH = els.video.videoHeight;
      state.mirror = state.facing === "user";
      state.face = null; state.faceRaw = null; state.lastSeen = 0; state.lastVideoTime = -1; state.intro = null;
      setMode("camera");
      if (state.trackerStatus !== "ready") startIntro(false); // no tracking: still play the drop-in
    } catch (err) {
      console.error(err);
      toast(location.protocol === "http:" && location.hostname !== "localhost"
        ? "The camera needs a secure (https) link. Try uploading a photo."
        : "Couldn't open the camera. Allow camera access, or upload a photo.");
      if (state.mode === "camera") setMode("start");
    }
  }

  function stopCamera() {
    if (state.stream) { state.stream.getTracks().forEach((tr) => tr.stop()); state.stream = null; }
    els.video.srcObject = null;
  }

  function capture() {
    if (state.mode !== "camera" || !els.video.videoWidth) return;
    const off = document.createElement("canvas");
    off.width = els.video.videoWidth; off.height = els.video.videoHeight;
    off.getContext("2d").drawImage(els.video, 0, 0);
    const livePose = state.face;
    stopCamera();
    state.source = off; state.srcW = off.width; state.srcH = off.height;
    state.from = "camera"; state.intro = null; state.particles = [];
    setMode("result");
    detectStill(false);
    if (!state.face && livePose) { state.face = livePose; state.faceRaw = { ...livePose }; }
    updateResultUI();
    els.stage.classList.remove("flash"); void els.stage.offsetWidth; els.stage.classList.add("flash");
  }

  // ---------- Upload ----------
  function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) { toast("Please choose a photo."); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      stopCamera();
      state.source = img; state.srcW = img.naturalWidth; state.srcH = img.naturalHeight;
      state.mirror = false; state.from = "upload";
      state.manual = { x: W / 2, y: H * 0.3, w: W * 0.4 }; state.manualScale = 1; els.crownSize.value = "1";
      setMode("result");
      detectStill(true);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast("Couldn't read that photo. Try another one."); };
    img.src = url;
  }

  // ---------- UI ----------
  function setMode(mode) {
    state.mode = mode;
    els.app.dataset.mode = mode;
    els.btnFlip.hidden = mode !== "camera";
    updateStatus(); updateResultUI();
  }

  let lastStatus = null;
  function updateStatus() {
    let msg = "";
    if (state.mode === "camera") {
      if (state.trackerStatus === "loading") msg = "Getting the crown ready…";
      else if (state.trackerStatus === "ready" && !state.faceRaw) msg = "Look at the camera";
    }
    if (msg !== lastStatus) { els.status.textContent = msg; els.status.hidden = !msg; lastStatus = msg; }
  }

  function updateResultUI() {
    const manual = state.mode === "result" && !state.face;
    els.sizeRow.hidden = !manual;
    els.stage.classList.toggle("draggable", manual);
  }

  function buildLooks() {
    els.looks.innerHTML = "";
    for (const [key, label, swatch] of LOOKS) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "look"; b.dataset.theme = key;
      b.setAttribute("role", "radio"); b.setAttribute("aria-label", label);
      b.innerHTML = `<span class="swatch" style="background:${swatch}"></span><span class="look-label">${label}</span>`;
      b.addEventListener("click", () => { state.theme = key; save(); markLook(); });
      els.looks.appendChild(b);
    }
    markLook();
  }
  function markLook() {
    for (const b of els.looks.children) {
      const on = b.dataset.theme === state.theme;
      b.setAttribute("aria-checked", String(on)); b.classList.toggle("on", on);
      if (on) b.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    }
  }

  // ---------- Export ----------
  function fileName() {
    const slug = (state.name.trim() || "stylist").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return `crowncam-${slug || "stylist"}.png`;
  }
  function toBlob() {
    render(performance.now(), true);            // finished wreath, no moving sparkles
    return new Promise((resolve) => els.stage.toBlob(resolve, "image/png"));
  }
  async function download() {
    const blob = await toBlob(); if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = fileName();
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast("Saved. Post it to your Stories!");
  }
  async function share() {
    const blob = await toBlob(); if (!blob) return;
    const file = new File([blob], fileName(), { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Stylist of the Future", text: "#StylistOfTheFuture" }); }
      catch (err) { if (err && err.name !== "AbortError") download(); }
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
      if (d.theme && THEMES[d.theme]) state.theme = d.theme;
    } catch {}
  }
  function loadLogo(key, src) {
    const img = new Image();
    img.onload = () => { state.logos[key] = img; state.tinted.clear(); };
    img.onerror = () => {};
    img.src = src;
  }

  // ---------- Events ----------
  els.btnStart.addEventListener("click", startCamera);
  els.btnShutter.addEventListener("click", capture);
  els.btnFlip.addEventListener("click", () => { state.facing = state.facing === "user" ? "environment" : "user"; startCamera(); });
  els.btnBack.addEventListener("click", () => {
    if (state.mode === "result" && state.from === "camera") startCamera();
    else { stopCamera(); setMode("start"); }
  });
  els.btnFit.addEventListener("click", () => {
    state.zoom = state.zoom ? 0 : 1;
    els.btnFit.setAttribute("aria-pressed", String(!!state.zoom));
    els.btnFit.setAttribute("aria-label", state.zoom ? "Show whole photo" : "Fill the frame");
    if (state.mode === "result") detectStill(false);
  });
  els.file.addEventListener("change", (e) => { loadFile(e.target.files[0]); e.target.value = ""; });
  els.name.addEventListener("input", () => { state.name = els.name.value; save(); });
  els.crownSize.addEventListener("input", () => { state.manualScale = parseFloat(els.crownSize.value); });
  els.btnSave.addEventListener("click", download);
  els.btnShare.addEventListener("click", share);

  // Tap the picture to replay the reveal; with no face found, drag to place the crown.
  let drag = null;
  const toCanvas = (e) => { const r = els.stage.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  els.stage.addEventListener("pointerdown", (e) => {
    const p = toCanvas(e); drag = { start: p, moved: false, from: { ...state.manual } };
    els.stage.setPointerCapture(e.pointerId);
  });
  els.stage.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = toCanvas(e), dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (Math.hypot(dx, dy) > 12) drag.moved = true;
    if (drag.moved && state.mode === "result" && !state.face) { state.manual.x = drag.from.x + dx; state.manual.y = drag.from.y + dy; }
  });
  els.stage.addEventListener("pointerup", () => {
    if (drag && !drag.moved && state.mode !== "start") startIntro(!!state.face);
    drag = null;
  });
  els.stage.addEventListener("dragover", (e) => e.preventDefault());
  els.stage.addEventListener("drop", (e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });

  window.addEventListener("pagehide", stopCamera);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.mode === "camera") { stopCamera(); setMode("start"); }
  });

  // ---------- Frame loop ----------
  function frame(now) {
    if (state.mode === "camera" && state.stream) {
      if (els.video.videoWidth) { state.srcW = els.video.videoWidth; state.srcH = els.video.videoHeight; }
      detectVideo(); smoothFace();
    }
    if (state.mode !== "start") render(now);
    requestAnimationFrame(frame);
  }

  // ---------- Boot ----------
  restore();
  buildLooks();
  if (navigator.share) els.btnShare.hidden = false;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) els.btnStart.textContent = "Upload a photo";
  setMode("start");
  initTracker();
  loadLogo("orsMark", "assets/ors-mark.svg");
  loadLogo("orsLockup", "assets/ors-olive-oil-logo.png"); // optional official lockup overrides the drawn one
  loadLogo("ghaba", "assets/ghaba-logo.png");
  requestAnimationFrame(frame);

  // Small hook for testing.
  window.CrownCam = { state, render, loadFile, detectStill, startIntro };
})();
