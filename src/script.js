/* =============================================
   PORTFOLIO — script.js
   Three.js (3D) · GSAP + ScrollTrigger · Lenis
   ============================================= */
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const fine   = matchMedia('(pointer: fine)').matches;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root   = document.documentElement;
const clamp  = (v, a, b) => Math.min(b, Math.max(a, v));
let mx = innerWidth / 2, my = innerHeight / 2;
addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });

history.scrollRestoration = 'manual';
scrollTo(0, 0);
gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

/* ---------- Smooth vertical scroll (Lenis) ---------- */
let lenis = null;
if (!reduce && window.Lenis) {
  lenis = new Lenis({ lerp: 0.09, smoothWheel: true, touchMultiplier: 1.4 });
  lenis.stop();                                   // locked until the preloader finishes
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(t => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
const scrollVel = () => (lenis && isFinite(lenis.velocity) ? lenis.velocity : 0);
if (!lenis) document.body.style.overflow = 'hidden';

$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const id = a.getAttribute('href');
  const t = id === '#hero' ? 0 : $(id);
  if (t === null || (t !== 0 && !t)) return;
  e.preventDefault();
  closeMenu();
  lenis ? lenis.scrollTo(t, { offset: t === 0 ? 0 : -10, duration: 1.4 })
        : scrollTo({ top: t === 0 ? 0 : t.offsetTop, behavior: 'smooth' });
}));

/* ---------- Menu ---------- */
const hamburger = $('#hamburger'), navLinks = $('#nav-links');
function closeMenu() {
  navLinks.classList.remove('open'); hamburger.classList.remove('open'); $('#navbar').classList.remove('menu-open'); hamburger.setAttribute('aria-expanded', false);
}
hamburger.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  hamburger.classList.toggle('open', open);
  $('#navbar').classList.toggle('menu-open', open);
  hamburger.setAttribute('aria-expanded', open);
});

/* ---------- Cursor: object-detector box (with a "pull" label over the 3D balls) ---------- */
let extraTag = null;
window.setCursorTag = t => {
  extraTag = t;
  if (!t && !window.__curTarget) $('#reticle').classList.remove('tagged');
};
if (fine) {
  root.classList.add('has-cursor');
  const dot = $('#cursor-dot'), ret = $('#reticle'), label = $('#reticle-label');
  const cur = { x: mx, y: my, w: 30, h: 30 }, goal = { x: mx, y: my, w: 30, h: 30 };
  const KINDS = [['.card', 'project'], ['.pills span', 'skill'], ['.stat', 'metric'], ['button', 'button'], ['a', 'link']];
  let target = null;
  document.addEventListener('mouseover', e => {
    target = e.target.closest('a, button, [role="button"], .pills span');
    window.__curTarget = target;
    if (!target) { ret.classList.remove('snap'); if (!extraTag) ret.classList.remove('tagged'); return; }
    const kind = target.dataset.cursor || (KINDS.find(k => target.matches(k[0])) || [0, 'object'])[1];
    label.textContent = kind + ' ' + (0.9 + Math.random() * 0.09).toFixed(2);
    ret.classList.add('tagged');
  });
  addEventListener('mousedown', () => ret.classList.add('down'));
  addEventListener('mouseup', () => ret.classList.remove('down'));
  let px = mx, py = my, speed = 0, svx = 0, svy = 0;
  (function loop() {
    const dx = mx - px, dy = my - py; px = mx; py = my;
    speed += (Math.hypot(dx, dy) - speed) * 0.16;               // smoothed pointer speed (px / frame)
    svx += (dx - svx) * 0.2; svy += (dy - svy) * 0.2;
    let free = false;
    if (target && document.contains(target)) {
      const r = target.getBoundingClientRect();
      if (r.width > 420 || r.height > 220) { goal.x = mx; goal.y = my; goal.w = goal.h = 58; ret.classList.remove('snap'); }
      else { goal.x = r.left + r.width / 2; goal.y = r.top + r.height / 2; goal.w = r.width + 14; goal.h = r.height + 14; ret.classList.add('snap'); }
    } else if (extraTag) {
      goal.x = mx; goal.y = my; goal.w = goal.h = 58; label.textContent = extraTag; ret.classList.add('tagged');
    } else {                                                    // free movement: the ring swells with speed, relaxes when you stop
      free = true;
      goal.x = mx; goal.y = my; goal.w = goal.h = 30 + clamp(speed * 2.4, 0, 90);
    }
    cur.x += (goal.x - cur.x) * 0.24; cur.y += (goal.y - cur.y) * 0.24;
    const kk = goal.w > cur.w ? 0.2 : 0.085;                    // grows quickly, settles back slowly
    cur.w += (goal.w - cur.w) * kk; cur.h += (goal.h - cur.h) * kk;
    const stretch = free ? clamp(speed / 70, 0, 0.45) : 0;      // stretches along the direction of travel
    ret.style.width = cur.w + 'px'; ret.style.height = cur.h + 'px';
    ret.style.transform = 'translate(' + (cur.x - cur.w / 2) + 'px,' + (cur.y - cur.h / 2) + 'px)' +
      (stretch > 0.02 ? ' rotate(' + Math.atan2(svy, svx) + 'rad) scale(' + (1 + stretch) + ',' + (1 - stretch * 0.4) + ')' : '');
    ret.style.background = free ? 'rgba(255,255,255,' + clamp(speed / 400, 0, 0.12) + ')' : '';
    dot.style.transform = 'translate(' + mx + 'px,' + my + 'px) scale(' + (1 - clamp(speed / 90, 0, 0.6)) + ')';
    requestAnimationFrame(loop);
  })();
}

