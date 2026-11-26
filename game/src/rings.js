// MERIDIAN RUN — the ring course: visuals, pass detection, score, landing.
// One clear job: everything about the 12 rings and finishing the run.

import * as THREE from 'three';
import { RINGS, RING_RADIUS, RUNWAY } from './config.js';

export function createCourse(scene) {
  const group = new THREE.Group();
  const rings = RINGS.map((r, i) => {
    const prev = i === 0 ? { x: RUNWAY.x, y: RUNWAY.altitude + 8, z: RUNWAY.z } : RINGS[i - 1];
    const next = i === RINGS.length - 1 ? { x: RUNWAY.x, y: RUNWAY.altitude + 8, z: RUNWAY.z } : RINGS[i + 1];
    // The ring faces the pilot flying in from the previous ring.
    const normal = new THREE.Vector3(r.x - prev.x, r.y - prev.y, r.z - prev.z).normalize();
    const toNext = new THREE.Vector3(next.x - r.x, next.y - r.y, next.z - r.z).normalize();

    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 0.85, 12, 48),
      new THREE.MeshBasicMaterial({ color: 0x2ec4b6, transparent: true, opacity: 0.9 }),
    );
    torus.position.set(r.x, r.y, r.z);
    torus.lookAt(r.x + normal.x, r.y + normal.y, r.z + normal.z);
    group.add(torus);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(RING_RADIUS - 1, 40),
      new THREE.MeshBasicMaterial({ color: 0x2ec4b6, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
    );
    disc.position.copy(torus.position);
    disc.quaternion.copy(torus.quaternion);
    group.add(disc);

    // A light beam above the ring so the course reads from far away.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.6, 90, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    beam.position.set(r.x, r.y + 45, r.z);
    group.add(beam);

    return {
      index: i,
      center: new THREE.Vector3(r.x, r.y, r.z),
      normal,
      toNext,
      torus,
      disc,
      beam,
      passed: false,
      scored: 0,
    };
  });

  // A faint dotted line through the course so the route reads from the air.
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(RUNWAY.x, RUNWAY.altitude + 8, RUNWAY.z),
    ...rings.map((r) => r.center),
    new THREE.Vector3(RUNWAY.x, RUNWAY.altitude + 8, RUNWAY.z),
  ]);
  const line = new THREE.Line(
    lineGeo,
    new THREE.LineDashedMaterial({ color: 0xffd27a, dashSize: 14, gapSize: 10, transparent: true, opacity: 0.45 }),
  );
  line.computeLineDistances();
  group.add(line);
  scene.add(group);

  const state = {
    passedCount: 0,
    score: 0,
    nextIndex: 0,
    landed: false,
    finished: false,
    prevSide: 1,
  };

  function nextRing() {
    return state.nextIndex < rings.length ? rings[state.nextIndex] : null;
  }

  function setRingLook(ring, kind) {
    const colors = { next: 0xff9a1f, future: 0x2ec4b6, done: 0x37d67a };
    const opacities = { next: 1, future: 0.55, done: 0.35 };
    ring.torus.material.color.setHex(colors[kind]);
    ring.torus.material.opacity = opacities[kind];
    ring.disc.material.color.setHex(colors[kind]);
    ring.disc.material.opacity = kind === 'next' ? 0.14 : 0.06;
    ring.beam.material.opacity = kind === 'next' ? 0.07 : 0;
  }

  function refreshLooks() {
    rings.forEach((ring, i) => {
      setRingLook(ring, i < state.nextIndex ? 'done' : i === state.nextIndex ? 'next' : 'future');
    });
  }
  refreshLooks();

  // Where the plane respawns after a crash: just past the last passed ring.
  function checkpoint() {
    if (state.nextIndex === 0) {
      return { x: RUNWAY.x, y: RUNWAY.altitude + 10, z: RUNWAY.z, yaw: Math.PI + RUNWAY.heading };
    }
    const ring = rings[state.nextIndex - 1];
    const p = ring.center.clone().addScaledVector(ring.toNext, 40);
    const yaw = Math.atan2(ring.toNext.x, ring.toNext.z);
    return { x: p.x, y: p.y, z: p.z, yaw };
  }

  function update(dt, t, planePos) {
    // Pulse the next ring.
    const ring = nextRing();
    if (ring) {
      const s = 1 + Math.sin(t * 3.2) * 0.045;
      ring.torus.scale.setScalar(s);
      const dist = planePos.distanceTo(ring.center);
      const side = Math.sign(planePos.clone().sub(ring.center).dot(ring.normal)) || 1;
      if (state.prevSide !== 0 && side !== state.prevSide && dist < RING_RADIUS + 8) {
        const center = dist < RING_RADIUS - 3;
        ring.passed = true;
        ring.scored = center ? 500 : 200;
        state.score += ring.scored;
        state.passedCount++;
        state.nextIndex++;
        refreshLooks();
        state.prevSide = side;
        return { event: center ? 'ring-center' : 'ring-near', ring, points: ring.scored };
      }
      state.prevSide = side;
    }
    return null;
  }

  // Landing: all rings done, plane settled on the runway strip, slow.
  function checkLanding(planeState) {
    if (state.nextIndex < rings.length || state.landed) return false;
    const dx = planeState.pos.x - RUNWAY.x;
    const dz = planeState.pos.z - RUNWAY.z;
    const along = dx * Math.sin(RUNWAY.heading) + dz * Math.cos(RUNWAY.heading);
    const across = dx * Math.cos(RUNWAY.heading) - dz * Math.sin(RUNWAY.heading);
    const low = planeState.pos.y - RUNWAY.altitude < 3.5;
    const slow = planeState.speed < 48;
    if (Math.abs(along) < RUNWAY.length / 2 + 8 && Math.abs(across) < RUNWAY.width / 2 + 8 && low && slow) {
      state.landed = true;
      state.finished = true;
      return true;
    }
    return false;
  }

  function landingBonus(elapsedSeconds) {
    const timeBonus = Math.max(0, Math.round((540 - elapsedSeconds) * 5));
    return 1000 + timeBonus;
  }

  return {
    rings,
    state,
    group,
    nextRing,
    checkpoint,
    update,
    checkLanding,
    landingBonus,
    refreshLooks,
    reset() {
      state.passedCount = 0;
      state.score = 0;
      state.nextIndex = 0;
      state.landed = false;
      state.finished = false;
      state.prevSide = 1;
      for (const r of rings) {
        r.passed = false;
        r.scored = 0;
      }
      refreshLooks();
    },
  };
}
