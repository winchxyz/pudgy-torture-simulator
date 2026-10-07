// The igloo: rounded ice-block walls, a packed-snow floor, a round tunnel doorway, a cosy sign,
// icicles, a fish bucket, soft lights, blob contact shadows, plus the static Rapier colliders
// (floor, back and side walls, invisible front and ceiling).
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { G, groups } from './physics.js';

export const ROOM = {
  halfW: 3.8, // side walls at x = +-halfW (1.5x the first version)
  backZ: -3.9,
  frontZ: 4.4, // invisible wall toward the camera: nothing gets closer than ~3.5 units to the lens
  height: 9,
  floorFront: 22, // the floor mesh extends past the invisible front wall
};

const TAU = Math.PI * 2;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Small deterministic random generator so the textures look the same every run.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finishTex(THREE, c, { repeat = true, anisotropy = 8 } = {}) {
  const tex = new THREE.CanvasTexture(c);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

function sparkle(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + r, y);
  g.quadraticCurveTo(x + r * 0.12, y + r * 0.12, x, y + r);
  g.quadraticCurveTo(x - r * 0.12, y + r * 0.12, x - r, y);
  g.quadraticCurveTo(x - r * 0.12, y - r * 0.12, x, y - r);
  g.fill();
}

// Rounded ice blocks in a running bond: cols x rows blocks per tile, repeats seamlessly.
function iceBlockTexture(THREE, { size = 1024, cols = 4, rows = 8, seed = 7, anisotropy = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rand = rng(seed);
  const bw = size / cols;
  const bh = size / rows;
  // soft blue mortar
  const mort = g.createLinearGradient(0, 0, size, size);
  mort.addColorStop(0, '#8dbbe0');
  mort.addColorStop(1, '#7eaed8');
  g.fillStyle = mort;
  g.fillRect(0, 0, size, size);
  const tints = ['#e7f8ff', '#dbf2fc', '#eefaff', '#d2eefa', '#e2f6fd'];
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bw * 0.5;
    for (let i = -1; i <= cols; i++) {
      const x = i * bw + off;
      const y = r * bh;
      const ins = 7;
      const bx = x + ins;
      const by = y + ins;
      const w = bw - ins * 2;
      const h = bh - ins * 2;
      const base = tints[Math.floor(rand() * tints.length)];
      g.save();
      // soft contact shadow into the mortar
      g.shadowColor = 'rgba(48,100,165,0.5)';
      g.shadowBlur = 11;
      g.shadowOffsetY = 3;
      roundRect(g, bx, by, w, h, 34);
      g.fillStyle = base;
      g.fill();
      g.restore();
      g.save();
      roundRect(g, bx, by, w, h, 34);
      g.clip();
      // toon body: light top, a slightly bluer lower band with a soft edge
      const grad = g.createLinearGradient(bx, by, bx + w * 0.4, by + h);
      grad.addColorStop(0, 'rgba(255,255,255,0.85)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(110,170,220,0.38)');
      g.fillStyle = grad;
      g.fillRect(bx, by, w, h);
      g.fillStyle = 'rgba(120,175,225,0.2)';
      g.beginPath();
      g.moveTo(bx - 4, by + h * 0.74);
      g.quadraticCurveTo(bx + w * 0.5, by + h * 0.66, bx + w + 4, by + h * 0.76);
      g.lineTo(bx + w + 4, by + h + 4);
      g.lineTo(bx - 4, by + h + 4);
      g.fill();
      // glossy streaks
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.moveTo(bx + w * 0.14, by + h * 0.14);
      g.lineTo(bx + w * 0.42, by + h * 0.14);
      g.lineTo(bx + w * 0.22, by + h * 0.62);
      g.lineTo(bx + w * 0.1, by + h * 0.62);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.moveTo(bx + w * 0.5, by + h * 0.14);
      g.lineTo(bx + w * 0.56, by + h * 0.14);
      g.lineTo(bx + w * 0.42, by + h * 0.5);
      g.lineTo(bx + w * 0.37, by + h * 0.5);
      g.fill();
      // a hair crack or two inside the ice
      if (rand() < 0.4) {
        g.strokeStyle = 'rgba(120,175,220,0.45)';
        g.lineWidth = 2.2;
        g.beginPath();
        const cx = bx + w * (0.35 + rand() * 0.45);
        const cy = by + h * (0.25 + rand() * 0.3);
        g.moveTo(cx, cy);
        g.lineTo(cx + 18 + rand() * 20, cy + 10 + rand() * 14);
        g.lineTo(cx + 26 + rand() * 24, cy + 4 + rand() * 18);
        g.stroke();
      }
      // frost freckles
      for (let k = 0; k < 14; k++) {
        g.fillStyle = `rgba(255,255,255,${0.35 + rand() * 0.4})`;
        g.beginPath();
        g.arc(bx + rand() * w, by + rand() * h, 1 + rand() * 2.2, 0, TAU);
        g.fill();
      }
      g.restore();
      // bevel: bright top-left rim, bluer bottom-right rim
      g.save();
      roundRect(g, bx + 1.5, by + 1.5, w - 3, h - 3, 32);
      g.lineWidth = 3;
      const rim = g.createLinearGradient(bx, by, bx + w, by + h);
      rim.addColorStop(0, 'rgba(255,255,255,0.95)');
      rim.addColorStop(0.5, 'rgba(255,255,255,0.25)');
      rim.addColorStop(1, 'rgba(70,135,200,0.55)');
      g.strokeStyle = rim;
      g.stroke();
      g.restore();
      if (rand() < 0.22) sparkle(g, bx + w * (0.15 + rand() * 0.7), by + h * (0.2 + rand() * 0.5), 9 + rand() * 6, 'rgba(255,255,255,0.95)');
    }
  }
  return finishTex(THREE, c, { anisotropy });
}

