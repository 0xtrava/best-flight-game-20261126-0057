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
    G.flight.resetTo(RUNWAY.x, RUNWAY.altitude + 2, RUNWAY.z, RUNWAY.heading, 0);
    G.flight.state.throttle = 0;
    G.flight.state.speed = 0;
    G.setState('menu');
    G.setCameraMode('orbit');
    G.setOrbitAngle(-0.6); // from the south-west, looking north-east ALONG
    // the runway: a front-left 3/4 view — nose, prop, canopy and the
    // maroon belly face the camera, the runway runs away to the northern
    // sea, the town climbs the eastern hillside and the sunset glows
    // ahead. (Looking east into the hillside fills the frame with dark
    // slope; looking along the strip opens it up.)
    G.setOrbitRadius(14);
    document.body.classList.add('shot-frame');
    G.hud.showMenu(0);
    return true;
  }
  if (name === 'play') {
    // Early course: one ring banked through, flying east-north-east at ring
    // 2 — green coast and open sea below, the low sun ~30 degrees to the
    // RIGHT of the flight path so it warms the frame edge and lights the
    // plane without washing the ring out (v2 flew straight into the sun;
    // the ring-3 leg flew over a brown rocky peak). Gentler bank (0.3) so
    // the fuselage, windows and cheatline stay visible beside the wing.
    const ring = G.course.rings[1];
    const prev = G.course.rings[0];
    const dir = new THREE.Vector3().subVectors(ring.center, prev.center).normalize();
    const p = ring.center.clone().addScaledVector(dir, -70);
    G.course.state.nextIndex = 1;
    G.course.state.passedCount = 1;
    G.course.state.score = 500;
    for (let i = 0; i < 1; i++) G.course.rings[i].passed = true;
    G.course.refreshLooks();
    G.flight.resetTo(p.x, p.y + 6, p.z, Math.atan2(dir.x, dir.z), 66);
    G.flight.state.roll = 0.3;
    G.flight.state.pitch = -0.06;
    G.flight.state.throttle = 0.7;
    G.setElapsed(75);
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
    G.flight.resetTo(RUNWAY.x, RUNWAY.altitude + 2, RUNWAY.z, RUNWAY.heading, 0);
    G.flight.state.throttle = 0;
    G.flight.state.speed = 0;
    G.course.state.nextIndex = 12;
    G.course.state.passedCount = 12;
    G.course.state.score = 9840; // synced with the results card total
    G.course.rings.forEach((r) => {
      r.passed = true;
    });
    G.course.refreshLooks();
    G.setElapsed(522);
    G.setState('results');
    G.setCameraMode('orbit');
    G.setOrbitAngle(-0.6);
    G.setOrbitRadius(13);
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
