// MERIDIAN RUN — the fighter jet: model from primitives + arcade flight model.
// One clear job: how the jet looks and how it flies.
//
// v8: the Cessna is GONE (user: "pesawatnya juga diganti pesawat tempur
// yang sedang berperang"). This is now a grey-camo fighter: pointed nose,
// dark glass canopy, swept low wings, twin canted fins, missiles under the
// wings, afterburner flame + glow at the tail. Same interface main.js uses:
// buildPlaneModel() returns { group, prop, canopy, bladeMat, discMat } —
// `prop` is now the afterburner group (it spins harmlessly each frame, the
// flame cone is symmetric around its own axis), `bladeMat` is the flame
// material and `discMat` the nozzle glow disc (both hidden in cockpit mode,
// exactly like the old prop). buildJetModel(opts) is the shared builder:
// the player jet (full detail) and the enemy jets (dark, no gear/missiles).
//
// v9: user rejected the v8 jet ("jetnya jelek") — the twin black box fins
// read as sails and the canopy as a black blob on a grey tube. Full F-16
// rebuild: flattened elliptical fuselage (wider than tall), longer sharper
// nose, frameless blue-grey bubble canopy on a sill, SINGLE swept grey tail
// fin, ventral fins, LERX strakes, cropped-delta wings a touch darker than
// the body, and ONE chin intake under the nose.

import * as THREE from 'three';
import { PLANE, RUNWAY, terrainHeight, clamp } from './config.js';

const GREY_TOP = 0x9aa2ab; // light grey camo, upper fuselage + wings
const GREY_BELLY = 0x5d646d; // darker grey belly + radome
const GREY_DARK = 0x3a4048; // enemy jets, fins, intakes
const GREY_WING = 0x878e97; // wings a touch darker than the body, so the
// wing reads as a wing against the fuselage in the hero shot (v8's pale
// wings washed out into the sky).
const GREY_SPINE = 0x7e858e; // dorsal spine strip, panel variation
const DARK = 0x16181c;