/* ---------- 3D scene: morphing latent-space point cloud + a living loss landscape (last section) ---------- */
function initGL() {
  const canvas = $('#gl');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (e) { canvas.remove(); return { start() {}, state: {}, showTerrain() {}, hideTerrain() {} }; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(35, 1, 1, 100);
  cam.position.set(0, 0, 30);

  /* procedural studio environment: soft boxes + coloured bounce -> gives the balls real reflections */
  (function env() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#2b2257'); g.addColorStop(0.5, '#7d5df0'); g.addColorStop(1, '#10081c');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    const blob = (px, py, rx, ry, col) => {
      x.save(); x.translate(px, py); x.scale(rx, ry);
      const rg = x.createRadialGradient(0, 0, 0, 0, 0, 1);
      rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rg; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore();
    };
    blob(256, 100, 240, 70, 'rgba(255,255,255,1)');
    blob(768, 150, 180, 64, 'rgba(255,110,185,.95)');
    blob(512, 390, 320, 90, 'rgba(110,200,255,.55)');
    blob(930, 290, 80, 170, 'rgba(255,255,255,.85)');
    blob(90, 290, 80, 160, 'rgba(255,255,255,.7)');
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping; t.encoding = THREE.sRGBEncoding;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromEquirectangular(t).texture;
    pm.dispose(); t.dispose();
  })();
  const key = new THREE.DirectionalLight(0xffffff, 0.5); key.position.set(-6, 10, 14); scene.add(key);

  let W, H, S, tScale = 1;
  const FOV_H = 2 * Math.tan(THREE.MathUtils.degToRad(17.5)) * 30;

  /* a morphing "latent space" point cloud: t-SNE clusters -> embedding sphere -> tensor grid -> helix */
  const COUNT = innerWidth < 760 ? 3800 : 7500;
  const cloud = new THREE.Group(); cloud.position.z = -3; scene.add(cloud);
  const shp = [0, 1, 2, 3].map(() => new Float32Array(COUNT * 3));
  const colA = new Float32Array(COUNT * 3), rndA = new Float32Array(COUNT);
  const CPAL = ['#9d7bff', '#4f8bff', '#7c5cff', '#5ec8ff', '#b79bff'].map(x => new THREE.Color(x));
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
  const centers = Array.from({ length: 5 }, () => new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 6));
  const n3 = Math.ceil(Math.cbrt(COUNT)), sp = 9 / n3;
  for (let i = 0; i < COUNT; i++) {
    const k = i * 3, ci = i % 5, cn = centers[ci];
    shp[0][k] = cn.x + gauss() * 1.1; shp[0][k + 1] = cn.y + gauss() * 1.1; shp[0][k + 2] = cn.z + gauss() * 1.1;            // clusters
    const y = 1 - (i / (COUNT - 1)) * 2, rr = Math.sqrt(1 - y * y), th = i * 2.39996323, R = 5 + (Math.random() - 0.5) * 0.25;
    shp[1][k] = Math.cos(th) * rr * R; shp[1][k + 1] = y * R; shp[1][k + 2] = Math.sin(th) * rr * R;                        // sphere
    shp[2][k] = ((i % n3) - n3 / 2) * sp; shp[2][k + 1] = ((Math.floor(i / n3) % n3) - n3 / 2) * sp; shp[2][k + 2] = (Math.floor(i / (n3 * n3)) - n3 / 2) * sp;   // tensor grid
    const t = (i >> 1) / (COUNT / 2), ang = t * Math.PI * 10 + (i & 1) * Math.PI;
    shp[3][k] = Math.cos(ang) * 3.2 + (Math.random() - 0.5) * 0.25; shp[3][k + 1] = (t - 0.5) * 13; shp[3][k + 2] = Math.sin(ang) * 3.2 + (Math.random() - 0.5) * 0.25;  // helix
    const col = CPAL[ci]; colA[k] = col.r; colA[k + 1] = col.g; colA[k + 2] = col.b; rndA[i] = Math.random();
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(shp[0], 3));
  cg.setAttribute('p1', new THREE.BufferAttribute(shp[1], 3));
  cg.setAttribute('p2', new THREE.BufferAttribute(shp[2], 3));
  cg.setAttribute('p3', new THREE.BufferAttribute(shp[3], 3));
  cg.setAttribute('aCol', new THREE.BufferAttribute(colA, 3));
  cg.setAttribute('rnd', new THREE.BufferAttribute(rndA, 1));
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uM: { value: 0 }, uTime: { value: 0 }, uBurst: { value: 0 }, uSize: { value: 3.4 * Math.min(devicePixelRatio, 1.75) }, uMouse: { value: new THREE.Vector2(999, 999) }, uAmt: { value: 0 }, uViolet: { value: 0 }, uLight: { value: 0 } },
    vertexShader: `
      attribute vec3 p1; attribute vec3 p2; attribute vec3 p3; attribute vec3 aCol; attribute float rnd;
      uniform float uM; uniform float uTime; uniform float uBurst; uniform float uSize; uniform vec2 uMouse; uniform float uAmt; uniform float uViolet; uniform float uLight;
      varying vec3 vC;
      float ss(float a){ return smoothstep(0.0, 1.0, clamp(a, 0.0, 1.0)); }
      void main(){
        vec3 p = position;
        p = mix(p, p1, ss(uM)); p = mix(p, p2, ss(uM - 1.0)); p = mix(p, p3, ss(uM - 2.0));
        p += vec3(sin(uTime*0.6 + rnd*30.0), cos(uTime*0.5 + rnd*20.0), sin(uTime*0.7 + rnd*10.0)) * 0.14;
        p += normalize(p + 0.001) * uBurst * (rnd - 0.3) * 2.4;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vec2 dir = wp.xy - uMouse; float d = length(dir);
        float f = smoothstep(6.0, 0.0, d); f = f * f;                       // eased falloff = soft, fluid push
        wp.xy += normalize(dir + 0.0001) * f * 2.0 * uAmt;
        wp.z  += f * 1.4 * uAmt;
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.7 + rnd * 1.4) * (30.0 / -mv.z);
        vec3 onViolet = mix(vec3(0.03, 0.03, 0.06), vec3(1.0), step(0.55, rnd));    // readable on the purple section
        vec3 onLight  = mix(vec3(0.31, 0.20, 0.90), vec3(0.03, 0.03, 0.06), step(0.6, rnd));  // readable on the light section
        vC = mix(mix(aCol, onLight, uLight), onViolet, uViolet);
      }`,
    fragmentShader: `
      varying vec3 vC;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vC, smoothstep(0.5, 0.12, d) * 0.92);
      }`
  });
  const points = new THREE.Points(cg, cloudMat); points.frustumCulled = false; cloud.add(points);
  const state = { nx: 0.55, ny: -0.02, s: 0, mul: 1.05, ry: 0, morph: 0, tv: 0, tl: 0, terr: 0 };

  /* ---- last section: a living loss landscape with gradient-descent optimizers ---- */
  const EX = 16, EZ = 7;
  const terr = new THREE.Group(); terr.visible = false; scene.add(terr);
  const tg = new THREE.PlaneGeometry(EX * 2, EZ * 2, 190, 90); tg.rotateX(-Math.PI / 2);
  const tu = { uT: { value: 0 }, uWell: { value: 0 }, uGx: { value: 2.2 }, uGz: { value: -1.0 }, uPx: { value: 0 }, uPz: { value: 0 }, uFade: { value: 0 } };
  const terrMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: tu,
    vertexShader: `
      uniform float uT; uniform float uWell; uniform float uGx; uniform float uGz; uniform float uPx; uniform float uPz;
      varying float vH; varying vec2 vP;
      float lossf(vec2 p){
        float h = 0.6*sin(0.8*p.x)*cos(0.8*p.y) + 0.012*dot(p,p) + 0.3*sin(0.35*p.x + 0.55*p.y + uT*0.3);
        h -= 3.2*exp(-dot(p - vec2(uGx,uGz), p - vec2(uGx,uGz))/6.0);   // global minimum
        h -= uWell*exp(-dot(p - vec2(uPx,uPz), p - vec2(uPx,uPz))/5.0); // the cursor digs its own well
        return h;
      }
      void main(){
        vec3 pos = position; pos.y = lossf(pos.xz);
        vH = pos.y; vP = pos.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: `
      varying float vH; varying vec2 vP; uniform float uFade;
      void main(){
        float line = 1.0 - smoothstep(0.0, 0.07, abs(fract(vH * 1.7) - 0.5));          // contour lines
        vec2 g = abs(fract(vP * 0.5) - 0.5);
        float grid = (1.0 - smoothstep(0.0, 0.035, min(g.x, g.y))) * 0.26;              // faint grid
        vec3 c = mix(vec3(0.62, 0.48, 1.0), vec3(0.36, 0.55, 1.0), smoothstep(-1.0, 3.0, vH));
        c = mix(vec3(1.0), c, smoothstep(-3.4, -0.8, vH));                              // glows white in the valleys
        float edge = (1.0 - smoothstep(9.0, 16.0, abs(vP.x))) * (1.0 - smoothstep(3.5, 7.0, abs(vP.y)));
        float glow = (1.0 - smoothstep(-3.4, -2.0, vH)) * 0.55;
        float a = (line * 0.85 + grid + glow + 0.03) * edge * uFade;
        gl_FragColor = vec4(c, a);
      }`
  });
  terr.add(new THREE.Mesh(tg, terrMat));
  const loss = (x, z) => 0.6 * Math.sin(0.8 * x) * Math.cos(0.8 * z) + 0.012 * (x * x + z * z) + 0.3 * Math.sin(0.35 * x + 0.55 * z + tu.uT.value * 0.3)
    - 3.2 * Math.exp(-((x - tu.uGx.value) ** 2 + (z - tu.uGz.value) ** 2) / 6) - tu.uWell.value * Math.exp(-((x - tu.uPx.value) ** 2 + (z - tu.uPz.value) ** 2) / 5);

  const beadGeo = new THREE.SphereGeometry(0.26, 24, 16);
  const beadMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.06, envMapIntensity: 1.6 });
  const haloMat = new THREE.MeshBasicMaterial({ color: 0x9d7bff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  const TRAIL = 56, beads = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(beadGeo, beadMat), halo = new THREE.Mesh(beadGeo, haloMat);
    halo.scale.setScalar(2.3); m.add(halo);
    const pos = new Float32Array(TRAIL * 3), col = new Float32Array(TRAIL * 3);
    for (let k = 0; k < TRAIL; k++) { const f = 1 - k / TRAIL; col[k * 3] = 0.62 * f; col[k * 3 + 1] = 0.5 * f; col[k * 3 + 2] = f; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    line.frustumCulled = false; m.frustumCulled = false;
    m.visible = line.visible = false;
    terr.add(m, line);
    beads.push({ m, line, pos, x: 0, z: 0, vx: 0, vz: 0, on: false, t0: 0, still: 0, trail: [] });
  }
  const randSpot = () => [(Math.random() - 0.5) * 2 * (EX - 4), (Math.random() - 0.5) * 2 * (EZ - 1.5)];
  function drop(b, x, z, t) { Object.assign(b, { x, z, vx: 0, vz: 0, on: true, t0: t, still: 0, trail: [] }); b.m.visible = b.line.visible = true; }
  function stepBeads(dt, t) {
    const e = 0.05, damp = Math.pow(0.93, dt * 60);
    beads.forEach(b => {
      if (!b.on) return;
      const gx = (loss(b.x + e, b.z) - loss(b.x - e, b.z)) / (2 * e), gz = (loss(b.x, b.z + e) - loss(b.x, b.z - e)) / (2 * e);
      b.vx = (b.vx - gx * dt * 26) * damp; b.vz = (b.vz - gz * dt * 26) * damp;     // gradient descent with momentum
      b.x += b.vx * dt * 6; b.z += b.vz * dt * 6;
      const sp = Math.hypot(b.vx, b.vz);
      b.still = sp < 0.05 ? b.still + dt : 0;
      if (b.still > 2.2 || Math.abs(b.x) > EX - 1 || Math.abs(b.z) > EZ - 0.6) { const r = randSpot(); drop(b, r[0], r[1], t); }   // converged -> start a new run
      const y = loss(b.x, b.z) + 0.3;
      b.m.position.set(b.x, y, b.z); b.m.scale.setScalar(Math.max(0.0001, state.terr));
      b.trail.unshift([b.x, y, b.z]); if (b.trail.length > TRAIL) b.trail.pop();
      for (let k = 0; k < TRAIL; k++) { const p = b.trail[Math.min(k, b.trail.length - 1)]; b.pos[k * 3] = p[0]; b.pos[k * 3 + 1] = p[1]; b.pos[k * 3 + 2] = p[2]; }
      b.line.geometry.attributes.position.needsUpdate = true;
    });
  }

  let terrOn = false;
  function showTerrain() {
    if (terrOn) return;
    terrOn = true; terr.visible = true;
    beads.forEach((b, i) => { if (i < 6) { const r = randSpot(); drop(b, r[0], r[1], time); } else { b.on = false; b.m.visible = b.line.visible = false; } });
    gsap.to(state, { terr: 1, duration: 1.6, ease: 'power3.out', overwrite: 'auto' });
  }
  function hideTerrain() {
    terrOn = false; window.setCursorTag(null);
    gsap.to(state, { terr: 0, duration: 0.8, overwrite: 'auto', onComplete: () => { if (!terrOn) terr.visible = false; } });
  }

  /* pointer helpers */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), pt = new THREE.Vector3();
  const tplane = new THREE.Plane(), nrm = new THREE.Vector3(), loc = new THREE.Vector3();
  const setNdc = () => ndc.set(mx / innerWidth * 2 - 1, -(my / innerHeight) * 2 + 1);
  const pointerWorld = () => { setNdc(); ray.setFromCamera(ndc, cam); ray.ray.intersectPlane(plane, pt); return pt; };
  function pointerLocal() {                                      // pointer -> terrain coordinates
    setNdc(); ray.setFromCamera(ndc, cam);
    nrm.set(0, 1, 0).applyQuaternion(terr.quaternion);
    tplane.setFromNormalAndCoplanarPoint(nrm, terr.position);
    if (!ray.ray.intersectPlane(tplane, loc)) return null;
    return terr.worldToLocal(loc);
  }
  const overUI = t => t && t.closest && t.closest('a, button, .card, .modal, .pills span, input');

  addEventListener('mousemove', e => { if (fine) window.setCursorTag(terrOn && !overUI(e.target) ? 'drop' : null); }, { passive: true });
  addEventListener('click', e => {                               // click = drop a new optimizer where you point
    mx = e.clientX; my = e.clientY;
    if (!terrOn || overUI(e.target)) return;
    const p = pointerLocal(); if (!p) return;
    const free = beads.find(b => !b.on) || beads.reduce((o, b) => (b.t0 < o.t0 ? b : o), beads[0]);
    drop(free, clamp(p.x, -EX + 2, EX - 2), clamp(p.z, -EZ + 1, EZ - 1), time);
    const rp = document.createElement('div'); rp.className = 'ripple';
    rp.style.left = mx + 'px'; rp.style.top = my + 'px'; document.body.appendChild(rp);
    gsap.fromTo(rp, { scale: 0.2, opacity: 1 }, { scale: 6, opacity: 0, duration: 0.8, ease: 'expo.out', onComplete: () => rp.remove() });
  });

  function size() {
    renderer.setSize(innerWidth, innerHeight, false);
    cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    H = FOV_H; W = H * cam.aspect; S = clamp(W / 34, 0.45, 1);
    tScale = clamp(Math.max(W * 0.95 / (EX * 2), cam.aspect < 1 ? 0.45 : 0), 0.28, 1.15);
  }
  size();
  addEventListener('resize', size);

  const clock = new THREE.Clock();
  let time = 0, tiltX = 0, tiltY = 0, scatter = 0, wellAmt = 0;
  const mouseSm = new THREE.Vector2(999, 999);
  let mouseAmt = 0, mouseIn = false, mouseSeen = false;
  addEventListener('mousemove', () => { mouseIn = true; }, { passive: true });
  document.addEventListener('mouseleave', () => { mouseIn = false; });

  function tick() {
    const dt = Math.min(clock.getDelta(), 1 / 30) || 1 / 60;
    time += dt;
    const v = scrollVel();
    tiltX += (((my / innerHeight) - 0.5) * 0.7 - tiltX) * 0.06;
    tiltY += (((mx / innerWidth) - 0.5) * 0.9 - tiltY) * 0.06;
    state.ry += v * 0.004;                                     // the cloud spins faster while you scroll
    scatter += (clamp(Math.abs(v) * 0.04, 0, 1.2) - scatter) * 0.1;  // ...and scatters a little
    const U = cloudMat.uniforms;
    U.uM.value = state.morph; U.uTime.value = time; U.uBurst.value = scatter;
    if (fine) {                                                // pointer is eased, so the field glides instead of snapping
      const pw = pointerWorld();
      if (!mouseSeen) { mouseSm.set(pw.x, pw.y); mouseSeen = true; }
      const k = 1 - Math.exp(-dt * 7);
      mouseSm.x += (pw.x - mouseSm.x) * k; mouseSm.y += (pw.y - mouseSm.y) * k;
      mouseAmt += ((mouseIn ? 1 : 0) - mouseAmt) * (1 - Math.exp(-dt * 4));
      U.uMouse.value.copy(mouseSm); U.uAmt.value = mouseAmt;
    }
    U.uViolet.value = state.tv; U.uLight.value = state.tl;
    cloud.position.set(state.nx * W / 2, state.ny * H / 2, -3);
    cloud.scale.setScalar(Math.max(0.0001, state.s * state.mul * S));
    cloud.rotation.set(tiltX * 0.5 + Math.sin(time * 0.2) * 0.12, state.ry * 0.5 + time * 0.12 + tiltY, 0);


    if (terr.visible) {                                          // loss landscape
      terr.rotation.set(0.85 + (my / innerHeight - 0.5) * 0.1, (mx / innerWidth - 0.5) * 0.35 + Math.sin(time * 0.15) * 0.08, 0);
      terr.position.set(0, -H * 0.16, -2); terr.scale.setScalar(tScale);
      terr.updateMatrixWorld(true);
      tu.uT.value = time; tu.uFade.value = state.terr;
      if (fine && mouseIn && terrOn) {
        const p = pointerLocal();
        if (p) { tu.uPx.value += (p.x - tu.uPx.value) * 0.12; tu.uPz.value += (p.z - tu.uPz.value) * 0.12; }
      }
      wellAmt += (((fine && mouseIn && terrOn) ? 2.6 : 0) - wellAmt) * 0.06; tu.uWell.value = wellAmt;
      stepBeads(dt, time);
    }
    cam.position.x += ((mx / innerWidth - 0.5) * 2 - cam.position.x) * 0.05;
    cam.position.y += ((0.5 - my / innerHeight) * 1 - cam.position.y) * 0.05;
    cam.lookAt(0, 0, 0);
    renderer.render(scene, cam);
  }
  gsap.ticker.add(tick);

  return {
    state, showTerrain, hideTerrain,
    start() { gsap.to(state, { s: 1, duration: 1.8, ease: 'elastic.out(1,0.55)', delay: 0.4 }); }
  };
}

/* ---------- Preloader → intro ---------- */
function splitChars() {
  let i = 0;
  $$('[data-split]').forEach(line => {
    const text = line.textContent.trim(); line.textContent = '';
    [...text].forEach(c => {
      const s = document.createElement('span');
      s.className = 'ch'; s.textContent = c; s.setAttribute('aria-hidden', 'true');
      line.appendChild(s);
    });
  });
}
splitChars();
const chars = $$('.ch');
gsap.set(chars, { yPercent: 115 });
gsap.set(['.hero-left', '.portrait', '.hero-desc', '.hero-actions', '.pull-hint'], { opacity: 0, y: 30 });
function splitHeading(el) {
  const text = el.textContent.trim();
  el.setAttribute('aria-label', text); el.textContent = '';
  const words = text.split(' ');
  words.forEach((w, i) => {
    const wd = document.createElement('span'); wd.className = 'word'; wd.setAttribute('aria-hidden', 'true');
    [...w].forEach(ch => { const c = document.createElement('span'); c.className = 'wc'; c.textContent = ch; wd.appendChild(c); });
    el.appendChild(wd);
    if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
  });
  el.classList.remove('reveal');
  gsap.from($$('.wc', el), { yPercent: 115, rotationX: -75, opacity: 0, transformOrigin: '50% 100%', stagger: 0.03, duration: 1.1, ease: 'expo.out',
    scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
}
$$('.mega-sm, .contact .mega').forEach(splitHeading);
/* Skills: the cards are "dealt" out of a stack at the centre of the grid - each one swings in on a 3D arc as you scroll */
(function dealSkillCards() {
  const sgs = $$('.sg'), grid = $('.skills-grid');
  if (!sgs.length || reduce) return;
  const centre = el => [el.offsetLeft + el.offsetWidth / 2, el.offsetTop + el.offsetHeight / 2];
  gsap.set(sgs, { transformPerspective: 1300 });
  gsap.fromTo(sgs, {
    x: (i, el) => centre(grid)[0] - centre(el)[0],
    y: (i, el) => centre(grid)[1] - centre(el)[1] - 40,
    z: -500, scale: 0.55, opacity: 0,
    rotationX: 55, rotationY: i => (i % 2 ? -1 : 1) * 70, rotationZ: i => (i - 2) * 10,
    zIndex: i => 10 - i
  }, {
    x: 0, y: 0, z: 0, scale: 1, opacity: 1, rotationX: 0, rotationY: 0, rotationZ: 0, zIndex: 1,
    ease: 'power3.out', stagger: 0.16,
    scrollTrigger: { trigger: grid, start: 'top 92%', end: 'top 25%', scrub: 1, invalidateOnRefresh: true }
  });
})();
gsap.set('.reveal', { opacity: 0, y: 50 });

let gl, loaderFX;
document.fonts.ready.then(() => {
  gl = initGL();
  ScrollTrigger.create({ trigger: '#contact', start: 'top 65%', onEnter: () => gl.showTerrain(), onLeaveBack: () => gl.hideTerrain() });
  if (gl.state && 'nx' in gl.state) {                   // the point cloud travels and morphs between sections as you scroll
    gsap.timeline({ scrollTrigger: { trigger: 'main', start: 'top top', end: 'bottom bottom', scrub: 1.2 } })
      .to(gl.state, { nx: -0.62, ny: 0.12, ry: Math.PI * 2, mul: 0.95, morph: 1, duration: 1, ease: 'none' })
      .to(gl.state, { nx: 0.74, ny: 0.28, ry: Math.PI * 4, mul: 0.6, morph: 2, duration: 1.2, ease: 'none' })
      .to(gl.state, { nx: -0.7, ny: -0.1, ry: Math.PI * 6, mul: 1, morph: 3, duration: 1, ease: 'none' })
      .to(gl.state, { nx: 0.5, ny: 0.05, ry: Math.PI * 8, mul: 0.001, morph: 1, duration: 1, ease: 'none' });
  }
  loaderFX = initLoader();
  const o = { v: 0 }, num = $('#loader-num');
  gsap.to(o, { v: 100, duration: reduce ? 0.3 : 2.9, ease: 'power1.inOut',
    onUpdate: () => { num.textContent = Math.round(o.v); loaderFX.progress(o.v / 100); }, onComplete: reveal });
});

/* Preloader: random noise "trains" into the name — accuracy rises as the % climbs */
function initLoader() {
  const cv = $('#loader-cv'), ctx = cv.getContext('2d');
  const read = $('#ld-read'), status = $('#ld-status'), bar = $('#ld-bar');
  const STATUS = ['initialising tensors…', 'loading face encodings…', 'warming up the model…', 'compiling interface…', 'ready.'];
  let W, H, parts = [], p = 0, exploding = 0, raf = 0, running = true;
  const mouse = { x: -999, y: -999 };

  function build() {
    const dpr = Math.min(devicePixelRatio, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const o = off.getContext('2d');
    const fs = Math.min(W * 0.17, H * 0.3);
    o.fillStyle = '#fff'; o.font = '800 ' + fs + 'px Geist, Arial Black, sans-serif';
    o.textAlign = 'center'; o.textBaseline = 'middle';
    o.fillText('PREETHAM', W / 2, H * 0.5 - fs * 0.5);
    o.fillText('ACHARYA', W / 2, H * 0.5 + fs * 0.5);
    const data = o.getImageData(0, 0, W, H).data, step = Math.max(4, Math.round(fs / 22)), pts = [];
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (data[(y * W + x) * 4 + 3] > 128) pts.push([x, y]);
    const keep = Math.min(1, 5200 / pts.length);
    parts = pts.filter(() => Math.random() < keep).map(([tx, ty]) => ({
      tx, ty, x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0,
      ox: Math.random() - 0.5, oy: Math.random() - 0.5, ph: Math.random() * 6.28, v: Math.random() < 0.3, r: 1.5 + Math.random() * 1.6
    }));
  }
  build();
  addEventListener('resize', build);
  addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });

  function frame(t) {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);
    const spread = Math.pow(1 - p, 1.6) * Math.min(W, H) * 0.5;       // noise amplitude falls as the model "converges"
    for (const q of parts) {
      if (exploding) { q.x += q.vx; q.y += q.vy; q.vx *= 0.985; q.vy *= 0.985; }
      else {
        const tx = q.tx + q.ox * spread + Math.sin(t / 400 + q.ph) * (1 - p) * 14;
        const ty = q.ty + q.oy * spread + Math.cos(t / 450 + q.ph) * (1 - p) * 14;
        q.x += (tx - q.x) * 0.07; q.y += (ty - q.y) * 0.07;
        const dx = q.x - mouse.x, dy = q.y - mouse.y, d = Math.hypot(dx, dy);
        if (d < 120 && d > 0) { const f = (1 - d / 120) * 16; q.x += dx / d * f; q.y += dy / d * f; }   // cursor scatters the particles
      }
    }
    if (exploding) exploding++;
    const alpha = (0.35 + 0.65 * p) * (exploding ? Math.max(0, 1 - exploding / 55) : 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#f3f3f8'; for (const q of parts) if (!q.v) ctx.fillRect(q.x, q.y, q.r, q.r);
    ctx.fillStyle = '#9d7bff'; for (const q of parts) if (q.v) ctx.fillRect(q.x, q.y, q.r, q.r);
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    progress(v) {
      p = v;
      bar.style.transform = 'scaleX(' + v + ')';
      read.textContent = 'acc ' + (100 * (1 - 0.97 * Math.exp(-v * 4.2))).toFixed(1) + '%';
      status.textContent = STATUS[v >= 0.98 ? 4 : v >= 0.75 ? 3 : v >= 0.5 ? 2 : v >= 0.25 ? 1 : 0];
    },
    burst() {                                                          // particles fly outward on completion
      for (const q of parts) {
        const dx = q.x - W / 2, dy = q.y - H / 2, len = Math.hypot(dx, dy) || 1, sp = 6 + Math.random() * 20;
        q.vx = dx / len * sp; q.vy = dy / len * sp;
      }
      exploding = 1;
    },
    stop() { running = false; cancelAnimationFrame(raf); }
  };
}

function reveal() {
  const tl = gsap.timeline();
  tl.add(() => loaderFX.burst(), 0)
    .to('.loader-ui', { opacity: 0, duration: 0.5 }, 0.1)
    .add(() => $('#loader').classList.add('curve'), 0.45)
    .to('#loader', { yPercent: -100, duration: 1.1, ease: 'power4.inOut', onComplete: () => {
      loaderFX.stop(); $('#loader').remove();
      if (lenis) lenis.start(); else document.body.style.overflow = '';
      ScrollTrigger.refresh();
    } }, 0.6)
    .add(() => gl.start(), 1.0)
    .to(chars, { yPercent: 0, duration: 1.2, stagger: 0.05, ease: 'expo.out' }, 1.1)
    .to(['.hero-left', '.portrait', '.hero-desc', '.hero-actions', '.pull-hint'], { opacity: 1, y: 0, duration: 1, stagger: 0.1, ease: 'power3.out' }, 1.5)
    .add(() => $$('.hero-name .line').forEach(l => { l.style.overflow = 'visible'; }), 3.4);
}

/* ---------- Hero name hover: weight swell + cursor-lit gradient + glow + 3D lift per letter ---------- */
if (fine && !reduce) {
  gsap.set(chars, { transformPerspective: 700 });
  const fx = chars.map(c => ({
    y:  gsap.quickTo(c, 'y',         { duration: 0.6, ease: 'power3.out' }),
    ry: gsap.quickTo(c, 'rotationY', { duration: 0.6, ease: 'power3.out' }),
    rx: gsap.quickTo(c, 'rotationX', { duration: 0.6, ease: 'power3.out' })
  }));
  let heroOn = true, raf = 0;
  new IntersectionObserver(es => { heroOn = es[0].isIntersecting; }).observe($('.hero'));
  const update = () => {
    raf = 0;
    if (!heroOn) return;
    chars.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height / 2);
      const p = clamp(1 - Math.hypot(dx, dy) / 340, 0, 1);
      c.style.setProperty('--w', Math.round(560 + 340 * p));
      c.style.setProperty('--cx', (mx - r.left) + 'px');
      c.style.setProperty('--cy', (my - r.top) + 'px');
      c.style.setProperty('--p', p.toFixed(3));
      fx[i].y(-p * p * 26); fx[i].ry(clamp(-dx / 10, -40, 40) * p); fx[i].rx(clamp(dy / 14, -25, 25) * p);
    });
  };
  addEventListener('mousemove', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  document.addEventListener('mouseleave', () => chars.forEach((c, i) => { c.style.setProperty('--p', 0); c.style.setProperty('--cx', '-999px'); fx[i].y(0); fx[i].ry(0); fx[i].rx(0); }));
}

/* ---------- Typewriter ---------- */
(function typewriter() {
  const el = $('#typewriter'), ph = ['ML Engineer', 'Full Stack Developer', 'Computer Vision', 'LLM Apps'];
  let p = 0, c = 0, del = false;
  (function tick() {
    const s = ph[p];
    if (del) { el.textContent = s.slice(0, --c); if (!c) { del = false; p = (p + 1) % ph.length; return setTimeout(tick, 400); } return setTimeout(tick, 40); }
    el.textContent = s.slice(0, ++c);
    if (c === s.length) { del = true; return setTimeout(tick, 1800); }
    setTimeout(tick, 75);
  })();
})();

/* ---------- 3D tilt (portrait, project images) ---------- */
if (fine && !reduce) $$('.tilt').forEach(el => {
  el.addEventListener('mousemove', e => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(el, { rotationY: px * 14, rotationX: -py * 14, scale: 1.03, transformPerspective: 900, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
  });
  el.addEventListener('mouseleave', () => gsap.to(el, { rotationY: 0, rotationX: 0, scale: 1, duration: 0.9, ease: 'elastic.out(1,0.5)', overwrite: 'auto' }));
});

/* ---------- Marquees: speed and direction follow scroll velocity ---------- */
$$('.marquee').forEach((m, k) => {
  const track = $('.marquee-track', m);
  let x = 0;
  gsap.ticker.add(() => {
    const w = track.children[0].offsetWidth * (track.children.length > 3 ? 2 : 1);
    x -= (1.4 + scrollVel() * 0.35) * (k % 2 ? -1 : 1);
    if (x <= -w) x += w; if (x > 0) x -= w;
    track.style.transform = 'translate3d(' + x + 'px,0,0)';
  });
});

/* ---------- Pointer-reactive dot-matrix background (only in sections marked data-fx) ---------- */
const bgfx = (function () {
  const cv = $('#bgfx');
  if (!cv || !fine || reduce) return { set() {} };
  const ctx = cv.getContext('2d');
  const GAP = 34;
  let W, H, on = false, cleared = false, rgb = '157,123,255', ox = mx, oy = my;
  const st = { op: 0, r: 0 };
  let sx = mx, sy = my, lx = mx, ly = my, spd = 0;
  function size() {
    const dpr = Math.min(devicePixelRatio, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size(); addEventListener('resize', size);
  gsap.ticker.add(() => {
    if (!on && st.op < 0.01) { if (!cleared) { ctx.clearRect(0, 0, W, H); cleared = true; } return; }
    cleared = false;
    spd += (Math.hypot(mx - lx, my - ly) - spd) * 0.15; lx = mx; ly = my;
    sx += (mx - sx) * 0.12; sy += (my - sy) * 0.12;            // eased pointer = fluid motion
    const R = 150 + Math.min(spd, 60) * 4;                     // faster pointer = wider influence
    cv.style.opacity = st.op;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * 1.5);
    g.addColorStop(0, 'rgba(' + rgb + ',.20)'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgb(' + rgb + ')';
    for (let i = 0; i <= W / GAP + 1; i++) for (let j = 0; j <= H / GAP + 1; j++) {
      let x = i * GAP, y = j * GAP;
      const reveal = clamp((st.r - Math.hypot(x - ox, y - oy)) / 180, 0, 1);   // radial "wave-in" transition
      if (reveal <= 0) continue;
      const dx = x - sx, dy = y - sy, d = Math.hypot(dx, dy) || 1;
      const f = Math.exp(-(d * d) / (R * R));
      x += dx / d * f * 16; y += dy / d * f * 16;              // dots are gently pushed away
      ctx.globalAlpha = (0.2 + f * 0.8) * reveal;
      ctx.beginPath(); ctx.arc(x, y, 1.1 + f * 3.8, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  return {
    set(active, tone) {
      rgb = tone === 'violet' ? '7,7,11' : tone === 'light' ? '79,70,229' : '157,123,255';
      on = active;
      gsap.to(st, { op: active ? 1 : 0, duration: 0.6, ease: 'power2.out', overwrite: 'auto' });
      if (active) { ox = mx; oy = my; st.r = 0; gsap.to(st, { r: Math.hypot(W, H), duration: 1.4, ease: 'power3.out' }); }
    }
  };
})();

/* ---------- Section colour blocks ---------- */
$$('[data-bg]').forEach(s => {
  const go = () => { gsap.to(document.body, { backgroundColor: s.dataset.bg, color: s.dataset.fg, duration: 0.7, ease: 'power2.out', overwrite: true }); gsap.to('#navbar', { color: s.dataset.fg, duration: 0.7, overwrite: true }); gsap.to('.side-nav', { color: s.dataset.fg, duration: 0.7, overwrite: true });
    bgfx.set(s.dataset.fx === 'dots', s.dataset.tone);
    if (gl && gl.state) gsap.to(gl.state, { tv: s.dataset.tone === 'violet' ? 1 : 0, tl: s.dataset.tone === 'light' ? 1 : 0, duration: 0.8, ease: 'power2.out', overwrite: 'auto' }); };
  ScrollTrigger.create({ trigger: s, start: 'top 55%', end: 'bottom 55%', onEnter: go, onEnterBack: go });
});

/* ---------- Scroll animations ---------- */
ScrollTrigger.batch('.reveal', {
  start: 'top 90%', once: true,
  onEnter: b => gsap.to(b, { opacity: 1, y: 0, stagger: 0.09, duration: 0.9, ease: 'power3.out' })
});

const statement = $('#statement');
statement.innerHTML = statement.textContent.trim().split(/\s+/).map(w => '<span class="w">' + w + '</span>').join(' ');
gsap.fromTo($$('.w', statement), { opacity: 0.14 }, {
  opacity: 1, ease: 'none', stagger: 0.12,
  scrollTrigger: { trigger: statement, start: 'top 82%', end: 'bottom 55%', scrub: true }
});

$$('.stat-number').forEach(el => {
  const target = +el.dataset.target, o = { v: 0 };
  ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => gsap.to(o, { v: target, duration: 1.8, ease: 'expo.out', onUpdate: () => { el.textContent = Math.floor(o.v) + '+'; } }) });
});

const cards = $$('.card');
cards.forEach((card, i) => {
  gsap.fromTo(card, { rotationX: 16, y: 80, transformPerspective: 1600 }, {     // card tips up into place
    rotationX: 0, y: 0, ease: 'none',
    scrollTrigger: { trigger: card, start: 'top bottom', end: 'top 30%', scrub: true }
  });
  if (cards[i + 1]) gsap.fromTo(card, { scale: 1, opacity: 1 }, {                 // previous card recedes
    scale: 0.9, opacity: 0.4, ease: 'none', immediateRender: false,
    scrollTrigger: { trigger: cards[i + 1], start: 'top 85%', end: 'top 14%', scrub: true }
  });
  gsap.fromTo($('img', card), { yPercent: -8 }, {          // image parallax
    yPercent: 0, ease: 'none',
    scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true }
  });
});

/* ---------- Project modal ---------- */
const descs = {
  'project-visualattend': '<p>An <strong>AI-powered face recognition attendance system</strong> that changes how teachers track classroom attendance.</p><p>Manual attendance is slow, repetitive and error-prone. With VisualAttend, a teacher records a whole classroom in seconds by capturing or uploading a single photograph.</p><p>Built with <strong>dlib</strong> and <strong>face_recognition_models</strong>, it generates reliable facial encodings to identify students under varying lighting conditions and viewing angles.</p>',
  'project-connecteach': '<p>A <strong>professional networking platform</strong> that helps people build a strong digital presence and showcase their skills, experience and projects.</p><p>Users create structured profile pages that highlight their professional journey and technical capabilities.</p><p>They can also form and manage <strong>teams</strong> to work together on projects, making collaboration seamless and productive.</p>',
  'project-aiagent': '<p><strong>Info Agent</strong> is a full-stack MERN application for intelligent, real-time AI conversations.</p><p>It integrates the <strong>Groq API</strong> to deliver fast responses across multiple AI models. Users can customize AI behavior and switch models to suit their interaction style.</p><p>The project demonstrates practical <strong>AI integration</strong> and smooth frontend-backend communication.</p>'
};
Object.entries(descs).forEach(([id, html]) => { const el = document.getElementById(id); if (el) el.dataset.desc = html; });

const modal = $('#project-modal'), modalClose = $('#modal-close');
let lastFocus = null;
function openModal(card) {
  const d = card.dataset;
  $('#modal-img').src = d.img; $('#modal-img').alt = d.title;
  $('#modal-title').textContent = d.title;
  $('#modal-desc').innerHTML = d.desc || '';
  $('#modal-link').href = d.link;
  const tags = $('#modal-tags'); tags.innerHTML = '';
  JSON.parse(d.tags).forEach(t => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = t; tags.appendChild(s); });
  lastFocus = card;
  modal.classList.add('active');
  if (lenis) lenis.stop(); else document.body.style.overflow = 'hidden';
  modalClose.focus();
}
function closeModal() {
  modal.classList.remove('active');
  if (lenis) lenis.start(); else document.body.style.overflow = '';
  if (lastFocus) lastFocus.focus({ preventScroll: true });
}
$$('.project-img-btn').forEach(card => {
  card.addEventListener('click', () => openModal(card));
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(card); } });
});
modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('active')) closeModal(); });

/* ---------- Magnetic buttons + cursor spotlight ---------- */
if (fine && !reduce) $$('.btn, .card-cta, .contact-mail, .logo').forEach(el => {
  el.addEventListener('mousemove', e => {
    const r = el.getBoundingClientRect();
    gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.3, y: (e.clientY - r.top - r.height / 2) * 0.4, duration: 0.4, ease: 'power3.out' });
  });
  el.addEventListener('mouseleave', () => gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1,0.4)' }));
});
$$('.card, .spot, .term').forEach(el => el.addEventListener('mousemove', e => {
  const r = el.getBoundingClientRect();
  el.style.setProperty('--x', e.clientX - r.left + 'px'); el.style.setProperty('--y', e.clientY - r.top + 'px');
}));

/* ---------- Live "training run" terminal ---------- */
(function terminal() {
  const pre = $('#term-log'), cv = $('#loss');
  if (!pre) return;
  const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
  let ep = 0, data = [], lines = [], on = false;
  new IntersectionObserver(es => { on = es[0].isIntersecting; }, { threshold: 0.1 }).observe(cv);
  const head = ['<span class="t-hl">$</span> python train.py --task face-recognition', '<span class="t-pk">loading</span> dataset … <span class="t-ok">ok</span>'];
  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (data.length < 2) return;
    const pts = data.map((v, i) => [i / 49 * W, H - 10 - (v / 1.7) * (H - 24)]);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(157,123,255,.45)'); g.addColorStop(1, 'rgba(157,123,255,0)');
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.lineTo(pts[pts.length - 1][0], H); ctx.lineTo(0, H); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.strokeStyle = '#ff5fa2'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function step() {
    if (!on) return;
    if (++ep > 50) { ep = 1; data = []; lines = []; }
    const loss = 1.6 * Math.exp(-ep / 11) + 0.05 + Math.random() * 0.03;
    const acc = 1 - 0.9 * Math.exp(-ep / 9) - Math.random() * 0.01;
    data.push(loss);
    lines.push('epoch ' + String(ep).padStart(2, '0') + '/50  loss <span class="t-pk">' + loss.toFixed(3) + '</span>  acc <span class="t-ok">' + (acc * 100).toFixed(1) + '%</span>');
    if (lines.length > 5) lines.shift();
    pre.innerHTML = head.join('\n') + '\n' + lines.join('\n') + '\n<span class="t-hl">_</span>';
    draw();
  }
  if (reduce) { on = true; for (let i = 0; i < 20; i++) step(); } else setInterval(step, 420);
})();

/* ---------- Exploded 3D architecture stack ---------- */
(function architecture() {
  const st = $('#iso');
  if (!st) return;
  const slabs = $$('.slab', st), items = $$('.layer-list li');
  gsap.set(st, { rotationX: 58, rotationZ: -38 });
  gsap.set(slabs, { z: i => i * 14 });
  gsap.timeline({ scrollTrigger: { trigger: '#stack', start: 'top 75%', end: 'bottom 35%', scrub: 1 } })
    .to(slabs, { z: i => i * 110, ease: 'none' }, 0)
    .to(st, { rotationZ: -8, rotationX: 48, ease: 'none' }, 0);
  const hl = (i, on) => { if (slabs[i]) slabs[i].classList.toggle('hl', on); const li = items.find(x => +x.dataset.i === i); if (li) li.classList.toggle('on', on); };
  items.forEach(li => { const i = +li.dataset.i; li.addEventListener('mouseenter', () => hl(i, true)); li.addEventListener('mouseleave', () => hl(i, false)); });
  slabs.forEach((sl, i) => { sl.addEventListener('mouseenter', () => hl(i, true)); sl.addEventListener('mouseleave', () => hl(i, false)); });
})();

/* ---------- Section index + active nav state ---------- */
['hero', 'about', 'stack', 'projects', 'skills', 'education', 'contact'].forEach(id => {
  ScrollTrigger.create({ trigger: '#' + id, start: 'top 50%', end: 'bottom 50%', onToggle: self => {
    if (self.isActive) $$('.side-nav a, .nav-links a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
  } });
});

/* ---------- Hero scroll choreography ---------- */
const heroST = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true };
gsap.to('.hero-name .line:nth-child(1)', { xPercent: -16, ease: 'none', scrollTrigger: heroST });
gsap.to('.hero-name .line:nth-child(2)', { xPercent: 16, ease: 'none', scrollTrigger: heroST });
gsap.to('.portrait', { yPercent: 70, rotation: 9, ease: 'none', scrollTrigger: heroST });
gsap.to('.hero-bottom', { opacity: 0, y: -40, ease: 'none', scrollTrigger: { trigger: '.hero', start: '55% top', end: 'bottom top', scrub: true } });

/* ---------- Scroll velocity skew + progress bar ---------- */
const bar = document.createElement('div'); bar.className = 'bar'; document.body.appendChild(bar);
const skewEls = $$('.card-img, .stat-number');
let skew = 0;
gsap.ticker.add(() => {
  skew += (clamp(scrollVel() * 0.12, -5, 5) - skew) * 0.12;
  if (!reduce) gsap.set(skewEls, { skewY: skew });
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = 'scaleX(' + (max > 0 ? scrollY / max : 0) + ')';
});

/* keep scroll triggers accurate if the layout changes (fonts, images, resize) */
let rt;
new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => ScrollTrigger.refresh(), 250); }).observe(document.body);
addEventListener('load', () => ScrollTrigger.refresh());
