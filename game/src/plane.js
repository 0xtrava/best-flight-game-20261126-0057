// MERIDIAN RUN — the stunt plane: model from primitives + arcade flight model.
// One clear job: how the plane looks and how it flies.

import * as THREE from 'three';
import { PLANE, RUNWAY, terrainHeight, clamp } from './config.js';

// Cessna 172-style high-wing, built to match the user's reference photo
// literally: white upper fuselage, maroon belly + cheatline, grey tail.
const WHITE = 0xf5f2ea;
const MAROON = 0x8e2f2a;
const GREY = 0x8a8f94;
const DARK = 0x16181c;

export function buildPlaneModel() {
  const group = new THREE.Group();
  // Slightly warmer/darker white + stronger specular: the flat 0xf5f2ea
  // read as a featureless white slab under ACES. The sheen along the
  // fuselage curve now gives the body a 3D read (v5).
  const white = new THREE.MeshPhongMaterial({ color: 0xeee7d6, shininess: 110, specular: 0xb09a72 });
  const maroon = new THREE.MeshPhongMaterial({ color: MAROON, shininess: 70, specular: 0x662222 });
  const grey = new THREE.MeshPhongMaterial({ color: GREY, shininess: 40, specular: 0x555555 });
  const dark = new THREE.MeshPhongMaterial({ color: DARK, shininess: 30 });
  // The prop blades and disc fade to a blur in the cockpit view (see main.js).
  const bladeMat = new THREE.MeshPhongMaterial({ color: DARK, shininess: 30, transparent: true, opacity: 1 });
  const discMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.04, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhongMaterial({ color: 0x18242e, shininess: 180, transparent: true, opacity: 0.92 });

  // Fuselage: long tapered cylinder along Z (nose at -Z), fat at the nose.
  // CylinderGeometry's radiusTop lands at +Z after the X-rotation, so the
  // small radius goes first: thin tail, fat nose. 24 segments (was 16):
  // the rounder cross-section catches the sun as a gradient, not a facet.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.62, 5.4, 24), white);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  group.add(body);
  // Maroon belly: a half-shell wrapped around the lower fuselage, so the
  // two-tone split reads from the side exactly like the reference photo.
  // (Local -Z maps to world -Y after the X-rotation, so theta in
  // [-PI/2, PI/2] is the bottom half.)
  const bellyMat = new THREE.MeshPhongMaterial({ color: MAROON, shininess: 70, specular: 0x662222, side: THREE.DoubleSide });
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.63, 5.0, 24, 1, true, -Math.PI / 2, Math.PI), bellyMat);
  belly.rotation.x = Math.PI / 2;
  belly.position.z = 0.1;
  group.add(belly);
  // Rounded white nose cowl.
  const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.64, 24, 18), white);
  cowl.scale.set(1, 0.85, 1.15);
  cowl.position.z = -2.55;
  cowl.castShadow = true;
  group.add(cowl);
  // Maroon cheatline stripe along each fuselage side at window level: thin
  // shell bands that hug the taper (a straight box would ridge at the tail).
  // Band covers world y in [-0.08, +0.28]; theta ranges pick out the sides.
  for (const thetaStart of [1.41, 4.11]) {
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.57, 3.0, 24, 1, true, thetaStart, 0.76),
      bellyMat,
    );
    stripe.rotation.x = Math.PI / 2;
    stripe.position.z = 0.2;
    group.add(stripe);
  }
  // Cabin: the boxy Cessna cabin with big dark windows, sitting above the
  // fuselage line under the high wing.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.8, 1.7), white);
  cabin.position.set(0, 0.42, -0.35);
  cabin.castShadow = true;
  group.add(cabin);
  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.08, 1.7), white);
  cabinRoof.position.set(0, 0.86, -0.35);
  group.add(cabinRoof);
  // Big dark side windows — the Cessna signature. Larger in v5 (taller +
  // longer, plus a small rear window each side) so the glass reads as real
  // windows from the hero angle instead of thin dark slits.
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.62, 1.35), glass);
    win.position.set(side * 0.58, 0.5, -0.35);
    group.add(win);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.7), glass);
    rear.position.set(side * 0.58, 0.48, 0.55);
    group.add(rear);
  }
  // Windshield: sloped dark glass at the front of the cabin (bottom forward,
  // top raked back toward the roof). Hidden in the cockpit view (main.js
  // toggles canopy.visible), so the pilot sees out.
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 0.06), glass);
  canopy.position.set(0, 0.55, -1.18);
  canopy.rotation.x = 0.45;
  group.add(canopy);
  // High wing: ONE straight wing on top of the cabin (Cessna style), slight
  // dihedral, white with maroon tips — the single most recognisable part of
  // the reference plane. Two halves so the dihedral reads cleanly.
  for (const side of [-1, 1]) {
    const half = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.2, 1.9), white);
    half.position.set(side * 2.85, 1.02, -0.3);
    half.rotation.z = side * 0.06;
    half.castShadow = true;
    group.add(half);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.22, 1.9), maroon);
    tip.position.set(side * 5.35, 1.17, -0.3);
    tip.rotation.z = side * 0.06;
    group.add(tip);
    // Rounded wingtip: a half-disc cap at the outer edge.
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.22, 14, 1, false, side > 0 ? 0 : Math.PI, Math.PI),
      maroon,
    );
    cap.position.set(side * 5.85, 1.2, -0.3);
    cap.rotation.z = side * 0.06;
    group.add(cap);
    // Wing strut: the diagonal brace from the lower fuselage to the wing —
    // the Cessna signature. Lower end on the fuselage side, upper end under
    // the wing at about 40% span. Thicker in v5 (0.09) so it reads in shots.
    const strutLen = Math.hypot(1.75, 1.25);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, strutLen, 6), white);
    strut.position.set(side * 1.32, 0.28, -0.3);
    strut.rotation.z = -side * Math.atan2(1.75, 1.25);
    group.add(strut);
  }
  // Tail: grey like the photo — a swept vertical fin with a dorsal extension
  // and a grey horizontal stabilizer with maroon tips.
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 1.3), grey);
  fin.position.set(0, 0.85, 2.55);
  fin.rotation.x = -0.18;
  group.add(fin);
  const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 1.2), grey);
  dorsal.position.set(0, 0.42, 1.85);
  dorsal.rotation.x = -0.18;
  group.add(dorsal);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.14, 1.0), grey);
  tail.position.set(0, 0.32, 2.55);
  group.add(tail);
  for (const side of [-1, 1]) {
    const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 1.0), maroon);
    tailTip.position.set(side * 1.5, 0.32, 2.55);
    group.add(tailTip);
  }
  // Propeller: dark spinner + TWO black blades (like the photo) + a
  // translucent spin disc so the prop reads as a blur in flight.
  // Bigger spinner cone in v5 so the nose has a visible centre.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 12), dark);
  hub.rotation.x = -Math.PI / 2;
  prop.add(hub);
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.30, 3.4, 0.07), bladeMat);
    blade.rotation.z = i * Math.PI;
    prop.add(blade);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.75, 28), discMat);
  disc.position.z = -0.05;
  prop.add(disc);
  prop.position.z = -3.35;
  group.add(prop);
  // Landing gear: fixed TRICYCLE gear like the photo — nose wheel plus two
  // mains, each with a white wheel fairing (spat) the tyre peeks out of.
  const gearLeg = (x, z, wheelY) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.95, 6), dark);
    strut.position.set(x, -0.95, z);
    group.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, wheelY, z);
    group.add(wheel);
    const spat = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), white);
    spat.scale.set(0.8, 1.15, 1.5);
    spat.position.set(x, wheelY + 0.28, z);
    group.add(spat);
  };
  gearLeg(0, -1.9, -1.38);
  gearLeg(-0.8, 0.35, -1.42);
  gearLeg(0.8, 0.35, -1.42);
  // Navigation lights: red left, green right, white tail.
  const light = (color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    group.add(m);
  };
  light(0xff2a2a, -5.85, 1.18, -0.3);
  light(0x2aff66, 5.85, 1.18, -0.3);
  light(0xffffff, 0, 0.35, 2.95);
  // Landing lights: bright lenses under the wing leading edge — they catch
  // the eye in the hero shot and sell "real plane" at a glance (v5).
  const lensMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (const side of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), lensMat);
    lens.scale.set(1, 0.7, 1.4);
    lens.position.set(side * 2.2, 0.9, -1.28);
    group.add(lens);
  }

  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return { group, prop, canopy, bladeMat, discMat };
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