function sweptWing(span, rootLead, rootTrail, tipLead, tipTrail, thick, material) {
  // Extruded planform: shape in (span, -chord) so that after rotateX(-PI/2)
  // the shape's +Y lands at -Z (leading edge forward). One geometry per
  // side; the left wing is a scale.x = -1 clone (DoubleSide material).
  const shape = new THREE.Shape();
  shape.moveTo(0.3, -rootLead);
  shape.lineTo(span, -tipLead);
  shape.lineTo(span, -tipTrail);
  shape.lineTo(0.3, -rootTrail);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

export function buildJetModel(opts = {}) {
  const dark = !!opts.dark;
  const withGear = opts.withGear !== false;
  const withMissiles = !!opts.withMissiles;
  const group = new THREE.Group();
  const top = new THREE.MeshPhongMaterial({ color: dark ? GREY_DARK : GREY_TOP, shininess: 90, specular: 0x777777, side: THREE.DoubleSide });
  const belly = new THREE.MeshPhongMaterial({ color: dark ? 0x2c3138 : GREY_BELLY, shininess: 60, specular: 0x444444, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhongMaterial({ color: 0x22303e, shininess: 220, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const metal = new THREE.MeshPhongMaterial({ color: 0x2a2e33, shininess: 120, specular: 0x888888 });

  // Fuselage: a LATHE profile, jet-shaped — long pointed nose, fat
  // mid-body, tapering tail. v9 (user: "jetnya jelek"): the v8 lathe read
  // as a grey tube, so the body is now FLATTENED (elliptical cross-section,
  // wider than tall — a fighter fuselage, not a pipe) and the nose is
  // longer and sharper, F-16 style. Nose at -Z, tail at +Z.
  const PROFILE = [
    [0.02, -4.00], // nose tip
    [0.14, -3.70],
    [0.28, -3.30], // radome
    [0.40, -2.80],
    [0.50, -2.20], // chin intake
    [0.58, -1.40],
    [0.63, -0.60], // widest mid-body
    [0.63, 0.20],
    [0.60, 1.00],
    [0.52, 1.80],
    [0.44, 2.40],
    [0.36, 2.90], // tail
    [0.32, 3.10], // nozzle base
  ];
  const profilePoints = (zMin, zMax, extra = 0) =>
    PROFILE.filter(([, z]) => z >= zMin && z <= zMax)
      .map(([r, z]) => new THREE.Vector2(r + extra, z));
  const lathe = (zMin, zMax, extra, phiStart, phiLength, material) => {
    const m = new THREE.Mesh(
      new THREE.LatheGeometry(profilePoints(zMin, zMax, extra), 32, phiStart, phiLength),
      material,
    );
    m.rotation.x = Math.PI / 2;
    m.scale.set(1, 1, 0.82); // flatten: local Z is world vertical after
    // the rotation, so the body is wider than it is tall
    m.castShadow = true;
    group.add(m);
    return m;
  };
  // Light-grey body, full profile, full circle.
  lathe(-4.00, 3.10, 0, 0, Math.PI * 2, top);
  // Darker belly: half-shell around the lower fuselage (camouflage split).
  lathe(-4.00, 3.10, 0.012, -Math.PI / 2, Math.PI, belly);
  // Dark radome: the pointed nose cone section.
  lathe(-4.00, -2.80, 0.014, 0, Math.PI * 2, belly);
  // Dorsal spine: a narrow darker strip along the top centreline, following
  // the profile — panel variation so the body is not one flat grey slab.
  // (Lathe phi PI is the top: phi 0 is local +Z, which the rotation maps
  // to world down, so the belly half-shell is phi -PI/2..PI/2.)
  lathe(-0.60, 2.80, 0.016, Math.PI - 0.28, 0.56, new THREE.MeshPhongMaterial({ color: GREY_SPINE, shininess: 60, side: THREE.DoubleSide }));

  // Canopy: a frameless bubble (F-16 style — no bow frame at all), dark
  // blue-grey glass, long and low so it reads as glass, not a black blob.
  // It sits IN the body on a grey sill instead of perched on top of it.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), glass);
  canopy.scale.set(0.62, 0.42, 2.3);
  canopy.position.set(0, 0.52, -1.45);
  canopy.castShadow = true;
  group.add(canopy);
  // Sill: a thin grey fairing under the bubble so the glass meets the body.
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.09, 2.1), top);
  sill.position.set(0, 0.42, -1.45);
  group.add(sill);

  // Cropped-delta wings, F-16 style: bigger, more swept, slightly darker
  // than the body. Root chord 2.6 (z -1.1..+1.5), tip chord 0.9.
  const wingMat = new THREE.MeshPhongMaterial({ color: dark ? GREY_DARK : GREY_WING, shininess: 90, specular: 0x777777, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const wing = sweptWing(3.4, -1.1, 1.5, 0.7, 1.3, 0.12, wingMat);
    wing.scale.x = side;
    wing.position.set(0, -0.18, 0);
    wing.rotation.z = side * -0.04;
    group.add(wing);
    // LERX: leading-edge root extension — a thin swept strake blending the
    // intake into the wing root. The F-16's signature silhouette cue.
    const lerx = sweptWing(1.5, -1.9, -0.7, -1.0, -0.25, 0.07, wingMat);
    lerx.scale.x = side;
    lerx.position.set(0, 0.06, 0);
    group.add(lerx);
    // Wingtip missile rail (player only, cosmetic on the enemy too if asked).
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.0), metal);
    rail.position.set(side * 3.35, -0.16, 0.8);
    group.add(rail);
  }
  // Tailplanes: all-moving stabilators, swept, slightly larger than v8.
  for (const side of [-1, 1]) {
    const stab = sweptWing(1.6, 1.6, 3.05, 2.3, 2.95, 0.1, top);
    stab.scale.x = side;
    stab.position.set(0, 0.1, 0);
    stab.rotation.z = side * -0.06;
    group.add(stab);
  }
  // SINGLE swept vertical tail fin, F-16 style — GREY, same as the body,
  // never a big black rectangle. v8's twin black boxes read as sails and
  // were the single ugliest part of the jet. One fin, swept back, standing
  // on the tail. (Built from the same extruded planform as the wings,
  // rotated up: span X becomes vertical Y.)
  const finMat = new THREE.MeshPhongMaterial({ color: dark ? GREY_DARK : GREY_TOP, shininess: 80, specular: 0x666666, side: THREE.DoubleSide });
  const fin = sweptWing(1.25, 1.55, 3.15, 2.35, 3.15, 0.09, finMat);
  fin.rotation.z = Math.PI / 2;
  fin.position.set(0, 0.12, 0);
  fin.castShadow = true;
  group.add(fin);
  // Ventral fins: two small swept strakes under the tail (F-16 has them).
  for (const side of [-1, 1]) {
    const vf = sweptWing(0.55, 2.3, 3.05, 2.6, 3.05, 0.07, finMat);
    vf.rotation.z = -Math.PI / 2;
    vf.position.set(side * 0.28, -0.12, 0);
    group.add(vf);
  }
  // SINGLE chin intake under the nose (F-16 style) — one dark ventral
  // scoop, not two boxy side intakes. Plus a black intake mouth facing
  // forward. This is the other big silhouette cue: one engine, one intake.
  const intake = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 1.35), metal);
  intake.position.set(0, -0.42, -1.85);
  group.add(intake);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.1), new THREE.MeshPhongMaterial({ color: 0x14161a }));
  mouth.position.set(0, -0.42, -2.52);
  group.add(mouth);

  // Missiles under the wings (player only): white-grey body, dark nose,
  // tiny tail fins, on a pylon.
  if (withMissiles) {
    const missileMat = new THREE.MeshPhongMaterial({ color: 0xd8d8d8, shininess: 80 });
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.7), metal);
      pylon.position.set(side * 1.7, -0.32, 0.3);
      group.add(pylon);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.2, 10), missileMat);
      body.rotation.x = Math.PI / 2;
      body.position.set(side * 1.7, -0.52, 0.3);
      group.add(body);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 10), metal);
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(side * 1.7, -0.52, -0.45);
      group.add(tip);
      for (const fs of [-1, 1]) {
        const mfin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.3), metal);
        mfin.position.set(side * 1.7 + fs * 0.1, -0.52, 0.85);
        group.add(mfin);
      }
    }
  }

  // Afterburner: nozzle ring + orange flame cone + bright core + point
  // light. This whole group is `prop` in the old interface — main.js spins
  // prop.rotation.z every frame (invisible on a symmetric flame) and hides
  // the group in cockpit mode.
  const afterburner = new THREE.Group();
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.5, 16), metal);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = 3.2;
  afterburner.add(nozzle);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff7711, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  // v8.1: shorter, fatter, more saturated — the long thin cone read as a
  // pale paper triangle in the hero shot, washed out against the sky.
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.8, 12), flameMat);
  flame.rotation.x = Math.PI / 2; // tip points +Z (backward)
  flame.position.z = 4.1;
  afterburner.add(flame);
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 1.1, 10),
    new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  core.rotation.x = Math.PI / 2;
  core.position.z = 3.75;
  afterburner.add(core);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff9922, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), glowMat);
  glow.position.z = 3.47;
  afterburner.add(glow);
  const light = new THREE.PointLight(0xff7733, 3, 45, 2);
  light.position.set(0, 0, 3.75);
  afterburner.add(light);
  group.add(afterburner);

  // Landing gear: small dark tires on thin struts — a fighter sits on the
  // runway in the menu/end shots, so the gear stays (same v6 style). The
  // gear lives in its own group so main.js can retract it in flight (v8.1:
  // wheels dangling under a fighter in the air read wrong).
  const gear = new THREE.Group();
  group.add(gear);
  if (withGear) {
    const legMat = new THREE.MeshPhongMaterial({ color: 0x9aa0a6, shininess: 60 });
    const gearLeg = (x, z) => {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.95, 6), legMat);
      strut.position.set(x, -1.0, z);
      gear.add(strut);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.13, 14), new THREE.MeshPhongMaterial({ color: DARK }));
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x, -1.45, z);
      gear.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.15, 10), new THREE.MeshPhongMaterial({ color: 0x8a8f94 }));
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x, -1.45, z);
      gear.add(hub);
    };
    gearLeg(0, -1.05); // nose gear sits just behind the chin intake
    gearLeg(-0.75, 0.5);
    gearLeg(0.75, 0.5);
  }

  // Navigation lights: red left, green right, white tail.
  const lightDot = (color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    group.add(m);
  };
  lightDot(0xff2a2a, -3.4, -0.14, 0.8);
  lightDot(0x2aff66, 3.4, -0.14, 0.8);
  lightDot(0xffffff, 0, 0.35, 3.1);

  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return { group, afterburner, canopy, flameMat, glowMat, gear };
}

