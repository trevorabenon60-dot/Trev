// LETREV — GTA 6 thumbnail. Everything is drawn procedurally on <canvas>.
// Logical size 1280x720, rendered at S x supersampling.
(function () {
  const W = 1280, H = 720, S = 2;
  const HZ = 400;              // horizon
  const VPX = 610;             // vanishing point x
  const F = 900;               // ground projection focal length (px)
  const CAM_H = 1.0;           // camera height (m)
  const SUN = { x: 606, y: 322, r: 98 };

  // ---------- utils ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
  const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const px = (v) => v * S; // for shadowBlur / filter lengths (device pixels)
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function layer() {
    const c = document.createElement('canvas');
    c.width = W * S; c.height = H * S;
    const g = c.getContext('2d');
    g.setTransform(S, 0, 0, S, 0, 0);
    return { c, g };
  }
  // composite a full layer onto g (device-space, identity transform)
  function put(g, L, alpha = 1, op = 'source-over', filter = 'none') {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = alpha; g.globalCompositeOperation = op; g.filter = filter;
    g.drawImage(L.c || L, 0, 0);
    g.restore();
  }
  function tint(L, color) {
    const T = layer();
    put(T.g, L);
    T.g.save(); T.g.setTransform(1, 0, 0, 1, 0, 0);
    T.g.globalCompositeOperation = 'source-in'; T.g.fillStyle = color; T.g.fillRect(0, 0, W * S, H * S);
    T.g.restore();
    return T;
  }
  function radial(g, x, y, r0, r1, stops, op = 'source-over', sy = 1) {
    g.save(); g.globalCompositeOperation = op;
    g.translate(x, y); g.scale(1, sy);
    const gr = g.createRadialGradient(0, 0, r0, 0, 0, r1);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr; g.fillRect(-r1, -r1, 2 * r1, 2 * r1);
    g.restore();
  }
  function maskAlphaV(L, y0, a0, y1, a1) { // multiply layer alpha by vertical ramp
    L.g.save(); L.g.globalCompositeOperation = 'destination-in';
    const gr = L.g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, `rgba(0,0,0,${a0})`); gr.addColorStop(1, `rgba(0,0,0,${a1})`);
    L.g.fillStyle = gr; L.g.fillRect(0, 0, W, H);
    L.g.restore();
  }
  // vertical smear (wet-road streaks): average of N copies shifted down
  function smearDown(L, n, step, gain = 1) {
    const O = layer();
    O.g.save(); O.g.setTransform(1, 0, 0, 1, 0, 0); O.g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) { O.g.globalAlpha = Math.min(1, gain / n); O.g.drawImage(L.c, 0, px(k * step)); }
    O.g.restore();
    return O;
  }
  function mirror(L, axisY) {
    const M = layer();
    M.g.save(); M.g.setTransform(1, 0, 0, -1, 0, px(2 * axisY)); M.g.drawImage(L.c, 0, 0); M.g.restore();
    return M;
  }
  // horizontal ripple displacement of a layer below y0
  function ripple(L, y0, amp, seed) {
    const O = layer(); const R = rng(seed);
    const ph = [R() * 6, R() * 6, R() * 6];
    put(O.g, L); // keep everything above y0
    O.g.save(); O.g.setTransform(1, 0, 0, 1, 0, 0);
    O.g.clearRect(0, px(y0), W * S, H * S);
    const rows = Math.ceil((H - y0) * S);
    for (let r = 0; r < rows; r += 2) {
      const y = y0 + r / S; const d = (y - y0) / (H - y0);
      const off = (Math.sin(y * 0.55 + ph[0]) * 0.6 + Math.sin(y * 1.7 + ph[1]) * 0.3 + Math.sin(y * 0.13 + ph[2]) * 0.4) * amp * (0.25 + d * 1.6);
      O.g.drawImage(L.c, 0, px(y0) + r, W * S, 2, px(off), px(y0) + r, W * S, 2);
    }
    O.g.restore();
    return O;
  }
  const gY = (Z) => HZ + (F * CAM_H) / Z;
  const gX = (X, Z) => VPX + (F * X) / Z;

  // ---------- sky ----------
  const SKY = [
    [0.00, [11, 3, 30]], [0.20, [36, 8, 74]], [0.42, [84, 16, 112]], [0.62, [150, 30, 130]],
    [0.78, [222, 52, 128]], [0.90, [255, 104, 110]], [1.00, [255, 160, 112]],
  ];
  function skyColor(y) {
    const t = clamp(y / HZ, 0, 1);
    for (let i = 1; i < SKY.length; i++) if (t <= SKY[i][0]) {
      const a = SKY[i - 1], b = SKY[i];
      return mix(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
    }
    return SKY[SKY.length - 1][1];
  }
  function paintSky(g) {
    const gr = g.createLinearGradient(0, 0, 0, HZ);
    for (const [o, c] of SKY) gr.addColorStop(o, rgba(c));
    g.fillStyle = gr; g.fillRect(0, 0, W, HZ + 1);
    // warm dome of light around the sun
    radial(g, SUN.x, SUN.y + 30, 0, 700, [[0, 'rgba(255,150,110,0.55)'], [0.3, 'rgba(255,80,140,0.32)'], [0.65, 'rgba(190,40,150,0.12)'], [1, 'rgba(120,20,120,0)']], 'screen', 0.55);
    // cool top-right corner for depth
    radial(g, 1180, -40, 0, 520, [[0, 'rgba(60,40,160,0.35)'], [1, 'rgba(60,40,160,0)']], 'screen');
  }

  function paintClouds(g, seed, yMin, yMax, count, darkness) {
    const L = layer(); const c = L.g; const R = rng(seed);
    for (let i = 0; i < count; i++) {
      const y = lerp(yMin, yMax, Math.pow(R(), 0.9));
      const x = -100 + R() * (W + 200);
      const len = 120 + R() * 380;
      const th = 3 + R() * 10 * (0.4 + y / HZ);
      const d = Math.hypot((x - SUN.x) / 650, (y - SUN.y) / 260);
      const lit = clamp(1 - d, 0, 1);
      const base = skyColor(y);
      const dark = mix(base, [26, 6, 52], darkness);
      const glow = mix([255, 90, 170], [255, 196, 140], lit);
      // cluster of puffs along a streak
      const puffs = 6 + (R() * 8) | 0;
      for (let k = 0; k < puffs; k++) {
        const px_ = x + (k / puffs - 0.5) * len + (R() - 0.5) * 30;
        const py = y + (R() - 0.5) * th * 0.8;
        const rx = len / puffs * (0.9 + R() * 0.9), ry = th * (0.6 + R() * 0.7);
        const gr = c.createLinearGradient(0, py - ry, 0, py + ry);
        gr.addColorStop(0, rgba(dark, 0.55));
        gr.addColorStop(0.55, rgba(mix(dark, glow, 0.35), 0.6));
        gr.addColorStop(1, rgba(glow, 0.45 + lit * 0.4));
        c.fillStyle = gr;
        c.beginPath(); c.ellipse(px_, py, rx, ry, 0, 0, Math.PI * 2); c.fill();
      }
    }
    put(g, L, 1, 'source-over', `blur(${px(1.6)}px)`);
  }

  function paintSun(g) {
    radial(g, SUN.x, SUN.y, 0, SUN.r * 3.2, [[0, 'rgba(255,236,190,0.85)'], [0.3, 'rgba(255,180,120,0.45)'], [1, 'rgba(255,90,120,0)']], 'screen');
    const gr = g.createRadialGradient(SUN.x - 12, SUN.y - 22, 0, SUN.x, SUN.y, SUN.r);
    gr.addColorStop(0, '#fffef4'); gr.addColorStop(0.5, '#fff0bf'); gr.addColorStop(0.8, '#ffc27c'); gr.addColorStop(1, '#ff9466');
    g.save(); g.shadowColor = 'rgba(255,190,120,0.9)'; g.shadowBlur = px(40);
    g.fillStyle = gr; g.beginPath(); g.arc(SUN.x, SUN.y, SUN.r, 0, Math.PI * 2); g.fill(); g.restore();
  }
  function paintSunBands(g) { // thin clouds crossing the disc
    const R = rng(91);
    g.save();
    g.beginPath(); g.arc(SUN.x, SUN.y, SUN.r + 30, 0, Math.PI * 2); g.clip();
    const bands = [[SUN.y + 18, 4], [SUN.y + 34, 2.5], [SUN.y - 6, 1.6], [SUN.y + 52, 5], [SUN.y + 68, 6]];
    for (const [y, t] of bands) {
      g.fillStyle = 'rgba(150,30,110,0.55)';
      g.beginPath(); g.ellipse(SUN.x + (R() - 0.5) * 60, y, SUN.r * (1.2 + R() * 0.5), t, 0, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  function paintFlare(g) {
    // anamorphic streak
    const L = layer(); const c = L.g;
    const gr = c.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, 'rgba(120,120,255,0)'); gr.addColorStop(0.3, 'rgba(255,140,220,0.35)');
    gr.addColorStop(SUN.x / W, 'rgba(255,240,230,0.95)');
    gr.addColorStop(0.75, 'rgba(255,120,220,0.35)'); gr.addColorStop(1, 'rgba(120,120,255,0)');
    c.fillStyle = gr; c.fillRect(0, SUN.y - 1.2, W, 2.4);
    put(g, L, 0.8, 'screen', `blur(${px(1.2)}px)`);
    put(g, L, 0.5, 'screen', `blur(${px(6)}px)`);
  }

  function paintRays(g) {
    const L = layer(); const c = L.g; const R = rng(55);
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI + 0.12 + R() * (Math.PI - 0.24), w = 0.008 + R() * 0.03, len = 700 + R() * 400;
      const gr = c.createRadialGradient(SUN.x, SUN.y, SUN.r * 0.8, SUN.x, SUN.y, len);
      gr.addColorStop(0, `rgba(255,190,160,${0.18 + R() * 0.2})`); gr.addColorStop(1, 'rgba(255,120,180,0)');
      c.fillStyle = gr; c.beginPath(); c.moveTo(SUN.x, SUN.y);
      c.lineTo(SUN.x + Math.cos(a - w) * len, SUN.y + Math.sin(a - w) * len); c.lineTo(SUN.x + Math.cos(a + w) * len, SUN.y + Math.sin(a + w) * len); c.closePath(); c.fill();
    }
    put(g, L, 0.55, 'screen', `blur(${px(5)}px)`);
  }

  // ---------- skyline ----------
  function genBuildings(R, x0, x1, hfn, wmin, wmax) {
    const arr = []; let x = x0;
    while (x < x1) {
      const w = wmin + R() * (wmax - wmin);
      const h = Math.max(4, hfn(x + w / 2) * (0.55 + R() * 0.6));
      arr.push({ x, w, h, t: R(), s: R() });
      x += w * (0.55 + R() * 0.55);
    }
    return arr;
  }
  function drawBuilding(g, b, base, col, R, o) {
    const top = base - b.h;
    g.fillStyle = col;
    g.fillRect(b.x, top, b.w, b.h + 1);
    let crownTop = top;
    if (b.t < 0.28) { // setback tower + spire
      const w2 = b.w * 0.6, h2 = b.h * 0.14;
      g.fillRect(b.x + (b.w - w2) / 2, top - h2, w2, h2 + 1);
      const w3 = w2 * 0.55, h3 = b.h * 0.08;
      g.fillRect(b.x + (b.w - w3) / 2, top - h2 - h3, w3, h3 + 1);
      crownTop = top - h2 - h3;
      if (b.s < 0.7) {
        g.beginPath(); g.moveTo(b.x + b.w / 2 - 1.5, crownTop); g.lineTo(b.x + b.w / 2, crownTop - b.h * 0.22); g.lineTo(b.x + b.w / 2 + 1.5, crownTop); g.fill();
        if (o.lights) light(g, b.x + b.w / 2, crownTop - b.h * 0.22, [255, 40, 60], 1.3);
      }
    } else if (b.t < 0.45) { // slanted glass top
      g.beginPath(); g.moveTo(b.x, top + 0.5); g.lineTo(b.x + b.w, top - b.w * 0.45); g.lineTo(b.x + b.w, top + 0.5); g.fill();
      crownTop = top - b.w * 0.45;
    } else if (b.t < 0.62) { // antenna
      g.fillRect(b.x + b.w * 0.68, top - b.h * 0.25, 1.2, b.h * 0.25);
      if (o.lights) light(g, b.x + b.w * 0.68 + 0.6, top - b.h * 0.25, [255, 40, 60], 1.2);
    } else if (b.t < 0.8) { // art-deco steps
      const w2 = b.w * 0.75, w3 = b.w * 0.5;
      g.fillRect(b.x + (b.w - w2) / 2, top - 6, w2, 7);
      g.fillRect(b.x + (b.w - w3) / 2, top - 11, w3, 6);
      crownTop = top - 11;
    }
    // windows
    if (o.windows) {
      const cw = o.win[0], rh = o.win[1];
      const pLit = 0.12 + b.s * 0.3;
      for (let y = top + 4; y < base - 3; y += rh) {
        for (let x = b.x + 2; x < b.x + b.w - 2; x += cw) {
          if (R() < pLit) {
            const k = R();
            const col2 = k < 0.7 ? [255, 214, 150] : (k < 0.85 ? [140, 236, 255] : [255, 150, 225]);
            g.fillStyle = rgba(col2, o.winAlpha * (0.4 + R() * 0.6));
            g.fillRect(x, y, cw * 0.5, rh * 0.45);
          }
        }
      }
    }
    // sun-side rim light
    const dir = Math.sign(SUN.x - (b.x + b.w / 2));
    const dist = Math.abs(SUN.x - (b.x + b.w / 2));
    const rim = clamp(1 - dist / 600, 0, 1) * o.rim;
    if (rim > 0.02) {
      g.fillStyle = `rgba(255,170,140,${rim})`;
      g.fillRect(dir < 0 ? b.x : b.x + b.w - 1, top, 1, b.h);
      g.fillStyle = `rgba(255,170,140,${rim * 0.7})`;
      g.fillRect(b.x, top, b.w, 0.8);
    }
    // neon accents
    if (o.neon && b.s > 0.62 && b.h > 70) {
      const nc = b.s > 0.82 ? [255, 50, 210] : [40, 230, 255];
      g.save(); g.shadowColor = rgba(nc, 1); g.shadowBlur = px(8);
      g.fillStyle = rgba(mix(nc, [255, 255, 255], 0.45), 0.95);
      if (b.s > 0.75) g.fillRect(b.x + 1, top + 2, 1.4, b.h - 4);         // vertical strip
      else g.fillRect(b.x + 1, top + 3, b.w - 2, 1.4);                       // crown band
      if (b.s > 0.9) g.fillRect(b.x + b.w - 2.4, top + 2, 1.4, b.h * 0.6);
      g.restore();
    }
  }
  function light(g, x, y, c, r) {
    g.save(); g.shadowColor = rgba(c, 1); g.shadowBlur = px(6); g.fillStyle = rgba(mix(c, [255, 255, 255], 0.4));
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.restore();
  }
  function paintSkyline(g) {
    // far — hazy
    const R1 = rng(11);
    const hFar = (x) => 16 + 120 * smooth(760, 1060, x) + 70 * (1 - smooth(260, 470, x)) + 20 * Math.sin(x * 0.03);
    const far = genBuildings(R1, -20, W + 20, hFar, 18, 46);
    for (const b of far) drawBuilding(g, b, HZ + 1, rgba(mix(skyColor(HZ - 30), [120, 30, 110], 0.55), 0.92), R1,
      { windows: false, rim: 0.25, lights: true, neon: false });
    // haze over far layer
    const hz = g.createLinearGradient(0, HZ - 160, 0, HZ);
    hz.addColorStop(0, 'rgba(255,120,150,0)'); hz.addColorStop(1, 'rgba(255,120,150,0.30)');
    g.fillStyle = hz; g.fillRect(0, HZ - 160, W, 161);
    // mid — towers on the right, mid-rise on the left, open around the sun
    const R2 = rng(29);
    const hMid = (x) => (x > 790 ? 150 + 120 * smooth(800, 1100, x) : (x < 440 ? 90 - 50 * smooth(200, 440, x) : 0));
    const mid = genBuildings(R2, -20, W + 20, hMid, 26, 64).filter((b) => b.h > 12);
    for (const b of mid) drawBuilding(g, b, HZ + 1, rgba([44, 12, 64]), R2,
      { windows: true, win: [4.2, 5.6], winAlpha: 0.75, rim: 0.55, lights: true, neon: true });
    // glow at the base of the city
    const bg = g.createLinearGradient(0, HZ - 40, 0, HZ);
    bg.addColorStop(0, 'rgba(255,90,170,0)'); bg.addColorStop(1, 'rgba(255,110,170,0.35)');
    g.fillStyle = bg; g.fillRect(0, HZ - 40, W, 41);
  }

  // ---------- palms ----------
  function quad(p0, p1, p2, t) {
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]];
  }
  function palm(g, bx, by, h, lean, bow, seed, col, rimCol) {
    const R = rng(seed);
    const top = [bx + lean * h, by - h];
    const ctl = [bx + bow * h, by - h * 0.5];
    const w0 = h * 0.042, w1 = h * 0.02;
    // trunk polygon
    const L = [], Rr = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50; const p = quad([bx, by], ctl, top, t);
      const q = quad([bx, by], ctl, top, Math.min(1, t + 0.01)); const p2 = quad([bx, by], ctl, top, Math.max(0, t - 0.01));
      let dx = q[0] - p2[0], dy = q[1] - p2[1]; const d = Math.hypot(dx, dy); dx /= d; dy /= d;
      const w = lerp(w0, w1, t) * (1 + 0.25 * Math.exp(-t * 14));
      L.push([p[0] - dy * w, p[1] + dx * w]); Rr.push([p[0] + dy * w, p[1] - dx * w]);
    }
    g.fillStyle = col;
    g.beginPath(); g.moveTo(L[0][0], L[0][1]);
    for (const p of L) g.lineTo(p[0], p[1]);
    for (let i = Rr.length - 1; i >= 0; i--) g.lineTo(Rr[i][0], Rr[i][1]);
    g.closePath(); g.fill();
    // rim light along the sun-facing edge + rings
    const side = SUN.x < bx ? Rr : L;
    g.strokeStyle = rimCol; g.lineWidth = Math.max(0.6, h * 0.003);
    g.beginPath(); side.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = Math.max(0.5, h * 0.0025);
    for (let i = 2; i < 50; i += 2) { g.beginPath(); g.moveTo(L[i][0], L[i][1]); g.lineTo(Rr[i][0], Rr[i][1]); g.stroke(); }
    // fronds
    const n = 13;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i + 0.5) / n - 0.5) * Math.PI * 2.05 + (R() - 0.5) * 0.3;
      const len = h * (0.3 + R() * 0.12);
      const up = Math.sin(a) < -0.6 ? 0.5 : 0.25;
      const p0 = top;
      const p1 = [top[0] + Math.cos(a) * len * 0.55, top[1] + Math.sin(a) * len * 0.45 - len * up];
      const p2 = [top[0] + Math.cos(a) * len, top[1] + Math.sin(a) * len * 0.35 + len * 0.42];
      g.strokeStyle = col; g.lineWidth = h * 0.007;
      g.beginPath(); g.moveTo(p0[0], p0[1]); g.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]); g.stroke();
      g.lineWidth = Math.max(0.6, h * 0.0042);
      for (let s = 0.06; s < 0.98; s += 0.028) {
        const p = quad(p0, p1, p2, s), q = quad(p0, p1, p2, s + 0.01);
        let tx = q[0] - p[0], ty = q[1] - p[1]; const d = Math.hypot(tx, ty); tx /= d; ty /= d;
        const ll = len * 0.2 * Math.sin(Math.PI * clamp(s * 1.05, 0, 1)) * (0.75 + R() * 0.4);
        for (const sd of [-1, 1]) {
          // leaflets hang: mix of forward tangent and gravity, splayed per side
          let ex = tx * 0.55 + (-ty) * sd * 0.6, ey = ty * 0.55 + tx * sd * 0.6 + 0.75;
          const e = Math.hypot(ex, ey); ex /= e; ey /= e;
          g.beginPath(); g.moveTo(p[0], p[1]);
          g.quadraticCurveTo(p[0] + ex * ll * 0.6, p[1] + ey * ll * 0.4, p[0] + ex * ll, p[1] + ey * ll);
          g.stroke();
        }
      }
    }
    // coconuts
    g.fillStyle = col;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(top[0] + (R() - 0.5) * h * 0.04, top[1] + h * 0.02 + R() * h * 0.02, h * 0.012, 0, 7); g.fill(); }
  }

  // ---------- helicopter ----------
  function helicopter(g, x, y, s) {
    const col = '#12061c';
    // searchlight beam (drawn first, behind)
    const B = layer(); const b = B.g;
    const bx = x - 6 * s, by = y + 7 * s;
    const gr = b.createLinearGradient(bx, by, bx + 150, by + 300);
    gr.addColorStop(0, 'rgba(210,235,255,0.55)'); gr.addColorStop(1, 'rgba(210,235,255,0)');
    b.fillStyle = gr;
    b.beginPath(); b.moveTo(bx, by); b.lineTo(bx + 95, by + 320); b.lineTo(bx + 205, by + 290); b.closePath(); b.fill();
    put(g, B, 0.55, 'screen', `blur(${px(5)}px)`);
    g.save(); g.translate(x, y); g.scale(s, s); g.rotate(-0.08);
    g.fillStyle = col;
    // body
    g.beginPath();
    g.moveTo(-14, 2); g.quadraticCurveTo(-14, -7, -4, -8); g.lineTo(8, -8); g.quadraticCurveTo(14, -7, 15, -2);
    g.lineTo(15, 3); g.quadraticCurveTo(12, 8, 2, 8); g.lineTo(-8, 8); g.quadraticCurveTo(-14, 7, -14, 2); g.fill();
    // tail boom
    g.beginPath(); g.moveTo(12, -4); g.lineTo(44, -3); g.lineTo(44, 0); g.lineTo(12, 3); g.fill();
    g.beginPath(); g.moveTo(40, -3); g.lineTo(46, -12); g.lineTo(48, -12); g.lineTo(45, 0); g.fill();
    // mast + skids
    g.fillRect(1, -11, 3, 4);
    g.fillRect(-12, 12, 26, 1.4); g.fillRect(-7, 8, 1.4, 4); g.fillRect(7, 8, 1.4, 4);
    // cockpit glass glint
    g.fillStyle = 'rgba(255,170,200,0.55)';
    g.beginPath(); g.moveTo(-12, 0); g.quadraticCurveTo(-11, -6, -4, -6.5); g.lineTo(-3, 0); g.fill();
    // rotor blur
    g.fillStyle = 'rgba(30,10,45,0.55)';
    g.beginPath(); g.ellipse(2.5, -11.5, 34, 1.6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(30,10,45,0.35)';
    g.beginPath(); g.arc(46, -9, 5.5, 0, Math.PI * 2); g.fill();
    g.restore();
    light(g, x + 2.5 * s, y - 9.5 * s, [255, 40, 60], 1.6);
    light(g, x + 46 * s, y - 13 * s, [255, 255, 255], 1.2);
    light(g, x - 6 * s, y + 7 * s, [230, 245, 255], 2.4);
  }

  // ---------- people ----------
  function limb(g, x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy); const nx = -dy / d, ny = dx / d;
    g.beginPath(); g.moveTo(x1 + nx * r1, y1 + ny * r1); g.lineTo(x2 + nx * r2, y2 + ny * r2);
    g.lineTo(x2 - nx * r2, y2 - ny * r2); g.lineTo(x1 - nx * r1, y1 - ny * r1); g.closePath(); g.fill();
    g.beginPath(); g.arc(x1, y1, r1, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x2, y2, r2, 0, Math.PI * 2); g.fill();
  }
  function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); }
  function woman(g, fx, fy, h) { // feet centre, height in px
    g.save(); g.translate(fx, fy - h); g.scale(h / 100, h / 100);
    // hair volume + long hair
    ell(g, 0.3, 6.6, 5.5, 6.9);
    g.beginPath(); g.moveTo(-5.3, 5); g.quadraticCurveTo(-7.8, 16, -7.6, 28); g.quadraticCurveTo(-5.2, 30.5, -3, 27);
    g.lineTo(3.4, 27); g.quadraticCurveTo(5.8, 30, 7.8, 27.5); g.quadraticCurveTo(7.6, 15, 5.7, 5); g.closePath(); g.fill();
    ell(g, 0.6, 7.6, 4.5, 6.1);                // face
    limb(g, 0.3, 12, 1.9, 0.3, 18.5, 2.3);     // neck
    // torso
    g.beginPath();
    g.moveTo(-9.3, 19.8); g.quadraticCurveTo(0, 17.4, 9.3, 19.8);
    g.quadraticCurveTo(10.4, 24.5, 8.7, 28.5); g.quadraticCurveTo(6.1, 33, 6.3, 37.5);
    g.quadraticCurveTo(10.6, 44, 10.3, 50.5); g.quadraticCurveTo(5, 57, 0, 56.5);
    g.quadraticCurveTo(-5, 57, -10.3, 50.5); g.quadraticCurveTo(-10.6, 44, -6.3, 37.5);
    g.quadraticCurveTo(-6.1, 33, -8.7, 28.5); g.quadraticCurveTo(-10.4, 24.5, -9.3, 19.8); g.fill();
    // arms: left hangs, right on hip
    limb(g, -9.0, 22.2, 2.4, -11.6, 35, 2.0); limb(g, -11.6, 35, 1.95, -12.6, 48.5, 1.45); ell(g, -12.7, 50.8, 1.6, 2.4);
    limb(g, 9.0, 22.2, 2.4, 16.4, 32.5, 2.1); limb(g, 16.4, 32.5, 2.0, 9.6, 44, 1.6); ell(g, 9.4, 45, 2.0, 1.8);
    // legs: weight on left, right knee relaxed
    limb(g, -5, 50, 5.4, -4.4, 73, 3.4); limb(g, -4.4, 73, 3.2, -4.9, 95, 1.9);
    limb(g, 5, 50, 5.4, 2.6, 73, 3.4); limb(g, 2.6, 73, 3.1, 5.6, 95, 1.9);
    // heels
    g.beginPath(); g.moveTo(-7.5, 96); g.lineTo(-2.5, 95.5); g.lineTo(-1.5, 99.6); g.lineTo(-7.5, 99.6); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(3.5, 96); g.lineTo(8.5, 95.5); g.lineTo(9.8, 99.6); g.lineTo(3.5, 99.6); g.closePath(); g.fill();
    g.restore();
  }
  function man(g, fx, fy, h) {
    g.save(); g.translate(fx, fy - h); g.scale(h / 100, h / 100);
    ell(g, 0, 6.8, 5.0, 6.5);                  // head
    ell(g, 0.1, 10.8, 4.5, 3.4);               // beard / jaw
    ell(g, -0.3, 2.4, 4.6, 2.4, -0.1);         // short hair
    limb(g, 0, 12, 2.9, 0, 17.5, 3.4);         // neck
    g.beginPath();
    g.moveTo(-3.6, 15.6); g.quadraticCurveTo(-9.5, 17.2, -12.4, 20.2);
    g.quadraticCurveTo(-14.3, 23, -13.4, 28.5); g.quadraticCurveTo(-11.4, 35, -10.2, 41);
    g.quadraticCurveTo(-9.4, 47, -9.9, 53.5); g.quadraticCurveTo(-5, 57.8, 0, 57.2);
    g.quadraticCurveTo(5, 57.8, 9.9, 53.5); g.quadraticCurveTo(9.4, 47, 10.2, 41);
    g.quadraticCurveTo(11.4, 35, 13.4, 28.5); g.quadraticCurveTo(14.3, 23, 12.4, 20.2);
    g.quadraticCurveTo(9.5, 17.2, 3.6, 15.6); g.closePath(); g.fill();
    // arms slightly away from the body
    limb(g, -12.2, 24, 3.2, -14.4, 36, 2.8); limb(g, -14.4, 36, 2.7, -13.2, 49.5, 2.1); ell(g, -13.0, 52, 2.2, 2.8);
    limb(g, 12.2, 24, 3.2, 15.2, 35.5, 2.8); limb(g, 15.2, 35.5, 2.8, 15.4, 48.5, 2.1); ell(g, 15.6, 51.2, 2.3, 2.8);
    // pistol held low
    g.beginPath(); g.moveTo(14.4, 50.6); g.lineTo(17.4, 50.4); g.lineTo(18.6, 60.2); g.lineTo(16.8, 60.4); g.closePath(); g.fill();

    // legs, wide stance
    limb(g, -5.6, 52, 5.8, -7.4, 74, 4.1); limb(g, -7.4, 74, 3.9, -8.8, 95, 2.7);
    limb(g, 5.6, 52, 5.8, 7.4, 74, 4.1); limb(g, 7.4, 74, 3.9, 8.8, 95, 2.7);
    ell(g, -9.8, 98.3, 3.9, 1.7); ell(g, 9.8, 98.3, 3.9, 1.7);
    g.restore();
  }

  // ---------- car ----------
  const CAR = { cx: 962, gy: 668, hw: 268 };
  function carPaths(c) {
    const { cx, gy, hw } = CAR;
    const P = (u, v) => [cx + u * hw, gy - v * hw];
    const path = (pts) => { // pts: array of [cmd, ...uv]
      c.beginPath();
      for (const [cmd, ...a] of pts) {
        const q = []; for (let i = 0; i < a.length; i += 2) q.push(...P(a[i], a[i + 1]));
        if (cmd === 'M') c.moveTo(...q); else if (cmd === 'L') c.lineTo(...q);
        else if (cmd === 'Q') c.quadraticCurveTo(...q); else if (cmd === 'C') c.bezierCurveTo(...q);
      }
      c.closePath();
    };
    const sym = (half) => { // half: list from top-centre clockwise to bottom-centre on right side
      const out = [...half];
      for (let i = half.length - 1; i >= 1; i--) {
        // mirror segment i (endpoint of i-1 is start). Rebuild reversed with control points.
        const [cmd, ...a] = half[i]; const prev = half[i - 1]; const pa = prev.slice(-2);
        const m = (arr) => arr.map((v, k) => (k % 2 === 0 ? -v : v));
        if (cmd === 'L') out.push(['L', ...m(pa)]);
        else if (cmd === 'Q') out.push(['Q', ...m([a[0], a[1]]), ...m(pa)]);
        else if (cmd === 'C') out.push(['C', ...m([a[2], a[3]]), ...m([a[0], a[1]]), ...m(pa)]);
      }
      return out;
    };
    const body = sym([
      ['M', 0, 0.80],
      ['L', 0.52, 0.797],
      ['C', 0.70, 0.792, 0.83, 0.78, 0.90, 0.742],
      ['C', 0.98, 0.70, 1.03, 0.62, 1.035, 0.52],
      ['C', 1.04, 0.42, 1.02, 0.33, 0.965, 0.295],
      ['L', 0.66, 0.265],
      ['Q', 0.62, 0.17, 0.56, 0.115],
      ['L', 0, 0.105],
    ]);
    const cabin = sym([
      ['M', 0, 1.065],
      ['L', 0.25, 1.06],
      ['Q', 0.37, 1.055, 0.41, 0.99],
      ['L', 0.56, 0.78],
      ['L', 0, 0.78],
    ]);
    const glass = sym([
      ['M', 0, 1.035],
      ['L', 0.23, 1.031],
      ['Q', 0.33, 1.026, 0.36, 0.978],
      ['L', 0.455, 0.835],
      ['L', 0, 0.835],
    ]);
    return { P, path, body, cabin, glass };
  }

  function paintCar(g) {
    const { cx, gy, hw } = CAR;
    const { path, body, cabin, glass } = carPaths(g);
    const u = (x) => cx + x * hw, v = (h) => gy - h * hw;

    // tyres
    for (const s of [-1, 1]) {
      const x0 = cx + s * 0.645 * hw, x1 = cx + s * 0.99 * hw;
      const l = Math.min(x0, x1), w = Math.abs(x1 - x0);
      g.fillStyle = '#030205';
      g.beginPath(); g.roundRect(l, gy - 0.3 * hw, w, 0.3 * hw, [3, 3, 12, 12]); g.fill();
      const sg = g.createLinearGradient(l, 0, l + w, 0);
      const c1 = s < 0 ? 'rgba(255,110,190,0.22)' : 'rgba(0,0,0,0)', c2 = s > 0 ? 'rgba(80,200,255,0.2)' : 'rgba(0,0,0,0)';
      sg.addColorStop(0, c1); sg.addColorStop(0.12, 'rgba(0,0,0,0)'); sg.addColorStop(0.88, 'rgba(0,0,0,0)'); sg.addColorStop(1, c2);
      g.fillStyle = sg; g.fill();
    }

    // cabin / buttresses
    g.fillStyle = '#07040a'; path(cabin); g.fill();
    // rear glass: tinted, sunset glowing through the windscreen beyond
    g.save(); path(glass); g.clip();
    const gg = g.createLinearGradient(0, v(1.04), 0, v(0.83));
    gg.addColorStop(0, '#1a0626'); gg.addColorStop(0.45, '#6a1450'); gg.addColorStop(0.8, '#ff6a6a'); gg.addColorStop(1, '#ffb27a');
    g.fillStyle = gg; g.fillRect(u(-0.5), v(1.1), hw, 0.3 * hw);
    radial(g, u(-0.25), v(0.86), 0, 0.5 * hw, [[0, 'rgba(255,230,180,0.75)'], [1, 'rgba(255,160,120,0)']], 'screen', 0.5);
    // seats / headrests / interior silhouettes
    g.fillStyle = '#08030c';
    for (const s of [-1, 1]) {
      g.beginPath(); g.roundRect(u(s * 0.19) - 0.08 * hw, v(0.975), 0.16 * hw, 0.12 * hw, 9); g.fill();
      g.beginPath(); g.roundRect(u(s * 0.19) - 0.14 * hw, v(0.885), 0.28 * hw, 0.08 * hw, 6); g.fill();
    }
    g.fillRect(u(-0.5), v(0.865), hw, 0.04 * hw);
    g.fillRect(u(-0.04), v(1.03), 0.08 * hw, 0.025 * hw);
    // reflections on the glass
    g.fillStyle = 'rgba(255,190,240,0.16)';
    g.beginPath(); g.moveTo(u(-0.21), v(1.035)); g.lineTo(u(-0.09), v(1.035)); g.lineTo(u(-0.27), v(0.835)); g.lineTo(u(-0.4), v(0.835)); g.fill();
    g.fillStyle = 'rgba(255,190,240,0.07)';
    g.beginPath(); g.moveTo(u(0.0), v(1.035)); g.lineTo(u(0.05), v(1.035)); g.lineTo(u(-0.12), v(0.835)); g.lineTo(u(-0.17), v(0.835)); g.fill();
    g.restore();
    // side mirrors
    g.fillStyle = '#060308';
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(u(s * 0.47), v(0.86)); g.lineTo(u(s * 0.58), v(0.905)); g.lineTo(u(s * 0.58), v(0.885)); g.lineTo(u(s * 0.49), v(0.84)); g.fill();
      g.beginPath(); g.ellipse(u(s * 0.635), v(0.905), 0.075 * hw, 0.036 * hw, s * -0.1, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,170,170,0.6)'; g.lineWidth = 0.9;
      g.beginPath(); g.ellipse(u(s * 0.635), v(0.905), 0.075 * hw, 0.036 * hw, s * -0.1, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    }

    // body: glossy black
    const bg = g.createLinearGradient(0, v(0.80), 0, v(0.11));
    bg.addColorStop(0, '#22102c'); bg.addColorStop(0.08, '#0d0612'); bg.addColorStop(0.5, '#060309'); bg.addColorStop(1, '#030204');
    g.fillStyle = bg; path(body); g.fill();
    g.save(); path(body); g.clip();
    // sky reflection band on the rear deck curvature
    const hb = g.createLinearGradient(0, v(0.80), 0, v(0.66));
    hb.addColorStop(0, 'rgba(255,120,210,0.0)'); hb.addColorStop(0.18, 'rgba(255,120,210,0.38)');
    hb.addColorStop(0.32, 'rgba(110,30,150,0.10)'); hb.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hb; g.fillRect(u(-1.1), v(0.82), 2.2 * hw, 0.2 * hw);
    // flank highlights: warm (sun side) and cool (neon side)
    radial(g, u(-1.0), v(0.53), 0, 0.22 * hw, [[0, 'rgba(255,90,180,0.5)'], [1, 'rgba(255,90,180,0)']], 'screen', 2.2);
    radial(g, u(1.0), v(0.53), 0, 0.22 * hw, [[0, 'rgba(60,200,255,0.42)'], [1, 'rgba(60,200,255,0)']], 'screen', 2.2);
    // red spill from the taillights onto the glossy rear
    radial(g, cx, v(0.62), 0, 1.0 * hw, [[0, 'rgba(255,20,50,0.38)'], [0.5, 'rgba(255,20,50,0.12)'], [1, 'rgba(255,20,50,0)']], 'screen', 0.22);
    // recessed rear panel
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.beginPath(); g.roundRect(u(-0.80), v(0.585), 1.6 * hw, 0.22 * hw, 12); g.fill();
    // a crisp horizontal crease highlight below the panel
    g.fillStyle = 'rgba(255,90,200,0.22)'; g.fillRect(u(-0.9), v(0.355), 1.8 * hw, 1.2);
    // side vents
    for (const s of [-1, 1]) {
      const x0 = u(s * 0.76), x1 = u(s * 0.97); const l = Math.min(x0, x1), w = Math.abs(x1 - x0);
      g.fillStyle = '#010102'; g.beginPath(); g.roundRect(l, v(0.53), w, 0.16 * hw, 6); g.fill();
      g.strokeStyle = 'rgba(255,60,120,0.16)'; g.lineWidth = 0.7;
      for (let yy = v(0.52); yy < v(0.38); yy += 3.2) { g.beginPath(); g.moveTo(l + 3, yy); g.lineTo(l + w - 3, yy); g.stroke(); }
    }
    // licence plate
    g.fillStyle = '#020103'; g.beginPath(); g.roundRect(u(-0.19), v(0.53), 0.38 * hw, 0.13 * hw, 4); g.fill();
    g.fillStyle = '#0e0912'; g.beginPath(); g.roundRect(u(-0.165), v(0.515), 0.33 * hw, 0.095 * hw, 3); g.fill();
    g.fillStyle = 'rgba(255,200,230,0.28)'; g.font = `${0.06 * hw}px Anton`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('L E T R E V', cx, v(0.467));
    // diffuser + fins
    g.fillStyle = '#020103';
    g.beginPath(); g.moveTo(u(-0.63), v(0.29)); g.lineTo(u(0.63), v(0.29)); g.lineTo(u(0.56), v(0.11)); g.lineTo(u(-0.56), v(0.11)); g.fill();
    g.strokeStyle = 'rgba(140,60,170,0.4)'; g.lineWidth = 1.3;
    for (const f of [-0.45, -0.27, -0.09, 0.09, 0.27, 0.45]) { g.beginPath(); g.moveTo(u(f), v(0.28)); g.lineTo(u(f * 1.05), v(0.11)); g.stroke(); }
    // quad exhausts
    for (const e of [-0.37, -0.25, 0.25, 0.37]) {
      const ex = u(e), ey = v(0.2), r = 0.047 * hw;
      const rg = g.createLinearGradient(ex, ey - r, ex, ey + r);
      rg.addColorStop(0, '#f0d2ff'); rg.addColorStop(0.45, '#4a2a58'); rg.addColorStop(1, '#ff6a8a');
      g.fillStyle = rg; g.beginPath(); g.arc(ex, ey, r, 0, Math.PI * 2); g.fill();
      const ig = g.createRadialGradient(ex, ey, 0, ex, ey, r * 0.78);
      ig.addColorStop(0, 'rgba(255,120,40,0.7)'); ig.addColorStop(0.5, '#1a0606'); ig.addColorStop(1, '#040204');
      g.fillStyle = ig; g.beginPath(); g.arc(ex, ey, r * 0.78, 0, Math.PI * 2); g.fill();
    }
    // glossy specular lines on the lower body
    g.fillStyle = 'rgba(255,120,210,0.35)'; g.fillRect(u(-0.95), v(0.305), 1.9 * hw, 1.0);
    g.fillStyle = 'rgba(120,220,255,0.18)'; g.fillRect(u(-0.62), v(0.292), 1.24 * hw, 0.8);
    const sp = g.createLinearGradient(0, v(0.60), 0, v(0.56));
    sp.addColorStop(0, 'rgba(255,60,90,0.0)'); sp.addColorStop(0.5, 'rgba(255,60,90,0.35)'); sp.addColorStop(1, 'rgba(255,60,90,0)');
    g.fillStyle = sp; g.fillRect(u(-0.98), v(0.60), 1.96 * hw, 0.04 * hw);
    // central crown badge
    g.save(); g.translate(cx, v(0.69)); g.fillStyle = 'rgba(255,220,240,0.55)'; crownPath(g, 0.035 * hw); g.fill(); g.restore();
    g.restore();

    // ducktail lip
    g.fillStyle = '#0a0510';
    g.beginPath(); g.moveTo(u(-0.83), v(0.775)); g.quadraticCurveTo(cx, v(0.81), u(0.83), v(0.775)); g.lineTo(u(0.85), v(0.80)); g.quadraticCurveTo(cx, v(0.835), u(-0.85), v(0.80)); g.closePath(); g.fill();

    // sun rim light along the top silhouette (sun is ahead of the car)
    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,190,160,1)'; g.lineWidth = 1.6;
    g.shadowColor = 'rgba(255,120,150,1)'; g.shadowBlur = px(12);
    g.beginPath(); g.moveTo(u(-0.25), v(1.063)); g.lineTo(u(0.25), v(1.063)); g.stroke();
    g.beginPath(); g.moveTo(u(-0.85), v(0.80)); g.quadraticCurveTo(cx, v(0.835), u(0.85), v(0.80)); g.stroke();
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,170,170,0.9)';
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(u(s * 0.86), v(0.775)); g.bezierCurveTo(u(s * 0.95), v(0.74), u(s * 1.03), v(0.64), u(s * 1.035), v(0.52)); g.stroke();
      g.beginPath(); g.moveTo(u(s * 0.41), v(0.99)); g.lineTo(u(s * 0.56), v(0.78)); g.stroke();
    }
    // flank edges
    g.strokeStyle = 'rgba(90,220,255,0.75)'; g.shadowColor = 'rgba(60,200,255,1)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(u(1.035), v(0.52)); g.bezierCurveTo(u(1.04), v(0.42), u(1.02), v(0.33), u(0.965), v(0.295)); g.stroke();
    g.strokeStyle = 'rgba(255,110,200,0.8)'; g.shadowColor = 'rgba(255,80,190,1)';
    g.beginPath(); g.moveTo(u(-1.035), v(0.52)); g.bezierCurveTo(u(-1.04), v(0.42), u(-1.02), v(0.33), u(-0.965), v(0.295)); g.stroke();
    g.restore();
  }
  // taillights only (so they can be glowed / reflected separately)
  function paintTaillights(g, intensity = 1) {
    const { cx, gy, hw } = CAR;
    const u = (x) => cx + x * hw, v = (h) => gy - h * hw;
    const shape = (c) => {
      c.beginPath();
      // full-width bar
      c.moveTo(u(-0.70), v(0.655)); c.quadraticCurveTo(cx, v(0.67), u(0.70), v(0.655));
      c.lineTo(u(0.70), v(0.633)); c.quadraticCurveTo(cx, v(0.648), u(-0.70), v(0.633)); c.closePath();
      // flared end clusters wrapping the haunches
      for (const s of [-1, 1]) {
        c.moveTo(u(s * 0.66), v(0.66)); c.lineTo(u(s * 0.95), v(0.712)); c.quadraticCurveTo(u(s * 1.03), v(0.67), u(s * 1.025), v(0.6));
        c.lineTo(u(s * 0.98), v(0.6)); c.lineTo(u(s * 0.66), v(0.628)); c.closePath();
      }
    };
    g.save();
    g.globalAlpha = intensity;
    g.shadowColor = 'rgba(255,0,40,1)';
    g.shadowBlur = px(30); g.fillStyle = '#ff0a2a'; shape(g); g.fill();
    g.shadowBlur = px(10); g.fillStyle = '#ff2a40'; shape(g); g.fill();
    // white-hot LED cores
    g.shadowBlur = px(4); g.shadowColor = 'rgba(255,60,80,1)'; g.fillStyle = '#ffe2e4';
    g.beginPath(); g.moveTo(u(-0.68), v(0.6475)); g.quadraticCurveTo(cx, v(0.662), u(0.68), v(0.6475));
    g.lineTo(u(0.68), v(0.641)); g.quadraticCurveTo(cx, v(0.6555), u(-0.68), v(0.641)); g.closePath();
    for (const s of [-1, 1]) { g.moveTo(u(s * 0.7), v(0.651)); g.lineTo(u(s * 0.95), v(0.69)); g.lineTo(u(s * 0.96), v(0.675)); g.lineTo(u(s * 0.7), v(0.642)); g.closePath(); }
    g.fill();
    g.restore();
  }

  // ---------- ground ----------
  function paintGround(g, upper, seed) {
    // base asphalt
    const gr = g.createLinearGradient(0, HZ, 0, H);
    gr.addColorStop(0, '#22092a'); gr.addColorStop(0.2, '#0e0512'); gr.addColorStop(1, '#040206');
    g.fillStyle = gr; g.fillRect(0, HZ, W, H - HZ);

    // rough reflection of the sky & city
    const M = mirror(upper, HZ);
    let Rough = smearDown(M, 22, 1.6);
    Rough = ripple(Rough, HZ, 1.6, seed);
    maskAlphaV(Rough, HZ, 0.95, H, 0.42);
    put(g, Rough, 0.8, 'source-over', `blur(${px(1.2)}px) contrast(1.35) brightness(0.8) saturate(1.2)`);

    // puddles: sharper mirror
    const Pm = layer(); const R = rng(seed + 5);
    Pm.g.fillStyle = '#fff';
    const puddles = [[-2.2, 7, 2.2, 3.4], [0.6, 14, 2.4, 5], [-5.5, 22, 3, 6], [3.2, 5.2, 1.1, 1.6], [-1.0, 4.1, 1.4, 1.2], [1.8, 30, 4, 9], [-3.3, 10.5, 1.5, 2.2], [4.5, 18, 2, 4]];
    for (const [X, Z, a, b] of puddles) {
      for (let k = 0; k < 4; k++) {
        const XX = X + (R() - 0.5) * a, ZZ = Z + (R() - 0.5) * b * 0.6;
        const rx = (F * a * (0.5 + R() * 0.6)) / ZZ, ry = (F * CAM_H * b * (0.4 + R() * 0.5)) / (ZZ * ZZ);
        Pm.g.beginPath(); Pm.g.ellipse(gX(XX, ZZ), gY(ZZ), rx, Math.max(0.6, ry), 0, 0, Math.PI * 2); Pm.g.fill();
      }
    }
    let Sharp = smearDown(M, 5, 0.8);
    Sharp = ripple(Sharp, HZ, 0.7, seed + 2);
    put(Sharp.g, Pm, 1, 'destination-in', `blur(${px(2)}px)`);
    put(g, Sharp, 0.9, 'source-over', 'contrast(1.2) brightness(0.95)');

    // lane markings (worn, wet)
    g.save();
    const strip = (X, w, z0, z1, col) => {
      g.fillStyle = col; g.beginPath();
      g.moveTo(gX(X - w / 2, z0), gY(z0)); g.lineTo(gX(X + w / 2, z0), gY(z0));
      g.lineTo(gX(X + w / 2, z1), gY(z1)); g.lineTo(gX(X - w / 2, z1), gY(z1)); g.closePath(); g.fill();
    };
    for (let z = 2.6; z < 160; z += 9) strip(-0.45, 0.13, z, z + 3.2, 'rgba(235,215,240,0.22)');
    strip(3.5, 0.15, 2.6, 400, 'rgba(235,215,240,0.18)');
    strip(-4.2, 0.12, 2.6, 400, 'rgba(255,190,90,0.16)'); strip(-4.45, 0.12, 2.6, 400, 'rgba(255,190,90,0.16)');
    // right curb + sidewalk
    g.fillStyle = 'rgba(10,4,14,0.65)'; g.beginPath();
    g.moveTo(gX(4.1, 2.6), gY(2.6)); g.lineTo(gX(4.1, 400), gY(400)); g.lineTo(W, gY(400)); g.lineTo(W, H); g.closePath(); g.fill();
    strip(4.1, 0.05, 2.6, 400, 'rgba(255,140,200,0.35)');
    // left curb + sidewalk
    g.fillStyle = 'rgba(10,4,14,0.6)'; g.beginPath();
    g.moveTo(gX(-11, 1), gY(1)); g.lineTo(gX(-11, 400), gY(400)); g.lineTo(0, gY(400)); g.lineTo(0, H); g.closePath(); g.fill();
    strip(-11, 0.06, 1, 400, 'rgba(255,140,200,0.3)');
    g.restore();

    // asphalt grain
    const Rn = rng(seed + 9);
    for (let i = 0; i < 2600; i++) {
      const y = HZ + Math.pow(Rn(), 1.6) * (H - HZ); const x = Rn() * W; const d = (y - HZ) / (H - HZ);
      g.fillStyle = Rn() < 0.5 ? `rgba(255,170,220,${0.05 + d * 0.06})` : `rgba(0,0,0,${0.15 + d * 0.15})`;
      g.fillRect(x, y, 0.6 + d * 1.6, 0.4 + d * 0.8);
    }
  }

  // projected cast shadow of a mask layer (sun behind, shadow toward camera)
  function castShadow(mask, feetY, Z0, ppm, tanE) {
    const O = layer();
    O.g.setTransform(1, 0, 0, 1, 0, 0);
    const rows = Math.ceil(170 * S);
    for (let r = 0; r < rows; r++) {
      const Y = r / S / ppm;               // metres above ground
      const Z = Z0 - Y / tanE; if (Z < 2.4) break;
      const Zn = Z0 - (Y + 1 / S / ppm) / tanE;
      const y0 = gY(Z), y1 = gY(Math.max(2.3, Zn));
      const k = Z0 / Z;
      const sy = px(feetY) - r - 1;
      if (sy < 0) break;
      O.g.drawImage(mask.c, 0, sy, W * S, 1, px(VPX + (0 - VPX) * k), px(y0), px(W * k), Math.max(1, px(y1 - y0) + 1));
    }
    return O;
  }

  // ---------- typography ----------
  function crownPath(c, s) { // centred at 0,0 base, width ~ 2s
    c.beginPath();
    c.moveTo(-1.0 * s, 0); c.lineTo(-1.08 * s, -1.05 * s); c.lineTo(-0.52 * s, -0.5 * s); c.lineTo(0, -1.3 * s);
    c.lineTo(0.52 * s, -0.5 * s); c.lineTo(1.08 * s, -1.05 * s); c.lineTo(1.0 * s, 0); c.closePath();
  }
  function crown(g, x, y, s, rot) {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const band = () => { g.beginPath(); g.moveTo(-1.0 * s, 0.22 * s); g.lineTo(1.0 * s, 0.22 * s); };
    // faint gold body
    const fg = g.createLinearGradient(0, -1.3 * s, 0, 0.3 * s);
    fg.addColorStop(0, 'rgba(255,230,140,0.45)'); fg.addColorStop(1, 'rgba(255,150,40,0.25)');
    g.fillStyle = fg; g.shadowColor = 'rgba(255,180,40,1)'; g.shadowBlur = px(30); crownPath(g, s); g.fill();
    // neon tube: glow, colour, white-hot core
    for (const [w, col, blur, a] of [[s * 0.26, '#ffb21e', 40, 0.7], [s * 0.17, '#ffc23a', 16, 1], [s * 0.065, '#fff7d6', 5, 1]]) {
      g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = w; g.shadowColor = '#ffae1a'; g.shadowBlur = px(blur);
      crownPath(g, s); g.stroke(); band(); g.stroke();
    }
    g.globalAlpha = 1;
    // jewels on the tips + centre gem
    g.fillStyle = '#fffbe8'; g.shadowColor = 'rgba(255,220,120,1)'; g.shadowBlur = px(12);
    for (const [px_, py] of [[-1.08, -1.05], [0, -1.3], [1.08, -1.05]]) { g.beginPath(); g.arc(px_ * s, py * s - 0.16 * s, 0.16 * s, 0, 7); g.fill(); }
    g.fillStyle = '#ff4fc0'; g.shadowColor = 'rgba(255,40,170,1)'; g.shadowBlur = px(10);
    g.beginPath(); g.moveTo(0, -0.66 * s); g.lineTo(0.16 * s, -0.42 * s); g.lineTo(0, -0.2 * s); g.lineTo(-0.16 * s, -0.42 * s); g.closePath(); g.fill();
    g.restore();
  }
  function neon(g, text, x, y, font, color, core, tube, fillA) {
    g.save(); g.font = font; g.lineJoin = 'round'; g.lineCap = 'round'; g.textBaseline = 'alphabetic';
    if (fillA) { // body of the letters, for legibility at small sizes
      g.shadowColor = color; g.shadowBlur = px(30);
      g.fillStyle = rgba(color === 'x' ? [0, 0, 0] : [255, 40, 190], fillA); g.fillText(text, x, y);
    }
    g.strokeStyle = color; g.shadowColor = color;
    g.globalAlpha = 0.7; g.shadowBlur = px(46); g.lineWidth = tube * 1.6; g.strokeText(text, x, y);
    g.globalAlpha = 1; g.shadowBlur = px(18); g.lineWidth = tube; g.strokeText(text, x, y);
    g.shadowBlur = px(5); g.strokeStyle = core; g.lineWidth = tube * 0.38; g.strokeText(text, x, y);
    g.restore();
  }
  function neonFilled(g, text, x, y, font, color, core, outline) {
    g.save(); g.font = font; g.lineJoin = 'round'; g.textBaseline = 'alphabetic';
    g.shadowColor = color;
    g.fillStyle = color; g.globalAlpha = 0.85; g.shadowBlur = px(60); g.fillText(text, x, y);
    g.globalAlpha = 1; g.shadowBlur = px(22); g.fillText(text, x, y);
    g.strokeStyle = color; g.lineWidth = outline; g.shadowBlur = px(12); g.strokeText(text, x, y);
    g.shadowBlur = px(4); g.fillStyle = core; g.fillText(text, x, y);
    g.restore();
  }

  function specimen() {
    const L = layer(); const g = L.g;
    g.fillStyle = '#16061f'; g.fillRect(0, 0, W, H);
    const fonts = ['Tilt Neon', 'Monoton', 'Righteous', 'Russo One', 'Bungee', 'Kaushan Script'];
    fonts.forEach((f, i) => {
      const col = i % 2, row = (i / 2) | 0;
      const x = 40 + col * 640, y = 150 + row * 220;
      g.fillStyle = '#aaa'; g.font = '14px Inter'; g.fillText(f, x, y - 110);
      neon(g, 'LETREV', x, y, `92px '${f}'`, '#ff2bd6', '#fff0fb', 7, 0);
      neonFilled(g, 'LETREV', x + 300, y + 80, `60px '${f}'`, '#ff2bd6', '#ffe9fb', 3);
    });
    return { specimen: L.c.toDataURL('image/png') };
  }

  function paintTitle(g) {
    const T = layer(); const c = T.g;
    const x0 = 40, base = 262;
    const fG = "236px Anton";
    // --- "GTA"
    c.font = fG;
    const mG = c.measureText('GTA');
    const capG = mG.actualBoundingBoxAscent;
    c.save();
    c.translate(x0, base); c.transform(1, 0, -0.08, 1, 0, 0);
    // back glow
    c.save(); c.shadowColor = 'rgba(255,40,190,0.9)'; c.shadowBlur = px(50); c.fillStyle = 'rgba(255,40,190,0.6)'; c.font = fG; c.fillText('GTA', 0, 0); c.restore();
    // extrusion
    for (let i = 12; i >= 1; i--) { c.fillStyle = i > 10 ? '#05010a' : `rgb(${40 - i * 2},${6},${60 - i * 3})`; c.font = fG; c.fillText('GTA', i * 0.55, i * 0.85); }
    c.lineJoin = 'round';
    c.font = fG;
    c.strokeStyle = '#0b0214'; c.lineWidth = 14; c.strokeText('GTA', 0, 0);
    const fg = c.createLinearGradient(0, -capG, 0, 0);
    fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.55, '#fff3fb'); fg.addColorStop(0.56, '#ffd6ef'); fg.addColorStop(1, '#ffb3df');
    c.fillStyle = fg; c.fillText('GTA', 0, 0);
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2; c.strokeText('GTA', 0, 0);
    c.restore();
    // --- "6" — sunset-filled, oversized
    const x6 = x0 + mG.width + 16, base6 = base + 28;
    const f6 = "300px Anton";
    c.font = f6; const m6 = c.measureText('6'); const cap6 = m6.actualBoundingBoxAscent;
    c.save(); c.translate(x6, base6); c.transform(1, 0, -0.08, 1, 0, 0); c.font = f6;
    c.save(); c.shadowColor = 'rgba(255,60,160,1)'; c.shadowBlur = px(60); c.fillStyle = 'rgba(255,80,170,0.7)'; c.fillText('6', 0, 0); c.restore();
    for (let i = 14; i >= 1; i--) { c.fillStyle = i > 12 ? '#05010a' : `rgb(${46 - i * 2},${6},${66 - i * 3})`; c.fillText('6', i * 0.55, i * 0.85); }
    c.lineJoin = 'round';
    c.strokeStyle = '#0b0214'; c.lineWidth = 16; c.strokeText('6', 0, 0);
    const sg = c.createLinearGradient(0, -cap6, 0, 0);
    sg.addColorStop(0, '#ffe680'); sg.addColorStop(0.28, '#ff9a4a'); sg.addColorStop(0.55, '#ff3d8b'); sg.addColorStop(0.8, '#c22bd0'); sg.addColorStop(1, '#6d21c9');
    c.fillStyle = sg; c.fillText('6', 0, 0);
    c.strokeStyle = '#fff4fb'; c.lineWidth = 3; c.strokeText('6', 0, 0);
    c.restore();
    put(g, T);
    return { right: x6 + m6.width, top: base - capG, bottom: base6 };
  }
  function paintBrand(g, font) {
    const T = layer(); const c = T.g;
    const x = 50, y = 646;
    const f = font || "112px 'Russo One'";
    radial(c, x + 235, y - 40, 0, 330, [[0, 'rgba(6,0,12,0.6)'], [0.6, 'rgba(6,0,12,0.35)'], [1, 'rgba(6,0,12,0)']], 'source-over', 0.42);
    neon(c, 'LETREV', x, y, f, '#ff2bd6', '#fff2fd', 6.5, 0.0);
    c.font = f; const m = c.measureText('LETREV');
    // underline swoosh
    c.save(); c.strokeStyle = '#2ef2ff'; c.shadowColor = '#2ef2ff'; c.lineCap = 'round';
    c.lineWidth = 4; c.shadowBlur = px(18);
    c.beginPath(); c.moveTo(x + 6, y + 22); c.quadraticCurveTo(x + m.width * 0.5, y + 12, x + m.width - 4, y + 18); c.stroke();
    c.lineWidth = 1.4; c.strokeStyle = '#e8feff'; c.shadowBlur = px(4); c.stroke();
    c.restore();
    crown(c, x + 34, y - 92, 27, -0.24);
    put(g, T);
  }

  // ---------- compose ----------
  let PEOPLE = null;
  function render() {
    // upper scene: sky + city (for reflections and see-through glass)
    const U = layer(); const u = U.g;
    paintSky(u);
    paintClouds(u, 3, 30, 230, 34, 0.75);
    paintSun(u);
    paintSunBands(u);
    paintRays(u);
    paintClouds(u, 8, 250, 370, 26, 0.45);
    paintSkyline(u);
    paintFlare(u);
    helicopter(u, 872, 148, 1.4);
    u.clearRect(0, HZ + 1, W, H);

    const O = layer(); const g = O.g;
    put(g, U);
    paintGround(g, U, 17);

    // palms (with their own short reflections)
    const Pl = layer();
    palm(Pl.g, 64, 580, 540, -0.2, -0.05, 4, '#0d0414', 'rgba(255,120,170,0.45)');
    palm(Pl.g, 1262, 470, 430, -0.1, 0.02, 12, '#0d0414', 'rgba(255,140,170,0.45)');
    palm(Pl.g, 1092, 444, 300, 0.05, 0.03, 23, '#150720', 'rgba(255,150,170,0.4)');
    palm(Pl.g, 790, 418, 140, 0.04, 0.02, 31, '#2a0c36', 'rgba(255,170,170,0.35)');
    palm(Pl.g, 455, 420, 120, -0.06, -0.02, 37, '#2a0c36', 'rgba(255,170,170,0.35)');
    put(g, Pl);

    // people
    const feetY = gY(10.5), ppm = F / 10.5;
    const Pp = layer(); PEOPLE = Pp;
    Pp.g.fillStyle = '#fff';
    woman(Pp.g, 548, feetY, 1.68 * ppm);
    man(Pp.g, 616, feetY, 1.83 * ppm);
    // reflection
    const Pr = smearDown(mirror(tint(Pp, '#12051a'), feetY), 8, 1.2);
    maskAlphaV(Pr, feetY, 0.85, feetY + 170, 0.0);
    put(g, Pr, 0.85);
    // long shadows toward camera
    const Sh = castShadow(Pp, feetY, 10.5, ppm, 0.12);
    const ShT = tint(Sh, '#05010a');
    maskAlphaV(ShT, feetY, 0.75, H, 0.25);
    put(g, ShT, 0.8, 'source-over', `blur(${px(2.5)}px)`);
    // sun wrap + silhouettes
    put(g, tint(Pp, 'rgb(255,190,140)'), 0.75, 'screen', `blur(${px(3)}px)`);
    put(g, tint(Pp, '#0e0414'));
    put(g, tint(Pp, 'rgb(255,170,120)'), 0.35, 'screen', `blur(${px(0.8)}px)`);
    put(g, tint(Pp, '#0e0414'), 0.85);

    // horizon haze over road / people feet
    const hz = g.createLinearGradient(0, HZ - 8, 0, HZ + 40);
    hz.addColorStop(0, 'rgba(255,130,170,0)'); hz.addColorStop(0.3, 'rgba(255,130,170,0.35)'); hz.addColorStop(1, 'rgba(255,130,170,0)');
    g.fillStyle = hz; g.fillRect(0, HZ - 8, W, 48);

    // car + reflections
    const C = layer(); paintCar(C.g);
    const TL = layer(); paintTaillights(TL.g);
    const Cm = smearDown(mirror(C, CAR.gy), 10, 1.4);
    maskAlphaV(Cm, CAR.gy, 0.6, H, 0.15);
    put(g, Cm, 0.9);
    {
      const St = layer(); const c = St.g; const { cx, gy, hw } = CAR;
      for (let x = -1.0; x <= 1.0; x += 0.012) {
        const end = Math.abs(x) > 0.66 ? 1 : 0.45;
        const a = end * (0.55 + 0.45 * Math.sin(x * 37) ** 2);
        const lg = c.createLinearGradient(0, gy - 4, 0, H);
        lg.addColorStop(0, `rgba(255,40,70,${0.55 * a})`); lg.addColorStop(0.35, `rgba(255,20,60,${0.35 * a})`); lg.addColorStop(1, `rgba(255,20,60,${0.12 * a})`);
        c.fillStyle = lg; c.fillRect(cx + x * hw * 1.02, gy - 4, 2.2, H - gy + 4);
      }
      for (const sx of [-0.9, -0.8, 0.8, 0.9]) {
        const lg = c.createLinearGradient(0, gy + 2, 0, H);
        lg.addColorStop(0, 'rgba(255,90,110,0.0)'); lg.addColorStop(0.3, 'rgba(255,170,180,0.55)'); lg.addColorStop(1, 'rgba(255,60,90,0.25)');
        c.fillStyle = lg; c.fillRect(cx + sx * hw - 3, gy + 2, 6, H - gy);
      }
      put(g, St, 0.9, 'lighter', `blur(${px(3)}px)`);
      put(g, St, 0.6, 'lighter', `blur(${px(12)}px)`);
    }
    // red spill on the road + contact shadow
    radial(g, CAR.cx, CAR.gy + 4, 0, CAR.hw * 1.3, [[0, 'rgba(255,20,50,0.45)'], [1, 'rgba(255,20,50,0)']], 'screen', 0.16);
    g.save(); g.filter = `blur(${px(5)}px)`; g.fillStyle = 'rgba(0,0,0,0.9)';
    g.beginPath(); g.ellipse(CAR.cx, CAR.gy - 2, CAR.hw * 1.02, 9, 0, 0, Math.PI * 2); g.fill(); g.restore();
    put(g, C);
    put(g, TL);
    put(g, TL, 0.9, 'lighter', `blur(${px(14)}px)`);
    put(g, TL, 0.6, 'lighter', `blur(${px(40)}px)`);

    // ---- post: bloom, grade, vignette
    const Bl = layer();
    put(Bl.g, O, 1, 'source-over', 'brightness(0.72) contrast(3.4) saturate(1.4)');
    // contrast: multiply the frame by itself (deepens blacks, keeps highlights)
    const Cc = layer(); put(Cc.g, O);
    put(g, Cc, 0.3, 'multiply');
    put(g, Bl, 0.3, 'screen', `blur(${px(12)}px)`);
    put(g, Bl, 0.2, 'screen', `blur(${px(46)}px)`);
    // darken left side for type legibility
    const lv = g.createLinearGradient(0, 0, 560, 0);
    lv.addColorStop(0, 'rgba(8,0,18,0.55)'); lv.addColorStop(1, 'rgba(8,0,18,0)');
    g.fillStyle = lv; g.fillRect(0, 0, 560, H);
    // vignette
    radial(g, W / 2, H / 2, H * 0.35, W * 0.72, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(4,0,10,0.7)']], 'source-over', 0.75);

    put(g, tint(PEOPLE, '#0b0310'), 0.5);
    const scene = O.c.toDataURL('image/png');

    // ---- typography
    paintTitle(g);
    paintBrand(g);
    // final light bloom on everything (neon)
    const B2 = layer();
    put(B2.g, O, 1, 'source-over', 'brightness(0.8) contrast(3) saturate(1.2)');
    put(g, B2, 0.18, 'screen', `blur(${px(10)}px)`);
    // grain
    const N = document.createElement('canvas'); N.width = W * S; N.height = H * S;
    const nx = N.getContext('2d'); const id = nx.createImageData(N.width, N.height); const R = rng(99);
    for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (R() - 0.5) * 46; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    nx.putImageData(id, 0, 0);
    put(g, N, 0.06, 'overlay');

    return { scene, final: O.c.toDataURL('image/png') };
  }

  window.renderAll = (mode) => (mode === 'specimen' ? specimen() : render());
})();
