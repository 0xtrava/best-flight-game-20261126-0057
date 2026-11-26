// MERIDIAN RUN — the stunt plane: model from primitives + arcade flight model.
// One clear job: how the plane looks and how it flies.

import * as THREE from 'three';
import { PLANE, RUNWAY, terrainHeight, clamp } from './config.js';

const CREAM = 0xf3e9d2;
const TEAL = 0x1f7a6d;
const ORANGE = 0xe86a1f;
const DARK = 0x2b2f36;

export function buildPlaneModel() {
  const group = new THREE.Group();
  const cream = new THREE.MeshPhongMaterial({ color: CREAM, shininess: 60, specular: 0x8a6a44 });
  const teal = new THREE.MeshPhongMaterial({ color: TEAL, shininess: 50, specular: 0x2a4a3a });
  const orange = new THREE.MeshPhongMaterial({ color: ORANGE, shininess: 70, specular: 0x993311 });
  const dark = new THREE.MeshPhongMaterial({ color: DARK, shininess: 30 });
  // The prop blades and disc fade to a blur in the cockpit view (see main.js).
  const bladeMat = new THREE.MeshPhongMaterial({ color: DARK, shininess: 30, transparent: true, opacity: 1 });
  const discMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.16, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhongMaterial({ color: 0x9fd8e8, shininess: 140, transparent: true, opacity: 0.85 });

  // Fuselage: a tapered cylinder along Z (nose at -Z), cream on top.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.5, 5.2, 14), cream);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  group.add(body);
  // Rounded orange nose cowl.
  const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.88, 14, 10), orange);
  cowl.scale.set(1, 1, 1.15);
  cowl.position.z = -2.55;
  cowl.castShadow = true;
  group.add(cowl);
  // Teal belly keel so the plane reads from below as well.
  const keel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 3.6), teal);
  keel.position.set(0, -0.72, 0.4);
  group.add(keel);
  // Orange cheatline stripe along the fuselage.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.24, 4.4), orange);
  stripe.position.set(0, 0.05, 0.2);
  group.add(stripe);
  // Canopy: a bigger glass bubble, with a cream fairing behind it.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.78, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(1, 0.8, 1.6);
  canopy.position.set(0, 0.5, -0.9);
  group.add(canopy);
  const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.9), cream);
  fairing.position.set(0, 0.62, 0.45);
  group.add(fairing);
  // Main wings: two cream halves with a slight dihedral, teal trailing-edge
  // stripe, orange tips with rounded caps — bright on top so the plane pops
  // against green land and blue sea from the chase camera.
  for (const side of [-1, 1]) {
    const half = new THREE.Mesh(new THREE.BoxGeometry(5.75, 0.2, 1.9), cream);
    half.position.set(side * 2.9, 0.28, 0.3);
    half.rotation.z = side * 0.09;
    half.castShadow = true;
    group.add(half);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(5.75, 0.22, 0.45), teal);
    edge.position.set(side * 2.9, 0.28, 1.02);
    edge.rotation.z = side * 0.09;
    group.add(edge);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 1.9), orange);
    tip.position.set(side * 5.3, 0.76, 0.3);
    tip.rotation.z = side * 0.09;
    group.add(tip);
    // Rounded wingtip: a half-disc cap at the outer edge.
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.22, 14, 1, false, side > 0 ? 0 : Math.PI, Math.PI),
      orange,
    );
    cap.position.set(side * 5.85, 0.8, 0.3);
    cap.rotation.z = side * 0.09;
    group.add(cap);
  }
  // Tail: cream stabilizer with orange tips, teal fin with an orange rudder.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.16, 1.1), cream);
  tail.position.set(0, 0.18, 2.4);
  group.add(tail);
  for (const side of [-1, 1]) {
    const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 1.1), orange);
    tailTip.position.set(side * 1.65, 0.18, 2.4);
    group.add(tailTip);
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 1.5), teal);
  fin.position.set(0, 0.85, 2.4);
  group.add(fin);
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 0.45), orange);
  rudder.position.set(0, 0.8, 3.05);
  group.add(rudder);
  // Propeller: orange spinner + three blades + a translucent spin disc so
  // the prop reads as a blur in flight and as a disc in the cockpit view.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 10), orange);
  hub.rotation.x = -Math.PI / 2;
  prop.add(hub);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.4, 0.08), bladeMat);
    blade.rotation.z = (i * Math.PI * 2) / 3;
    prop.add(blade);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.8, 28), discMat);
  disc.position.z = -0.05;
  prop.add(disc);
  prop.position.z = -4.25;
  group.add(prop);
  // Landing gear: two wheels on struts.
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), dark);
    strut.position.set(side * 0.85, -0.9, -0.4);
    group.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 0.85, -1.45, -0.4);
    group.add(wheel);
  }
  // Wing struts: thin braces from the lower fuselage to each wing.
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.1, 6), dark);
    strut.position.set(side * 1.45, -0.28, 0.3);
    strut.rotation.z = -side * 1.15;
    group.add(strut);
  }
  // Navigation lights: red left, green right, white tail.
  const light = (color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    group.add(m);
  };
  light(0xff2a2a, -5.8, -0.15, 0.3);
  light(0x2aff66, 5.8, -0.15, 0.3);
  light(0xffffff, 0, 0.2, 2.9);

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