export function buildPlaneModel() {
  const jet = buildJetModel({ dark: false, withGear: true, withMissiles: true });
  // Old interface main.js uses: prop = the spinning thing (afterburner),
  // bladeMat/discMat = the two materials setCameraMode toggles in cockpit.
  return { group: jet.group, prop: jet.afterburner, canopy: jet.canopy, bladeMat: jet.flameMat, discMat: jet.glowMat, afterburner: jet.afterburner, gear: jet.gear };
}

export function forwardVector(yaw, pitch) {
  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  );
}

export function createFlight() {
  const state = {
    pos: new THREE.Vector3(RUNWAY.x, RUNWAY.altitude + 2, RUNWAY.z),
    yaw: Math.PI + RUNWAY.heading, // take off toward ring 1 (north, -Z)
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    airborne: false, // true once the wheels have left the ground
    crashed: false,
    crashReason: '',
  };

  // True while the point sits on the airstrip (a little margin included):
  // touching down here is a landing or a roll, never a crash.
  function isOnRunwayStrip(x, z) {
    const dx = x - RUNWAY.x;
    const dz = z - RUNWAY.z;
    const along = dx * Math.sin(RUNWAY.heading) + dz * Math.cos(RUNWAY.heading);
    const across = dx * Math.cos(RUNWAY.heading) - dz * Math.sin(RUNWAY.heading);
    return Math.abs(along) < RUNWAY.length / 2 + 6 && Math.abs(across) < RUNWAY.width / 2 + 6;
  }

  function resetTo(x, y, z, yaw, speed = PLANE.cruiseSpeed) {
    state.pos.set(x, y, z);
    state.yaw = yaw;
    state.pitch = 0;
    state.roll = 0;
    state.speed = speed;
    state.throttle = 0.55;
    state.airborne = false;
    state.crashed = false;
    state.crashReason = '';
  }

  function update(dt, input) {
    if (state.crashed) return;
    // Throttle: Shift up, Ctrl down.
    if (input.throttleUp) state.throttle = clamp(state.throttle + 0.45 * dt, 0, 1);
    if (input.throttleDown) state.throttle = clamp(state.throttle - 0.45 * dt, 0, 1);
    const targetSpeed = PLANE.minSpeed + state.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
    state.speed += (targetSpeed - state.speed) * Math.min(1, 0.9 * dt);

    // Attitude: roll banks the plane, the bank turns it; pitch climbs/dives.
    state.roll += input.roll * PLANE.rollRate * dt;
    state.roll = clamp(state.roll, -1.15, 1.15);
    if (input.roll === 0) state.roll *= Math.max(0, 1 - 1.6 * dt);
    state.pitch += input.pitch * PLANE.pitchRate * dt;
    state.pitch = clamp(state.pitch, -0.55, 0.6);
    if (input.pitch === 0) state.pitch *= Math.max(0, 1 - 1.1 * dt);
    state.yaw += -state.roll * PLANE.turnRate * dt + input.yaw * 0.45 * dt;

    const fwd = forwardVector(state.yaw, state.pitch);
    state.pos.addScaledVector(fwd, state.speed * dt);

    const ground = Math.max(terrainHeight(state.pos.x, state.pos.z) + 1.1, 1.1);
    if (state.pos.y - ground > 4) state.airborne = true;
    // Stall sink: only while airborne. On the ground the plane rolls, it
    // never sinks into the runway while it is still building speed.
    if (state.airborne && state.speed < PLANE.minSpeed + 6) {
      state.pos.y -= (PLANE.minSpeed + 6 - state.speed) * 0.55 * dt;
    }
    // Keep the plane inside the world.
    state.pos.x = clamp(state.pos.x, -1150, 1150);
    state.pos.z = clamp(state.pos.z, -1150, 1150);
    state.pos.y = clamp(state.pos.y, 0.5, 420);

    // Touchdown / collision: the strip is always safe to touch; anywhere
    // else, hitting the ground while airborne is a crash. Rolling on rough
    // ground without ever getting airborne just follows the terrain.
    const groundNow = Math.max(terrainHeight(state.pos.x, state.pos.z) + 1.1, 1.1);
    if (state.pos.y <= groundNow) {
      if (isOnRunwayStrip(state.pos.x, state.pos.z) || !state.airborne) {
        state.pos.y = groundNow;
        state.airborne = false;
      } else {
        state.crashed = true;
        state.crashReason = state.pos.y <= 1.2 && terrainHeight(state.pos.x, state.pos.z) < 0 ? 'sea' : 'ground';
        state.pos.y = groundNow;
      }
    }
  }

  return { state, resetTo, update };
}
