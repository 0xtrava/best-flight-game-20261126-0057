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

import * as THREE from 'three';
import { PLANE, RUNWAY, terrainHeight, clamp } from './config.js';

const GREY_TOP = 0x9aa2ab; // light grey camo, upper fuselage + wings
const GREY_BELLY = 0x5d646d; // darker grey belly + radome
const GREY_DARK = 0x3a4048; // enemy jets, fins, intakes
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
  const finMat = new THREE.MeshPhongMaterial({ color: dark ? 0x2c3138 : GREY_DARK, shininess: 50, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhongMaterial({ color: 0x101c26, shininess: 220, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
  const metal = new THREE.MeshPhongMaterial({ color: 0x2a2e33, shininess: 120, specular: 0x888888 });

  // Fuselage: a LATHE profile, jet-shaped — pointed nose, fat mid-body,
  // tapering tail. Same technique as the v6 Cessna (which finally stopped
  // reading as a tube), but the stations are a fighter's: narrow radome,
  // wide centre, thin tail. Nose at -Z, tail at +Z.
  const PROFILE = [
    [0.02, -3.60], // nose tip
    [0.18, -3.30],
    [0.34, -2.90], // radome
    [0.48, -2.40],
    [0.56, -1.80], // intakes
    [0.62, -1.00], // mid-body
    [0.62, -0.20],
    [0.58, 0.60],
    [0.50, 1.40],
    [0.42, 2.10],
    [0.34, 2.70], // tail
    [0.30, 2.95], // nozzle base
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
    m.castShadow = true;
    group.add(m);
    return m;
  };
  // Light-grey body, full profile, full circle.
  lathe(-3.60, 2.95, 0, 0, Math.PI * 2, top);
  // Darker belly: half-shell around the lower fuselage (camouflage split).
  lathe(-3.60, 2.95, 0.012, -Math.PI / 2, Math.PI, belly);
  // Dark radome: the pointed nose cone section.
  lathe(-3.60, -2.40, 0.014, 0, Math.PI * 2, belly);

  // Canopy: dark glass bubble on top, forward of mid-body. Hidden in the
  // cockpit view (main.js toggles canopy.visible), so the pilot sees out.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), glass);
  canopy.scale.set(0.72, 0.62, 2.1);
  canopy.position.set(0, 0.52, -1.15);
  canopy.castShadow = true;
  group.add(canopy);
  // Canopy frame: a thin dark rim under the bubble so it sits on the body.
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 18), metal);
  frame.scale.set(1, 1, 2.4);
  frame.rotation.x = Math.PI / 2;
  frame.position.set(0, 0.42, -1.15);
  group.add(frame);

  // Swept low wings: one extruded planform per side, slight anhedral.
  // Root chord 2.2 (z -0.9..+1.3), tip chord 0.9, swept back ~35°.
  for (const side of [-1, 1]) {
    const wing = sweptWing(3.1, -0.9, 1.3, 0.2, 1.1, 0.12, top);
    wing.scale.x = side;
    wing.position.set(0, -0.18, 0);
    wing.rotation.z = side * -0.04;
    group.add(wing);
    // Wingtip missile rail (player only, cosmetic on the enemy too if asked).
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.0), metal);
    rail.position.set(side * 3.05, -0.16, 0.6);
    group.add(rail);
  }
  // Tailplanes: smaller swept surfaces at the rear, slight anhedral.
  for (const side of [-1, 1]) {
    const stab = sweptWing(1.5, 1.7, 3.0, 2.3, 2.9, 0.1, top);
    stab.scale.x = side;
    stab.position.set(0, 0.08, 0);
    stab.rotation.z = side * -0.06;
    group.add(stab);
  }
  // Twin tail fins, canted outward ~12°, swept back. v8.1: smaller and
  // lighter — at full size (1.15 tall) in dark grey they read as giant
  // black sails dominating the silhouette in the hero shot.
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.85), new THREE.MeshPhongMaterial({ color: 0x4a5158, shininess: 50, side: THREE.DoubleSide }));
    fin.position.set(side * 0.4, 0.72, 2.35);
    fin.rotation.x = -0.35; // sweep back
    fin.rotation.z = -side * 0.2; // cant outward
    fin.castShadow = true;
    group.add(fin);
  }
  // Side intakes: dark rectangular scoops under the fuselage, forward.
  for (const side of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 1.1), finMat);
    intake.position.set(side * 0.55, -0.28, -1.35);
    group.add(intake);
  }

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
  nozzle.position.z = 3.05;
  afterburner.add(nozzle);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff7711, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  // v8.1: shorter, fatter, more saturated — the long thin cone read as a
  // pale paper triangle in the hero shot, washed out against the sky.
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.8, 12), flameMat);
  flame.rotation.x = Math.PI / 2; // tip points +Z (backward)
  flame.position.z = 3.95;
  afterburner.add(flame);
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 1.1, 10),
    new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  core.rotation.x = Math.PI / 2;
  core.position.z = 3.6;
  afterburner.add(core);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff9922, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), glowMat);
  glow.position.z = 3.32;
  afterburner.add(glow);
  const light = new THREE.PointLight(0xff7733, 3, 45, 2);
  light.position.set(0, 0, 3.6);
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
    gearLeg(0, -1.9);
    gearLeg(-0.75, 0.5);
    gearLeg(0.75, 0.5);
  }

  // Navigation lights: red left, green right, white tail.
  const lightDot = (color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    group.add(m);
  };
  lightDot(0xff2a2a, -3.1, -0.14, 0.6);
  lightDot(0x2aff66, 3.1, -0.14, 0.6);
  lightDot(0xffffff, 0, 0.35, 2.95);

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
