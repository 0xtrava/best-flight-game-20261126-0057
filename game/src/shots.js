// MERIDIAN RUN — deterministic screenshot states (?shot=start|play|cockpit|end).
// One clear job: stage the exact scene each screenshot shows, every time.

import * as THREE from 'three';
import { RUNWAY, RINGS } from './config.js';

export function parseShot() {
  const q = new URLSearchParams(window.location.search);
  return {
    name: q.get('shot') || '',
    seed: Number(q.get('seed') || '1'),
  };
}

// G is the game context from main.js:
//   flight, course, hud, setState, setCameraMode, setElapsed, setStagedScore,
//   camera, placeChaseCamera(), placeCockpitCamera(), placeOrbitCamera()
export function stageShot(name, G) {
  const F = G.flight.state;
  if (name === 'start') {
    G.flight.resetTo(RUNWAY.x, RUNWAY.altitude + 2, RUNWAY.z, Math.PI + RUNWAY.heading, 0);
    G.flight.state.throttle = 0;
    G.flight.state.speed = 0;
    G.setState('menu');
    G.setCameraMode('orbit');
    G.setOrbitAngle(2.5); // from the north-east: the sun lights the plane's nose
    document.body.classList.add('shot-frame');
    G.hud.showMenu(0);
    return true;
  }
  if (name === 'play') {
    // Mid-course: two rings banked through, diving at ring 3 over the islands.
    const ring = G.course.rings[2];
    const prev = G.course.rings[1];
    const dir = new THREE.Vector3().subVectors(ring.center, prev.center).normalize();
    const p = ring.center.clone().addScaledVector(dir, -70);
    G.course.state.nextIndex = 2;
    G.course.state.passedCount = 2;
    G.course.state.score = 1000;
    G.course.rings[0].passed = true;
    G.course.rings[1].passed = true;
    G.course.refreshLooks();
    G.flight.resetTo(p.x, p.y + 6, p.z, Math.atan2(dir.x, dir.z), 66);
    G.flight.state.roll = 0.55;
    G.flight.state.pitch = -0.08;
    G.flight.state.throttle = 0.72;
    G.setElapsed(95);
    G.setState('flying');
    G.setCameraMode('chase');
    G.hud.hideMenu();
    return true;
  }
  if (name === 'cockpit') {
    // Final approach: high enough to see the strip over the island's rise,
    // offset west so the runway is dead ahead and the town stays to the left.
    const along = new THREE.Vector3(Math.sin(RUNWAY.heading), 0, Math.cos(RUNWAY.heading));
    const p = new THREE.Vector3(RUNWAY.x - 60, RUNWAY.altitude + 70, RUNWAY.z).addScaledVector(along, -300);
    G.flight.resetTo(p.x, p.y, p.z, RUNWAY.heading, 52);
    G.flight.state.throttle = 0.42;
    G.flight.state.pitch = -0.1;
    G.course.state.nextIndex = 12;
    G.course.state.passedCount = 12;
    G.course.state.score = 6400;
    G.course.rings.forEach((r) => {
      r.passed = true;
    });
    G.course.refreshLooks();
    G.setElapsed(502);
    G.setState('flying');
    G.setCameraMode('cockpit');
    G.hud.hideMenu();
    G.hud.setCockpit(true);
    return true;
  }
  if (name === 'end') {
    // Landed at sunset: plane on the runway, results screen up.
    G.flight.resetTo(RUNWAY.x, RUNWAY.altitude + 2, RUNWAY.z, Math.PI + RUNWAY.heading, 0);
    G.flight.state.throttle = 0;
    G.flight.state.speed = 0;
    G.course.state.nextIndex = 12;
    G.course.state.passedCount = 12;
    G.course.state.score = 8420;
    G.course.rings.forEach((r) => {
      r.passed = true;
    });
    G.course.refreshLooks();
    G.setElapsed(522);
    G.setState('results');
    G.setCameraMode('orbit');
    G.setOrbitAngle(2.5);
    document.body.classList.add('shot-frame');
    // Landed: no next ring to point at.
    document.getElementById('chevron').style.display = 'none';
    document.getElementById('target-box').style.display = 'none';
    G.hud.hideMenu();
    G.hud.showResults({
      score: 9840,
      rings: 12,
      totalRings: 12,
      seconds: 522,
      landingBonus: 1420,
      best: 9840,
      isBest: true,
    });
    return true;
  }
  return false;
}
