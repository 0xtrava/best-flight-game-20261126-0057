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
  const cream = new THREE.MeshLambertMaterial({ color: CREAM });
  const teal = new THREE.MeshLambertMaterial({ color: TEAL });
  const orange = new THREE.MeshLambertMaterial({ color: ORANGE });
  const dark = new THREE.MeshLambertMaterial({ color: DARK });
  const glass = new THREE.MeshPhongMaterial({ color: 0x9fd8e8, shininess: 120, transparent: true, opacity: 0.85 });

  // Fuselage: a tapered cylinder along Z (nose at -Z).
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.55, 5.2, 12), cream);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 12), orange);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.4;
  nose.castShadow = true;
  group.add(nose);
  // Orange stripe along the fuselage.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.22, 4.6), orange);
  stripe.position.set(0, -0.1, 0.1);
  group.add(stripe);
  // Canopy: a teal-tinted glass bubble.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(1, 0.75, 1.5);
  canopy.position.set(0, 0.55, -0.9);
  group.add(canopy);
  // Main wings with orange tips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.22, 1.9), teal);
  wing.position.set(0, -0.15, 0.3);
  wing.castShadow = true;
  group.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 1.9), orange);
    tip.position.set(side * 5.25, -0.15, 0.3);
    group.add(tip);
  }
  // Tail: horizontal stabilizer + vertical fin.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.18, 1.2), teal);
  tail.position.set(0, 0.15, 2.4);
  group.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 1.4), orange);
  fin.position.set(0, 0.8, 2.4);
  group.add(fin);
  // Propeller: hub + two blades, spins around the forward axis.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 10), dark);
  hub.rotation.x = -Math.PI / 2;
  prop.add(hub);
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.4, 0.08), dark);
    blade.rotation.z = angle;
    prop.add(blade);
  }
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
  return { group, prop };
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
    crashed: false,
    crashReason: '',
  };

  function resetTo(x, y, z, yaw, speed = PLANE.cruiseSpeed) {
    state.pos.set(x, y, z);
    state.yaw = yaw;
    state.pitch = 0;
    state.roll = 0;
    state.speed = speed;
    state.throttle = 0.55;
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
    // Stall sink: slow flight loses altitude.
    if (state.speed < PLANE.minSpeed + 6) {
      state.pos.y -= (PLANE.minSpeed + 6 - state.speed) * 0.55 * dt;
    }
    // Keep the plane inside the world.
    state.pos.x = clamp(state.pos.x, -1150, 1150);
    state.pos.z = clamp(state.pos.z, -1150, 1150);
    state.pos.y = clamp(state.pos.y, 0.5, 420);

    // Collision: terrain or sea.
    const ground = Math.max(terrainHeight(state.pos.x, state.pos.z) + 1.1, 1.1);
    if (state.pos.y <= ground) {
      state.crashed = true;
      state.crashReason = state.pos.y <= 1.2 && terrainHeight(state.pos.x, state.pos.z) < 0 ? 'sea' : 'ground';
      state.pos.y = ground;
    }
  }

  return { state, resetTo, update };
}
