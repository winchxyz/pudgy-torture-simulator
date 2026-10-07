// Builds every README image from the real game: the hero loop (gif + mp4), the gallery shots and their
// thumbnails, the social banner and the tools sheet. All game shots are page screenshots with the HUD
// visible, taken from scripted scenes (TS.pause(true) + TS.advance), so the run is repeatable.
//
//   node tools/media.mjs                    # everything
//   node tools/media.mjs --only=gallery     # gallery | hero | banner | tools  (comma separated)
//   node tools/media.mjs --only=gallery --scenes=fish,acid   # only some scenes (others keep the old candidates)
//
// Needs ffmpeg on PATH. Output goes to media/. Scratch frames (and every candidate shot) live in the
// OS temp dir under pengu-media/.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { open, ROOT } from './harness.mjs';

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(n);

const MEDIA = path.join(ROOT, 'media');
const TMP = path.join(os.tmpdir(), 'pengu-media');
const CAND = path.join(TMP, 'cand');
fs.mkdirSync(MEDIA, { recursive: true });
fs.mkdirSync(CAND, { recursive: true });

const PORT = 8940;
const ffmpeg = (a) => {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + a.join(' '));
};

const h = await open({ port: PORT, size: [1280, 720], prefix: 'media_' });
const { page, ev, errors } = h;
// no DOM tool cursor (reticle, emoji, flipper) may float over the penguin in any capture
await page.addStyleTag({ content: '.tool-cursor{display:none!important}' });

