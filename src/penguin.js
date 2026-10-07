// Procedural, articulated, toon-shaded Pudgy Penguin (a free fan parody, not affiliated with Pudgy Penguins or
// Igloo Inc.), modeled after the official 3D figurines: ONE soft bell-shaped body (head and belly merged), a heart-topped
// white face-and-belly mask, shiny black eyes, a tiny orange beak, a three-feather crest, paddle flippers and flat
// orange feet.
// Units: 1 unit = 1 "meter"-ish, total height about 1.9. The root sits on the floor (y = 0), the character faces +z.
// "L" limbs are on +x (the viewer's right when looking at the face), "R" limbs are on -x.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------------------------
// All sizes live here. World heights (y) are for the rest pose.
// ---------------------------------------------------------------------------------------------
export const PENGU = {
  colors: {
    body: 0x7ba7f2, // Pax Pengu periwinkle blue
    white: 0xffffff,
    beak: 0xf6a33c,
    beakMouth: 0x8a2438,
    beakDark: 0xe8892a,
    foot: 0xf6a33c,
    cheek: 0xf7a8c0,
    tongue: 0xff7a96,
    ink: 0x111111,
    bone: 0xf4f0e6,
    flesh: 0xf0607a,
    fleshDark: 0xb32d4b,
    fleshInner: 0xe25b72,
    blood: 0xd01830,
  },
  // Toon ramp (brightness of each band). Soft: the bands are close together so colors read flat.
  toonSteps: [0.6, 0.78, 0.92, 1.0],
  outline: { ratio: 0.008, min: 0.0055, max: 0.0105 }, // ink thickness = ratio * part size, clamped
  light: { ambient: 1.05, key: 1.7, keyPos: [2.5, 4, 4.5], fill: 0.3, fillPos: [-4, 1.5, 2] },

  // Joint layout (world y at rest): floor 0 -> ankle 0.13 -> hip 0.26 -> pelvis 0.33 -> torso 0.38 -> neck 0.98.
  pelvisY: 0.33,
  hip: { x: 0.2, y: -0.07 },
  leg: { radius: 0.065, length: 0.13 }, // ankle pivot sits `length` below the hip
  foot: { y: -0.096, z: 0.31, h: 0.1, hw: 0.1, len: 0.26 }, // foot mesh offset from the ankle pivot (flat orange duck foot)
  // The whole body is ONE smooth bell: [world y, radius (x)] pairs, bottom to top; depth (z) is radius * depth.
  body: {
    depth: 0.95,
    lean: 0.09, // the head dome sits this much further forward than the belly: he leans forward with a round back
    profile: [
      [0.05, 0.0],
      [0.06, 0.25],
      [0.1, 0.45],
      [0.18, 0.57],
      [0.3, 0.635],
      [0.44, 0.645],
      [0.6, 0.615],
      [0.78, 0.555],
      [0.95, 0.49],
      [1.06, 0.485],
      [1.18, 0.5],
      [1.32, 0.51],
      [1.46, 0.495],
      [1.57, 0.44],
      [1.65, 0.345],
      [1.705, 0.21],
      [1.735, 0.09],
      [1.745, 0.0],
    ],
  },
  torso: {
    y: 0.05, // torso pivot relative to pelvis
    waistY: 0.4, // WORLD y of the waist seam (pelvis mesh below, torso mesh above)
    neckY: 0.95, // WORLD y of the neck seam (where the head dome meets the belly bulge)
    tail: 0.12, // meshes overlap by this much (identical surface) so bending never opens a gap
    shoulder: { x: 0.54, y: 0.76, z: 0.13 }, // WORLD y
  },
  arm: { radius: 0.095, upper: 0.2, fore: 0.19, flat: 0.74 }, // flat: z thickness of the paddle flippers
  hand: { rx: 0.09, ry: 0.112, rz: 0.06, y: -0.04 },
  thumb: { radius: 0.034, length: 0.05, base: [0.075, -0.04, 0.0] },
  // Head: the dome of the same bell. Origin of the head frame = the neck pivot (world y torso.neckY).
  head: { top: 0.795 },
  eye: { x: 0.235, y: 0.38, rx: 0.063, ry: 0.083 }, // head-frame y of the eye line
  beak: { y: 0.31, z: 0.4, rx: 0.085, ry: 0.065, rz: 0.14, oz: 0.08, rxLow: 0.07, ryLow: 0.045 }, // pivot at the beak root
  crest: { y: 0.78, z: 0.06 },
  face: { canvasW: 1536, w: 0.84, h: 0.66, cy: 0.4 }, // face decal (head-frame units) and canvas width in px
  skull: { warmLo: 0.62, warmHi: 0.9 }, // warm-grey shadow tint range of the skull (lighting factor)
  // Thumbs-up gag: the flipper mesh stretches and the tip grows (poses set the amounts).
  // Rapier collider hints (segment-frame center, half extents of the inner box, rounding radius).
  colliders: {
    head: { frame: 'head', center: [0, 0.4, 0], half: [0.32, 0.24, 0.29], r: 0.18 },
    torso: { frame: 'torso', center: [0, 0.27, 0], half: [0.38, 0.17, 0.33], r: 0.23 },
    pelvis: { frame: 'pelvis', center: [0, -0.07, 0], half: [0.4, 0.06, 0.34], r: 0.2 },
  },
};

const INK_HEX = '#111111';

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------
function makeGradientMap(steps) {
  const data = new Uint8Array(steps.length);
  steps.forEach((v, i) => (data[i] = Math.round(v * 255)));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Inverted-hull ink outline: welded copy of the geometry, smooth normals, pushed out by t.
function hullGeometry(geo, t) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', src.getAttribute('position').clone());
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + n.getX(i) * t, p.getY(i) + n.getY(i) * t, p.getZ(i) + n.getZ(i) * t);
  }
  p.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}

function sizeOf(geo) {
  geo.computeBoundingBox();
  const s = new THREE.Vector3();
  geo.boundingBox.getSize(s);
  return Math.max(s.x, s.y, s.z);
}

const smooth01 = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const leanAt = (y) => PENGU.body.lean * smooth01(0.3, 1.5, y);

// One crest feather: a flat teardrop that grows along +y and bends (bx: sideways, bz: forward) toward its tip.
// Closed solid so the ink hull works.
function featherGeometry(len, width, bx, bz) {
  const prof = [[0, -0.014], [0.028, 0.0], [0.042, 0.025], [0.045, 0.055], [0.04, 0.08], [0.027, 0.098], [0.012, 0.108], [0, 0.111]];
  const k = len / 0.111;
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * width, y * k)), 14);
  g.deleteAttribute('uv');
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const u = Math.max(0, y / len);
    p.setX(i, p.getX(i) + bx * u * u);
    p.setZ(i, p.getZ(i) * 0.55 + bz * u * u);
  }
  const m = mergeVertices(g, 1e-6);
  m.computeVertexNormals();
  return m;
}