// Packed snow: soft toon drifts, ice chips, and a little sparkle.
function snowTexture(THREE, { size = 1024, seed = 21, anisotropy = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const rand = rng(seed);
  g.fillStyle = '#f2f8fd';
  g.fillRect(0, 0, size, size);
  const wrap = (fn) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) fn(dx, dy);
  };
  // big soft drifts: a blue-grey shade and an offset white crest give a gentle two-step toon shade
  for (let i = 0; i < 14; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rx = 150 + rand() * 190;
    const ry = rx * (0.5 + rand() * 0.3);
    const rot = (rand() - 0.5) * 0.9;
    wrap((dx, dy) => {
      g.save();
      g.translate(x + dx, y + dy);
      g.rotate(rot);
      g.scale(1, ry / rx);
      const sh = g.createRadialGradient(0, 8, rx * 0.2, 0, 8, rx);
      sh.addColorStop(0, 'rgba(176,205,232,0.42)');
      sh.addColorStop(1, 'rgba(176,205,232,0)');
      g.fillStyle = sh;
      g.beginPath();
      g.arc(0, 0, rx, 0, TAU);
      g.fill();
      const hi = g.createRadialGradient(-8, -8, rx * 0.1, -8, -8, rx * 0.85);
      hi.addColorStop(0, 'rgba(255,255,255,0.9)');
      hi.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = hi;
      g.beginPath();
      g.arc(0, 0, rx * 0.85, 0, TAU);
      g.fill();
      g.restore();
    });
  }
  // ice chips and dimples
  for (let i = 0; i < 46; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 3 + rand() * 6;
    wrap((dx, dy) => {
      g.fillStyle = 'rgba(165,198,228,0.4)';
      g.beginPath();
      g.ellipse(x + dx, y + dy + 2, r * 1.5, r * 0.7, 0, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.ellipse(x + dx - 1, y + dy - 1, r * 1.35, r * 0.55, 0, 0, TAU);
      g.fill();
    });
  }
  // sparkle
  for (let i = 0; i < 55; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 4 + rand() * 9;
    wrap((dx, dy) => {
      if (x + dx < -20 || x + dx > size + 20 || y + dy < -20 || y + dy > size + 20) return;
      sparkle(g, x + dx, y + dy, r, i % 3 ? 'rgba(255,255,255,0.95)' : 'rgba(190,235,255,0.95)');
    });
  }
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(255,255,255,${0.5 + rand() * 0.5})`;
    g.beginPath();
    g.arc(rand() * size, rand() * size, 1 + rand() * 1.8, 0, TAU);
    g.fill();
  }
  return finishTex(THREE, c, { anisotropy });
}

// A soft dark gradient used for ambient occlusion along floor/wall edges.
function edgeShadeTexture(THREE, { w = 512, h = 512, bottom = 0.5, top = 0, left = 0, right = 0 }) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  const edge = (x0, y0, x1, y1, a) => {
    if (a <= 0) return;
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, `rgba(40,90,150,${a})`);
    gr.addColorStop(1, 'rgba(40,90,150,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  };
  edge(0, h, 0, h * 0.7, bottom);
  edge(0, 0, 0, h * 0.25, top);
  edge(0, 0, w * 0.18, 0, left);
  edge(w, 0, w * 0.82, 0, right);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Vertical fade into the deep blue shade of the dome above the visible wall.
function domeShadeTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 256, 0, 0); // bottom of the plane -> top
  gr.addColorStop(0, 'rgba(46,104,176,0)');
  gr.addColorStop(0.12, 'rgba(46,104,176,0.34)');
  gr.addColorStop(0.5, 'rgba(34,82,156,0.72)');
  gr.addColorStop(1, 'rgba(28,68,138,0.9)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The tunnel mouth seen head-on: concentric ice rings fading into a bright patch of daylight.
function tunnelTexture(THREE) {
  const W = 480;
  const H = 800;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const r = W / 2;
  const arch = (s, cy) => {
    // arch outline scaled by s about (W/2, cy)
    const R = r * s;
    const top = cy - (cy - r) * s; // centre of the semicircle
    g.beginPath();
    g.moveTo(W / 2 - R, H);
    g.lineTo(W / 2 - R, top);
    g.arc(W / 2, top, R, Math.PI, 0);
    g.lineTo(W / 2 + R, H);
    g.closePath();
  };
  const cy0 = H * 0.62;
  arch(1, cy0);
  const grad = g.createRadialGradient(W / 2, H * 0.5, 8, W / 2, H * 0.52, H * 0.62);
  grad.addColorStop(0, '#effcff');
  grad.addColorStop(0.12, '#a9dcf7');
  grad.addColorStop(0.45, '#4d86c6');
  grad.addColorStop(1, '#1f3a72');
  g.fillStyle = grad;
  g.fill();
  g.save();
  arch(1, cy0);
  g.clip();
  // ring seams of the tunnel blocks
  for (const s of [0.88, 0.74, 0.6, 0.47, 0.35, 0.25]) {
    arch(s, cy0 - H * 0.06 * (1 - s));
    g.lineWidth = 5 * s + 1.5;
    g.strokeStyle = `rgba(215,240,255,${0.12 + (1 - s) * 0.4})`;
    g.stroke();
  }
  // floor of the tunnel: trapezoid of snow narrowing toward the far end
  g.beginPath();
  g.moveTo(0, H);
  g.lineTo(W * 0.4, H * 0.7);
  g.lineTo(W * 0.6, H * 0.7);
  g.lineTo(W, H);
  g.closePath();
  const fl = g.createLinearGradient(0, H * 0.7, 0, H);
  fl.addColorStop(0, 'rgba(235,248,255,0.75)');
  fl.addColorStop(1, 'rgba(205,230,247,0.95)');
  g.fillStyle = fl;
  g.fill();
  // glow at the far end
  const glow = g.createRadialGradient(W / 2, H * 0.52, 0, W / 2, H * 0.52, 90);
  glow.addColorStop(0, 'rgba(255,255,255,0.95)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.restore();
  return finishTex(THREE, c, { repeat: false });
}

function signTexture(THREE) {
  const W = 640;
  const H = 300;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const bx = 30;
  const by = 78;
  const bw = W - 60;
  const bh = 190;
  // two cords up to a peg
  g.strokeStyle = '#6b4b32';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(bx + 90, by + 8);
  g.lineTo(W / 2, 22);
  g.lineTo(bx + bw - 90, by + 8);
  g.stroke();
  g.fillStyle = '#c9ccd6';
  g.beginPath();
  g.arc(W / 2, 20, 11, 0, TAU);
  g.fill();
  g.strokeStyle = '#3a4a6a';
  g.lineWidth = 3;
  g.stroke();
  // plank
  g.save();
  g.shadowColor = 'rgba(30,60,110,0.4)';
  g.shadowBlur = 14;
  g.shadowOffsetY = 6;
  roundRect(g, bx, by, bw, bh, 30);
  g.fillStyle = '#7a4a2c';
  g.fill();
  g.restore();
  roundRect(g, bx + 9, by + 9, bw - 18, bh - 18, 24);
  const wood = g.createLinearGradient(0, by, 0, by + bh);
  wood.addColorStop(0, '#d79b62');
  wood.addColorStop(1, '#b57a47');
  g.fillStyle = wood;
  g.fill();
  g.save();
  roundRect(g, bx + 9, by + 9, bw - 18, bh - 18, 24);
  g.clip();
  g.strokeStyle = 'rgba(110,64,34,0.28)';
  g.lineWidth = 3;
  for (const yy of [by + 62, by + 118, by + 160]) {
    g.beginPath();
    g.moveTo(bx, yy);
    g.bezierCurveTo(bx + bw * 0.3, yy - 6, bx + bw * 0.6, yy + 7, bx + bw, yy);
    g.stroke();
  }
  g.restore();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.font = '900 70px "Trebuchet MS", "Arial Rounded MT Bold", system-ui, sans-serif';
  g.lineWidth = 12;
  g.strokeStyle = '#5a321a';
  g.strokeText('IGLOO 7', W / 2, by + bh * 0.38);
  g.fillStyle = '#fff6e2';
  g.fillText('IGLOO 7', W / 2, by + bh * 0.38);
  g.font = '800 36px "Trebuchet MS", system-ui, sans-serif';
  g.lineWidth = 8;
  g.strokeStyle = '#5a321a';
  g.strokeText('please be gentle', W / 2, by + bh * 0.76);
  g.fillStyle = '#ffb347';
  g.fillText('please be gentle', W / 2, by + bh * 0.76);
  // snow cap along the top edge with a few drips
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#a9cbe8';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(bx + 4, by + 18);
  const caps = [[0.0, 0], [0.12, -26], [0.26, -10], [0.42, -30], [0.58, -12], [0.74, -28], [0.88, -10], [1.0, 0]];
  for (let i = 0; i < caps.length - 1; i++) {
    const [x0, y0] = caps[i];
    const [x1, y1] = caps[i + 1];
    g.quadraticCurveTo(bx + bw * x0 + (bw * (x1 - x0)) / 2, by + y0 + y1 - 12, bx + bw * x1, by + 18 + y1 * 0.2);
  }
  g.lineTo(bx + bw - 4, by + 30);
  for (const [fx, d] of [[0.88, 24], [0.62, 14], [0.4, 30], [0.2, 16], [0.07, 22]]) {
    g.lineTo(bx + bw * fx + 12, by + 30);
    g.lineTo(bx + bw * fx, by + 30 + d);
    g.lineTo(bx + bw * fx - 12, by + 30);
  }
  g.lineTo(bx + 4, by + 30);
  g.closePath();
  g.fill();
  g.stroke();
  return finishTex(THREE, c, { repeat: false });
}

function blobTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(30,60,110,0.55)');
  grad.addColorStop(0.5, 'rgba(30,60,110,0.3)');
  grad.addColorStop(1, 'rgba(30,60,110,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Vertical gradient for the icicles: opaque pale ice at the root, glassy and light at the tip.
function icicleTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#e9f9ff');
  gr.addColorStop(0.6, '#bfe6fa');
  gr.addColorStop(1, '#8fd0f2');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 128);
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.fillRect(9, 6, 5, 90);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRoom({ THREE, scene, physics, light }) {
  const RAPIER = physics.RAPIER;
  const world = physics.world;
  const group = new THREE.Group();
  group.name = 'room';
  scene.add(group);

  scene.background = new THREE.Color(0xcfe8f8);

  // ------------------------------------------------------------------------------------- lights
  const L = light || { ambient: 1.25, key: 1.9, keyPos: [2.5, 4, 4.5], fill: 0.3, fillPos: [-4, 1.5, 2] };
  scene.add(new THREE.AmbientLight(0xffffff, L.ambient));
  const key = new THREE.DirectionalLight(0xffffff, L.key);
  key.position.set(...L.keyPos);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe9ff, L.fill);
  fill.position.set(...L.fillPos);
  scene.add(fill);

  // ------------------------------------------------------------------------------------- visuals
  const R = ROOM;
  const backW = R.halfW * 2 + 0.2;
  const depth = R.floorFront - R.backZ;
  const wallTex = iceBlockTexture(THREE);
  const floorTex = snowTexture(THREE);
  const basic = (map, color = 0xffffff) => new THREE.MeshBasicMaterial({ map, color, toneMapped: false });
  // three-step toon ramp for the 3D props (blocks, bucket, drifts)
  const ramp = (() => {
    const d = new Uint8Array([150, 210, 255]);
    const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  })();
  const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: ramp });

  const FT = 3.2; // world size of one floor tile
  const WT = 3.6; // ... and of one ice-block wall tile (4 blocks wide)
  const floorMat = basic(floorTex);
  floorTex.repeat.set((R.halfW * 2 + 0.4) / FT, depth / FT);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.halfW * 2 + 0.4, depth), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, R.backZ + depth / 2);
  group.add(floor);

  const wallH = R.height;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(backW, wallH), basic(wallTex.clone(), 0xffffff));
  back.material.map.repeat.set(backW / WT, wallH / WT);
  back.material.map.needsUpdate = true;
  back.position.set(0, wallH / 2, R.backZ);
  group.add(back);

  // ceiling (visual only), so a panned-up camera never sees the void above the walls
  {
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(R.halfW * 2 + 0.4, depth), new THREE.MeshBasicMaterial({ color: 0x3b79bd, toneMapped: false }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, wallH, R.backZ + depth / 2);
    group.add(ceil);
  }
  const sideGeo = new THREE.PlaneGeometry(depth + 8, wallH);
  for (const s of [-1, 1]) {
    const tex = wallTex.clone();
    tex.repeat.set((depth + 8) / WT, wallH / WT);
    tex.needsUpdate = true;
    const m = new THREE.Mesh(sideGeo, basic(tex, s < 0 ? 0xdbe9f6 : 0xeaf4fc));
    m.rotation.y = -s * Math.PI / 2;
    m.position.set(s * R.halfW, wallH / 2, R.backZ + (depth + 8) / 2 - 8);
    group.add(m);
  }

  // Ambient occlusion overlays along the floor/wall junctions.
  const aoMat = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  {
    const ao = new THREE.Mesh(new THREE.PlaneGeometry(backW, 2.2), aoMat(edgeShadeTexture(THREE, { w: 512, h: 128, bottom: 0.4 })));
    ao.position.set(0, 1.1, R.backZ + 0.004);
    group.add(ao);
    const aoc = new THREE.Mesh(new THREE.PlaneGeometry(backW, wallH), aoMat(edgeShadeTexture(THREE, { w: 512, h: 128, bottom: 0, top: 0, left: 0.42, right: 0.42 })));
    aoc.position.set(0, wallH / 2, R.backZ + 0.006);
    group.add(aoc);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(depth, 2.2), aoMat(edgeShadeTexture(THREE, { w: 512, h: 128, bottom: 0.4 })));
      side.rotation.y = -s * Math.PI / 2;
      side.position.set(s * (R.halfW - 0.004), 1.1, R.backZ + depth / 2);
      group.add(side);
    }
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(backW, 1.6), aoMat(edgeShadeTexture(THREE, { w: 512, h: 128, bottom: 0.45 })));
    fl.rotation.x = -Math.PI / 2;
    fl.rotation.z = Math.PI;
    fl.position.set(0, 0.006, R.backZ + 0.8);
    group.add(fl);
  }

  // The dome: the walls fade into deep blue shade above the frame, with an ice ledge and icicles on the way.
  const LEDGE_Y = 4.95;
  {
    const shadeTex = domeShadeTexture(THREE);
    const shadeH = wallH - 4.3;
    const mk = () => new THREE.Mesh(new THREE.PlaneGeometry(1, shadeH), new THREE.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false, toneMapped: false }));
    const bs = mk();
    bs.scale.x = backW;
    bs.position.set(0, 4.3 + shadeH / 2, R.backZ + 0.008);
    group.add(bs);
    for (const s of [-1, 1]) {
      const ss = mk();
      ss.scale.x = depth + 8;
      ss.rotation.y = -s * Math.PI / 2;
      ss.position.set(s * (R.halfW - 0.006), 4.3 + shadeH / 2, R.backZ + (depth + 8) / 2 - 8);
      group.add(ss);
    }
  }
  {
    // snowy ice ledge along the back and side walls
    const ledgeMat = toon(0xeaf6fd);
    const ledgeB = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, backW - 0.4, 6, 14), ledgeMat);
    ledgeB.rotation.z = Math.PI / 2;
    ledgeB.scale.set(1, 1, 1);
    ledgeB.position.set(0, LEDGE_Y, R.backZ + 0.12);
    group.add(ledgeB);
    const sideLen = depth + 4;
    for (const s of [-1, 1]) {
      const ledge = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, sideLen, 6, 14), ledgeMat);
      ledge.rotation.x = Math.PI / 2;
      ledge.position.set(s * (R.halfW - 0.12), LEDGE_Y, R.backZ + sideLen / 2 + 0.6 - 4);
      group.add(ledge);
    }
    // icicles hanging off the ledge
    const iceTex = icicleTexture(THREE);
    const iceMat = new THREE.MeshBasicMaterial({ map: iceTex, transparent: true, opacity: 0.94, toneMapped: false });
    const iceGeo = new THREE.ConeGeometry(1, 1, 7, 1, true);
    iceGeo.rotateX(Math.PI); // tip down
    iceGeo.translate(0, -0.5, 0); // root at the origin, hanging down
    const rand = rng(99);
    const icicle = (x, y, z) => {
      const len = 0.28 + Math.pow(rand(), 1.6) * 0.62;
      const r = 0.035 + rand() * 0.05 + len * 0.04;
      const m = new THREE.Mesh(iceGeo, iceMat);
      m.scale.set(r, len, r);
      m.position.set(x, y, z);
      group.add(m);
    };
    for (let x = -R.halfW + 0.15; x < R.halfW; x += 0.26 + rand() * 0.22) icicle(x, LEDGE_Y - 0.1, R.backZ + 0.22);
    for (const s of [-1, 1]) {
      for (let z = R.backZ + 0.45; z < 9; z += 0.3 + rand() * 0.26) icicle(s * (R.halfW - 0.22), LEDGE_Y - 0.1, z);
    }
  }

  // Snow berm (a soft rounded drift) along the foot of the back and side walls.
  {
    const bermMat = toon(0xe6f1fa);
    const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, backW - 0.4, 6, 14), bermMat);
    back.rotation.z = Math.PI / 2;
    back.scale.set(1, 1, 1);
    back.position.set(0, 0.1, R.backZ + 0.1);
    group.add(back);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, depth - 0.4, 6, 14), bermMat);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(s * (R.halfW - 0.1), 0.1, R.backZ + depth / 2);
      group.add(rail);
    }
  }

  // Round igloo tunnel doorway and the sign on the back wall.
  {
    const DX = 2.45;
    const aw = 1.5; // arch width
    const ar = aw / 2;
    const ah = 1.72; // height of the straight part; the semicircle sits on top
    const shape = new THREE.Shape();
    shape.moveTo(-ar, 0);
    shape.lineTo(-ar, ah);
    shape.absarc(0, ah, ar, Math.PI, 0, true);
    shape.lineTo(ar, 0);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape, 24);
    const uv = geo.getAttribute('uv');
    const pos = geo.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + ar) / aw, pos.getY(i) / (ah + ar));
    const hole = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tunnelTexture(THREE), toneMapped: false }));
    hole.position.set(DX, 0, R.backZ + 0.014);
    group.add(hole);
    // ring of rounded ice blocks around the opening
    const blockGeo = new RoundedBoxGeometry(0.4, 0.3, 0.26, 3, 0.1);
    const cols = [0xeaf8ff, 0xd7f0fc, 0xf4fcff, 0xcdeafa];
    const placeBlock = (x, y, rot, i) => {
      const b = new THREE.Mesh(blockGeo, toon(cols[i % cols.length]));
      b.position.set(DX + x, y, R.backZ + 0.13);
      b.rotation.z = rot;
      group.add(b);
    };
    let bi = 0;
    for (const sx of [-1, 1]) for (const y of [0.22, 0.7, 1.18, 1.62]) placeBlock(sx * (ar + 0.19), y, 0, bi++);
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - (i / n) * Math.PI; // from the left, over the top, to the right
      const rr = ar + 0.19;
      placeBlock(Math.cos(a) * rr, ah + Math.sin(a) * rr, a - Math.PI / 2, bi++);
    }
    // snow drift spilling out of the tunnel
    const drift = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), toon(0xf1f8fd));
    drift.scale.set(1.05, 0.14, 0.55);
    drift.position.set(DX, 0.0, R.backZ + 0.45);
    group.add(drift);

    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.8), new THREE.MeshBasicMaterial({ map: signTexture(THREE), transparent: true, toneMapped: false }));
    sign.position.set(-1.85, 2.45, R.backZ + 0.016);
    sign.rotation.z = 0.03;
    group.add(sign);
  }

  // Fish bucket in the back-left corner (static; it has a collider so things bounce off it).
  const BUCKET = { x: -3.2, z: -3.25, r: 0.34, h: 0.56 };
  {
    const bucket = new THREE.Group();
    bucket.position.set(BUCKET.x, 0, BUCKET.z);
    const metal = toon(0x5d8fc0);
    const rimMat = toon(0xd2e4f2);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(BUCKET.r, BUCKET.r * 0.82, BUCKET.h, 24), metal);
    body.position.y = BUCKET.h / 2;
    bucket.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(BUCKET.r * 0.93, BUCKET.r * 0.9, 0.07, 24), rimMat);
    band.position.y = BUCKET.h * 0.34;
    bucket.add(band);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(BUCKET.r, 0.032, 8, 28), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = BUCKET.h;
    bucket.add(rim);
    const inside = new THREE.Mesh(new THREE.CircleGeometry(BUCKET.r * 0.98, 24), new THREE.MeshBasicMaterial({ color: 0x1d3f6e, toneMapped: false }));
    inside.rotation.x = -Math.PI / 2;
    inside.position.y = BUCKET.h - 0.02;
    bucket.add(inside);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(BUCKET.r * 0.95, 0.018, 6, 24, Math.PI), toon(0xaabbd0));
    handle.position.y = BUCKET.h;
    handle.rotation.y = 0.5;
    bucket.add(handle);
    // fish tails and heads poking out
    const fishCols = [0xff9d6b, 0xb9cddb, 0x76aedb];
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Group();
      const c = fishCols[i];
      const bd = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), toon(c));
      bd.scale.set(0.8, 1.9, 0.55);
      bd.position.y = 0.2;
      f.add(bd);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.17, 10), toon(c));
      tail.scale.set(1, 1, 0.3);
      tail.rotation.z = Math.PI;
      tail.position.y = 0.46;
      f.add(tail);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: 0x14202c }));
      eye.position.set(0.05, 0.06, 0.05);
      f.add(eye);
      const a = (i / 3) * TAU + 0.5;
      f.position.set(Math.cos(a) * 0.13, BUCKET.h - 0.12, Math.sin(a) * 0.13);
      f.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      bucket.add(f);
    }
    group.add(bucket);
  }

  // ------------------------------------------------------------------------------------- blobs
  const blobTex = blobTexture(THREE);
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  const blobs = new Set();
  // A soft shadow disc on the floor. update(x, y, z) takes the height above the floor.
  function addBlob({ radius = 0.4, strength = 1, maxHeight = 3.5 } = {}) {
    const mat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(blobGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = -10;
    group.add(mesh);
    const blob = {
      mesh,
      radius,
      strength,
      update(x, y, z, r = radius) {
        const h = Math.max(0, y - 0.05);
        const k = Math.max(0, 1 - h / maxHeight);
        const s = r * 2 * (1 + h * 0.18);
        mesh.position.set(x, 0.008, z);
        mesh.scale.set(s, s, 1);
        mat.opacity = strength * k * k;
        mesh.visible = k > 0.01;
      },
      remove() {
        group.remove(mesh);
        mat.dispose();
        blobs.delete(blob);
      },
    };
    blobs.add(blob);
    return blob;
  }

  // ------------------------------------------------------------------------------------- colliders
  const cols = [];
  const tagWorld = (c, name) => {
    physics.tag(c, { kind: 'world', name });
    cols.push(c);
  };
  const worldDesc = (desc) =>
    desc.setFriction(0.9).setRestitution(0.3).setCollisionGroups(groups(G.WORLD, 0xffff)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  const addBox = (name, hx, hy, hz, x, y, z) => {
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
    tagWorld(world.createCollider(worldDesc(RAPIER.ColliderDesc.cuboid(hx, hy, hz)), rb), name);
    return rb;
  };
  addBox('floor', 30, 1, 30, 0, -1, 0);
  addBox('back', 30, 12, 1, 0, 8, R.backZ - 1);
  addBox('left', 1, 12, 30, -R.halfW - 1, 8, 0);
  addBox('right', 1, 12, 30, R.halfW + 1, 8, 0);
  addBox('front', 30, 12, 1, 0, 8, R.frontZ + 1);
  addBox('ceiling', 30, 1, 30, 0, R.height + 1, 0);
  {
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(BUCKET.x, BUCKET.h / 2, BUCKET.z));
    tagWorld(world.createCollider(worldDesc(RAPIER.ColliderDesc.cylinder(BUCKET.h / 2, BUCKET.r * 0.92)), rb), 'bucket');
  }

  return {
    group,
    // frontZ is the invisible wall; minZ/maxZ/height are older aliases of backZ/frontZ/ceilY.
    bounds: { minX: -R.halfW, maxX: R.halfW, floorY: 0, ceilY: R.height, backZ: R.backZ, frontZ: R.frontZ, minZ: R.backZ, maxZ: R.frontZ, height: R.height },
    // Visible surfaces as planes: normal points into the room, point is any point on the plane.
    walls: [
      { name: 'left', normal: new THREE.Vector3(1, 0, 0), point: new THREE.Vector3(-R.halfW, 0, 0) },
      { name: 'right', normal: new THREE.Vector3(-1, 0, 0), point: new THREE.Vector3(R.halfW, 0, 0) },
      { name: 'back', normal: new THREE.Vector3(0, 0, 1), point: new THREE.Vector3(0, 0, R.backZ) },
      { name: 'floor', normal: new THREE.Vector3(0, 1, 0), point: new THREE.Vector3(0, 0, 0) },
    ],
    addBlob,
    dispose() {
      for (const b of [...blobs]) b.remove();
    },
  };
}