// ------------------------------------------------------------------------------------------------ helpers
// draw on demand, wait two frames, then grab the whole page (HUD included)
async function snap(file, opts = {}) {
  await ev(() => {
    TS.render();
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.screenshot({ path: file, timeout: 120000, ...opts });
  return file;
}
const adv = (s) => ev((t) => TS.advance(t), s);
// fresh Pengu, every tool unlocked, the first-click hint gone
async function fresh(tool, settle = 1.6) {
  await ev(([t, s]) => {
    TS.reset();
    TS.unlockAll();
    TS.tool(t);
    document.getElementById('hint')?.classList.add('gone');
    TS.advance(s);
  }, [tool, settle]);
}
const ndcAt = (x, y, z) => ev(([a, b, c]) => TS.ndcAt(a, b, c), [x, y, z]);
async function click(x, y, z, hold = 0.03) {
  const n = await ndcAt(x, y, z);
  await ev(([nx, ny, hd]) => TS.click(nx, ny, hd), [n.x, n.y, hold]);
}
const pt = (seg, off) => ev(([s, o]) => TS.ndc(s, o), [seg, off]);
const jointNdc = (j) => ev((n) => {
  const w = TS.game.pengu.joints[n];
  w.updateWorldMatrix(true, false);
  return TS.game.ndcOf(w.getWorldPosition(new TS.game.THREE.Vector3()));
}, j);
const sevs = () => ev(() => ['neck', 'waist', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR'].filter((j) => TS.game.ragdoll.isSevered(j)));
const release = (n) => ev((p) => TS.game.pointer.up(p.x, p.y), n);

// candidate frames: scene_moment.png in the scratch dir; the PICK table below chooses the final ones
const cand = async (scene, moment) => snap(path.join(CAND, `${scene}_${moment}.png`));

// ------------------------------------------------------------------------------------------------ gallery
// Which candidate becomes media/shot-<name>.png (scene_moment). Re-take by editing after looking at the frames.
const PICK = {
  throw: 'hands_fly_a',
  fish: 'fish_impact',
  piano: 'piano_debris',
  bomb: 'bomb_explosion1',
  shuriken: 'shuriken_cut4',
  knives: 'knives_thrown',
  chainsaw: 'saw_torso_cut',
  acid: 'acid_6s',
  organs: 'organs_pop',
};

const gallery = {
  async hands() {
    await fresh('grab');
    const hp = await pt('head');
    await ev(([p]) => {
      TS.game.pointer.move(p.x, p.y);
      TS.game.pointer.down(p.x, p.y);
      TS.advance(0.05);
      for (let i = 1; i <= 12; i++) { TS.game.pointer.move(p.x - 0.005 * i, p.y + 0.02 * i); TS.advance(0.03); }
    }, [hp]);
    await cand('hands', 'lift');
    // swing him up and to the right, let go: he sails across the room
    await ev(([p]) => {
      for (let i = 1; i <= 8; i++) { TS.game.pointer.move(p.x + 0.05 * i, p.y + 0.24 - 0.01 * i); TS.advance(0.016); }
      TS.game.pointer.up(p.x + 0.4, p.y + 0.16);
      TS.advance(0.12);
    }, [hp]);
    for (const k of ['a', 'b', 'c', 'd', 'e']) {
      await cand('hands', 'fly_' + k);
      await adv(0.08);
    }
    // second take: straight up, so he is face-on at the top of the arc
    await fresh('grab');
    const h2 = await pt('head');
    await ev(([p]) => {
      TS.game.pointer.move(p.x, p.y);
      TS.game.pointer.down(p.x, p.y);
      TS.advance(0.05);
      for (let i = 1; i <= 10; i++) { TS.game.pointer.move(p.x, p.y + 0.03 * i); TS.advance(0.03); }
      for (let i = 1; i <= 4; i++) { TS.game.pointer.move(p.x + 0.01 * i, p.y + 0.3 + 0.04 * i); TS.advance(0.016); }
      TS.game.pointer.up(p.x + 0.04, p.y + 0.46);
      TS.advance(0.1);
    }, [h2]);
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) {
      await cand('hands', 'up_' + k);
      await adv(0.1);
    }
  },

  async mallet() {
    await fresh('mallet');
    await click(0.0, 1.25, 0.35);
    await adv(0.33);
    await cand('mallet', 'windup');
    await adv(0.12);
    await cand('mallet', 'smash');
    await adv(0.14);
    await cand('mallet', 'impact');
    await adv(0.3);
    await cand('mallet', 'squash');
  },

  async fish() {
    await fresh('fish');
    await click(0.0, 1.25, 0.35);
    await adv(0.3);
    await cand('fish', 'windup');
    await adv(0.2);
    await cand('fish', 'impact');
    await adv(0.12);
    await cand('fish', 'impact2');
    await adv(0.25);
    await cand('fish', 'follow');
  },

  async piano() {
    await fresh('piano');
    await click(0.0, 0.55, 0.3);
    await adv(0.6);
    await cand('piano', 'shadow');
    await adv(0.14);
    await cand('piano', 'falling');
    let n = 1;
    for (let i = 0; i < 12 && n; i++) {
      await adv(0.05);
      n = await ev(() => [...TS.game.props].filter((p) => p.userData.tool === 'piano').length);
    }
    await cand('piano', 'smash');
    await adv(0.25);
    await cand('piano', 'debris');
  },

  async bomb() {
    await fresh('bomb');
    await click(0.45, 0, 0.9);
    await adv(2.75);
    let n = 1;
    for (let i = 0; i < 40 && n; i++) {
      await adv(0.02);
      n = await ev(() => [...TS.game.props].filter((p) => p.userData.tool === 'bomb').length);
    }
    await adv(0.06);
    await cand('bomb', 'explosion0');
    await adv(0.14);
    await cand('bomb', 'explosion1');
    await adv(0.2);
    await cand('bomb', 'explosion2');
  },

  // one star into the belly, one through the shoulder (the flipper comes off), then a charged triple throw
  async shuriken() {
    // take 1: straight at the shoulder, a frame every 70 ms: the flipper flies off
    await fresh('shuriken');
    await ev(() => { TS.hover(0.6, 0.15); TS.advance(0.3); });
    const sj = await jointNdc('shoulderL');
    await ev(([p]) => { TS.hover(p.x, p.y); TS.advance(0.08); TS.game.pointer.down(p.x, p.y); TS.advance(0.04); TS.game.pointer.up(p.x, p.y); }, [sj]);
    for (let i = 0; i < 9; i++) {
      await adv(0.07);
      await cand('shuriken', 'cut' + i);
    }
    await adv(1.0);
    await cand('shuriken', 'cut_after');
    // take 2: a star into the belly first, then the shoulder, then a charged triple throw at the wall
    await fresh('shuriken');
    const p1 = await pt('torso', [0.0, 0.12, 0.4]);
    await ev(([p]) => { TS.hover(p.x, p.y); TS.game.pointer.down(p.x, p.y); TS.advance(0.04); TS.game.pointer.up(p.x, p.y); TS.advance(0.12); }, [p1]);
    await cand('shuriken', 'flight');
    await adv(0.9);
    const sj2 = await jointNdc('shoulderL');
    await ev(([p]) => { TS.click(p.x, p.y, 0.04); TS.advance(0.12); }, [sj2]);
    await adv(2.6);
    await ev(() => { TS.hover(-0.72, 0.28); TS.game.pointer.down(-0.72, 0.28); TS.advance(0.62); });
    await cand('shuriken', 'charge');
    await ev(() => { TS.game.pointer.up(-0.72, 0.28); TS.advance(0.08); });
    await cand('shuriken', 'triple_flight');
    await adv(0.4);
    await cand('shuriken', 'triple_mid');
    await adv(1.0);
    await cand('shuriken', 'triple_stuck');
    await ev(() => { TS.hover(0.75, 0.0); TS.advance(0.5); });
    await cand('shuriken', 'triple_stuck2');
  },

  async knives() {
    await fresh('throwknife');
    await ev(() => { TS.game.sharp.state.debug.flatChance = 0; });
    const spots = [['torso', [0.05, 0.15, 0.4]], ['head', [-0.3, 0.1, 0.5]], ['armL', [0, 0, 0.1]], ['head', [0.28, -0.05, 0.5]], ['legR', [0, 0, 0.1]], ['torso', [-0.12, -0.08, 0.4]], ['armR', [0, -0.05, 0.1]]];
    for (const [s, o] of spots) {
      const p = await pt(s, o);
      await ev(([q]) => { TS.click(q.x, q.y, 0.05); TS.advance(0.45); }, [p]);
    }
    await ev(() => { TS.click(-0.8, 0.5, 0.05); TS.advance(0.4); TS.click(0.85, 0.35, 0.05); TS.advance(0.4); });
    await adv(0.8);
    await cand('knives', 'thrown');
  },

  async chainsaw() {
    await fresh('chainsaw');
    const t = await pt('torso', [0.0, 0.05, 0.4]);
    await ev(([p]) => { TS.hover(p.x, p.y); TS.advance(0.1); TS.game.pointer.down(p.x, p.y); TS.advance(1.15); }, [t]);
    for (let i = 0; i < 6; i++) await ev(() => { const p = TS.ndc('torso', [0, 0.05, 0.4]); TS.game.pointer.move(p.x, p.y); TS.advance(0.2); });
    await cand('saw', 'torso_cut');
    await ev(() => { const p = TS.ndc('torso', [0, 0.05, 0.4]); TS.game.pointer.up(p.x, p.y); TS.advance(0.6); });
    await fresh('chainsaw');
    await ev(() => { const p = TS.ndc('armR', [0, -0.16, 0.1]); TS.game.pointer.move(p.x, p.y); TS.game.pointer.down(p.x, p.y); TS.advance(0.3); });
    for (let i = 0; i < 30; i++) {
      if (i > 6 && (await sevs()).length) break;
      await ev(() => { const p = TS.ndc('armR', [0, -0.16, 0.1]); TS.game.pointer.move(p.x, p.y); TS.advance(0.2); });
      if (i === 3) await cand('saw', 'arm_mid');
    }
    await cand('saw', 'arm_end');
    await ev(() => { const p = TS.ndc('armR', [0, -0.16, 0.1]); TS.game.pointer.up(p.x, p.y); TS.advance(0.5); });
    await cand('saw', 'arm_after');
  },

  async acid() {
    await fresh('acid');
    const p = await pt('head', [0, 0.05, 0.45]);
    await ev(([q]) => { TS.game.pointer.move(q.x, q.y); TS.advance(0.3); TS.game.pointer.down(q.x, q.y); TS.advance(0.7); }, [p]);
    await cand('acid', '1s');
    for (const [sec, name] of [[1.3, '2s'], [2, '4s'], [2, '6s']]) {
      await adv(sec);
      await cand('acid', name);
    }
  },

  async organs() {
    await ev(() => {
      TS.reset();
      TS.unlockAll();
      TS.tool('grab');
      document.getElementById('hint')?.classList.add('gone');
      TS.advance(1.5);
      TS.game.gore.openBelly();
      TS.advance(0.9);
    });
    await cand('organs', 'burst');
    await adv(1.7);
    await ev(() => TS.tool('squeeze'));
    const p = await ev(() => {
      const heart = TS.game.gore.organProps.find((o) => o.userData.organ === 'heart');
      const t = heart.body.translation();
      return TS.ndcAt(t.x, t.y, t.z);
    });
    await ev(([q]) => { TS.game.pointer.move(q.x, q.y); TS.advance(0.3); }, [p]);
    await cand('organs', 'hover');
    await ev(([q]) => { TS.game.pointer.down(q.x, q.y); TS.advance(0.7); }, [p]);
    await cand('organs', 'squeeze');
    await adv(0.5);
    await cand('organs', 'squeeze2');
    await adv(0.5);
    await cand('organs', 'pop');
    await ev(([q]) => TS.game.pointer.up(q.x, q.y), [p]);
  },
};

async function runGallery() {
  await ev(() => TS.addCoins(1250));
  const list = ['hands', 'mallet', 'fish', 'piano', 'bomb', 'shuriken', 'knives', 'chainsaw', 'acid', 'organs'];
  const filter = (args.find((a) => a.startsWith('--scenes=')) || '').slice(9).split(',').filter(Boolean);
  for (const s of list) {
    if (filter.length && !filter.includes(s)) continue;
    console.log('gallery scene', s);
    try {
      await gallery[s]();
    } catch (e) {
      errors.push(`gallery ${s}: ${e.stack || e}`);
    }
  }
  for (const [name, key] of Object.entries(PICK)) {
    const src = path.join(CAND, key + '.png');
    if (!fs.existsSync(src)) {
      console.log('  missing candidate', key);
      continue;
    }
    fs.copyFileSync(src, path.join(MEDIA, `shot-${name}.png`));
    ffmpeg(['-i', src, '-vf', 'scale=640:360:flags=lanczos', '-q:v', '4', path.join(MEDIA, `thumb-${name}.jpg`)]);
  }
}

// ------------------------------------------------------------------------------------------------ hero loop
const HERO = path.join(TMP, 'hero');
const FPS = 24;
const STEP = 1 / FPS;
let segFrames = [];

// capture n frames, 1/24 s of game time apart (or `step`), running fn(i) before each one
async function frames(seg, n, { step = STEP, fn = null } = {}) {
  for (let i = 0; i < n; i++) {
    if (fn) await fn(i);
    await adv(step);
    const f = path.join(HERO, seg, `f${String(segFrames.filter((x) => x.seg === seg).length).padStart(3, '0')}.png`);
    await snap(f);
    segFrames.push({ seg, file: f });
  }
}

const heroSegments = {
  // he waddle-wobbles around: little left-right nudges keep him rocking from foot to foot
  async idle() {
    await fresh('grab', 1.3);
    await frames('idle', Number(process.env.N_IDLE || 14), {
      fn: async (i) => {
        if (i % 5 === 0) {
          const sgn = (i / 5) % 2 ? -1 : 1;
          await ev((sg) => {
            TS.game.ragdoll.applyImpulse('torso', { x: sg * 1.9, y: 0, z: 0 });
            TS.game.ragdoll.applyImpulse('head', { x: sg * 2.6, y: 0, z: 0 });
            TS.game.ragdoll.applyImpulse('pelvis', { x: -sg * 0.6, y: 0.3, z: 0 });
          }, sgn);
        }
      },
    });
  },

  // frozen fish slap
  async fish() {
    await fresh('fish', 1.2);
    await click(0.0, 1.25, 0.35);
    await adv(0.26);
    await frames('fish', Number(process.env.N_FISH || 16));
  },

  async mallet() {
    await fresh('mallet', 1.2);
    await click(0.0, 1.25, 0.35);
    await adv(0.2); // skip the first part of the wind-up
    await frames('mallet', Number(process.env.N_MALLET || 20));
  },

  // Abstract Shuriken through the shoulder: the flipper comes off
  async shuriken() {
    await fresh('shuriken', 1.3);
    await ev(() => { TS.hover(0.6, 0.15); TS.advance(0.3); });
    const sj = await jointNdc('shoulderL');
    await ev(([p]) => { TS.hover(p.x, p.y); TS.advance(0.08); TS.game.pointer.down(p.x, p.y); TS.advance(0.04); TS.game.pointer.up(p.x, p.y); }, [sj]);
    await frames('shuriken', Number(process.env.N_STAR || 22));
  },

  // a volley of throwing knives, most of them stay stuck
  async knives() {
    await fresh('throwknife', 1.2);
    await ev(() => { TS.game.sharp.state.debug.flatChance = 0; });
    const spots = [['torso', [0.05, 0.15, 0.4]], ['head', [-0.3, 0.1, 0.5]], ['legR', [0, 0, 0.1]], ['head', [0.28, -0.05, 0.5]], ['torso', [-0.12, -0.08, 0.4]]];
    await frames('knives', Number(process.env.N_KNIVES || 16), {
      fn: async (i) => {
        if (i % 2 === 0 && i / 2 < spots.length) {
          const [s, o] = spots[i / 2];
          const p = await pt(s, o);
          await ev(([q]) => { TS.hover(q.x, q.y); TS.game.pointer.down(q.x, q.y); TS.game.pointer.up(q.x, q.y); }, [p]);
        }
      },
    });
  },

  // time-lapse: the melt takes about five seconds, here it runs at 5x
  async acid() {
    await fresh('acid', 1.2);
    const p = await pt('head', [0, 0.05, 0.45]);
    await ev(([q]) => { TS.game.pointer.move(q.x, q.y); TS.advance(0.2); TS.game.pointer.down(q.x, q.y); }, [p]);
    await frames('acid', Number(process.env.N_ACID || 16), { step: 0.24 });
    await ev(([q]) => TS.game.pointer.up(q.x, q.y), [p]);
  },

  // the hand saw goes back and forth across his belly until it opens and the organs spill out
  async belly() {
    await fresh('saw', 1.4);
    const t = await pt('torso', [0, 0.02, 0.28]);
    await ev(([q]) => { TS.game.pointer.move(q.x, q.y); TS.advance(0.15); TS.game.pointer.down(q.x, q.y); }, [t]);
    let openedAt = -1;
    await frames('belly', Number(process.env.N_BELLY || 26), {
      fn: async (i) => {
        if (openedAt < 0) {
          await ev(([q, k]) => TS.game.pointer.move(q.x + (k % 2 ? 1 : -1) * 0.06, q.y), [t, i]);
          if (await ev(() => TS.game.gore.bellyOpened)) openedAt = i;
        } else if (i === openedAt + 6) {
          await ev(([q]) => { TS.game.pointer.up(q.x, q.y); TS.game.pointer.move(0.85, -0.15); }, [t]);
        }
      },
    });
    console.log('  belly opened at frame', openedAt);
  },

  // slap him, fast-forward through the dizzy part, then hold on the teary thumbs-up
  async thumbs() {
    await fresh('slap', 1.4);
    const p = await pt('head', [0, 0.05, 0.5]);
    await ev(([q]) => { TS.click(q.x, q.y, 0.02); TS.game.pointer.move(0.85, -0.15); }, [p]);
    await frames('thumbs', 16, { step: 0.23 });
    await frames('thumbs', Number(process.env.N_THUMBS || 18));
  },
};

async function runHero() {
  if (args.includes('--encode-only')) return encodeHero();
  const filter = (args.find((a) => a.startsWith('--segs=')) || '').slice(7).split(',').filter(Boolean);
  // a partial run (--segs=a,b) only replaces those segments; the others are kept for encoding
  for (const seg of Object.keys(heroSegments)) {
    if (filter.length && !filter.includes(seg)) continue;
    fs.rmSync(path.join(HERO, seg), { recursive: true, force: true });
    fs.mkdirSync(path.join(HERO, seg), { recursive: true });
  }
  await ev(() => TS.addCoins(1250));
  segFrames = [];
  for (const [name, fn] of Object.entries(heroSegments)) {
    if (filter.length && !filter.includes(name)) continue;
    console.log('hero segment', name);
    try {
      await fn();
    } catch (e) {
      errors.push(`hero ${name}: ${e.stack || e}`);
    }
  }
  // strips for eyeballing: every 3rd frame of each segment
  for (const seg of Object.keys(heroSegments)) {
    const dir = path.join(HERO, seg);
    if (!fs.existsSync(dir) || !fs.readdirSync(dir).length) continue;
    ffmpeg(['-framerate', '1', '-i', path.join(dir, 'f%03d.png'), '-vf', 'select=not(mod(n\\,3)),scale=320:-1,tile=6x3', '-frames:v', '1', path.join(TMP, `strip_${seg}.png`)]);
  }
  if (!filter.length || args.includes('--encode')) encodeHero();
}

function encodeHero() {
  const order = Object.keys(heroSegments);
  const list = [];
  for (const seg of order) for (const f of fs.readdirSync(path.join(HERO, seg)).sort()) list.push(path.join(HERO, seg, f));
  const N = list.length;
  const K = 4; // cross-fade the tail into the head so the loop closes
  const seq = path.join(HERO, 'seq');
  fs.rmSync(seq, { recursive: true, force: true });
  fs.mkdirSync(seq, { recursive: true });
  const name = (i) => path.join(seq, `s${String(i).padStart(4, '0')}.png`);
  // frames K .. N-K-1 as they are
  let o = 0;
  for (let i = K; i < N - K; i++) fs.copyFileSync(list[i], name(o++));
  // then the K tail frames, each mixed with the matching head frame (weight rises 0 -> 1)
  for (let j = 0; j < K; j++) {
    const w = (j + 1) / (K + 1);
    ffmpeg(['-i', list[N - K + j], '-i', list[j], '-filter_complex', `[0:v][1:v]blend=all_expr='A*(1-${w.toFixed(4)})+B*${w.toFixed(4)}'`, '-frames:v', '1', name(o++)]);
  }
  console.log('hero frames', o, `(${(o / FPS).toFixed(2)} s)`);
  const gifFps = Number((args.find((a) => a.startsWith('--gifps=')) || '--gifps=20').slice(8));
  const colors = (args.find((a) => a.startsWith('--colors=')) || '--colors=64').slice(9);
  const scale = 'scale=720:-1:flags=lanczos';
  const pal = path.join(HERO, 'palette.png');
  ffmpeg(['-framerate', String(FPS), '-i', path.join(seq, 's%04d.png'), '-vf', `fps=${gifFps},${scale},palettegen=stats_mode=diff:max_colors=${colors}`, pal]);
  ffmpeg(['-framerate', String(FPS), '-i', path.join(seq, 's%04d.png'), '-i', pal, '-lavfi', `fps=${gifFps},${scale}[x];[x][1:v]paletteuse=dither=${process.env.DITHER || 'bayer:bayer_scale=5'}:diff_mode=rectangle`, '-loop', '0', path.join(MEDIA, 'hero.gif')]);
  ffmpeg(['-framerate', String(FPS), '-i', path.join(seq, 's%04d.png'), '-vf', 'scale=1280:720:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '23', '-preset', 'slow', '-movflags', '+faststart', '-an', path.join(MEDIA, 'hero.mp4')]);
}

if (want('hero')) await runHero();

// ------------------------------------------------------------------------------------------------ banner
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

// Pengu alone, HUD hidden, from a 1920x1080 render: the teary thumbs-up (a slap, then a calm moment)
async function capturePengu() {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await ev(() => new Promise((r) => setTimeout(r, 400)));
  await fresh('slap', 1.4);
  const p = await pt('head', [0, 0.05, 0.5]);
  await ev(([q]) => { TS.click(q.x, q.y, 0.02); TS.advance(4.2); }, [p]);
  await ev(() => {
    // remember every inline display value so the HUD can be put back exactly as it was
    window.__hidden = [];
    for (const sel of ['#hud', '#floaters', '.tool-cursor', '#tip', '.toast']) document.querySelectorAll(sel).forEach((e) => { window.__hidden.push([e, e.style.display]); e.style.display = 'none'; });
    TS.game.pointer.move(0.95, -0.9);
    TS.advance(0.3);
  });
  const box = await ev(() => {
    const W = innerWidth, H = innerHeight;
    const px = (n) => ({ x: ((n.x + 1) / 2) * W, y: ((1 - n.y) / 2) * H });
    return { head: px(TS.ndc('head')), pelvis: px(TS.ndc('pelvis')), armL: px(TS.ndc('armL')), footL: px(TS.ndc('legL', [0, -0.2, 0])) };
  });
  console.log('  pengu box', JSON.stringify(box));
  const file = path.join(TMP, 'pengu_crop.png');
  const cw = Number(process.env.CROP_W || 640), ch = Number(process.env.CROP_H || 826);
  const cx = (box.head.x + box.pelvis.x) / 2 + Number(process.env.CROP_DX || 80);
  const top = box.head.y - Number(process.env.CROP_UP || 330);
  const y0 = Math.max(0, Math.round(top));
  const clip = { x: Math.max(0, Math.round(cx - cw / 2)), y: y0, width: cw, height: Math.min(ch, 1080 - y0) };
  await ev(() => { TS.render(); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
  await page.screenshot({ path: file, clip, timeout: 120000 });
  await ev(() => { for (const [e, d] of window.__hidden || []) e.style.display = d; window.__hidden = []; });
  await page.setViewportSize({ width: 1280, height: 720 });
  return file;
}

const FONT_LINK = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;900&display=swap" rel="stylesheet">';
// Pudgy palette: icy blue, white, warm orange accents, pink blush
const BASE_CSS = `
  :root { --ink:#1b2f63; --ink-soft:#4d6aa8; --ice:#7BA7F2; --ice-dark:#4f7fd6; --ice-light:#EAF3FF; --orange:#F6A33C; --orange-dark:#c97a14; --blush:#F7A8C0; --blush-dark:#e0698f; --glass:rgba(255,255,255,.88); --line:rgba(79,127,214,.32); }
  * { box-sizing:border-box; margin:0; }
  body { font-family:'Nunito','Trebuchet MS','Segoe UI',system-ui,sans-serif; color:var(--ink); -webkit-font-smoothing:antialiased; }
  .chunk { font-family:'Lilita One','Arial Rounded MT Bold','Trebuchet MS',system-ui,sans-serif; font-weight:400; }
`;

// a six-armed snowflake, drawn as inline SVG so it never turns into a colour emoji
const FLAKE = (x, y, size, rot, op) => `<svg style="position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;transform:rotate(${rot}deg);opacity:${op}" viewBox="-50 -50 100 100" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round">${[0, 60, 120].map((a) => `<g transform="rotate(${a})"><path d="M0 -44V44"/><path d="M0 -26l-12 -12M0 -26l12 -12M0 26l-12 12M0 26l12 12"/></g>`).join('')}</svg>`;

// open an HTML string in a fresh tab, wait for the web fonts, hand the page to fn
async function withHtml(html, size, fn) {
  const pg = await page.context().browser().newPage();
  await pg.setViewportSize(size);
  await pg.setContent(html, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await pg.evaluate(() => document.fonts.ready);
  const fonts = await pg.evaluate(() => ({ lilita: document.fonts.check("40px 'Lilita One'"), nunito: document.fonts.check("20px 'Nunito'") }));
  console.log('  fonts loaded', JSON.stringify(fonts));
  if (!fonts.lilita) errors.push('banner/tools: Lilita One did not load (offline?)');
  await fn(pg);
  await pg.close();
}

const getTools = () => ev(() => TS.game.tools.map((t) => ({ id: t.id, name: t.name, group: t.group, icon: t.icon, price: t.price })));

async function runBanner() {
  const tools = await getTools();
  const crop = await capturePengu();
  const flakes = Array.from({ length: 26 }, (_, i) => FLAKE((i * 211 + 30) % 1240, (i * 127 + 20) % 600, 18 + ((i * 11) % 34), (i * 37) % 60, (0.35 + ((i * 17) % 55) / 100).toFixed(2))).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8">${FONT_LINK}<style>${BASE_CSS}
    html,body{width:1280px;height:640px;overflow:hidden}
    body{background:radial-gradient(900px 600px at 76% 42%,#ffffff 0%,rgba(255,255,255,0) 62%),linear-gradient(160deg,#EAF3FF 0%,#b9d3fa 48%,#7BA7F2 100%);position:relative}
    .bricks{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,0) 0 62px,rgba(255,255,255,.38) 62px 66px),repeating-linear-gradient(90deg,rgba(255,255,255,0) 0 128px,rgba(255,255,255,.3) 128px 132px);opacity:.55;-webkit-mask-image:linear-gradient(180deg,#000 0%,rgba(0,0,0,.2) 70%,transparent 100%)}
    .snow{position:absolute;left:-80px;right:-80px;bottom:-120px;height:230px;border-radius:50%;background:radial-gradient(ellipse at 50% 0%,#fff 0%,#EAF3FF 70%);box-shadow:0 -10px 40px rgba(255,255,255,.7)}
    .copy{position:absolute;left:58px;top:120px;width:760px}
    .kicker{display:inline-flex;gap:10px;align-items:center;background:var(--glass);border:2px solid var(--line);border-radius:999px;padding:8px 20px;font-weight:900;font-size:22px;letter-spacing:.14em;text-transform:uppercase;color:var(--blush-dark);box-shadow:0 6px 18px rgba(40,80,170,.2)}
    h1{margin-top:20px;line-height:.9}
    .t1{display:block;white-space:nowrap;font-size:97px;letter-spacing:1px;color:#fff;-webkit-text-stroke:11px var(--ink);paint-order:stroke fill;text-shadow:0 7px 0 var(--ink),0 10px 24px rgba(27,47,99,.35)}
    .t2{display:block;white-space:nowrap;font-size:70px;margin-top:10px;color:var(--orange);-webkit-text-stroke:9px var(--ink);paint-order:stroke fill;letter-spacing:1px;text-shadow:0 6px 0 var(--ink)}
    .tag{margin-top:34px;font-weight:900;font-size:31px;line-height:1.25;color:var(--ink)}
    .tag b{color:#fff;background:var(--orange);border:3px solid var(--orange-dark);border-radius:14px;padding:1px 12px;box-shadow:0 4px 0 var(--orange-dark);white-space:nowrap}
    .card{position:absolute;right:58px;top:36px;width:440px;height:568px;border-radius:44px;border:10px solid #fff;overflow:hidden;transform:rotate(3.2deg);box-shadow:0 26px 50px rgba(27,47,99,.42),0 0 0 4px var(--ink)}
    .card img{width:100%;height:100%;object-fit:cover;object-position:50% 60%;display:block}
    .chip{position:absolute;display:flex;align-items:center;gap:8px;background:var(--glass);border:2px solid var(--line);border-radius:999px;padding:8px 18px 8px 10px;font-weight:900;font-size:26px;box-shadow:0 8px 20px rgba(40,80,170,.28)}
    .coin{width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe3ad,var(--orange) 55%,#e08a14);border:3px solid var(--orange-dark);display:grid;place-items:center;font-size:18px;color:#7a4608}
    .star{position:absolute;font-size:64px;filter:drop-shadow(0 6px 0 rgba(27,47,99,.35))}
  </style></head><body>
    <div class="bricks"></div>${flakes}<div class="snow"></div>
    <div class="copy">
      <div class="kicker">🐧 A 3D ragdoll sandbox</div>
      <h1 class="chunk"><span class="t1">PUDGY PENGUIN</span><span class="t2">TORTURE SIMULATOR</span></h1>
      <p class="tag">A cartoon ragdoll sandbox.<br><b>${tools.length} ways</b> to ruin his day.</p>
    </div>
    <div class="card"><img src="${b64(crop)}"></div>
    <div class="chip" style="right:478px;top:58px;transform:rotate(-5deg)"><span class="coin">$</span>+250</div>
    <div class="chip" style="right:38px;bottom:38px;transform:rotate(4deg)">🐟 ❇️ 🔨 ☣️</div>
    <div class="star" style="right:436px;bottom:110px;transform:rotate(-14deg)">💥</div>
  </body></html>`;
  await withHtml(html, { width: 1280, height: 640 }, (pg) => pg.screenshot({ path: path.join(MEDIA, 'banner.png'), clip: { x: 0, y: 0, width: 1280, height: 640 } }));
}

// ------------------------------------------------------------------------------------------------ tools sheet
async function runTools() {
  const tools = await getTools();
  const GROUPS = [['Hands', '✋'], ['Blunt', '🔨'], ['Sharp', '🔪'], ['Boom', '💥'], ['Nasty', '☣️']];
  console.log('  tools in game:', tools.length);
  fs.writeFileSync(path.join(TMP, 'tools.json'), JSON.stringify(tools, null, 1));
  const rows = GROUPS.map(([g, ic]) => {
    const list = tools.filter((t) => t.group === g);
    const tiles = list.map((t) => {
      const star = t.id === 'shuriken';
      return `<div class="tile${star ? ' star' : ''}">${star ? '<div class="ribbon">NEW</div>' : ''}<div class="box">${t.icon}</div><div class="nm">${t.name}</div>${t.price ? `<div class="price"><span class="coin">$</span>${t.price}</div>` : '<div class="free">Free</div>'}</div>`;
    }).join('');
    return `<section class="row"><div class="tab"><span class="ti">${ic}</span><span>${g}</span><small>${list.length} tools</small></div><div class="tiles">${tiles}</div></section>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8">${FONT_LINK}<style>${BASE_CSS}
    body{width:1280px;background:radial-gradient(900px 500px at 90% 0%,#ffffff 0%,rgba(255,255,255,0) 60%),linear-gradient(160deg,#EAF3FF 0%,#b9d3fa 100%);padding:44px 48px 40px;position:relative;overflow:hidden}
    header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:26px;position:relative}
    h1{font-size:64px;line-height:1;color:var(--ink)} h1 em{font-style:normal;color:var(--orange);-webkit-text-stroke:0}
    header p{font-weight:900;font-size:20px;color:var(--ink-soft);text-align:right;line-height:1.35}
    .row{display:flex;gap:22px;align-items:center;margin-bottom:16px;background:var(--glass);border:2px solid var(--line);border-radius:28px;padding:16px 22px;box-shadow:0 8px 24px rgba(40,80,170,.16);position:relative}
    .tab{flex:0 0 150px;display:flex;flex-direction:column;align-items:center;gap:2px;background:var(--ice);color:#fff;border-radius:22px;padding:14px 8px 12px;box-shadow:0 4px 0 var(--ice-dark)}
    .tab .ti{font-size:38px;line-height:1.1} .tab span:nth-child(2){font-weight:900;font-size:24px} .tab small{font-weight:800;font-size:13px;opacity:.9;letter-spacing:.08em;text-transform:uppercase}
    .tiles{display:flex;gap:14px;flex:1}
    .tile{flex:0 0 118px;display:flex;flex-direction:column;align-items:center;gap:7px;position:relative}
    .box{width:84px;height:84px;border-radius:24px;border:2px solid var(--line);background:#fff;display:grid;place-items:center;font-size:44px;line-height:1;box-shadow:0 4px 0 rgba(79,127,214,.28)}
    .tile.star .box{border:3px solid var(--orange);background:#fff7ea;box-shadow:0 0 0 5px rgba(246,163,60,.28),0 4px 0 var(--orange-dark)}
    .tile.star .nm{color:var(--orange-dark)}
    .ribbon{position:absolute;top:-8px;right:2px;z-index:2;background:var(--blush-dark);color:#fff;font-weight:900;font-size:11px;letter-spacing:.08em;border-radius:999px;padding:2px 8px;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.2)}
    .nm{font-weight:900;font-size:15px;text-align:center;line-height:1.1;min-height:17px;white-space:nowrap}
    .tile.star .nm{font-size:13.5px}
    .price{display:flex;align-items:center;gap:5px;background:var(--orange);color:#5a3200;border:2px solid var(--orange-dark);border-radius:999px;padding:2px 10px 2px 3px;font-weight:900;font-size:15px;box-shadow:0 2px 0 rgba(0,0,0,.15)}
    .price .coin{width:20px;height:20px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe3ad,#ffbd55 55%,#e08a14);border:2px solid var(--orange-dark);display:grid;place-items:center;font-size:11px;color:#7a4608}
    .free{background:#e1f5ff;color:#1d5f8c;border:2px solid #8fcbe9;border-radius:999px;padding:2px 14px;font-weight:900;font-size:15px}
    footer{margin-top:6px;text-align:center;font-weight:800;font-size:16px;color:var(--ink-soft);position:relative}
  </style></head><body>
    ${[[40, 20, 46, 12, 0.7], [1100, 70, 60, 30, 0.6], [640, 8, 30, 0, 0.55], [1200, 520, 40, 20, 0.5], [18, 700, 52, 45, 0.5], [1160, 840, 44, 10, 0.6]].map((a) => FLAKE(...a)).join('')}
    <header><h1 class="chunk">${tools.length} <em>tools</em> of terrible ideas</h1><p>Free tools to start.<br>Hits pay coins, coins unlock the rest.</p></header>
    <main id="sheet">${rows}</main>
    <footer>Prices in coins, as in the game</footer>
  </body></html>`;
  await withHtml(html, { width: 1280, height: 900 }, async (pg) => {
    const height = await pg.evaluate(() => document.body.scrollHeight);
    await pg.setViewportSize({ width: 1280, height });
    await pg.screenshot({ path: path.join(MEDIA, 'tools.png'), clip: { x: 0, y: 0, width: 1280, height } });
    console.log('  tools.png height', height);
  });
}

if (want('tools')) await runTools();
if (want('gallery')) await runGallery();
if (want('banner')) await runBanner();

const code = await h.close();
console.log('candidates in', CAND);
process.exit(code);