// ---------------------------------------------------------------------------------------------
// Face decal: drawn on a canvas in head-frame units (x right, y up, origin at the decal center).
// ---------------------------------------------------------------------------------------------
function drawFace(ctx, CW, CH, expr, blink) {
  const F = PENGU.face;
  const E = PENGU.eye;
  const k = CW / F.w;
  const X = (x) => CW / 2 + x * k;
  const Y = (y) => CH / 2 - y * k;
  const R = (r) => r * k;
  const ey = E.y - F.cy; // eye line in decal space
  ctx.clearRect(0, 0, CW, CH);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK_HEX;
  ctx.fillStyle = INK_HEX;

  const line = (pts, w, color = INK_HEX) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = R(w);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.stroke();
  };
  const disc = (x, y, r, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(X(x), Y(y), R(r), 0, Math.PI * 2);
    ctx.fill();
  };
  const ellipse = (x, y, rx, ry, color, rot = 0) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(X(x), Y(y), R(rx), R(ry), rot, 0, Math.PI * 2);
    ctx.fill();
  };
  const arc = (x, y, r, a0, a1, w, color = INK_HEX) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = R(w);
    ctx.beginPath();
    ctx.arc(X(x), Y(y), R(r), a0, a1, false);
    ctx.stroke();
  };
  const sides = [-1, 1];
  // shiny black oval eye with the big storybook highlights
  const shinyEye = (ex, grow = 0, glints = 2) => {
    ellipse(ex, ey, E.rx + grow, E.ry + grow * 1.2, INK_HEX);
    ellipse(ex - 0.016, ey + 0.024, 0.0185 + grow * 0.45, 0.0185 + grow * 0.45, '#ffffff');
    if (glints > 1) disc(ex + 0.017, ey - 0.026, 0.0095 + grow * 0.2, '#ffffff');
    if (glints > 2) disc(ex + 0.022, ey + 0.02, 0.006, '#ffffff');
  };

  switch (expr) {
    case 'neutral': {
      for (const s of sides) {
        const ex = s * E.x;
        if (blink) arc(ex, ey + 0.012, 0.05, Math.PI * 0.08, Math.PI * 0.92, 0.02);
        else shinyEye(ex);
      }
      break;
    }
    case 'teary': {
      for (const s of sides) {
        const ex = s * E.x;
        // tear streams running down the cheeks
        for (const [dx, len, w] of [[-0.012, 0.2, 0.034], [0.022, 0.15, 0.024]]) {
          const x0 = ex + s * 0.012 + dx;
          const grad = ctx.createLinearGradient(0, Y(ey - 0.05), 0, Y(ey - 0.05 - len));
          grad.addColorStop(0, 'rgba(150, 224, 255, 0.85)');
          grad.addColorStop(1, 'rgba(150, 224, 255, 0.35)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = R(w);
          ctx.beginPath();
          ctx.moveTo(X(x0), Y(ey - 0.05));
          ctx.quadraticCurveTo(X(x0 + s * 0.014), Y(ey - 0.05 - len * 0.5), X(x0 + s * 0.008), Y(ey - 0.05 - len));
          ctx.stroke();
          disc(x0 + s * 0.008, ey - 0.05 - len, w * 0.62, 'rgba(150, 224, 255, 0.75)');
        }
        if (blink) {
          arc(ex, ey + 0.03, 0.05, Math.PI * 0.1, Math.PI * 0.9, 0.022, INK_HEX);
          arc(ex, ey + 0.03, 0.068, Math.PI * 0.14, Math.PI * 0.86, 0.01, '#9deeff');
        } else {
          shinyEye(ex, 0.008, 3);
          // pooled tears along the lower lid
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(X(ex), Y(ey), R(E.rx + 0.008), R(E.ry + 0.0105), 0, 0, Math.PI * 2);
          ctx.clip();
          ellipse(ex, ey - E.ry * 0.95, E.rx * 1.3, E.ry * 0.42, 'rgba(150, 232, 255, 0.9)');
          ctx.restore();
        }
      }
      break;
    }
    case 'happy': {
      for (const s of sides) {
        const ex = s * E.x;
        arc(ex, ey - 0.028, 0.05, Math.PI * 1.02, Math.PI * 1.98, 0.024);
        // pink blush cheeks, a touch lighter in the middle
        ellipse(s * 0.305, ey - 0.088, 0.062, 0.036, 'rgba(247, 168, 192, 0.95)', -s * 0.12);
        ellipse(s * 0.298, ey - 0.082, 0.04, 0.019, 'rgba(255, 205, 222, 0.7)', -s * 0.12);
      }
      break;
    }
    case 'hurt': {
      for (const s of sides) {
        const ex = s * E.x;
        const d = -s; // left eye ">" right eye "<"
        line([[ex - d * 0.045, ey + 0.058], [ex + d * 0.045, ey], [ex - d * 0.045, ey - 0.058]], 0.026);
        // little impact ticks beside each eye
        line([[ex + s * 0.085, ey + 0.06], [ex + s * 0.115, ey + 0.085]], 0.011);
        line([[ex + s * 0.095, ey + 0.02], [ex + s * 0.13, ey + 0.026]], 0.011);
      }
      break;
    }
    case 'dizzy': {
      for (const s of sides) {
        const ex = s * E.x;
        const pts = [];
        const turns = 2.6;
        for (let i = 0; i <= 100; i++) {
          const t = i / 100;
          const a = t * turns * Math.PI * 2 * s;
          const r = 0.082 * t;
          pts.push([ex + Math.cos(a) * r, ey + Math.sin(a) * r]);
        }
        line(pts, 0.017);
      }
      break;
    }
    case 'dead': {
      for (const s of sides) {
        const ex = s * E.x;
        line([[ex - 0.055, ey + 0.055], [ex + 0.055, ey - 0.055]], 0.03);
        line([[ex - 0.055, ey - 0.055], [ex + 0.055, ey + 0.055]], 0.03);
      }
      break;
    }
    case 'shock': {
      for (const s of sides) {
        const ex = s * E.x;
        ellipse(ex, ey, E.rx + 0.03, E.ry + 0.03, INK_HEX);
        ellipse(ex, ey, E.rx + 0.017, E.ry + 0.017, '#ffffff');
        disc(ex, ey - 0.004, 0.02, INK_HEX);
        disc(ex - 0.006, ey + 0.006, 0.006, '#ffffff');
      }
      // a cold-sweat drop on the forehead
      ctx.fillStyle = 'rgba(150, 224, 255, 0.95)';
      ctx.beginPath();
      ctx.moveTo(X(0.36), Y(ey + 0.2));
      ctx.quadraticCurveTo(X(0.395), Y(ey + 0.14), X(0.36), Y(ey + 0.115));
      ctx.quadraticCurveTo(X(0.325), Y(ey + 0.14), X(0.36), Y(ey + 0.2));
      ctx.fill();
      ctx.strokeStyle = '#2a8ccc';
      ctx.lineWidth = R(0.006);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

// Expressions whose eyes can blink.
const BLINKABLE = new Set(['neutral', 'teary']);
// Beak state per expression: how far the lower beak hangs open (radians) and how much tongue shows (0..1).
const MOUTH = {
  neutral: { open: 0, tongue: 0 },
  teary: { open: 0.04, tongue: 0 },
  happy: { open: 0.34, tongue: 0.45 },
  hurt: { open: 0.1, tongue: 0 },
  dizzy: { open: 0.2, tongue: 0 },
  shock: { open: 0.78, tongue: 0.25 },
  dead: { open: 0.42, tongue: 1 },
};

// ---------------------------------------------------------------------------------------------
// Poses. Rotations are [x, y, z] Euler (XYZ) in radians. Left-side data is mirrored to the right
// side (x kept, y and z negated) unless a "R" block is given.
// stretch: [L, R] flipper length multipliers, fist: [L, R] flipper-tip scale, thumb: [L, R] thumb amount.
// ---------------------------------------------------------------------------------------------
const SIDE_JOINTS = ['shoulder', 'arm', 'elbow', 'hand', 'hip', 'leg', 'foot'];

const POSES = {
  idle: {
    L: { shoulder: [-0.32, 0, 0.42], elbow: [-0.3, 0, 0.0], hip: [0, 0, 0.05] },
    life: 1,
  },
  thumbsUp: {
    L: { shoulder: [0, -0.2, 1.42], elbow: [0, 0, 0.0], hip: [0, 0, 0.05] },
    R: { shoulder: [-0.32, 0, -0.42], elbow: [-0.3, 0, 0], hip: [0, 0, -0.05] },
    C: { torso: [0, 0.1, -0.03], head: [0, -0.12, 0.05] },
    thumb: [1, 0],
    stretch: [2.4, 1],
    fist: [2.2, 1],
    life: 0.5,
  },
  tpose: {
    L: { shoulder: [0, 0, Math.PI / 2], hip: [0, 0, 0.06] },
    life: 0.25,
  },
  wave: {
    L: { shoulder: [0, -0.2, 1.75], elbow: [0, 0, 0.6], hip: [0, 0, 0.05] },
    R: { shoulder: [-0.32, 0, -0.42], elbow: [-0.3, 0, 0], hip: [0, 0, -0.05] },
    C: { head: [0, 0, 0.1], torso: [0, 0, -0.04] },
    stretch: [3.0, 1],
    fist: [1.3, 1],
    life: 0.5,
    anim: (t, add) => {
      add('elbowL', 0, 0, 0.14 * Math.sin(t * 9));
      add('handL', 0, 0, 0.45 * Math.sin(t * 9 + 0.8));
      add('shoulderL', 0, 0.05 * Math.sin(t * 9), 0);
    },
  },
  flop: {
    L: { shoulder: [-0.45, 0.2, 0.6], arm: [0, 0, 0], elbow: [-0.35, 0, 0.15], hand: [-0.3, 0, 0.1], hip: [-0.3, 0.15, 0.34], foot: [0.35, 0, 0.15] },
    R: { shoulder: [-0.6, -0.1, -0.45], elbow: [-0.2, 0, -0.1], hand: [-0.5, 0, -0.2], hip: [-0.1, -0.25, -0.5], foot: [0.1, 0, -0.2] },
    C: {
      pelvis: [0, 0, 0.08],
      torso: [0.3, 0.1, -0.2],
      neck: [0.05, 0, -0.1],
      head: [0.1, -0.1, -0.3],
      crest: [0.25, 0, 0.35],
    },
    pos: { pelvis: [0, -0.03, 0] },
    life: 0.12,
  },
};

function expandPose(def) {
  const rot = {};
  const put = (name, v) => (rot[name] = v.slice());
  for (const j of SIDE_JOINTS) {
    const l = def.L?.[j];
    const r = def.R?.[j] ?? (l ? [l[0], -l[1], -l[2]] : null);
    if (l) put(j + 'L', l);
    if (r) put(j + 'R', r);
  }
  for (const [name, v] of Object.entries(def.C || {})) put(name, v);
  return {
    rot,
    pos: def.pos || {},
    thumb: def.thumb || [0, 0],
    stretch: def.stretch || [1, 1],
    fist: def.fist || [1, 1],
    life: def.life ?? 1,
    anim: def.anim || null,
  };
}

// ---------------------------------------------------------------------------------------------
// ---------------------------------------------------------------------------------------------
// Skin shader patch: cut planes (flatten a limb end so a stump cap can seal it), acid melt (sag,
// bubbles, green-brown blotches) and noise dissolve. One program per kind; every material owns its
// uniform objects, and all materials of a segment share that segment's melt uniforms.
// ---------------------------------------------------------------------------------------------
const WM_NOISE = `
float wmH(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float wmN(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wmH(i), wmH(i + vec3(1,0,0)), f.x), mix(wmH(i + vec3(0,1,0)), wmH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(wmH(i + vec3(0,0,1)), wmH(i + vec3(1,0,1)), f.x), mix(wmH(i + vec3(0,1,1)), wmH(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;
const WM_VERT_HEAD = `
uniform vec4 uCutA; uniform vec4 uCutB; uniform float uMelt; uniform vec3 uMeltDir;
uniform float uMeltSize; uniform float uTime; uniform float uInset;
uniform vec3 uSegMin; uniform vec3 uSegMax; uniform vec3 uOrigin; uniform float uBend;
varying vec3 vNPos;
${WM_NOISE}
`;
const WM_VERT_BODY = `
#include <begin_vertex>
vNPos = position;
{
  float dA = dot(uCutA.xyz, transformed) - uCutA.w;
  if (dA > 0.0) transformed -= uCutA.xyz * dA;
  float dB = dot(uCutB.xyz, transformed) - uCutB.w;
  if (dB > 0.0) transformed -= uCutB.xyz * dB;
  transformed -= normal * uInset;
  #ifndef WM_NOSHAPE
  if (uMelt > 0.001) {
    float m = uMelt;
    #ifdef WM_BONE
    m *= 0.3;
    #endif
    // gravity in mesh space, and where this vertex sits between the top (0) and bottom (1) of its whole segment
    vec3 ld = normalize(transpose(mat3(modelMatrix)) * uMeltDir);
    vec3 q = transformed + uOrigin;
    vec3 a0 = ld * uSegMin;
    vec3 a1 = ld * uSegMax;
    float d0 = min(a0.x, a1.x) + min(a0.y, a1.y) + min(a0.z, a1.z);
    float d1 = max(a0.x, a1.x) + max(a0.y, a1.y) + max(a0.z, a1.z);
    float H = max(d1 - d0, 0.05);
    float h = clamp((dot(q, ld) - d0) / H, 0.0, 1.0);
    // the top slumps down over the bottom, the bottom spreads out into a skirt
    float asym = 0.7 + 0.6 * wmN(q * 2.0 / uMeltSize);
    float slump = m * H * 0.6 * pow(1.0 - h, 1.3) * asym;
    vec3 perp = transformed - ld * dot(transformed, ld);
    transformed += perp * (m * 0.3 * smoothstep(0.25, 1.0, h));
    transformed += ld * slump;
    // ears (and other bendable parts) flop downward
    float bo = clamp(transformed.x / 0.24 + 0.4, 0.0, 1.0);
    transformed += ld * (uBend * m * 0.5 * bo * bo);
    // smooth goo undulation
    transformed += normal * (wmN(q * 3.0 / uMeltSize) - 0.5) * m * uMeltSize * 0.1;
    // a few big round bubbles that swell and pop (one candidate per cell, animated by time)
    {
      vec3 cq = q / (uMeltSize * 0.45);
      vec3 ci = floor(cq);
      vec3 cf = fract(cq);
      float hh = wmH(ci + 7.0);
      vec3 cen = vec3(wmH(ci + 1.0), wmH(ci + 2.0), wmH(ci + 3.0)) * 0.6 + 0.2;
      float ph = fract(uTime * 0.35 + hh);
      float sz = (hh > 0.45 ? 1.0 : 0.0) * smoothstep(0.0, 0.8, ph) * (1.0 - smoothstep(0.86, 0.9, ph));
      float bump = smoothstep(0.32, 0.0, distance(cf, cen)) * sz * smoothstep(0.1, 0.5, m);
      transformed += normal * bump * uMeltSize * 0.16;
    }
  }
  #endif
}
`;
const WM_FRAG_HEAD = `
uniform float uMelt; uniform float uMeltSize; uniform float uTime;
varying vec3 vNPos;
${WM_NOISE}
`;
const WM_FRAG_BODY = `
#include <color_fragment>
float wmGlow = 0.0;
float wmWet = 0.0;
#ifndef WM_BONE
if (uMelt > 0.001) {
  vec3 mp = vNPos / uMeltSize * 2.0;
  // smooth dissolve mask (large soft blobs, no camo noise)
  float nn = wmN(mp * 2.2) * 0.65 + wmN(mp * 5.0) * 0.35;
  float dis = clamp((uMelt - WM_START) / (1.0 - WM_START), 0.0, 1.0);
  float thr = dis * 1.1;
  if (dis > 0.0 && nn < thr) discard;
  #if defined(WM_SKIN) || defined(WM_FLESH) || defined(WM_ORGAN)
    // burnt patches: smooth, wet, dark red-purple, spreading with the amount
    float bn = wmN(mp * 1.3 + 4.0) * 0.6 + wmN(mp * 2.6 + 9.0) * 0.4 + uMelt * 0.9 - 0.3;
    float burn = smoothstep(0.35, 0.65, bn);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.09, 0.26), burn * 0.82);
    // raw pink underlayer showing through
    float raw = smoothstep(0.55, 0.75, wmN(mp * 2.0 + 21.0) + uMelt * 0.75 - 0.35);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.42, 0.55), raw * 0.85);
    wmWet = smoothstep(0.03, 0.3, uMelt);
    // acid-green foam only along the active edge of the burn
    float edgeBand = 1.0 - smoothstep(0.0, 0.05, abs(bn - 0.5));
    float foam = smoothstep(0.4, 0.62, wmN(mp * 14.0 + uTime * 0.6));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.9, 0.12), edgeBand * (0.35 + 0.65 * foam) * smoothstep(0.05, 0.25, uMelt));
    if (dis > 0.0) wmGlow = 1.0 - smoothstep(0.0, 0.08, nn - thr);
  #endif
}
#endif
`;
const WM_FRAG_END = `
#if defined(WM_SKIN) || defined(WM_FLESH) || defined(WM_ORGAN)
{
  // wet gloss highlight and the glowing green dissolve rim
  vec3 wmP = vNPos / uMeltSize * 2.0;
  vec3 wmN3 = normalize(normalize(vNormal) + (vec3(wmN(wmP * 3.0), wmN(wmP * 3.0 + 5.0), wmN(wmP * 3.0 + 9.0)) - 0.5) * 0.8 * wmWet);
  vec3 wmV = normalize(vViewPosition);
  vec3 wmH2 = normalize(wmV + normalize(vec3(0.35, 0.6, 0.7)));
  float sp = smoothstep(0.93, 0.965, dot(wmN3, wmH2));
  outgoingLight = mix(outgoingLight, vec3(1.0), sp * wmWet * 0.6);
  outgoingLight = mix(outgoingLight, vec3(0.6, 1.0, 0.15), wmGlow);
}
#endif
#if defined(WM_SKIN)
{
  // soft vinyl: the toon shadow bands tint blue-grey (so white stays soft), a gentle cool rim light, and a broad
  // soft gloss highlight on the big curved forms
  vec3 vN = normalize(vNormal);
  vec3 vV = normalize(vViewPosition);
  float lit = dot(outgoingLight, vec3(0.3333)) / max(dot(diffuseColor.rgb, vec3(0.3333)), 1e-3);
  outgoingLight *= mix(vec3(0.88, 0.94, 1.04), vec3(1.0), smoothstep(0.62, 1.0, lit));
  float rim = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), 3.2);
  outgoingLight += vec3(0.42, 0.62, 1.0) * rim * 0.16 * (1.0 - wmWet);
  vec3 vH = normalize(vV + normalize(vec3(-0.25, 0.7, 0.65)));
  float gl = smoothstep(0.945, 0.99, dot(vN, vH));
  outgoingLight = mix(outgoingLight, vec3(1.0), gl * 0.22 * (1.0 - wmWet));
}
#endif
#include <opaque_fragment>
`;
const WM_START = { SKIN: 0.6, INK: 0.6, DECAL: 0.6, FLESH: 0.8, ORGAN: 0.75, BONE: 0.6 };

function patchSkin(mat, kind, U, noShape = false) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    const defs = `#define WM_${kind}\n#define WM_START ${WM_START[kind].toFixed(2)}\n${noShape ? '#define WM_NOSHAPE\n' : ''}`;
    sh.vertexShader = defs + WM_VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', WM_VERT_BODY);
    sh.fragmentShader = defs + WM_FRAG_HEAD + sh.fragmentShader.replace('#include <color_fragment>', WM_FRAG_BODY).replace('#include <opaque_fragment>', WM_FRAG_END);
  };
  mat.customProgramCacheKey = () => 'wm-' + kind + (noShape ? '-ns' : '');
  return mat;
}


// ---------------------------------------------------------------------------------------------
// Geometry builders
// ---------------------------------------------------------------------------------------------
// Bell (pear) profile helper: radius lookups and closed lathe slices of the body outline (world y).
function makePear(profile) {
  const curve = new THREE.CatmullRomCurve3(
    profile.map(([y, r]) => new THREE.Vector3(Math.max(0, r), y, 0)),
    false,
    'centripetal'
  );
  const yMin = profile[0][0];
  const yMax = profile[profile.length - 1][0];
  const pts = [];
  let last = -Infinity;
  for (const v of curve.getPoints(400)) {
    const y = Math.min(yMax, Math.max(yMin, v.y));
    if (y > last + 1e-6) {
      pts.push([y, Math.max(0, v.x)]);
      last = y;
    }
  }
  // smooth the sampled radii a little so the analytic normals (slopes) carry no polyline noise
  {
    const src = pts.map((q) => q[1]);
    const K = 7;
    for (let i = 1; i < pts.length - 1; i++) {
      let acc = 0;
      let wsum = 0;
      for (let j = -K; j <= K; j++) {
        const jj = Math.min(pts.length - 1, Math.max(0, i + j));
        const w = Math.exp(-(j * j) / (2 * (K / 2.2) ** 2));
        acc += src[jj] * w;
        wsum += w;
      }
      pts[i][1] = acc / wsum;
    }
  }
  const rAt = (y) => {
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][0] >= y) {
        const [y0, r0] = pts[i - 1];
        const [y1, r1] = pts[i];
        const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
        return r0 + (r1 - r0) * Math.min(1, Math.max(0, t));
      }
    }
    return 0;
  };
  // y (on the lower half) where the radius equals r
  const yAtR = (r) => {
    for (let i = 1; i < pts.length; i++) if (pts[i][1] >= r) return pts[i][0];
    return 0;
  };
  // Lathe outline between y0 and y1. Flat caps only where asked (interior seams stay open: the neighbouring mesh
  // overlaps them, and the stump seals a severed end), so no hidden disc can z-fight with the skin.
  const slice = (y0, y1, capLo = true, capHi = true) => {
    const out = capLo ? [new THREE.Vector2(0, y0), new THREE.Vector2(rAt(y0), y0)] : [new THREE.Vector2(rAt(y0), y0)];
    for (const [y, r] of pts) if (y > y0 + 1e-4 && y < y1 - 1e-4) out.push(new THREE.Vector2(r, y));
    out.push(new THREE.Vector2(rAt(y1), y1));
    if (capHi) out.push(new THREE.Vector2(0, y1));
    return out;
  };
  return { rAt, yAtR, slice, yMin, yMax };
}

// Lathe of the body outline between y0 and y1 with analytic normals from the profile, so two slices of the same
// bell (pelvis / torso / head) shade identically across their seams. depth scales z. UVs: u runs around the body
// (0.5 is the front, the seam is at the back), v is the WORLD height over the whole bell, so every slice samples
// the same mask texture. The result is translated down by frameY (into its joint's frame).
function pearGeometry(pear, y0, y1, depth, frameY, capLo = true, capHi = true, segs = 128, rs = null) {
  const prof = pear.slice(y0, y1, capLo, capHi);
  if (rs) for (const v of prof) v.x *= rs(v.y);
  const rf = rs ? (y) => pear.rAt(y) * rs(y) : pear.rAt;
  const g = new THREE.LatheGeometry(prof, segs, Math.PI, Math.PI * 2);
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const mid = (y0 + y1) / 2;
  const e = 0.02;
  const H = pear.yMax - pear.yMin;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    uv.setY(i, (y - pear.yMin) / H);
    let nx = 0;
    let ny = y < mid ? -1 : 1;
    let nz = 0;
    if (r >= 1e-5) {
      const slope = (rf(y + e) - rf(y - e)) / (2 * e);
      const len = Math.hypot(1, slope);
      nx = x / r / len;
      ny = -slope / len;
      nz = z / r / len;
    }
    // squash z by depth, then shear z forward with height (the lean); normals follow (inverse transpose)
    const c = (leanAt(y + 0.01) - leanAt(y - 0.01)) / 0.02;
    nz /= depth;
    ny -= c * nz;
    const nl = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(i, nx / nl, ny / nl, nz / nl);
    p.setZ(i, z * depth + leanAt(y));
    p.setY(i, y - frameY);
  }
  p.needsUpdate = true;
  n.needsUpdate = true;
  return g;
}

