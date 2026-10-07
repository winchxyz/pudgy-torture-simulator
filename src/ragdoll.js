// The Pengu ragdoll: rigid bodies on the model's segments, spherical impulse joints with
// spring-damper "muscles", a balance controller, severing, explosions, squash and stretch.
import { G, groups, FIXED_DT } from './physics.js';

export const SEGMENTS = ['head', 'torso', 'pelvis', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR'];

// The model joint Group that owns each segment when pengu.segments is not available.
const SEG_JOINT = {
  head: 'neck', torso: 'torso', pelvis: 'pelvis', armL: 'armL', armR: 'armR',
  foreL: 'elbowL', foreR: 'elbowR', legL: 'legL', legR: 'legR',
};

// Impulse joints. kp/kd are angular accelerations (1 / s^2, 1 / s) of the joint "muscle";
// limit is the soft cone limit in radians away from the rest orientation.
const JOINTS = {
  neck: { parent: 'torso', child: 'head', at: 'neck', kp: 700, kd: 36, limit: 0.42, limitK: 3 }, // penguin: one pear body, keep seams closed
  waist: { parent: 'pelvis', child: 'torso', at: 'torso', kp: 1000, kd: 44, limit: 0.2, limitK: 3 },
  shoulderL: { parent: 'torso', child: 'armL', at: 'shoulderL', kp: 260, kd: 15, limit: 2.3 },
  shoulderR: { parent: 'torso', child: 'armR', at: 'shoulderR', kp: 260, kd: 15, limit: 2.3 },
  elbowL: { parent: 'armL', child: 'foreL', at: 'elbowL', kp: 260, kd: 13, limit: 1.5 },
  elbowR: { parent: 'armR', child: 'foreR', at: 'elbowR', kp: 260, kd: 13, limit: 1.5 },
  hipL: { parent: 'pelvis', child: 'legL', at: 'hipL', kp: 1400, kd: 52, limit: 0.95 },
  hipR: { parent: 'pelvis', child: 'legR', at: 'hipR', kp: 1400, kd: 52, limit: 0.95 },
};

const MASS = { head: 1.5, torso: 1.0, pelvis: 0.9, armL: 0.16, armR: 0.16, foreL: 0.15, foreR: 0.15, legL: 0.55, legR: 0.55 };

const BLOB = {
  head: { radius: 0.7, strength: 0.7 },
  torso: { radius: 0.62, strength: 0.6 },
  pelvis: { radius: 0.52, strength: 0.6 },
  legL: { radius: 0.2, strength: 0.55 },
  legR: { radius: 0.2, strength: 0.55 },
  armL: { radius: 0.14, strength: 0.4 },
  armR: { radius: 0.14, strength: 0.4 },
  foreL: { radius: 0.17, strength: 0.4 },
  foreR: { radius: 0.17, strength: 0.4 },
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function createRagdoll({ THREE, RAPIER, physics, scene, room, pengu, events }) {
  const world = physics.world;
  const V3 = THREE.Vector3;
  const Q = THREE.Quaternion;

  pengu.setPose('idle', true);
  pengu.setPoseControl(false);
  pengu.root.updateMatrixWorld(true);
  const joints = pengu.joints;
  const segGroups = pengu.segments || Object.fromEntries(SEGMENTS.map((s) => [s, joints[SEG_JOINT[s]]]));

  const container = new THREE.Group();
  container.name = 'ragdollContainer';
  (pengu.root.parent || scene).add(container);

  // ------------------------------------------------------------------ frames
  const worldPos = (g) => g.getWorldPosition(new V3());
  const worldQuat = (g) => g.getWorldQuaternion(new Q());
  const restPos = {};
  const restQuat = {};
  for (const s of SEGMENTS) {
    restPos[s] = worldPos(segGroups[s]);
    restQuat[s] = worldQuat(segGroups[s]);
  }
  // A point/orientation given in a model joint's frame, expressed in the segment's local frame.
  function localIn(seg, jointGroup, x, y, z) {
    const p = jointGroup.localToWorld(new V3(x, y, z));
    const d = p.sub(restPos[seg]).applyQuaternion(restQuat[seg].clone().invert());
    const qr = restQuat[seg].clone().invert().multiply(worldQuat(jointGroup));
    return { t: d, q: qr };
  }
  const localPointOf = (seg, wp) => wp.clone().sub(restPos[seg]).applyQuaternion(restQuat[seg].clone().invert());

  // ------------------------------------------------------------------ bodies + colliders
  const bodies = {};
  const colliders = {};
  const partColliders = []; // { collider, seg, part }
  const inertia = {};
  const vinertia = {};

  function bodyFor(seg) {
    const p = restPos[seg];
    const q = restQuat[seg];
    const b = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.25)
        .setAngularDamping(0.9)
        .setCanSleep(false)
        .setCcdEnabled(true)
    );
    bodies[seg] = b;
    colliders[seg] = [];
    return b;
  }

  const FILTER = {
    head: G.WORLD | G.PROP | G.LEG | G.DEBRIS,
    torso: G.WORLD | G.PROP | G.DEBRIS,
    pelvis: G.WORLD | G.PROP | G.DEBRIS,
    limb: G.WORLD | G.PROP | G.DEBRIS,
    leg: G.WORLD | G.PROP | G.HEAD | G.DEBRIS,
  };
  const MEMBER = { head: G.HEAD, torso: G.TORSO, pelvis: G.PELVIS, armL: G.LIMB, armR: G.LIMB, foreL: G.LIMB, foreR: G.LIMB, legL: G.LEG, legR: G.LEG };
  const FILT = { head: FILTER.head, torso: FILTER.torso, pelvis: FILTER.pelvis, armL: FILTER.limb, armR: FILTER.limb, foreL: FILTER.limb, foreR: FILTER.limb, legL: FILTER.leg, legR: FILTER.leg };

  function addCollider(seg, desc, frame, { mass, friction = 0.8, restitution = 0.25, part = null, sensor = false } = {}) {
    desc
      .setTranslation(frame.t.x, frame.t.y, frame.t.z)
      .setRotation({ x: frame.q.x, y: frame.q.y, z: frame.q.z, w: frame.q.w })
      .setFriction(friction)
      .setRestitution(restitution)
      .setCollisionGroups(groups(MEMBER[seg], sensor ? 0 : FILT[seg]));
    if (sensor) desc.setSensor(true);
    else desc.setMass(mass).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const c = world.createCollider(desc, bodies[seg]);
    physics.tag(c, { kind: 'seg', seg, part, sensor });
    colliders[seg].push(c);
    partColliders.push({ collider: c, seg, part });
    return c;
  }

  // head: one big dome (the top of the pear-shaped body); sizes follow PENGU.colliders in penguin.js
  const CH = pengu.constants?.colliders || {};
  const box = (c) => RAPIER.ColliderDesc.roundCuboid(c.half[0], c.half[1], c.half[2], c.r);
  bodyFor('head');
  {
    const c = CH.head || { center: [0, 0.44, 0], half: [0.33, 0.27, 0.3], r: 0.18 };
    addCollider('head', box(c), localIn('head', joints.head, c.center[0], c.center[1], c.center[2]), { mass: MASS.head, restitution: 0.3, part: 'head' });
  }
  // beak: a solid little ball at the beak root (pickable as part 'beak'); crest: a pick-only sensor
  if (joints.beak) addCollider('head', RAPIER.ColliderDesc.ball(0.075), localIn('head', joints.beak, 0, 0, 0.08), { mass: 0.03, part: 'beak' });
  addCollider('head', RAPIER.ColliderDesc.ball(0.14), localIn('head', joints.crest, 0, 0.08, 0), { part: 'crest', sensor: true });

  // torso and pelvis: wide, soft belly boxes
  // The colliding box of the torso and pelvis is slimmer than the visible belly on purpose: the flippers hang along
  // its sides and must stay clickable, and the spilled intestines should hang along the belly, not inside a collider.
  // A full-size ghost collider (it collides with nothing) keeps the belly's mass and inertia, so the balance muscles
  // feel the same as with the full-width shape.
  function slimBody(seg, jointName, c0, slim, mass, part) {
    const narrow = { ...c0, half: [Math.min(c0.half[0], slim.x), c0.half[1], Math.min(c0.half[2], slim.z)] };
    const fr = localIn(seg, joints[jointName], c0.center[0], c0.center[1], c0.center[2]);
    addCollider(seg, box(narrow), fr, { mass: mass * 0.5, part });
    const ghost = box(c0)
      .setTranslation(fr.t.x, fr.t.y, fr.t.z)
      .setRotation({ x: fr.q.x, y: fr.q.y, z: fr.q.z, w: fr.q.w })
      .setMass(mass * 0.5)
      .setCollisionGroups(groups(MEMBER[seg], 0));
    const gc = world.createCollider(ghost, bodies[seg]);
    physics.tag(gc, { kind: 'ghost', seg, part: null }); // never picked or hit (its filter is empty)
    colliders[seg].push(gc);
  }
  bodyFor('torso');
  slimBody('torso', 'torso', CH.torso || { center: [0, 0.3, 0], half: [0.34, 0.2, 0.3], r: 0.2 }, { x: 0.23, z: 0.3 }, MASS.torso, 'torso');
  bodyFor('pelvis');
  {
    const p0 = CH.pelvis || { center: [0, -0.06, 0], half: [0.34, 0.07, 0.3], r: 0.17 };
    slimBody('pelvis', 'pelvis', p0, { x: p0.half[0], z: p0.r + 0.02 }, MASS.pelvis, 'pelvis');
  }

  // short flippers and stubby legs with flat feet
  const F = pengu.constants?.foot || { y: -0.096, z: 0.31, h: 0.1, hw: 0.1, len: 0.26 };
  for (const S of ['L', 'R']) {
    bodyFor('arm' + S);
    addCollider('arm' + S, RAPIER.ColliderDesc.capsule(0.02, 0.1), localIn('arm' + S, joints['arm' + S], 0, -0.1, 0), { mass: MASS['arm' + S], part: 'arm' });
    bodyFor('fore' + S);
    addCollider('fore' + S, RAPIER.ColliderDesc.capsule(0.03, 0.1), localIn('fore' + S, joints['elbow' + S], 0, -0.11, 0), { mass: MASS['fore' + S], part: 'fore' });
    bodyFor('leg' + S);
    addCollider('leg' + S, RAPIER.ColliderDesc.capsule(0.02, 0.07), localIn('leg' + S, joints['leg' + S], 0, -0.065, 0), { mass: MASS['leg' + S] * 0.5, part: 'leg' });
    addCollider('leg' + S, RAPIER.ColliderDesc.roundCuboid(Math.max(0.01, F.hw - 0.04), 0.0, Math.max(0.01, F.len / 2 - 0.04), 0.04), localIn('leg' + S, joints['foot' + S], 0, F.y, F.z), { mass: MASS['leg' + S] * 0.5, friction: 1.6, restitution: 0.15, part: 'foot' });
  }
  for (const s of SEGMENTS) {
    const p = bodies[s].principalInertia();
    inertia[s] = Math.max(1e-4, (p.x + p.y + p.z) / 3);
    // virtual inertia for the balance controller: about the ground, so the torque can beat gravity
    const cy = bodies[s].worldCom().y;
    vinertia[s] = inertia[s] + bodies[s].mass() * cy * cy;
    physics.track(bodies[s]);
  }

  // ------------------------------------------------------------------ reparent flat + blobs
  const pivots = {};
  const sqState = {};
  for (const s of SEGMENTS) {
    const g = segGroups[s];
    container.attach(g);
    g.matrixAutoUpdate = false;
    const c = bodies[s].localCom();
    pivots[s] = new V3(c.x, c.y, c.z);
    sqState[s] = { x: 0, v: 0, n: new V3(0, 1, 0), t: 0 };
  }
  const blobs = {};
  for (const s of SEGMENTS) if (room) blobs[s] = room.addBlob(BLOB[s]);

  // ------------------------------------------------------------------ joints
  const jointObjs = {}; // name -> ImpulseJoint | null
  const jointInfo = {}; // name -> { parent, child, restQ, anchorP, anchorC, kp, kd, limit }
  const severed = {};

  function makeJoint(name) {
    const d = JOINTS[name];
    const info = jointInfo[name];
    const j = world.createImpulseJoint(
      RAPIER.JointData.spherical({ x: info.anchorP.x, y: info.anchorP.y, z: info.anchorP.z }, { x: info.anchorC.x, y: info.anchorC.y, z: info.anchorC.z }),
      bodies[d.parent],
      bodies[d.child],
      true
    );
    j.setContactsEnabled(false);
    jointObjs[name] = j;
  }
  for (const [name, d] of Object.entries(JOINTS)) {
    const wp = worldPos(joints[d.at]);
    jointInfo[name] = {
      ...d,
      anchorP: localPointOf(d.parent, wp),
      anchorC: localPointOf(d.child, wp),
      restQ: restQuat[d.parent].clone().invert().multiply(restQuat[d.child]),
      world: wp,
    };
    severed[name] = false;
    makeJoint(name);
  }

  // ------------------------------------------------------------------ temporaries
  const _q = new Q();
  const _q2 = new Q();
  const _v = new V3();
  const _v2 = new V3();
  const bq = (b) => {
    const r = b.rotation();
    return _q.set(r.x, r.y, r.z, r.w);
  };
  const state = {
    t: 0,
    limpT: 0, // seconds of limpness left
    recover: 1, // 0..1 balance ramp
    holdLimp: 0, // > 0 while something (a grab) holds him
    standingOK: true,
  };
  const tune = { sway: 0.2, support: 1, upright: 1, yaw: 1, muscle: 1 };

  // Secondary motion: the crest feathers lag behind the head like soft toys.
  const flop = { last: null, lv: new V3(), crest: { x: 0, vx: 0, z: 0, vz: 0 } };
  const crestJoint = joints.crest;
  const crestBase = crestJoint.rotation.clone();

  const hasLegs = () => !severed.hipL && !severed.hipR;

  // ------------------------------------------------------------------ control
  function applyTorque(body, ax, ay, az, I, h) {
    body.applyTorqueImpulse({ x: ax * I * h, y: ay * I * h, z: az * I * h }, true);
  }

  function uprightAlpha(seg, kp, kd, maxA, gain, h, yawKp = 0, capI = Infinity) {
    if (tune.upSegs && !tune.upSegs.includes(seg)) return;
    const b = bodies[seg];
    const q = bq(b);
    _v.set(0, 1, 0).applyQuaternion(q);
    const w = b.angvel();
    // axis = up_body x up_world, angle = acos(up_y)
    let ax = -_v.z;
    let az = _v.x;
    const s = Math.hypot(ax, az);
    const theta = Math.atan2(s, _v.y);
    if (s > 1e-5) {
      ax = (ax / s) * theta;
      az = (az / s) * theta;
    } else if (_v.y < 0) {
      ax = Math.PI;
    } else {
      ax = az = 0;
    }
    let alx = kp * ax - kd * w.x;
    let alz = kp * az - kd * w.z;
    const m = Math.hypot(alx, alz);
    if (m > maxA) {
      alx *= maxA / m;
      alz *= maxA / m;
    }
    let aly = -kd * 0.35 * w.y;
    if (yawKp && _v.y > 0.6) {
      _v2.set(0, 0, 1).applyQuaternion(q);
      const psi = Math.atan2(_v2.x, _v2.z);
      aly += -yawKp * tune.yaw * psi - yawKp * 0.35 * w.y * tune.yaw;
      aly = Math.max(-30, Math.min(30, aly));
    }
    applyTorque(b, alx * gain, aly * gain, alz * gain, Math.min(vinertia[seg], inertia[seg] * capI), h);
  }

  const wq = new Q();
  const rv = new V3();
  function jointMuscle(name, stiff, h) {
    const info = jointInfo[name];
    const bp = bodies[info.parent];
    const bc = bodies[info.child];
    const qp = bq(bp).clone();
    const qc = bq(bc).clone();
    // desired child orientation = parent * restQ ; error rotation in world frame
    wq.copy(qp).multiply(info.restQ);
    _q2.copy(qc).multiply(wq.invert());
    if (_q2.w < 0) {
      _q2.x = -_q2.x;
      _q2.y = -_q2.y;
      _q2.z = -_q2.z;
      _q2.w = -_q2.w;
    }
    const sinHalf = Math.hypot(_q2.x, _q2.y, _q2.z);
    const angle = 2 * Math.atan2(sinHalf, _q2.w);
    if (sinHalf > 1e-6) rv.set(_q2.x, _q2.y, _q2.z).multiplyScalar(1 / sinHalf);
    else rv.set(0, 0, 0);
    const wc = bc.angvel();
    const wp = bp.angvel();
    const rw = { x: wc.x - wp.x, y: wc.y - wp.y, z: wc.z - wp.z };
    const over = Math.max(0, angle - info.limit);
    const kp = info.kp * stiff;
    const kd = info.kd * Math.sqrt(stiff);
    const mag = kp * angle + kp * (info.limitK ?? 9) * over;
    const dk = kd * (1 + (over > 0 ? 2 : 0));
    const ax = -(rv.x * mag) - dk * rw.x;
    const ay = -(rv.y * mag) - dk * rw.y;
    const az = -(rv.z * mag) - dk * rw.z;
    const Ic = inertia[info.child];
    const Ip = inertia[info.parent];
    const Ir = 1 / (1 / Ic + 1 / Ip);
    // child gets torque, parent the opposite (each scaled by its share so accelerations stay bounded)
    bc.applyTorqueImpulse({ x: ax * Ir * h, y: ay * Ir * h, z: az * Ir * h }, true);
    bp.applyTorqueImpulse({ x: -ax * Ir * h, y: -ay * Ir * h, z: -az * Ir * h }, true);
  }

  const ragdoll = {
    THREE,
    pengu,
    container,
    bodies,
    colliders,
    segments: segGroups,
    jointObjs,
    state,
    tune,
    SEGMENTS,
    // -------------------------------------------------------------- queries
    segmentOf(collider) {
      const t = physics.tagOf(collider);
      return t && t.kind === 'seg' ? t.seg : null;
    },
    partOf(collider) {
      const t = physics.tagOf(collider);
      return t && t.kind === 'seg' ? t.part : null;
    },
    isSevered(joint) {
      return !!severed[joint];
    },
    get standing() {
      return hasLegs() && state.limpT <= 0 && state.holdLimp <= 0 && state.recover > 0.6;
    },
    get limp() {
      return state.limpT > 0 || state.holdLimp > 0 || !hasLegs();
    },
    // Debug: distance between the two anchor points of every joint (limbs stretching apart).
    jointGaps() {
      const out = {};
      for (const name of Object.keys(JOINTS)) {
        if (severed[name] || !jointObjs[name]) continue;
        const info = jointInfo[name];
        const pa = bodies[info.parent];
        const pc = bodies[info.child];
        const a = new V3(info.anchorP.x, info.anchorP.y, info.anchorP.z).applyQuaternion(new Q(pa.rotation().x, pa.rotation().y, pa.rotation().z, pa.rotation().w)).add(new V3(pa.translation().x, pa.translation().y, pa.translation().z));
        const c = new V3(info.anchorC.x, info.anchorC.y, info.anchorC.z).applyQuaternion(new Q(pc.rotation().x, pc.rotation().y, pc.rotation().z, pc.rotation().w)).add(new V3(pc.translation().x, pc.translation().y, pc.translation().z));
        out[name] = +a.distanceTo(c).toFixed(4);
      }
      return out;
    },
    // Debug: current angle (rad) of every joint from its rest orientation.
    jointAngles() {
      const out = {};
      for (const name of Object.keys(JOINTS)) {
        if (severed[name]) continue;
        const info = jointInfo[name];
        const qp = bq(bodies[info.parent]).clone();
        const qc = bq(bodies[info.child]).clone();
        const e = qc.multiply(qp.multiply(info.restQ).invert());
        if (e.w < 0) e.set(-e.x, -e.y, -e.z, -e.w);
        const sh = Math.hypot(e.x, e.y, e.z);
        out[name] = { angle: +(2 * Math.atan2(sh, e.w)).toFixed(3), axis: sh > 1e-6 ? [e.x / sh, e.y / sh, e.z / sh].map((n) => +n.toFixed(2)) : [0, 0, 0] };
      }
      return out;
    },
    // First collider of a part: 'head', 'beak', 'crest', 'foot', ...
    partCollider(seg, part) {
      return partColliders.find((p) => p.seg === seg && p.part === part)?.collider || null;
    },
    // Parent/child segment names of a joint.
    jointSegments(joint) {
      const d = JOINTS[joint];
      return d ? { parentSeg: d.parent, childSeg: d.child } : null;
    },
    pointVelocity(seg, p) {
      return physics.velocityAt(bodies[seg], p);
    },
    centerOfMass() {
      const c = new V3();
      let m = 0;
      for (const s of SEGMENTS) {
        const b = bodies[s];
        const w = b.worldCom();
        c.x += w.x * b.mass();
        c.y += w.y * b.mass();
        c.z += w.z * b.mass();
        m += b.mass();
      }
      return c.multiplyScalar(1 / m);
    },

    // -------------------------------------------------------------- forces
    limpFor(sec) {
      state.limpT = Math.max(state.limpT, sec);
      state.recover = 0;
    },
    setHeld(on) {
      state.holdLimp = on ? 1 : 0;
      if (on) state.recover = 0;
    },
    applyImpulse(seg, v, point) {
      const b = bodies[seg];
      if (!b || !b.isEnabled()) return;
      const imp = { x: v.x, y: v.y, z: v.z };
      if (point) b.applyImpulseAtPoint(imp, { x: point.x, y: point.y, z: point.z }, true);
      else b.applyImpulse(imp, true);
    },
    // Radial impulse: strength is the velocity change (m/s) at the center; falls off to 0 at radius.
    explode(center, radius, strength) {
      for (const s of SEGMENTS) {
        const b = bodies[s];
        const c = b.worldCom();
        const dx = c.x - center.x;
        const dy = c.y - center.y + 0.15;
        const dz = c.z - center.z;
        const d = Math.hypot(dx, dy, dz) || 0.01;
        if (d > radius) continue;
        const f = (1 - d / radius) ** 1.2 * strength * b.mass();
        b.applyImpulse({ x: (dx / d) * f, y: (dy / d) * f, z: (dz / d) * f }, true);
        b.applyTorqueImpulse({ x: (Math.random() - 0.5) * f * 0.35, y: (Math.random() - 0.5) * f * 0.35, z: (Math.random() - 0.5) * f * 0.35 }, true);
      }
      for (const p of physics.props) {
        const c = p.body.worldCom();
        const dx = c.x - center.x;
        const dy = c.y - center.y + 0.15;
        const dz = c.z - center.z;
        const d = Math.hypot(dx, dy, dz) || 0.01;
        if (d > radius) continue;
        const f = (1 - d / radius) ** 1.2 * strength * p.body.mass();
        p.body.applyImpulse({ x: (dx / d) * f, y: (dy / d) * f, z: (dz / d) * f }, true);
        p.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * f * 0.1, y: (Math.random() - 0.5) * f * 0.1, z: (Math.random() - 0.5) * f * 0.1 }, true);
      }
      ragdoll.limpFor(1.6);
    },

    // -------------------------------------------------------------- squash / twitch
    // Brief scale pulse along a world-space normal. amount ~ 0.05..0.3 (fraction of compression).
    squash(seg, normal, amount = 0.15) {
      const s = sqState[seg];
      if (!s) return;
      _v.set(normal.x, normal.y, normal.z);
      if (_v.lengthSq() < 1e-6) _v.set(0, 1, 0);
      s.n.copy(_v.normalize());
      s.x = -Math.min(0.35, Math.abs(amount));
      s.v = 0;
    },
    // A small random jolt, used while he bleeds or gets zapped.
    twitch(seg, strength = 1) {
      const b = bodies[seg];
      if (!b) return;
      const I = inertia[seg];
      const a = strength * 6;
      b.applyTorqueImpulse({ x: (Math.random() - 0.5) * a * I, y: (Math.random() - 0.5) * a * I, z: (Math.random() - 0.5) * a * I }, true);
      b.applyImpulse({ x: (Math.random() - 0.5) * strength * 0.25 * b.mass(), y: Math.random() * strength * 0.3 * b.mass(), z: (Math.random() - 0.5) * strength * 0.25 * b.mass() }, true);
      _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      ragdoll.squash(seg, _v, 0.03 * strength);
    },

    // -------------------------------------------------------------- severing
    sever(joint) {
      const info = jointInfo[joint];
      if (!info || severed[joint]) return null;
      severed[joint] = true;
      try {
        world.removeImpulseJoint(jointObjs[joint], true);
      } catch {
        /* already gone */
      }
      jointObjs[joint] = null;
      const wp = worldPos(joints[info.at]);
      const cb = bodies[info.child];
      const pb = bodies[info.parent];
      // Tiny separation kick so the two halves part visibly.
      const dir = new V3(cb.worldCom().x - pb.worldCom().x, cb.worldCom().y - pb.worldCom().y, cb.worldCom().z - pb.worldCom().z).normalize();
      cb.applyImpulse({ x: dir.x * 0.25 * cb.mass(), y: dir.y * 0.25 * cb.mass(), z: dir.z * 0.25 * cb.mass() }, true);
      ragdoll.limpFor(1.2);
      const res = { parentSeg: info.parent, childSeg: info.child, worldPos: wp.clone() };
      events.emit('sever', { joint, parentSeg: info.parent, childSeg: info.child, point: wp.clone() });
      return res;
    },

    // Chain bodies with spherical joints at the midpoints. items: props or Rapier bodies.
    attachRope(items, anchorBody, opts = {}) {
      const list = items.map((b) => b.body || b);
      const joints = [];
      const local = (b, wp) => {
        const t = b.translation();
        const r = b.rotation();
        const q = new Q(r.x, r.y, r.z, r.w).invert();
        const p = new V3(wp.x - t.x, wp.y - t.y, wp.z - t.z).applyQuaternion(q);
        return { x: p.x, y: p.y, z: p.z };
      };
      const link = (A, B, wp) => {
        const j = world.createImpulseJoint(RAPIER.JointData.spherical(local(A, wp), local(B, wp)), A, B, true);
        j.setContactsEnabled(opts.contacts ?? false);
        joints.push(j);
      };
      let prev = anchorBody;
      list.forEach((b, i) => {
        const pt = prev.translation();
        const bt = b.translation();
        const wp = i === 0 && opts.anchorWorld ? opts.anchorWorld : { x: (pt.x + bt.x) / 2, y: (pt.y + bt.y) / 2, z: (pt.z + bt.z) / 2 };
        link(prev, b, wp);
        prev = b;
      });
      return {
        joints,
        remove() {
          for (const j of joints) {
            try {
              world.removeImpulseJoint(j, true);
            } catch {
              /* already removed */
            }
          }
          joints.length = 0;
        },
      };
    },

    // -------------------------------------------------------------- per-step / per-frame
    preStep(h) {
      state.t += h;
      const legs = hasLegs();
      // limp bookkeeping
      if (state.holdLimp <= 0) {
        if (state.limpT > 0) {
          state.limpT -= h;
          if (state.limpT <= 0) state.recover = 0;
        } else if (state.recover < 1) {
          state.recover = Math.min(1, state.recover + h / 1.1);
        }
      }
      const balanced = legs && state.limpT <= 0 && state.holdLimp <= 0;
      const gain = balanced ? state.recover * state.recover * (3 - 2 * state.recover) : legs ? 0.03 : 0;
      const stiff = legs ? 0.12 + 0.88 * gain : 0.3;

      // speed limits keep the solver sane (a 40 m/s ragdoll tears its own joints apart)
      for (const sname of SEGMENTS) {
        const b = bodies[sname];
        if (!b.isEnabled()) continue;
        const v = b.linvel();
        const sp = Math.hypot(v.x, v.y, v.z);
        if (sp > 32) {
          const k = 32 / sp;
          b.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, false);
        }
        const w = b.angvel();
        const ws = Math.hypot(w.x, w.y, w.z);
        if (ws > 40) {
          const k = 40 / ws;
          b.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, false);
        }
      }
      // muscles at the joints
      for (const name of Object.keys(JOINTS)) {
        if (severed[name]) continue;
        if (tune.only && !tune.only.includes(name)) continue;
        jointMuscle(name, stiff * tune.muscle, h);
      }

      // balance
      if (gain > 0.001) {
        const t = state.t;
        // gentle sway so he never looks frozen
        const swayX = tune.sway * 4 * (Math.sin(t * 1.3) * 0.9 + Math.sin(t * 2.9 + 1) * 0.35);
        const swayZ = tune.sway * 4 * (Math.sin(t * 1.1 + 2) * 0.9 + Math.sin(t * 2.3) * 0.35);
        uprightAlpha('pelvis', 60, 6, 45, gain, h, 26, 6);
        for (const S of ['L', 'R']) if (!severed['hip' + S]) uprightAlpha('leg' + S, 60, 6, 45, gain, h, 26, 6);
        if (!severed.waist) uprightAlpha('torso', 60, 12, 45, gain, h, 10);
        if (!severed.neck && !severed.waist) uprightAlpha('head', 50, 10, 45, gain, h, 8);
        if (!severed.waist) applyTorque(bodies.torso, swayX * 0.6 * gain, 0, swayZ * 0.6 * gain, vinertia.torso, h);
        if (!severed.neck) applyTorque(bodies.head, -swayZ * 0.5 * gain, 0, swayX * 0.5 * gain, vinertia.head, h);
        // support: lift the pelvis a little so he stands tall and rises from the floor
        const pb = bodies.pelvis;
        const py = pb.translation().y;
        const total = 7 * 13;
        const err = 0.33 - py;
        if (err > 0.01 && tune.support > 0) {
          // no extra push while he is already rising (it made a spring with no damping: a small tug started a hop)
          const rise = clamp01(1 - pb.linvel().y / 0.5);
          const f = Math.min(err * 40, 1.0) * total * 0.5 * gain * tune.support * rise;
          pb.applyImpulse({ x: 0, y: f * h, z: 0 }, true);
        }
      }
    },
    postStep() {},

    // The crest tool takes over the crest joint while it pulls on it.
    crestLocked: false,

    // Visual sync: bodies -> segment Groups (call every frame after stepping).
    sync(dt) {
      // head acceleration in head-local axes drives the crest
      {
        const hb = bodies.head;
        const v = hb.linvel();
        const w = hb.angvel();
        const q = hb.rotation();
        const inv = new Q(q.x, q.y, q.z, q.w).invert();
        if (!flop.last) flop.last = new V3(v.x, v.y, v.z);
        const a = new V3((v.x - flop.last.x) / Math.max(dt, 1e-3), (v.y - flop.last.y) / Math.max(dt, 1e-3), (v.z - flop.last.z) / Math.max(dt, 1e-3)).applyQuaternion(inv);
        flop.last.set(v.x, v.y, v.z);
        const wl = new V3(w.x, w.y, w.z).applyQuaternion(inv);
        const clampA = (n, m) => Math.max(-m, Math.min(m, n));
        const t = state.t;
        const step = Math.min(dt, 0.033);
        if (!ragdoll.crestLocked && crestJoint.visible) {
          const L = flop.crest;
          const tz = clampA(-a.x * 0.035 - wl.y * 0.05, 0.9) + 0.07 * Math.sin(t * 2.3);
          const tx = clampA(a.z * 0.035 + wl.x * 0.03, 0.9) + 0.05 * Math.sin(t * 1.7 + 1);
          L.vz += (110 * (tz - L.z) - 5.5 * L.vz) * step;
          L.z += L.vz * step;
          L.vx += (110 * (tx - L.x) - 5.5 * L.vx) * step;
          L.x += L.vx * step;
          crestJoint.rotation.set(crestBase.x + L.x, crestBase.y, crestBase.z + L.z);
        }
      }
      for (const s of SEGMENTS) {
        const b = bodies[s];
        const g = segGroups[s];
        const t = b.translation();
        const r = b.rotation();
        if (blobs[s]) blobs[s].update(t.x, t.y, t.z);
        g.position.set(t.x, t.y, t.z);
        g.quaternion.set(r.x, r.y, r.z, r.w);
        g.scale.set(1, 1, 1);
        const sq = sqState[s];
        g.matrix.compose(g.position, g.quaternion, g.scale);
        if (sq.x !== 0 || sq.v !== 0) {
          sq.v += (-260 * sq.x - 15 * sq.v) * dt;
          sq.x += sq.v * dt;
          if (Math.abs(sq.x) < 0.002 && Math.abs(sq.v) < 0.03) {
            sq.x = sq.v = 0;
          } else {
            _q2.set(r.x, r.y, r.z, r.w).invert();
            const n = _v2.copy(sq.n).applyQuaternion(_q2);
            const sc = 1 + sq.x;
            const p = 1 / Math.sqrt(Math.max(0.3, sc));
            const k = sc - p;
            const m = new THREE.Matrix4().set(
              p + k * n.x * n.x, k * n.x * n.y, k * n.x * n.z, 0,
              k * n.y * n.x, p + k * n.y * n.y, k * n.y * n.z, 0,
              k * n.z * n.x, k * n.z * n.y, p + k * n.z * n.z, 0,
              0, 0, 0, 1
            );
            // scale about the segment's center of mass
            const pv = pivots[s];
            const tr = new THREE.Matrix4().makeTranslation(pv.x, pv.y, pv.z);
            const tri = new THREE.Matrix4().makeTranslation(-pv.x, -pv.y, -pv.z);
            g.matrix.multiply(tr).multiply(m).multiply(tri);
          }
        }
        g.matrixWorldNeedsUpdate = true;
      }
    },

    dispose() {
      for (const name of Object.keys(jointObjs)) {
        if (jointObjs[name]) {
          try {
            world.removeImpulseJoint(jointObjs[name], false);
          } catch {
            /* already gone */
          }
          jointObjs[name] = null;
        }
      }
      for (const s of SEGMENTS) {
        physics.untrack(bodies[s]);
        for (const c of colliders[s]) {
          physics.untag(c);
          try {
            world.removeCollider(c, false);
          } catch {
            /* ignore */
          }
        }
        try {
          world.removeRigidBody(bodies[s]);
        } catch {
          /* ignore */
        }
        blobs[s]?.remove();
      }
      container.parent?.remove(container);
    },
  };

  return ragdoll;
}