// Blue body with a big white face-and-belly mask painted into a texture, so the mask is part of the same surface (no
// z-fighting, it follows the melt) and the heart-shaped top edge stays crisp. Canvas u = around the body (0.5 = the
// front), v = world height over the whole bell.
function makeMaskTexture(pear, bodyHex) {
  const W = 2048;
  const H = 2048;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const br = (bodyHex >> 16) & 255;
  const bg = (bodyHex >> 8) & 255;
  const bb = bodyHex & 255;
  // half-angle (radians, around the body) of the white mask by height: wide face, narrower belly, wide at the bottom
  const PHI = [[0.0, 1.05], [0.2, 1.0], [0.4, 0.92], [0.7, 0.87], [0.93, 0.84], [1.08, 0.94], [1.26, 1.02], [1.48, 1.03], [1.8, 0.9]];
  const phiAt = (y) => {
    if (y <= PHI[0][0]) return PHI[0][1];
    for (let i = 1; i < PHI.length; i++) {
      if (y <= PHI[i][0]) {
        const t = (y - PHI[i - 1][0]) / (PHI[i][0] - PHI[i - 1][0]);
        const s = t * t * (3 - 2 * t);
        return PHI[i - 1][1] + (PHI[i][1] - PHI[i - 1][1]) * s;
      }
    }
    return PHI[PHI.length - 1][1];
  };
  // top edge: two rounded lobes over the eyes that meet in a soft dip at the center (a heart)
  const A0 = 0.5;
  const DIP = 1.555;
  const PEAK = 1.65;
  const topAt = (a0) => {
    const a = Math.sqrt(a0 * a0 + 0.0049) - 0.07; // rounds off the cusp of the dip
    if (a <= A0) return DIP + (PEAK - DIP) * Math.sin(((a / A0) * Math.PI) / 2);
    const t = (a - A0) / 0.7;
    return PEAK - (PEAK - 1.42) * t * t;
  };
  const top = new Float32Array(W);
  const ang = new Float32Array(W);
  for (let i = 0; i < W; i++) {
    ang[i] = Math.abs(((i + 0.5) / W - 0.5) * Math.PI * 2);
    top[i] = topAt(ang[i]);
  }
  const AA = 0.0035;
  for (let j = 0; j < H; j++) {
    const v = 1 - (j + 0.5) / H;
    const y = pear.yMin + v * (pear.yMax - pear.yMin);
    const phi = phiAt(y);
    const r = Math.max(0.05, pear.rAt(y));
    for (let i = 0; i < W; i++) {
      const e = Math.min(top[i] - y, (phi - ang[i]) * r);
      const w = smooth01(-AA, AA, e);
      const o = (j * W + i) * 4;
      d[o] = br + (255 - br) * w;
      d[o + 1] = bg + (255 - bg) * w;
      d[o + 2] = bb + (255 - bb) * w;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// Flipper segment: a soft paddle that runs from a round shoulder cap at y = +r0 down to y = -len and ends in a round
// tip, thickest at about 55% of the way, flattened in z. Both segments of a flipper share the radius at the elbow, so
// the two caps coincide and the bend stays closed.
function paddleGeometry({ r0, rmax, r1, len, flat }) {
  const pts = [];
  const N = 8;
  // bottom cap (pole first)
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r1 * Math.sin(a), -len - r1 * Math.cos(a)));
  }
  const M = 14;
  for (let i = 1; i < M; i++) {
    const u = 1 - i / M; // 1 at the tip end ... 0 at the shoulder end
    let r;
    if (u <= 0.55) r = r0 + (rmax - r0) * Math.sin(((u / 0.55) * Math.PI) / 2);
    else r = rmax + (r1 - rmax) * smooth01(0.55, 1, u);
    pts.push(new THREE.Vector2(r, -u * len));
  }
  // top cap
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r0 * Math.cos(a), r0 * Math.sin(a)));
  }
  const g = new THREE.LatheGeometry(pts, 24);
  g.deleteAttribute('uv');
  g.scale(1, 1, flat);
  return g;
}

// A big smooth orange paddle foot: a flat bean / soft wedge (narrow at the heel, wide and round at the toes) that
// sticks out in front of the belly. side: +1 left, -1 right (the left foot rests a little ahead of the right).
// Local origin = ankle pivot.
function footGeometry(F, side) {
  const g = new THREE.SphereGeometry(1, 40, 26);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const p = g.getAttribute('position');
  const yaw = side * 0.14;
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const ry = F.h * 0.62;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const w = F.hw * (0.62 + 0.38 * (z + 1) * 0.5) + 0.03 * (z > 0 ? z * z : 0);
    const X = x * w;
    const Z = z * F.len;
    const Y = Math.max(y, -0.55) * ry * (1 - 0.25 * (1 - Math.abs(z)) * 0);
    // rotate about the vertical axis through the foot center, then place it
    const zc = F.z + (side > 0 ? 0.045 : -0.045);
    p.setXYZ(i, X * cs + Z * sn, F.y + Y, -X * sn + Z * cs + zc);
  }
  const m = mergeVertices(g, 1e-6);
  m.computeVertexNormals();
  return m;
}

// One half of the beak (upper or lower mandible): a rounded cone that narrows toward its tip, cut flat along y = 0.
// The flat inner face is painted mouth red so it shows when the lower beak hangs open. Local origin = beak root.
function beakHalfGeometry(B, upper) {
  const g = new THREE.SphereGeometry(1, 36, 26);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  const cO = new THREE.Color(PENGU.colors.beak);
  const cD = new THREE.Color(PENGU.colors.beakDark);
  const cM = new THREE.Color(PENGU.colors.beakMouth);
  const rx = upper ? B.rx : B.rxLow;
  const ry = upper ? B.ry : B.ryLow;
  const rz = upper ? B.rz : B.rz * 0.9;
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const zn = Math.max(0, z);
    const k = 1 - 0.55 * Math.pow(zn, 1.3); // narrows toward a soft rounded tip
    const depth = upper ? Math.max(0, -y) : Math.max(0, y);
    let Y = y * k * ry - 0.022 * zn * zn; // the tip droops a little
    Y = upper ? Math.max(-0.022 * zn * zn, Y) : Math.min(-0.022 * zn * zn, Y);
    p.setXYZ(i, x * k * rx, Y, z * rz + B.oz);
    // the lower beak and the underside are the darker orange; the flat inner faces shade into mouth red
    c.copy(cO);
    if (!upper) c.copy(cD);
    else c.lerp(cD, smooth01(0.0, -0.9, y) * 0.55);
    c.lerp(cM, smooth01(0.45, 0.95, depth));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = mergeVertices(g, 1e-6);
  m.computeVertexNormals();
  return m;
}

// ---------------------------------------------------------------------------------------------
// The factory
// ---------------------------------------------------------------------------------------------
const SEG_NAMES = ['head', 'torso', 'pelvis', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR'];
const SEG_SIZE = { head: 1.0, torso: 0.8, pelvis: 0.6, armL: 0.3, armR: 0.3, foreL: 0.3, foreR: 0.3, legL: 0.3, legR: 0.3 };

export function createPengu(options = {}) {
  const C = PENGU;
  const joints = {};
  const parts = {};
  const root = new THREE.Group();
  root.name = 'pengu';
  joints.root = root;

  const gradientMap = makeGradientMap(C.toonSteps);
  const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
  const pear = makePear(C.body.profile);
  const maskTex = makeMaskTexture(pear, C.colors.body);
  const base = {
    body: toon(0xffffff, { map: maskTex }), // blue body + white face/belly mask in one texture
    blue: toon(C.colors.body),
    orange: toon(C.colors.foot),
    beak: toon(0xffffff, { vertexColors: true }),
    tongue: toon(C.colors.tongue),
    bone: toon(C.colors.bone),
    flesh: toon(C.colors.flesh),
    fleshDark: toon(C.colors.fleshDark),
    fleshInner: toon(C.colors.fleshInner),
  };
  const inkMat = new THREE.MeshBasicMaterial({ color: C.colors.ink, side: THREE.BackSide });
  const inkFlat = new THREE.MeshBasicMaterial({ color: C.colors.ink });
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // Per-segment shared melt state + bookkeeping.
  const timeU = { value: 0 };
  const segState = {};
  for (const n of SEG_NAMES) {
    segState[n] = {
      amount: { value: 0 },
      min: { value: new THREE.Vector3(-1, -1, -1) },
      max: { value: new THREE.Vector3(1, 1, 1) },
      dir: { value: new THREE.Vector3(0, -1, 0) },
      flesh: [],
      hideOnMelt: [],
      boneForce: false,
      organForce: false,
      bones: [],
      organs: [],
    };
  }
  const skinMats = [];
  const hullMeshes = [];
  const cutRefs = {};
  const makeU = (seg, size, inset = 0) => ({
    uCutA: { value: new THREE.Vector4(0, 0, 0, 1e5) },
    uCutB: { value: new THREE.Vector4(0, 0, 0, 1e5) },
    uInset: { value: inset },
    uMelt: segState[seg].amount,
    uMeltDir: segState[seg].dir,
    uMeltSize: { value: size },
    uTime: timeU,
    uSegMin: segState[seg].min,
    uSegMax: segState[seg].max,
    uOrigin: { value: new THREE.Vector3() },
    uBend: { value: 0 },
  });

  const inkThickness = (geo) => {
    const o = C.outline;
    return Math.min(o.max, Math.max(o.min, sizeOf(geo) * o.ratio));
  };

  // Add a joint (Group) under parent.
  const joint = (name, parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    joints[name] = g;
    return g;
  };

  // Hull built by pushing the geometry's own (analytic) normals out: no vertex welding, so no seams.
  const hullFromNormals = (geo, t, scaleFn) => {
    const g = geo.clone();
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      const k = t * (scaleFn ? scaleFn(p.getY(i), p.getZ(i)) : 1);
      p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k);
    }
    g.computeBoundingSphere();
    return g;
  };
  const skinMeshes = [];

  // Add a skin mesh (patched materials for cut/melt, ink hull, hidden flesh shell) under parent.
  const part = (name, geo, baseMat, parent, { x = 0, y = 0, z = 0, ink = true, inkT, seg, flesh = true, hullMode, hullScale } = {}) => {
    let mat = baseMat;
    let hullMat = inkMat;
    let U = null;
    if (seg) {
      U = makeU(seg, SEG_SIZE[seg]);
      mat = patchSkin(baseMat.clone(), 'SKIN', U);
      hullMat = patchSkin(inkMat.clone(), 'INK', U);
      skinMats.push(mat);
      cutRefs[name] = U;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    parts[name] = mesh;
    if (seg) skinMeshes.push({ seg, mesh, U });
    if (ink) {
      const t = inkT ?? inkThickness(geo);
      const outline = new THREE.Mesh(hullMode === 'normals' ? hullFromNormals(geo, t, hullScale) : hullGeometry(geo, t), hullMat);
      outline.name = name + 'Ink';
      outline.renderOrder = -1;
      mesh.add(outline);
      parts[name + 'Ink'] = outline;
      if (seg) hullMeshes.push(outline);
    }
    if (seg && flesh) {
      const fu = { ...U, uInset: { value: 0.02 } };
      const fm = new THREE.Mesh(geo, patchSkin(base.fleshInner.clone(), 'FLESH', fu));
      fm.name = name + 'Flesh';
      fm.visible = false;
      mesh.add(fm);
      segState[seg].flesh.push(fm);
    }
    return mesh;
  };

  // -------------------------------------------------------------------------------- stretch registry
  // Rubber-limb gag: every vertex moves by (s - 1) * anchor along y, so end caps and ink hulls keep their shape.
  const stretchers = {};
  const addStretch = (key, geo, anchor) => {
    (stretchers[key] ||= { s: 1, items: [] }).items.push({ g: geo, orig: geo.getAttribute('position').array.slice(), anchor });
  };
  const capsuleAnchor = (geo, len) => {
    const p = geo.getAttribute('position');
    const a = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) a[i] = Math.min(0, Math.max(-len, p.getY(i)));
    return a;
  };
  const stretchCapsule = (key, mesh, len) => {
    addStretch(key, mesh.geometry, capsuleAnchor(mesh.geometry, len));
    const hg = parts[mesh.name + 'Ink'].geometry;
    addStretch(key, hg, capsuleAnchor(hg, len));
  };
  const applyStretch = (key, s) => {
    const st = stretchers[key];
    if (!st || Math.abs(s - st.s) < 1e-4) return;
    st.s = s;
    for (const { g, orig, anchor } of st.items) {
      const attr = g.getAttribute('position');
      const arr = attr.array;
      for (let i = 0; i < anchor.length; i++) arr[i * 3 + 1] = orig[i * 3 + 1] + (s - 1) * anchor[i];
      attr.needsUpdate = true;
      g.computeBoundingSphere();
    }
  };

  // -------------------------------------------------------------------------------- layout numbers
  const T = C.torso;
  const D = C.body.depth;
  const WYw = T.waistY; // world y of the waist seam
  const NYw = T.neckY; // world y of the neck seam
  const TAIL = T.tail;
  const torsoY = C.pelvisY + T.y; // world y of the torso pivot
  const WY = WYw - torsoY; // torso-frame waist seam
  const NYt = NYw - torsoY; // torso-frame neck seam
  const waistR = pear.rAt(WYw);
  const neckR = pear.rAt(NYw);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  // Each shell is full radius up to its seam plane and tucks in (to 86%) over the overlap beyond it, so when a joint
  // bends the swung-out rim sits inside the neighbouring skin instead of flaring out as a slab. At rest the tucked
  // part is hidden inside the neighbour's full-radius skin.
  const tuck = (d) => 1 - 0.14 * smooth01(0, TAIL, d);

  // -------------------------------------------------------------------------------- pelvis / legs
  const pelvis = joint('pelvis', root, 0, C.pelvisY, 0);
  {
    // The lower belly is the pelvis mesh (visible, so the waist can be severed). It overlaps the torso mesh by TAIL
    // (identical surface there); its ink hull fades out over the overlap so no ring pokes out of the neighbour.
    const g = pearGeometry(pear, pear.yMin, WYw + TAIL, D, C.pelvisY, true, false, 128, (y) => tuck(y - WYw));
    part('pelvis', g, base.body, pelvis, {
      seg: 'pelvis',
      hullMode: 'normals',
      hullScale: (y) => 1 - clamp01((y + C.pelvisY - WYw) / TAIL),
    });
  }

  for (const [sx, S] of [[1, 'L'], [-1, 'R']]) {
    const hip = joint('hip' + S, pelvis, sx * C.hip.x, C.hip.y, 0);
    const leg = joint('leg' + S, hip);
    const lg = new THREE.CapsuleGeometry(C.leg.radius, C.leg.length, 8, 16);
    lg.translate(0, -C.leg.length / 2, 0);
    part('leg' + S, lg, base.orange, leg, { seg: 'leg' + S });
    const foot = joint('foot' + S, leg, 0, -C.leg.length, 0);
    part('foot' + S, footGeometry(C.foot, sx), base.orange, foot, { seg: 'leg' + S, inkT: 0.007 });
  }

  // -------------------------------------------------------------------------------- torso
  const torso = joint('torso', pelvis, 0, T.y, 0);
  {
    const g = pearGeometry(pear, WYw - TAIL, NYw + TAIL, D, torsoY, false, false, 128, (y) => Math.min(tuck(WYw - y), tuck(y - NYw)));
    part('torso', g, base.body, torso, {
      seg: 'torso',
      hullMode: 'normals',
      hullScale: (y) => {
        const w = y + torsoY;
        return clamp01((w - (WYw - TAIL)) / TAIL) * (1 - clamp01((w - NYw) / TAIL));
      },
    });
  }

  // -------------------------------------------------------------------------------- flippers
  const creaseGroups = {};
  for (const [sx, S] of [[1, 'L'], [-1, 'R']]) {
    const A = C.arm;
    const shoulder = joint('shoulder' + S, torso, sx * T.shoulder.x, T.shoulder.y - torsoY, T.shoulder.z);
    const arm = joint('arm' + S, shoulder);
    const ug = paddleGeometry({ r0: A.radius * 0.95, rmax: A.radius * 1.06, r1: A.radius, len: A.upper, flat: A.flat });
    const upperMesh = part('arm' + S, ug, base.blue, arm, { seg: 'arm' + S });
    stretchCapsule('arm' + S, upperMesh, A.upper);
    const elbow = joint('elbow' + S, arm, 0, -A.upper, 0);
    const fg = paddleGeometry({ r0: A.radius, rmax: A.radius * 1.2, r1: A.radius * 0.95, len: A.fore, flat: A.flat });
    const foreMesh = part('forearm' + S, fg, base.blue, elbow, { seg: 'fore' + S });
    stretchCapsule('forearm' + S, foreMesh, A.fore);
    const hand = joint('hand' + S, elbow, 0, -A.fore, 0);
    const H = C.hand;
    const hg = new THREE.SphereGeometry(1, 28, 20);
    hg.scale(H.rx, H.ry, H.rz);
    part('hand' + S, hg, base.blue, hand, { y: H.y, seg: 'fore' + S });
    // Thumb nub: pivot on the flipper tip, pointing along +x (out of the tip when the flipper is stretched sideways,
    // which is "up" in the thumbsUp pose). It scales to nothing in other poses.
    const Th = C.thumb;
    const thumb = joint('thumb' + S, hand, sx * Th.base[0], Th.base[1], Th.base[2]);
    const tg = new THREE.CapsuleGeometry(Th.radius, Th.length, 6, 14);
    tg.translate(0, Th.length / 2, 0);
    tg.rotateZ((-sx * Math.PI) / 2);
    part('thumb' + S, tg, base.blue, thumb, { seg: 'fore' + S, flesh: false, inkT: 0.0055 });
    thumb.scale.setScalar(0.001);
    thumb.visible = false;
    // (a flipper tip has no finger creases; the group stays for API compatibility)
    const cg = new THREE.Group();
    cg.name = 'creases' + S;
    hand.add(cg);
    cg.visible = false;
    creaseGroups[S] = cg;
    parts['creases' + S] = cg;
  }

  // -------------------------------------------------------------------------------- head (the dome of the same bell)
  const neck = joint('neck', torso, 0, NYt, 0);
  const head = joint('head', neck, 0, 0, 0);
  {
    const g = pearGeometry(pear, NYw - TAIL, pear.yMax, D, NYw, false, true, 128, (y) => tuck(NYw - y));
    part('head', g, base.body, head, {
      seg: 'head',
      hullMode: 'normals',
      hullScale: (y) => clamp01((y + TAIL) / TAIL),
    });
  }
  // Seam sleeves: a skin-coloured (same mask texture) band tucked just inside the skin at each seam, one riding on each
  // side and reaching well into the other segment. At rest they are hidden inside the skin; when a joint bends far
  // enough to open a gap between the two shells, the gap shows body colour instead of the black inside of the
  // inverted ink hulls. No ink hull. They hide while the joint is severed or either neighbour has melted.
  const sleeves = [];
  const severedSeam = { waist: false, neck: false };
  {
    const REACH = 0.3;
    const K0 = 0.93;
    const K1 = 0.72;
    const make = (seam, name, parent, frameY, seg, seamY, dir, segA, segB) => {
      // dir +1: the band extends up from the seam (rides on the lower segment); -1: extends down (upper segment)
      const ya = dir > 0 ? seamY - 0.1 : seamY - REACH;
      const yb = dir > 0 ? seamY + REACH : seamY + 0.1;
      const rs = (y) => K0 - (K0 - K1) * smooth01(0, REACH, dir * (y - seamY));
      const g = pearGeometry(pear, ya, yb, D, frameY, false, false, 96, rs);
      const m = part(name, g, base.body, parent, { seg, ink: false, flesh: false });
      skinMeshes[skinMeshes.length - 1].noBox = true; // does not count toward the segment's melt extents
      m.renderOrder = 0;
      m.material.color.set(0xe3eaf6); // a touch of fold shadow so a bent-open gap reads as a skin crease, not a flat slab
      sleeves.push({ mesh: m, seam, a: segA, b: segB });
    };
    make('waist', 'sleeveWaistUp', pelvis, C.pelvisY, 'pelvis', WYw, 1, 'pelvis', 'torso');
    make('waist', 'sleeveWaistDown', torso, torsoY, 'torso', WYw, -1, 'pelvis', 'torso');
    make('neck', 'sleeveNeckUp', torso, torsoY, 'torso', NYw, 1, 'torso', 'head');
    make('neck', 'sleeveNeckDown', head, NYw, 'head', NYw, -1, 'torso', 'head');
  }
  const sealList = [];
  // The interior seams (waist, neck) have no cap discs, so a melted-away skin would show black hollows: seal each with a
  // flesh-coloured disc just inside the surface (hidden by the skin; it shows when the skin above or below is gone).
  {
    const sealMat = base.fleshInner.clone();
    sealMat.side = THREE.DoubleSide;
    const seal = (name, frame, yLocal, worldY) => {
      const r = pear.rAt(worldY) * 0.965;
      const g = new THREE.CircleGeometry(1, 40);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, sealMat);
      m.name = name;
      m.scale.set(r, 1, r * D);
      m.position.set(0, yLocal, leanAt(worldY));
      m.visible = false;
      frame.add(m);
      parts[name] = m;
      return m;
    };
    sealList.push([seal('sealNeck', torso, NYt, NYw), 'torso', 'head'], [seal('sealWaist', torso, WY, WYw), 'pelvis', 'torso']);
  }
  // z of the head's front surface at (x, y) in head-frame coordinates
  const headFrontZ = (x, y) => D * Math.sqrt(Math.max(0, pear.rAt(y + NYw) ** 2 - x * x)) + leanAt(y + NYw);

  // Expression decal: a plane that follows the head's front surface, so it hugs the curved head with a tiny constant
  // offset (no z-fighting).
  const CW = C.face.canvasW;
  const CH = Math.round((CW * C.face.h) / C.face.w);
  const faceCache = new Map();
  const faceTexture = (expr, blink) => {
    const key = expr + (blink ? ':blink' : '');
    let tex = faceCache.get(key);
    if (!tex) {
      const canvas = document.createElement('canvas');
      canvas.width = CW;
      canvas.height = CH;
      drawFace(canvas.getContext('2d'), CW, CH, expr, blink);
      tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      faceCache.set(key, tex);
    }
    return tex;
  };
  const faceMat = new THREE.MeshBasicMaterial({
    map: faceTexture('teary', false),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
  });
  const faceU = makeU('head', SEG_SIZE.head);
  patchSkin(faceMat, 'DECAL', faceU);
  {
    const fg = new THREE.PlaneGeometry(C.face.w, C.face.h, 96, 72);
    const p = fg.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      p.setZ(i, headFrontZ(x, C.face.cy + p.getY(i)) + 0.004);
    }
    p.needsUpdate = true;
    const faceMesh = new THREE.Mesh(fg, faceMat);
    faceMesh.name = 'face';
    faceMesh.position.set(0, C.face.cy, 0);
    faceMesh.renderOrder = 2;
    head.add(faceMesh);
    parts.face = faceMesh;
    skinMeshes.push({ seg: 'head', mesh: faceMesh, U: faceU, noBox: true }); // same melt displacement as the head
  }

  // -------------------------------------------------------------------------------- beak
  // joints.beak is a pivot at the beak root (scale it along z to stretch the beak). It carries the upper beak
  // (parts.beak) and the hinged lower beak (parts.beakJaw group > parts.beakLow) with a tongue.
  const Bk = C.beak;
  const beakJoint = joint('beak', head, 0, Bk.y, Bk.z + leanAt(NYw + Bk.y));
  const beakJaw = new THREE.Group();
  beakJaw.name = 'beakJaw';
  beakJoint.add(beakJaw);
  parts.beakJaw = beakJaw;
  part('beak', beakHalfGeometry(Bk, true), base.beak, beakJoint, { seg: 'head', inkT: 0.0055, flesh: false, hullMode: 'normals', hullScale: (y, z) => smooth01(0.04, 0.13, z) });
  part('beakLow', beakHalfGeometry(Bk, false), base.beak, beakJaw, { seg: 'head', inkT: 0.0055, flesh: false, hullMode: 'normals', hullScale: (y, z) => smooth01(0.04, 0.13, z) });
  {
    // tiny soft highlight on top of the beak
    const ux = -0.3;
    const uz = 0.3;
    const uy = Math.sqrt(1 - ux * ux - uz * uz);
    const k = 1 - 0.55 * Math.pow(uz, 1.3);
    const pos = new THREE.Vector3(ux * k * Bk.rx, uy * k * Bk.ry - 0.022 * uz * uz, uz * Bk.rz + Bk.oz);
    const nrm = new THREE.Vector3(ux / (Bk.rx * Bk.rx), uy / (Bk.ry * Bk.ry), uz / (Bk.rz * Bk.rz)).normalize();
    const hl = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), glintMat);
    hl.scale.set(0.02, 0.0045, 0.012);
    hl.position.copy(pos).addScaledVector(nrm, 0.0015);
    hl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
    hl.rotateY(0.5);
    hl.name = 'beakGlint';
    beakJoint.add(hl);
    parts.beakGlint = hl;
    segState.head.hideOnMelt.push(hl);
  }
  const tongue = (() => {
    const tg = new THREE.SphereGeometry(1, 16, 10);
    tg.deleteAttribute('uv');
    tg.scale(0.036, 0.011, 0.1);
    tg.translate(0, 0, 0.1);
    const m = new THREE.Mesh(tg, base.tongue);
    m.name = 'tongue';
    m.position.set(0, 0.003, 0.0);
    const ink = new THREE.Mesh(hullGeometry(tg, 0.004), inkMat);
    ink.renderOrder = -1;
    m.add(ink);
    m.visible = false;
    beakJaw.add(m);
    parts.tongue = m;
    return m;
  })();

  // -------------------------------------------------------------------------------- crest
  // Three little feathers on their own pivot, so the crest wobbles. (Not skin: it rides the skull when the head melts.)
  const crest = joint('crest', head, 0, C.crest.y, C.crest.z + leanAt(NYw + C.crest.y));
  {
    const specs = [
      { name: 'crestC', len: 0.15, w: 1.1, x: 0, rz: 0, rx: 0.42, bx: 0, bz: 0.03 },
      { name: 'crestL', len: 0.125, w: 1.0, x: 0.04, rz: -0.7, rx: 0.34, bx: -0.01, bz: 0.02 },
      { name: 'crestR', len: 0.125, w: 1.0, x: -0.04, rz: 0.7, rx: 0.34, bx: 0.01, bz: 0.02 },
    ];
    for (const s of specs) {
      const grp = new THREE.Group();
      grp.name = s.name + 'Pivot';
      grp.position.set(s.x, 0, 0);
      grp.rotation.set(s.rx, 0, s.rz, 'ZXY');
      crest.add(grp);
      // L is +x: bend its tip outward (+x); the geometry is built for +x bends, so mirror through bx's sign
      part(s.name, featherGeometry(s.len, s.w, s.bx, s.bz), base.blue, grp, { inkT: 0.0045 });
    }
    parts.crest = crest;
  }

  // =============================================================================== anatomy
  const boneMats = [];
  let jawGroup = null;
  // give a bone-side mesh its own patched material so it slumps with the skin (no dissolve, no recolor)
  const followMelt = (m, seg) => {
    const U = makeU(seg, SEG_SIZE[seg]);
    m.material = patchSkin(m.material.clone(), 'BONE', U);
    boneMats.push(m.material);
    skinMeshes.push({ seg, mesh: m, U });
  };
  const bonesOf = {};
  for (const n of SEG_NAMES) bonesOf[n] = segState[n].bones;

  const place = (geo, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, anchor } = {}) => {
    // normalize: non-indexed, no uv (RoundedBoxGeometry is non-indexed), so any pieces can be merged
    if (geo.index) geo = geo.toNonIndexed();
    if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz)
    );
    geo.applyMatrix4(m);
    const p = geo.getAttribute('position');
    const a = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) a[i] = anchor === undefined ? p.getY(i) : anchor;
    geo.setAttribute('anchor', new THREE.BufferAttribute(a, 1));
    return geo;
  };
  const sphG = (r, o) => place(new THREE.SphereGeometry(r, 18, 14), o);
  const capG = (r, len, o) => place(new THREE.CapsuleGeometry(r, len, 6, 12), o);
  const boxG = (w, h, d, rad, o) => place(new RoundedBoxGeometry(w, h, d, 3, rad), o);
  const mergeAll = (list) => mergeGeometries(list, false);

  // A chunky cartoon long bone along -y: a shaft between two knob pairs.
  const longBone = (yTop, yBot, r, kr, ks) => {
    const list = [];
    const cyl = new THREE.CylinderGeometry(r, r * 1.08, yTop - yBot, 12, 1);
    list.push(place(cyl, { y: (yTop + yBot) / 2 }));
    for (const yy of [yTop, yBot]) {
      for (const dx of [-ks, ks]) list.push(sphG(kr, { x: dx, y: yy, anchor: yy }));
    }
    return mergeAll(list);
  };

  const boneMesh = (name, geo, parent, seg, { x = 0, y = 0, z = 0, inkT = 0.006, stretchKey } = {}) => {
    const mesh = new THREE.Mesh(geo, base.bone);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.visible = false;
    const hg = hullGeometry(geo, inkT);
    const hull = new THREE.Mesh(hg, inkMat);
    hull.userData.isHull = true;
    hull.name = name + 'Ink';
    hull.renderOrder = -1;
    mesh.add(hull);
    parent.add(mesh);
    parts[name] = mesh;
    parts[name + 'Ink'] = hull;
    segState[seg].bones.push(mesh);
    {
      const U = makeU(seg, SEG_SIZE[seg]);
      mesh.material = patchSkin(base.bone.clone(), 'BONE', U);
      hull.material = patchSkin(inkMat.clone(), 'BONE', U);
      boneMats.push(mesh.material, hull.material);
      skinMeshes.push({ seg, mesh, U });
    }
    if (stretchKey) {
      const anchor = geo.getAttribute('anchor').array;
      addStretch(stretchKey, geo, anchor);
      // hull anchors: nearest source vertex
      const sp = geo.getAttribute('position');
      const hp = hg.getAttribute('position');
      const ha = new Float32Array(hp.count);
      for (let i = 0; i < hp.count; i++) {
        let best = 1e9;
        let bi = 0;
        for (let j = 0; j < sp.count; j++) {
          const dx = hp.getX(i) - sp.getX(j);
          const dy = hp.getY(i) - sp.getY(j);
          const dz = hp.getZ(i) - sp.getZ(j);
          const d = dx * dx + dy * dy + dz * dz;
          if (d < best) {
            best = d;
            bi = j;
          }
        }
        ha[i] = anchor[bi];
      }
      addStretch(stretchKey, hg, ha);
    }
    return mesh;
  };

  // ---- skull, jaw, neck vertebrae (head segment; frame = neck group)
  // A cute penguin skull: a rounded cranium that follows the dome of the head, big eye sockets with brow ridges, cheek
  // bumps, a tapering beak bone, a hinged lower beak (the jaw), a suture line and a crack. It is rigid: no melt
  // displacement at any amount.
  {
    const BONE = new THREE.Color(C.colors.bone);
    const DARK = new THREE.Color(0x2b2431);
    const SK = { rx: 0.36, ry: 0.31, rz: 0.34, k: 3.0, cy: 0.4, cz: -0.03 + leanAt(NYw + 0.4) };
    const sstep = (a, b, x) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const surfZ = (x, y) => SK.rz * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x / SK.rx), SK.k) - Math.pow(Math.abs(y / SK.ry), SK.k)), 1 / SK.k);
    const surfY = (x, z) => SK.ry * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x / SK.rx), SK.k) - Math.pow(Math.abs(z / SK.rz), SK.k)), 1 / SK.k);

    // superellipsoid with carved hollows (dark inside)
    const superGeo = (rx, ry, rz, k, carves, wSeg = 192, hSeg = 128) => {
      const g = new THREE.SphereGeometry(1, wSeg, hSeg);
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      const p = g.getAttribute('position');
      const col = new Float32Array(p.count * 3);
      const hol = new Float32Array(p.count).fill(-1);
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const dx = p.getX(i);
        const dy = p.getY(i);
        const dz = p.getZ(i);
        const L = Math.pow(Math.pow(Math.abs(dx), k) + Math.pow(Math.abs(dy), k) + Math.pow(Math.abs(dz), k), 1 / k) || 1;
        let x = (dx / L) * rx;
        let y = (dy / L) * ry;
        let z = (dz / L) * rz;
        let dark = 0;
        for (const cv of carves) {
          if (cv.t === 'f' && dz > 0.25) {
            const u = ((x - cv.cx) / cv.rx) ** 2 + ((y - cv.cy) / cv.ry) ** 2;
            if (u < 1) {
              z -= cv.depth * (1 - u) ** 2;
            }
            hol[i] = Math.max(hol[i], Math.max(-1, 1 - u));
          } else if (cv.t === 's' && cv.s * dx > 0.35) {
            const u = ((y - cv.cy) / cv.ry) ** 2 + ((z - cv.cz) / cv.rz) ** 2;
            if (u < 1) {
              x -= cv.s * cv.depth * (1 - u) ** 2;
            }
            hol[i] = Math.max(hol[i], Math.max(-1, 1 - u));
          }
        }
        p.setXYZ(i, x, y, z);
        c.copy(BONE).multiplyScalar(0.94 + 0.06 * Math.min(1, dy / L * 0.5 + 0.5));
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('hollow', new THREE.BufferAttribute(hol, 1));
      const m = mergeVertices(g, 1e-6);
      m.computeVertexNormals();
      return m.toNonIndexed();
    };
    // a solid colored piece (position, normal, color only) so pieces can be merged
    const piece = (geo, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, q } = {}) => {
      let g = geo.index ? geo.toNonIndexed() : geo;
      g = g.clone();
      for (const a of ['uv', 'anchor']) if (g.getAttribute(a)) g.deleteAttribute(a);
      g.applyMatrix4(
        new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q || new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz))
      );
      const n = g.getAttribute('position').count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([BONE.r, BONE.g, BONE.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('hollow', new THREE.BufferAttribute(new Float32Array(n).fill(-1), 1));
      return g;
    };
    const capBetween = (a, b, r) => {
      const A = new THREE.Vector3(...a);
      const B = new THREE.Vector3(...b);
      const len = A.distanceTo(B);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
      const mid = A.clone().add(B).multiplyScalar(0.5);
      return piece(new THREE.CapsuleGeometry(r, len, 6, 12), { x: mid.x, y: mid.y, z: mid.z, q });
    };
    const rbox = (w, h, d, r, o) => piece(new RoundedBoxGeometry(w, h, d, 3, r), o);

    // --- cranium (big eye sockets at the front)
    const list = [
      superGeo(SK.rx, SK.ry, SK.rz, SK.k, [
        { t: 'f', cx: -0.21, cy: -0.02, rx: 0.1, ry: 0.115, depth: 0.12 },
        { t: 'f', cx: 0.21, cy: -0.02, rx: 0.1, ry: 0.115, depth: 0.12 },
      ]),
    ];
    // --- beak bone: a tapering, flattened cone sticking out of the face, with a rounded tip
    {
      const by = C.beak.y - SK.cy - 0.005;
      const zBase = 0.3;
      list.push(piece(new THREE.CylinderGeometry(0.02, 0.062, 0.26, 14), { x: 0, y: by + 0.012, z: zBase + 0.13, rx: Math.PI / 2, sz: 0.62 }));
      list.push(piece(new THREE.SphereGeometry(1, 14, 10), { x: 0, y: by + 0.012, z: zBase + 0.26, sx: 0.022, sy: 0.014, sz: 0.022 }));
    }
    // --- brow ridges and cheek bumps
    for (const s of [-1, 1]) {
      const bx0 = s * 0.1;
      const bx1 = s * 0.31;
      list.push(capBetween([bx0, 0.1, surfZ(bx0, 0.1) * 0.985], [bx1, 0.07, surfZ(bx1, 0.07) * 0.97 + 0.01], 0.032));
      list.push(piece(new THREE.SphereGeometry(1, 20, 14), { x: s * 0.27, y: -0.13, z: 0.16, sx: 0.09, sy: 0.05, sz: 0.075 }));
    }
    // warm-grey shading baked into the vertex colors: undersides and backs of every form tint toward warm grey
    const warmShade = (geo) => {
      const n = geo.getAttribute('normal');
      const col = geo.getAttribute('color');
      const c = new THREE.Color();
      const warm = new THREE.Color(0.8, 0.72, 0.62);
      for (let i = 0; i < col.count; i++) {
        const k = sstep(0.3, -0.75, n.getY(i)) * 0.85 + sstep(0.1, -0.8, n.getZ(i)) * 0.35;
        c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).multiply(new THREE.Color(1, 1, 1).lerp(warm, Math.min(1, k)));
        col.setXYZ(i, c.r, c.g, c.b);
      }
      return geo;
    };
    const skullGeo = warmShade(mergeGeometries(list, false));

    // --- materials: rigid (no melt displacement), warm grey shadows
    const skullMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
    skullMat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float hollow;\nvarying float vHollow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvHollow = hollow;');
      sh.fragmentShader = 'varying float vHollow;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.015, 0.03), smoothstep(0.12, 0.17, vHollow));');
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        `float wl = dot(outgoingLight, vec3(0.3333)) / max(dot(diffuseColor.rgb, vec3(0.3333)), 1e-3);
         outgoingLight *= mix(vec3(1.0, 0.86, 0.72), vec3(1.0), smoothstep(SKULL_LO, SKULL_HI, wl));
         #include <opaque_fragment>`
      );
      sh.fragmentShader = `#define SKULL_LO ${C.skull.warmLo.toFixed(3)}\n#define SKULL_HI ${C.skull.warmHi.toFixed(3)}\n` + sh.fragmentShader;
    };
    skullMat.customProgramCacheKey = () => 'wm-skull';
    const skullInk = inkMat.clone();
    boneMats.push(skullMat, skullInk);
    const rigidBone = (name, geo, parent, { x = 0, y = 0, z = 0, inkT = 0.008 } = {}) => {
      const mesh = new THREE.Mesh(geo, skullMat);
      mesh.name = name;
      mesh.position.set(x, y, z);
      const hull = new THREE.Mesh(hullGeometry(geo, inkT), skullInk);
      hull.userData.isHull = true;
      hull.name = name + 'Ink';
      hull.renderOrder = -1;
      mesh.add(hull);
      parent.add(mesh);
      parts[name] = mesh;
      parts[name + 'Ink'] = hull;
      return mesh;
    };
    const skull = rigidBone('skull', skullGeo, neck, { y: SK.cy, z: SK.cz });
    skull.visible = false;
    segState.head.bones.push(skull);

    // --- suture line on top and a couple of cracks (thin ink tubes lying on the surface)
    const tube = (pts, r) => {
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(...v))), pts.length * 3, r, 5, false), inkFlat);
      skull.add(m);
      return m;
    };
    {
      const pts = [];
      for (let i = 0; i <= 26; i++) {
        const z = -0.29 + (0.55 * i) / 26;
        const x = 0.018 * Math.sin(i * 1.7) + (i % 2 ? 0.008 : -0.008);
        pts.push([x, surfY(x, z) * 1.004 + 0.002, z]);
      }
      tube(pts, 0.0036);
      const crack = (path, r) => tube(path.map(([x, y]) => [x, y, surfZ(x, y) * 1.003 + 0.002]), r);
      crack([[-0.1, 0.27], [-0.12, 0.23], [-0.08, 0.2], [-0.13, 0.16], [-0.11, 0.12]], 0.0042);
      crack([[-0.11, 0.2], [-0.17, 0.2], [-0.21, 0.22]], 0.0034);
    }

    // --- lower jaw (hinged at the back of the beak): mandible bar plus two rami up to the hinge
    const jaw = new THREE.Group();
    jaw.name = 'jaw';
    const hinge = [0, -0.17, 0.08];
    jaw.position.set(...hinge);
    skull.add(jaw);
    const jl = [capBetween([0, -0.012, 0.05], [0, -0.022, 0.4], 0.03)];
    for (const s of [-1, 1]) jl.push(capBetween([s * 0.17, 0.035, -0.03], [s * 0.05, -0.016, 0.2], 0.024));
    const jawMesh = rigidBone('jawBone', warmShade(mergeGeometries(jl, false)), jaw, { inkT: 0.007 });
    parts.jaw = jawMesh;
    jaw.userData.hinge = hinge;
    jawGroup = jaw;

    // --- neck vertebrae
    const nl = [];
    for (let i = 0; i < 3; i++) nl.push(sphG(0.058, { y: -0.03 + i * 0.07, z: -0.2, sx: 1.1, sy: 0.7, sz: 1 }));
    boneMesh('neckBones', mergeAll(nl), neck, 'head', { inkT: 0.005 });
  }

  // ---- spine, ribcage, sternum (torso segment; frame = torso group)
  {
    const sp = [];
    for (let i = 0; i < 7; i++) {
      const y = 0.0 + i * 0.085;
      sp.push(boxG(0.085, 0.05, 0.08, 0.018, { y, z: -0.38 }));
      sp.push(capG(0.016, 0.06, { x: 0, y, z: -0.435, rx: Math.PI / 2 }));
    }
    boneMesh('spine', mergeAll(sp), torso, 'torso', { inkT: 0.005 });
    const ribs = [];
    const rows = [[0.08, 0.54], [0.18, 0.56], [0.28, 0.53], [0.38, 0.47], [0.47, 0.38]];
    for (const [y, a] of rows) {
      const c = a * 0.88;
      const pts = [];
      for (let i = 0; i <= 26; i++) {
        const th = -2.35 + (4.7 * i) / 26;
        pts.push(new THREE.Vector3(a * Math.sin(th), y + 0.014 * Math.cos(th * 1.5), -0.03 + c * Math.cos(th)));
      }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.022, 8, false);
      ribs.push(place(tube, {}));
    }
    ribs.push(boxG(0.05, 0.4, 0.04, 0.018, { y: 0.28, z: -0.03 + 0.5 * 0.88 + 0.005 }));
    boneMesh('ribcage', mergeAll(ribs), torso, 'torso', { inkT: 0.005 });
  }

  // ---- pelvis bone (pelvis segment)
  {
    const pl = [
      sphG(1, { x: 0.23, y: 0.0, z: 0.0, sx: 0.15, sy: 0.1, sz: 0.09, rz: -0.35 }),
      sphG(1, { x: -0.23, y: 0.0, z: 0.0, sx: 0.15, sy: 0.1, sz: 0.09, rz: 0.35 }),
      sphG(0.075, { y: -0.02, z: -0.25 }),
      sphG(0.05, { x: 0.2, y: -0.075, z: 0 }),
      sphG(0.05, { x: -0.2, y: -0.075, z: 0 }),
      capG(0.032, 0.16, { y: -0.06, z: 0.15, rz: Math.PI / 2 }),
    ];
    boneMesh('pelvisBone', mergeAll(pl), pelvis, 'pelvis', { inkT: 0.005 });
  }

  // ---- limbs
  for (const [sx, S] of [[1, 'L'], [-1, 'R']]) {
    const A = C.arm;
    boneMesh('humerus' + S, longBone(-0.02, -(A.upper - 0.02), 0.022, 0.03, 0.016), joints['arm' + S], 'arm' + S, {
      stretchKey: 'arm' + S,
      inkT: 0.005,
    });
    boneMesh('radius' + S, longBone(-0.02, -(A.fore - 0.015), 0.02, 0.028, 0.015), joints['elbow' + S], 'fore' + S, {
      stretchKey: 'forearm' + S,
      inkT: 0.005,
    });
    const hb = [sphG(0.04, { y: -0.03, sx: 1.1, sz: 0.8 })];
    for (const dx of [-0.032, 0, 0.032]) hb.push(capG(0.014, 0.05, { x: dx, y: -0.085, z: 0.0 }));
    boneMesh('handBones' + S, mergeAll(hb), joints['hand' + S], 'fore' + S, { inkT: 0.004 });

    const Lg = C.leg;
    boneMesh('femur' + S, longBone(-0.02, -(Lg.length - 0.01), 0.022, 0.03, 0.016), joints['leg' + S], 'leg' + S, { inkT: 0.005 });
    const fb = [sphG(0.04, { y: -0.01 })];
    for (const dx of [-0.075, 0, 0.075]) fb.push(capG(0.02, 0.1, { x: dx, y: -0.09, z: C.foot.z + 0.07, rx: Math.PI / 2 }));
    boneMesh('footBones' + S, mergeAll(fb), joints['foot' + S], 'leg' + S, { inkT: 0.005 });
  }

  // =============================================================================== organs
  const organMats = {};
  const organInk = {};
  let organUid = 0;
  const glossList = [];
  const glossMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
  const organMeshOf = (geo, color, seg, inkT = 0.008, gloss = true) => {
    const U = makeU(seg, 0.3);
    const uid = organUid++;
    organMats[uid] = patchSkin(toon(color), 'ORGAN', U);
    organInk[uid] = patchSkin(inkMat.clone(), 'INK', U);
    const m = new THREE.Mesh(geo, organMats[uid]);
    skinMeshes.push({ seg, mesh: m, U, noBox: true });
    const hull = new THREE.Mesh(hullGeometry(geo, inkT), organInk[uid]);
    hull.renderOrder = -1;
    m.add(hull);
    if (gloss) {
      geo.computeBoundingBox();
      const b = geo.boundingBox;
      const c = b.getCenter(new THREE.Vector3());
      const h = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const d = new THREE.Vector3(-0.42, 0.5, 0.75).normalize();
      const gm = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), glossMat);
      const gs = Math.min(h.x, h.y, h.z) * 0.32;
      gm.scale.set(gs * 1.5, gs * 0.75, gs * 0.35);
      gm.position.set(c.x + d.x * h.x * 0.86, c.y + d.y * h.y * 0.86, c.z + d.z * h.z * 0.86);
      gm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
      gm.rotateZ(0.7);
      m.add(gm);
      glossList.push({ gm, seg });
    }
    return m;
  };
  const ell = (rx, ry, rz, o = {}) => place(new THREE.SphereGeometry(1, 24, 18), { sx: rx, sy: ry, sz: rz, ...o });

  const organs = { intestine: [] };
  const addOrgan = (name, group, seg, parent, x, y, z, rot) => {
    group.name = name;
    group.position.set(x, y, z);
    if (rot) group.rotation.set(...rot);
    group.visible = false;
    parent.add(group);
    segState[seg].organs.push(group);
    return group;
  };
  const squishable = (group, phase = 0) => {
    group.userData.sq = { amp: 0, t: 0, phase };
    group.userData.squish = (amount = 1) => {
      group.userData.sq.amp = Math.max(0, Math.min(1.5, amount));
      group.userData.sq.t = 0;
    };
    return group;
  };
  const single = (mesh, k = 1) => {
    const g = new THREE.Group();
    mesh.scale.setScalar(k); // base size lives on the mesh so the group scale stays free for squish
    g.add(mesh);
    return g;
  };
  {
    // heart: two lobes, plump body, tip, vessels
    const hg = mergeAll([
      ell(0.058, 0.058, 0.055, { x: -0.04, y: 0.03 }),
      ell(0.058, 0.058, 0.055, { x: 0.04, y: 0.03 }),
      ell(0.075, 0.075, 0.062, { y: -0.005 }),
      ell(0.04, 0.05, 0.04, { y: -0.055 }),
      place(new THREE.CylinderGeometry(0.017, 0.02, 0.07, 10), { x: 0.02, y: 0.09, z: 0.0, rz: -0.25 }),
      place(new THREE.CylinderGeometry(0.014, 0.016, 0.06, 10), { x: -0.03, y: 0.085, z: 0.0, rz: 0.25 }),
    ]);
    organs.heart = squishable(single(organMeshOf(hg, 0xe23a52, 'torso', 0.008), 2.0), 0);
    addOrgan('heart', organs.heart, 'torso', torso, 0.0, 0.33, 0.17, [0, 0, 0.12]);
    // lungs: teardrop lobes either side of the heart
    for (const [sx, S] of [[1, 'L'], [-1, 'R']]) {
      const lg = mergeAll([
        ell(0.078, 0.14, 0.09, { y: 0.0 }),
        ell(0.055, 0.075, 0.07, { x: -sx * 0.035, y: -0.085, z: 0.01 }),
      ]);
      organs['lung' + S] = squishable(single(organMeshOf(lg, 0xf58fae, 'torso', 0.009), 1.55), sx);
      addOrgan('lung' + S, organs['lung' + S], 'torso', torso, sx * 0.24, 0.34, -0.04, [0, 0, -sx * 0.1]);
    }
    // stomach: bean with a little esophagus
    const sg = mergeAll([
      ell(0.115, 0.075, 0.085),
      ell(0.055, 0.06, 0.055, { x: -0.07, y: 0.045 }),
      place(new THREE.CylinderGeometry(0.02, 0.022, 0.07, 10), { x: -0.06, y: 0.1, rz: 0.2 }),
    ]);
    organs.stomach = squishable(single(organMeshOf(sg, 0xf8a58a, 'torso', 0.009), 1.9), 2);
    addOrgan('stomach', organs.stomach, 'torso', torso, 0.2, 0.17, 0.16, [0, 0, -0.35]);
    // liver
    const lvg = mergeAll([ell(0.155, 0.06, 0.09), ell(0.08, 0.05, 0.075, { x: 0.09, y: -0.005 })]);
    organs.liver = squishable(single(organMeshOf(lvg, 0xb53a4c, 'torso', 0.009), 1.5), 3);
    addOrgan('liver', organs.liver, 'torso', torso, -0.17, 0.17, 0.15, [0, 0, 0.18]);
    // kidneys
    for (const [sx, S] of [[1, 'L'], [-1, 'R']]) {
      const kg = mergeAll([ell(0.038, 0.062, 0.034), ell(0.02, 0.026, 0.02, { x: -sx * 0.03, y: 0 })]);
      organs['kidney' + S] = squishable(single(organMeshOf(kg, 0xa3283f, 'torso', 0.007), 2.0), 4 + sx);
      addOrgan('kidney' + S, organs['kidney' + S], 'torso', torso, sx * 0.26, 0.18, -0.3, [0, 0, sx * 0.25]);
    }
    // intestines: a zig-zag chain of 12 plump sausage links in the belly
    const linkGeo = place(new THREE.CapsuleGeometry(0.058, 0.085, 10, 16), { rz: Math.PI / 2 });
    const rowsY = [0.24, 0.13, 0.03];
    let idx = 0;
    rowsY.forEach((y, ri) => {
      for (let k = 0; k < 4; k++) {
        const dir = ri % 2 === 0 ? 1 : -1;
        const x = (-0.25 + k * 0.167) * dir;
        const link = single(organMeshOf(linkGeo.clone(), idx % 2 ? 0xf48aa6 : 0xf7a1b8, 'torso', 0.006, false), 1.35);
        squishable(link, idx * 0.5);
        addOrgan('intestine' + idx, link, 'torso', torso, x, y + (k % 2 ? 0.008 : -0.008), 0.05 + ((ri + k) % 2) * 0.07, [0, 0, (k % 2 ? 0.12 : -0.12) * dir]);
        organs.intestine.push(link);
        idx++;
      }
    });
    // brain: wrinkly lumpy hemisphere pair in the skull
    const bg = new THREE.IcosahedronGeometry(1, 4);
    bg.deleteAttribute('uv');
    bg.deleteAttribute('normal');
    const bp = bg.getAttribute('position');
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i);
      const y = bp.getY(i);
      const z = bp.getZ(i);
      let r = 1 + 0.045 * Math.sin(9 * x + 1) * Math.sin(9 * y) * Math.sin(9 * z + 2) + 0.03 * Math.sin(17 * x) * Math.sin(15 * z);
      if (Math.abs(x) < 0.09 && y > -0.2) r *= 1 - 0.09 * (1 - Math.abs(x) / 0.09); // central groove
      bp.setXYZ(i, x * r * 0.3, y * r * 0.22, z * r * 0.27);
    }
    const bm = mergeVertices(bg, 1e-5);
    bm.computeVertexNormals();
    organs.brain = squishable(single(organMeshOf(bm, 0xf7a6c6, 'head', 0.009), 0.95), 1);
    addOrgan('brain', organs.brain, 'head', neck, 0, 0.43, -0.03);
  }

  // =============================================================================== stumps
  const cutSet = (mesh, slot, n, d) => {
    const U = cutRefs[mesh];
    if (!U) return;
    (slot === 'a' ? U.uCutA : U.uCutB).value.set(n[0], n[1], n[2], d);
  };
  const elbowParentCut = { L: false, R: false };
  const cutClear = () => {
    for (const U of Object.values(cutRefs)) {
      U.uCutA.value.set(0, 0, 0, 1e5);
      U.uCutB.value.set(0, 0, 0, 1e5);
    }
    elbowParentCut.L = elbowParentCut.R = false;
  };
  const yHip = pear.yAtR(C.hip.x);
  const stumpDefs = (jointName) => {
    const A = C.arm;
    const m = /^(neck|shoulder|elbow|hip|waist)([LR])?$/.exec(jointName);
    if (!m) throw new Error('makeStump: unknown joint ' + jointName);
    const kind = m[1];
    const S = m[2] || '';
    const sx = S === 'L' ? 1 : -1;
    switch (kind) {
      case 'neck':
        return {
          child: { frame: neck, pos: [0, -0.003, 0], n: [0, -1, 0], R: neckR * 0.99, cut: ['head', 'a', [0, -1, 0], 0] },
          parent: { frame: torso, pos: [0, NYt + 0.003, 0], n: [0, 1, 0], R: neckR * 0.99, cut: ['torso', 'b', [0, 1, 0], NYt] },
        };
      case 'shoulder':
        return {
          child: { frame: joints['arm' + S], pos: [0, 0.003, 0], n: [0, 1, 0], R: A.radius * 1.02, cut: ['arm' + S, 'a', [0, 1, 0], 0], flat: A.flat },
          parent: { frame: torso, pos: [sx * (Math.sqrt(pear.rAt(C.torso.shoulder.y) ** 2 - (C.torso.shoulder.z / D) ** 2) - 0.004), C.torso.shoulder.y - torsoY, C.torso.shoulder.z], n: [sx, 0.25, 0.1], R: 0.09 },
        };
      case 'elbow': {
        const s = stretchers['arm' + S]?.s ?? 1;
        return {
          child: { frame: joints['elbow' + S], pos: [0, 0.003, 0], n: [0, 1, 0], R: A.radius * 0.97, cut: ['forearm' + S, 'a', [0, 1, 0], 0], flat: A.flat },
          parent: {
            frame: joints['arm' + S],
            pos: [0, -A.upper * s - 0.003, 0],
            n: [0, -1, 0],
            R: A.radius,
            cut: ['arm' + S, 'b', [0, -1, 0], A.upper * s],
            elbow: S,
            flat: A.flat,
          },
        };
      }
      case 'hip':
        return {
          child: { frame: joints['leg' + S], pos: [0, 0.003, 0], n: [0, 1, 0], R: C.leg.radius * 1.0, cut: ['leg' + S, 'a', [0, 1, 0], 0] },
          parent: { frame: pelvis, pos: [sx * C.hip.x, yHip - C.pelvisY - 0.004, 0], n: [sx * 0.4, -1, 0], R: C.leg.radius * 0.95 },
        };
      default: // waist: both meshes overlap a little, the cut planes trim the overlap
        return {
          child: { frame: torso, pos: [0, WY - 0.003, 0], n: [0, -1, 0], R: waistR, cut: ['torso', 'a', [0, -1, 0], -WY] },
          parent: { frame: pelvis, pos: [0, WY + C.torso.y + 0.003, 0], n: [0, 1, 0], R: waistR, cut: ['pelvis', 'a', [0, 1, 0], WY + C.torso.y] },
        };
    }
  };

  const rng = (seed) => {
    let s = seed >>> 0;
    return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  };
  const hashStr = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  const stumpFleshMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  const toothBase = new THREE.ConeGeometry(1, 1, 5, 1, false);
  toothBase.translate(0, 0.5, 0);
  toothBase.rotateX(Math.PI / 2); // apex along +z, base at z = 0

  // A torn wound: ragged skin flaps around the rim, a lumpy wet muscle surface with dark blotches, and the bone
  // sticking out as a short stub, off-centre.
  function makeStump(jointName, side) {
    const def = stumpDefs(jointName)[side === 'parent' ? 'parent' : 'child'];
    const kind0 = jointName.replace(/[LR]$/, '');
    const R = def.R;
    const rnd = rng(hashStr(jointName + side));
    const g = new THREE.Group();
    g.name = `stump_${jointName}_${side}`;
    g.position.set(...def.pos);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...def.n).normalize());
    if (def.flat) g.scale.y = def.flat; // flippers are flat paddles: squash the round wound to match

    const ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
    const edge = (th) => 1 + 0.1 * Math.sin(3 * th + ph[0]) + 0.07 * Math.sin(5 * th + ph[1]) + 0.045 * Math.sin(9 * th + ph[2]);

    // muscle surface: rings of vertices with dome + lumps, colored by blotches
    {
      const rings = 8;
      const segs = 44;
      const pos = [];
      const col = [];
      const idx = [];
      const cMus = new THREE.Color(0xe94f69);
      const cLite = new THREE.Color(0xff8ea3);
      const cDark = new THREE.Color(0x8d1a37);
      const tmp = new THREE.Color();
      const sstep = (a, b, x) => {
        const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
      };
      for (let i = 0; i <= rings; i++) {
        const rho = i / rings;
        for (let j = 0; j < segs; j++) {
          const th = (j / segs) * Math.PI * 2;
          const rr = R * 0.96 * edge(th) * rho;
          const x = rr * Math.cos(th);
          const y = rr * Math.sin(th);
          const u = x / R;
          const v = y / R;
          const lump = Math.sin(u * 9 + ph[0]) * Math.sin(v * 8 + ph[1]) + 0.5 * Math.sin(u * 17 + v * 13 + ph[2]);
          const z = 0.006 + R * (0.3 * (1 - rho * rho) + 0.08 * lump * Math.min(1, rho * 2.2));
          pos.push(x, y, z);
          const bl = 0.5 + 0.5 * Math.sin(u * 7 + ph[1]) * Math.sin(v * 6 + ph[2]) + 0.25 * Math.sin(u * 15 + v * 11 + ph[3]);
          tmp.copy(cMus).lerp(cDark, sstep(0.62, 0.95, bl) * 0.85).lerp(cLite, sstep(0.25, 0.9, lump * 0.5 + 0.5) * 0.35);
          col.push(tmp.r, tmp.g, tmp.b);
        }
      }
      for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segs; j++) {
          const a = i * segs + j;
          const b = i * segs + ((j + 1) % segs);
          const c = (i + 1) * segs + j;
          const d = (i + 1) * segs + ((j + 1) % segs);
          idx.push(a, c, b, b, c, d);
        }
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      fg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      fg.setIndex(idx);
      fg.computeVertexNormals();
      const flesh = new THREE.Mesh(fg, stumpFleshMat);
      g.add(flesh);
      const hull = new THREE.Mesh(hullGeometry(fg, 0.006), inkMat);
      hull.renderOrder = -1;
      g.add(hull);
      // wet highlights
      for (const [hx, hy, s] of [[-0.42, 0.38, 1], [0.3, -0.42, 0.7], [0.1, 0.5, 0.5]]) {
        const sh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), glossMat);
        sh.scale.set(R * 0.16 * s, R * 0.07 * s, 0.004);
        sh.position.set(hx * R, hy * R, R * 0.2 + 0.01);
        sh.rotation.z = 0.6;
        g.add(sh);
      }
    }

    // torn skin flaps: a jagged ring of body-colour teeth around the rim, leaning outward
    {
      const n = 8 + Math.floor(rnd() * 3);
      const list = [];
      for (let k = 0; k < n; k++) {
        const th = ((k + (rnd() - 0.5) * 0.6) / n) * Math.PI * 2;
        const len = R * (0.17 + 0.2 * rnd());
        const w = R * (0.26 + 0.14 * rnd());
        const tilt = 0.75 + 0.35 * rnd();
        const outward = new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
        const dir = new THREE.Vector3(0, 0, 1).multiplyScalar(Math.cos(tilt)).addScaledVector(outward, Math.sin(tilt));
        const tang = new THREE.Vector3(-Math.sin(th), Math.cos(th), 0);
        const third = new THREE.Vector3().crossVectors(dir, tang).normalize();
        const basis = new THREE.Matrix4().makeBasis(tang, third, dir);
        basis.setPosition(outward.clone().multiplyScalar(R * 1.0));
        const t = toothBase.clone().toNonIndexed();
        t.deleteAttribute('uv');
        t.scale(w, w * 0.8, len);
        t.applyMatrix4(basis);
        list.push(t);
      }
      const tg = mergeGeometries(list, false);
      const teeth = new THREE.Mesh(tg, base.blue);
      g.add(teeth);
      const th = new THREE.Mesh(hullGeometry(tg, 0.006), inkMat);
      th.renderOrder = -1;
      g.add(th);
    }

    // bone stub, off-centre, with a dark blood ring at its base and a marrow dot on the end
    {
      const bx = R * (0.1 + 0.08 * rnd());
      const by = -R * (0.06 + 0.08 * rnd());
      const bs = new THREE.CapsuleGeometry(R * 0.26, R * 0.5, 6, 12);
      bs.rotateX(Math.PI / 2);
      const bone = new THREE.Mesh(bs, base.bone);
      bone.position.set(bx, by, R * 0.13);
      bone.rotation.set(0.12 * (rnd() - 0.5), 0.12 * (rnd() - 0.5), 0);
      g.add(bone);
      const bh = new THREE.Mesh(hullGeometry(bs, 0.006), inkMat);
      bh.renderOrder = -1;
      bone.add(bh);
      const marrow = new THREE.Mesh(new THREE.CircleGeometry(R * 0.12, 14), base.fleshDark);
      marrow.position.set(0, 0, R * 0.51 + 0.0005);
      bone.add(marrow);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.32, R * 0.06, 8, 22), base.fleshDark);
      ring.position.set(bx, by, R * 0.2);
      g.add(ring);
    }

    if (def.cut) {
      cutSet(def.cut[0], def.cut[1], def.cut[2], def.cut[3]);
      if (def.elbow) elbowParentCut[def.elbow] = true;
    }
    if (kind0 === 'waist' || kind0 === 'neck') {
      severedSeam[kind0] = true;
      syncSeals();
    }
    g.userData.frame = def.frame;
    return g;
  }

  // =============================================================================== melt drips
  // Goo geometry hanging off the lower edges of the melting skin: tapered drips (varied thickness, length and bulb
  // size), wide goo curtains along the chin, and a few droplets that detach, fall and splat. Coloured like the
  // burnt skin: dark purple at the root fading to raw pink at the tip.
  const GOO_TOP = new THREE.Color(0x5e1d55);
  const GOO_BOT = new THREE.Color(0xf0709d);
  const gooMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  const gooBulbMat = toon(0xee6c9a);
  const paintY = (geo, y0, y1) => {
    const p = geo.getAttribute('position');
    const col = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const t = Math.min(1, Math.max(0, (p.getY(i) - y0) / (y1 - y0)));
      c.copy(GOO_TOP).lerp(GOO_BOT, t * t * (3 - 2 * t));
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  };
  // flared at the top (blends into the body), thin neck, unit length hanging down from y = 0
  const dripStemGeo = paintY(
    new THREE.LatheGeometry(
      [[0.0, -1.0], [0.018, -1.0], [0.02, -0.6], [0.028, -0.25], [0.04, -0.08], [0.052, 0.0], [0.0, 0.0]].map(([r, y]) => new THREE.Vector2(r, y)),
      14
    ),
    0,
    -1
  );
  const dripBulbGeo = new THREE.SphereGeometry(0.045, 14, 10);
  dripBulbGeo.scale(1, 1.25, 1);
  // A curtain of goo: a flat sheet whose lower edge is a row of rounded lobes of different depths, unit length.
  const curtainGeometry = (W, lobes) => {
    const shape = new THREE.Shape();
    const N = 70;
    const bottom = (u) => {
      let d = 0.12;
      for (const [c, h, w] of lobes) {
        const k = (u - c) / w;
        if (Math.abs(k) < 1) d = Math.max(d, 0.12 + (h - 0.12) * Math.sqrt(1 - k * k));
      }
      return d;
    };
    shape.moveTo(-W / 2, 0.02);
    shape.lineTo(W / 2, 0.02);
    for (let i = N; i >= 0; i--) {
      const u = i / N;
      shape.lineTo((u - 0.5) * W, -bottom(u));
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 4 });
    g.translate(0, 0, -0.0175);
    g.deleteAttribute('uv');
    return paintY(g, 0, -1);
  };
  const drips = []; // stem-and-bulb drips and curtains, all with .g, .seg, .base, .len ...
  const dripPhaseRng = rng(12345);
  const addDrip = (seg, parent, x, y, z, len, r = 1, bulb = 1, shiftY = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.visible = false;
    const stem = new THREE.Mesh(dripStemGeo, gooMat);
    const bulbM = new THREE.Mesh(dripBulbGeo, gooBulbMat);
    const stemInk = new THREE.Mesh(dripStemGeo, inkMat);
    const bulbInk = new THREE.Mesh(dripBulbGeo, inkMat);
    stemInk.renderOrder = -1;
    bulbInk.renderOrder = -1;
    const shine = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), glossMat);
    g.add(stemInk, bulbInk, stem, bulbM, shine);
    for (const o of [stem, stemInk, bulbM, bulbInk, shine]) o.scale.setScalar(0.001);
    parent.add(g);
    drips.push({ kind: 'drip', g, stem, bulb: bulbM, stemInk, bulbInk, shine, seg, len, r, bulbK: bulb, shiftY, base: new THREE.Vector3(x, y, z), phase: dripPhaseRng() * 6.28 });
  };
  const addCurtain = (seg, parent, x, y, z, W, len, lobes, rotY = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    g.visible = false;
    const geo = curtainGeometry(W, lobes);
    const mesh = new THREE.Mesh(geo, gooMat);
    const ink = new THREE.Mesh(hullGeometry(geo, 0.009), inkMat);
    ink.renderOrder = -1;
    g.add(ink, mesh);
    mesh.scale.setScalar(0.001);
    ink.scale.setScalar(0.001);
    // curtain lobes that hold a bead at their lowest points
    parent.add(g);
    drips.push({ kind: 'curtain', g, mesh, ink, seg, len, shiftY: 0, rotY, base: new THREE.Vector3(x, y, z), phase: dripPhaseRng() * 6.28 });
  };
  {
    // head: a wide curtain along the chin, chin drips, one off the beak, two off the sides of the head
    addCurtain('head', head, 0.0, 0.05, 0.4, 0.6, 0.32, [[0.12, 0.7, 0.13], [0.36, 1.0, 0.11], [0.6, 0.5, 0.12], [0.85, 0.85, 0.13]]);
    addDrip('head', head, -0.36, 0.08, 0.22, 0.5, 1.5, 1.25);
    addDrip('head', head, 0.36, 0.08, 0.22, 0.24, 0.8, 0.8);
    addDrip('head', head, 0.04, 0.28, 0.56, 0.36, 1.1, 1.5);
    addDrip('head', head, 0.48, 0.2, -0.02, 0.52, 0.9, 1.2, -0.22);
    addDrip('head', head, -0.48, 0.2, -0.02, 0.3, 1.5, 0.7, -0.22);
    // torso around the waist: one thick, one thin, a small curtain at the belly front
    const wr = waistR + 0.012;
    addDrip('torso', torso, wr * 0.9, WY + 0.01, D * wr * 0.4, 0.3, 1.4, 1.3);
    addDrip('torso', torso, -wr * 0.55, WY + 0.01, D * wr * 0.8, 0.16, 0.7, 0.8);
    addCurtain('torso', torso, 0.0, WY + 0.02, D * wr * 0.98, 0.3, 0.2, [[0.25, 0.8, 0.22], [0.72, 1.0, 0.2]]);
    // pelvis, flippers
    addDrip('pelvis', pelvis, -0.24, -0.2, 0.3, 0.22, 1.2, 1.0);
    addDrip('armL', joints.armL, 0.03, -0.1, 0.03, 0.3, 1.0, 1.4);
    addDrip('foreR', joints.elbowR, -0.03, -0.1, 0.04, 0.16, 0.7, 0.9);
    addDrip('foreL', joints.handL, 0.0, -0.14, 0.04, 0.34, 1.3, 1.1);
  }
  // Falling droplets: each is tied to one source drip; it swells at the tip, detaches, falls, splats and respawns.
  const dropletGeo = new THREE.SphereGeometry(0.03, 12, 9);
  dropletGeo.scale(1, 1.35, 1);
  const splatGeo = new THREE.CylinderGeometry(1, 1, 0.006, 20);
  const droplets = [];
  {
    const sources = drips.filter((d) => d.kind === 'drip' && d.len >= 0.3 && d.seg !== 'torso');
    sources.slice(0, 5).forEach((src, i) => {
      const body = new THREE.Mesh(dropletGeo, gooBulbMat);
      const hull = new THREE.Mesh(dropletGeo, inkMat);
      hull.scale.setScalar(1.25);
      hull.renderOrder = -1;
      const splatMat = new THREE.MeshBasicMaterial({ color: 0xd85a8c, transparent: true, depthWrite: false });
      const splat = new THREE.Mesh(splatGeo, splatMat);
      body.add(hull);
      body.visible = splat.visible = false;
      splat.scale.setScalar(0.001);
      root.add(body, splat);
      droplets.push({ src, body, splat, splatMat, state: 'wait', t: 0.5 + i * 0.55, vy: 0, size: 0.8 + 0.15 * i });
    });
  }
  const dripSmooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const _dq = new THREE.Quaternion();
  const _sq = new THREE.Quaternion();
  const _se = new THREE.Euler();
  const _dv = new THREE.Vector3();
  function layoutDrips(t = 0, dt = 0) {
    for (const d of drips) {
      const m = segState[d.seg].amount.value;
      const fade = 1 - dripSmooth(0.82, 1.0, m);
      d.g.visible = m > 0.04 && fade > 0.02;
      if (!d.g.visible) continue;
      const grow = Math.pow(m, 0.75) * fade;
      const spread = 1 + 0.28 * m;
      d.g.position.set(d.base.x * spread, d.base.y + d.shiftY * m, d.base.z * spread);
      // keep hanging straight down in the world, with a slight random sway
      d.g.parent.getWorldQuaternion(_dq);
      _dq.invert();
      _se.set(0.07 * Math.sin(t * 1.3 + d.phase), 0, 0.09 * Math.sin(t * 1.05 + d.phase * 1.7));
      _sq.setFromEuler(_se);
      d.g.quaternion.copy(_dq).multiply(_sq);
      if (d.kind === 'curtain') {
        const L = Math.max(0.001, d.len * grow * (1 + 0.05 * Math.sin(t * 2.1 + d.phase)));
        d.mesh.scale.set(spread, L, 1);
        d.ink.scale.set(spread, L, 1);
        continue;
      }
      const L = Math.max(0.001, d.len * grow * (1 + 0.08 * Math.sin(t * 2.5 + d.phase)));
      const rad = d.r * (0.55 + 0.6 * Math.min(1, m * 1.6)) * (0.3 + 0.7 * fade);
      const bs = rad * d.bulbK * 0.95;
      d.stem.scale.set(rad, L, rad);
      d.stemInk.scale.set(rad * 1.12, L + 0.006, rad * 1.12);
      d.stemInk.position.y = -0.012;
      d.bulb.position.y = -L;
      d.bulb.scale.setScalar(bs);
      d.bulbInk.position.y = -L;
      d.bulbInk.scale.setScalar(bs * 1.2);
      d.shine.position.set(-0.014 * bs, -L + 0.016 * bs, 0.03 * bs);
      d.shine.scale.set(0.012 * bs, 0.02 * bs, 0.008 * bs);
    }
    // droplets
    for (const p of droplets) {
      const src = p.src;
      const m = segState[src.seg].amount.value;
      const live = src.g.visible && m > 0.3;
      if (!live) {
        p.body.visible = p.splat.visible = false;
        p.state = 'wait';
        p.t = Math.max(p.t, 0.4);
        continue;
      }
      if (dt <= 0) continue;
      p.t -= dt;
      if (p.state === 'wait') {
        p.body.visible = false;
        p.splat.visible = false;
        if (p.t <= 0) {
          src.bulb.getWorldPosition(_dv);
          root.worldToLocal(_dv);
          if (_dv.y < 0.12) {
            p.t = 1.0;
            continue;
          }
          p.body.position.copy(_dv);
          p.vy = 0;
          p.state = 'fall';
          p.body.visible = true;
          p.body.scale.setScalar(0.4 * p.size);
          p.age = 0;
        }
      } else if (p.state === 'fall') {
        p.age += dt;
        p.vy -= 3.6 * dt;
        p.body.position.y += p.vy * dt;
        p.body.scale.setScalar(p.size * Math.min(1, 0.4 + p.age * 4));
        p.body.scale.y *= 1 + Math.min(0.5, -p.vy * 0.15);
        if (p.body.position.y <= 0.02) {
          p.state = 'splat';
          p.t = 0.55;
          p.body.visible = false;
          p.splat.visible = true;
          p.splat.position.set(p.body.position.x, 0.006, p.body.position.z);
        }
      } else {
        const k = 1 - p.t / 0.55;
        p.splat.scale.set(0.015 + 0.09 * p.size * Math.sqrt(k), 1, 0.015 + 0.07 * p.size * Math.sqrt(k));
        p.splatMat.opacity = 1 - dripSmooth(0.5, 1.0, k);
        if (p.t <= 0) {
          p.state = 'wait';
          p.t = 0.6 + Math.random() * 1.6;
          p.splat.visible = false;
        }
      }
    }
  }

  // Per-segment extents (in the segment frame) and per-mesh origins the melt shader needs to slump a whole segment
  // coherently across its separate meshes.
  function finalizeMelt(segs) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4();
    const rel = new THREE.Matrix4();
    const box = new THREE.Box3();
    const bb = new THREE.Box3();
    for (const seg of SEG_NAMES) {
      inv.copy(segs[seg].matrixWorld).invert();
      box.makeEmpty();
      for (const { seg: s, mesh, noBox } of skinMeshes) {
        if (s !== seg || noBox) continue;
        rel.multiplyMatrices(inv, mesh.matrixWorld);
        mesh.geometry.computeBoundingBox();
        bb.copy(mesh.geometry.boundingBox).applyMatrix4(rel);
        box.union(bb);
      }
      segState[seg].min.value.copy(box.min);
      segState[seg].max.value.copy(box.max);
      for (const { seg: s, mesh, U } of skinMeshes) {
        if (s !== seg) continue;
        rel.multiplyMatrices(inv, mesh.matrixWorld);
        U.uOrigin.value.setFromMatrixPosition(rel);
      }
    }
  }

  let meltActive = false;
  const crestDrop = () => {
    const st = segState.head;
    const m = st.amount.value;
    const skin = m * (st.max.value.y - st.min.value.y) * 0.56;
    const onSkull = 0.075; // rest height minus the skull top: the crest rides on the skull once the skin is gone
    const k = m < 0.35 ? 0 : m > 0.6 ? 1 : (m - 0.35) / 0.25;
    return skin + (onSkull - skin) * (k * k * (3 - 2 * k));
  };

  // -------------------------------------------------------------------------------- state / poses
  const poses = {};
  for (const [name, def] of Object.entries(POSES)) poses[name] = expandPose(def);

  const restPos = {}; // rest transforms of joints that pose positions offset
  for (const [n, j] of Object.entries(joints)) restPos[n] = { pos: j.position.clone() };

  const state = {
    pose: 'idle',
    expression: 'teary',
    t: 0,
    blinkTimer: 2 + Math.random() * 2,
    blinkLeft: 0,
    cur: {}, // smoothed pose rotations
    curPos: {},
    thumb: [0, 0],
    stretch: [1, 1],
    fist: [1, 1],
    poseControl: true,
    life: true,
    xray: false,
  };
  for (const n of Object.keys(joints)) {
    state.cur[n] = [0, 0, 0];
    state.curPos[n] = [0, 0, 0];
  }

  function applyExpressionTexture() {
    const blink = state.blinkLeft > 0 && BLINKABLE.has(state.expression);
    faceMat.map = faceTexture(state.expression, blink);
  }

  // The 3D beak follows the expression: the lower beak hangs open and the tongue sticks out. Both ease toward their
  // targets in update(), so shock gasps and the dead tongue loll rather than snap.
  const mouth = { open: 0, tongue: 0, tOpen: 0, tTongue: 0 };
  const syncTongue = () => {
    tongue.visible = mouth.tongue > 0.03 && segState.head.amount.value < 0.6;
  };
  function applyMouth() {
    beakJaw.rotation.x = mouth.open;
    tongue.scale.set(1, 1, Math.max(0.01, mouth.tongue));
    tongue.rotation.x = 0.05 + 0.45 * mouth.tongue;
    if (jawGroup) jawGroup.rotation.x = mouth.open;
    syncTongue();
  }

  function setExpression(name, instant = false) {
    state.expression = name;
    state.blinkLeft = 0;
    applyExpressionTexture();
    const m = MOUTH[name] || MOUTH.neutral;
    mouth.tOpen = m.open;
    mouth.tTongue = m.tongue;
    if (instant || state.t === 0 || !state.life) {
      mouth.open = m.open;
      mouth.tongue = m.tongue;
      applyMouth();
    }
  }

  const targetFor = (name, pose) => pose.rot[name] || [0, 0, 0];

  function writeJoints(offsets) {
    for (const [n, j] of Object.entries(joints)) {
      const c = state.cur[n];
      const o = offsets?.[n];
      j.rotation.set(c[0] + (o ? o[0] : 0), c[1] + (o ? o[1] : 0), c[2] + (o ? o[2] : 0));
      if (n !== 'root') {
        const p = state.curPos[n];
        j.position.set(restPos[n].pos.x + p[0], restPos[n].pos.y + p[1] - (n === 'crest' ? crestDrop() : 0), restPos[n].pos.z + p[2]);
      }
    }
    ['L', 'R'].forEach((S, i) => {
      const a = state.thumb[i];
      const th = joints['thumb' + S];
      th.visible = a > 0.02;
      th.scale.setScalar(Math.max(0.001, a));
      creaseGroups[S].visible = a > 0.5;
      // Rubber-arm gag: stretch the arm meshes and move the elbow/hand pivots with them (joints stay rigid).
      const s = state.stretch[i];
      applyStretch('arm' + S, s);
      applyStretch('forearm' + S, s);
      joints['elbow' + S].position.y = restPos['elbow' + S].pos.y * s;
      joints['hand' + S].position.y = restPos['hand' + S].pos.y * s;
      joints['hand' + S].scale.setScalar(state.fist[i]);
      if (elbowParentCut[S]) cutSet('arm' + S, 'b', [0, -1, 0], C.arm.upper * s);
    });
  }

  function setPose(name, instant = false) {
    if (!poses[name]) throw new Error(`Unknown pose: ${name}`);
    state.pose = name;
    if (instant) {
      const p = poses[name];
      for (const n of Object.keys(joints)) {
        state.cur[n] = targetFor(n, p).slice();
        state.curPos[n] = (p.pos[n] || [0, 0, 0]).slice();
      }
      state.thumb = p.thumb.slice();
      state.stretch = p.stretch.slice();
      state.fist = p.fist.slice();
      writeJoints(null);
    }
  }

  function lifeOffsets(t, w) {
    const off = {};
    const add = (n, x, y, z) => {
      const o = off[n] || (off[n] = [0, 0, 0]);
      o[0] += x * w;
      o[1] += y * w;
      o[2] += z * w;
    };
    const br = Math.sin(t * 2.1);
    add('torso', 0.012 * br, 0.03 * Math.sin(t * 0.7), 0.012 * Math.sin(t * 0.9 + 1));
    add('head', -0.02 * br, 0.06 * Math.sin(t * 0.55), 0.025 * Math.sin(t * 0.8));
    add('crest', 0.06 * Math.sin(t * 2.3 + 0.5), 0, 0.11 * Math.sin(t * 1.7) + 0.05 * Math.sin(t * 3.4 + 1));
    add('shoulderL', 0, 0, 0.02 * Math.sin(t * 2.1 + 0.6) + 0.015);
    add('shoulderR', 0, 0, -0.02 * Math.sin(t * 2.1 + 0.6) - 0.015);
    add('elbowL', 0.03 * Math.sin(t * 1.3), 0, 0);
    add('elbowR', 0.03 * Math.sin(t * 1.3 + 1), 0, 0);
    return off;
  }

  // organ squash-and-stretch: a damped spring on scale
  const allOrganGroups = () => {
    const list = [];
    for (const n of SEG_NAMES) for (const g of segState[n].organs) list.push(g);
    return list;
  };
  const organList = allOrganGroups();
  function updateOrgans(dt) {
    for (const g of organList) {
      const q = g.userData.sq;
      if (!q || q.amp <= 0.001) continue;
      q.t += dt;
      const f = q.amp * Math.exp(-5 * q.t) * Math.cos(20 * q.t + q.phase * 0.3);
      g.scale.set(1 + 0.32 * f, 1 - 0.5 * f, 1 + 0.32 * f);
      if (q.t > 1.6) {
        q.amp = 0;
        g.scale.set(1, 1, 1);
      }
    }
  }

  function update(dt) {
    dt = Math.min(dt, 0.1);
    state.t += dt;
    timeU.value = state.t;
    updateOrgans(dt);
    if (meltActive) layoutDrips(state.t, dt);
    if (Math.abs(mouth.tOpen - mouth.open) > 1e-3 || Math.abs(mouth.tTongue - mouth.tongue) > 1e-3) {
      const km = 1 - Math.exp(-14 * dt);
      mouth.open += (mouth.tOpen - mouth.open) * km;
      mouth.tongue += (mouth.tTongue - mouth.tongue) * km;
      applyMouth();
    }
    const t = state.t;
    const pose = poses[state.pose];

    // blink
    if (state.life) {
      if (state.blinkLeft > 0) {
        state.blinkLeft -= dt;
        if (state.blinkLeft <= 0) {
          state.blinkLeft = 0;
          applyExpressionTexture();
        }
      } else {
        state.blinkTimer -= dt;
        if (state.blinkTimer <= 0) {
          state.blinkTimer = 2.2 + Math.random() * 3.2;
          if (BLINKABLE.has(state.expression)) {
            state.blinkLeft = 0.12;
            applyExpressionTexture();
          }
        }
      }
    }

    if (!state.poseControl) return;
    const k = 1 - Math.exp(-12 * dt);
    for (const n of Object.keys(joints)) {
      const tg = targetFor(n, pose);
      const c = state.cur[n];
      c[0] += (tg[0] - c[0]) * k;
      c[1] += (tg[1] - c[1]) * k;
      c[2] += (tg[2] - c[2]) * k;
      const tp = pose.pos[n] || [0, 0, 0];
      const cp = state.curPos[n];
      cp[0] += (tp[0] - cp[0]) * k;
      cp[1] += (tp[1] - cp[1]) * k;
      cp[2] += (tp[2] - cp[2]) * k;
    }
    for (let i = 0; i < 2; i++) {
      state.thumb[i] += (pose.thumb[i] - state.thumb[i]) * k;
      state.stretch[i] += (pose.stretch[i] - state.stretch[i]) * k;
      state.fist[i] += (pose.fist[i] - state.fist[i]) * k;
    }

    let offsets = null;
    if (state.life) {
      offsets = lifeOffsets(t, pose.life);
      if (pose.anim) {
        pose.anim(t, (n, x, y, z) => {
          const o = offsets[n] || (offsets[n] = [0, 0, 0]);
          o[0] += x;
          o[1] += y;
          o[2] += z;
        });
      }
    }
    writeJoints(offsets);

    // breathing: scale the torso mesh only (children keep their size)
    const b = state.life ? Math.sin(t * 2.1) * pose.life : 0;
    parts.torso.scale.set(1 + 0.012 * b, 1 + 0.02 * b, 1 + 0.012 * b);
  }

  // -------------------------------------------------------------------------------- gore controls
  const segments = {
    head: joints.neck,
    torso: joints.torso,
    pelvis: joints.pelvis,
    armL: joints.armL,
    armR: joints.armR,
    foreL: joints.elbowL,
    foreR: joints.elbowR,
    legL: joints.hipL,
    legR: joints.hipR,
  };
  const segmentExclude = {
    head: [],
    torso: [joints.neck, joints.shoulderL, joints.shoulderR],
    pelvis: [joints.torso, joints.hipL, joints.hipR],
    armL: [joints.elbowL],
    armR: [joints.elbowR],
    foreL: [],
    foreR: [],
    legL: [],
    legR: [],
  };
  const anatomy = {};
  for (const n of SEG_NAMES) anatomy[n] = { bones: bonesOf[n], flesh: base.flesh };
  anatomy.head.jaw = jawGroup; // Group hinged at the back of the muzzle: rotation.x > 0 opens the mouth

  const refreshInner = (seg) => {
    const st = segState[seg];
    const melted = st.amount.value > 0.6;
    for (const b of st.bones) b.visible = st.boneForce || melted;
    for (const o of st.organs) o.visible = st.organForce || melted;
    for (const f of st.flesh) f.visible = st.amount.value > 0.5;
    for (const m of st.hideOnMelt) m.visible = st.amount.value < 0.6;
    if (seg === 'head') syncTongue();
    for (const { gm, seg: gs } of glossList) if (gs === seg) gm.visible = st.amount.value < 0.02;
  };
  // a seal shows only while exactly one of the two segments at that seam has lost its skin (and not in x-ray)
  const syncSeals = () => {
    for (const sl of sleeves) sl.mesh.visible = !severedSeam[sl.seam] && segState[sl.a].amount.value < 0.5 && segState[sl.b].amount.value < 0.5;
    for (const [m, a, b] of sealList) m.visible = !state.xray && segState[a].amount.value > 0.6 !== segState[b].amount.value > 0.6;
  };
  const segList = (seg) => (seg === 'all' ? SEG_NAMES : [seg]);
  function showBones(seg, on = true) {
    for (const s of segList(seg)) {
      segState[s].boneForce = !!on;
      refreshInner(s);
    }
  }
  function showOrgans(on = true) {
    for (const s of ['torso', 'head']) {
      segState[s].organForce = !!on;
      refreshInner(s);
    }
  }
  function setMelt(seg, amount, dir) {
    for (const s of segList(seg)) {
      segState[s].amount.value = Math.max(0, Math.min(1, amount));
      if (dir) {
        const d = Array.isArray(dir) ? dir : [dir.x, dir.y, dir.z];
        segState[s].dir.value.set(d[0], d[1], d[2]).normalize();
      }
      refreshInner(s);
    }
    syncSeals();
    meltActive = SEG_NAMES.some((n) => segState[n].amount.value > 0.001);
    joints.crest.position.y = restPos.crest.pos.y + state.curPos.crest[1] - crestDrop();
    layoutDrips(state.t, 0);
  }
  // X-ray: skins turn semi-transparent (and lose their ink hulls) so bones and organs read.
  function setXray(on) {
    state.xray = !!on;
    syncSeals();
    for (const m of skinMats) {
      m.transparent = !!on;
      m.opacity = on ? 0.3 : 1;
      m.depthWrite = !on;
      m.needsUpdate = true;
    }
    for (const h of hullMeshes) h.visible = !on;
    faceMat.opacity = on ? 0.35 : 1;
    // bones and organs join the transparent pass, sorted after the skin, so they stay crisp
    const trans = [...boneMats, ...Object.values(organMats), ...Object.values(organInk)];
    for (const m of trans) {
      m.transparent = !!on;
      m.needsUpdate = true;
    }
    const orderInk = on ? 4 : -1;
    const orderMesh = on ? 5 : 0;
    for (const n of SEG_NAMES) {
      for (const b of segState[n].bones) {
        b.renderOrder = orderMesh;
        b.traverse((c) => {
          if (c === b || !c.isMesh) return;
          c.renderOrder = c.userData.isHull ? orderInk : on ? 5.5 : 0;
        });
      }
      for (const o of segState[n].organs) {
        o.traverse((c) => {
          if (!c.isMesh) return;
          if (c.material === glossMat) c.renderOrder = on ? 6 : 0;
          else if (Object.values(organInk).includes(c.material)) c.renderOrder = orderInk;
          else c.renderOrder = orderMesh;
        });
      }
    }
  }
  function clearStumps() {
    cutClear();
    severedSeam.waist = severedSeam.neck = false;
    syncSeals();
  }

  setPose('idle', true);
  setExpression('teary');
  finalizeMelt(segments);

  const api = {
    root,
    joints,
    parts,
    setExpression,
    setFace: setExpression,
    setPose,
    update,
    constants: C,
    colors: { blood: C.colors.blood, bone: C.colors.bone, flesh: C.colors.flesh, fleshDark: C.colors.fleshDark },
    anatomy,
    organs,
    segments,
    segmentExclude,
    showBones,
    showOrgans,
    makeStump,
    clearStumps,
    setMelt,
    setXray,
    // Set to false when a physics/ragdoll system drives the joints directly.
    setPoseControl(on) {
      state.poseControl = !!on;
    },
    // Toggle idle life (breathing, blink, sway). Disabled for deterministic screenshots.
    setLife(on) {
      state.life = !!on;
      if (!on) {
        state.blinkLeft = 0;
        applyExpressionTexture();
        parts.torso.scale.set(1, 1, 1);
      }
    },
    get pose() {
      return state.pose;
    },
    get expression() {
      return state.expression;
    },
    expressions: ['neutral', 'teary', 'happy', 'hurt', 'dizzy', 'shock', 'dead'],
    poses: Object.keys(POSES),
    segmentNames: SEG_NAMES,
  };
  return api;
}
