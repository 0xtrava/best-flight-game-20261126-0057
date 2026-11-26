// MERIDIAN RUN — boot, state machine, cameras, game loop.
// One clear job: wire the world, plane, course, HUD and sound into a game.

import * as THREE from 'three';
import { RUNWAY, RINGS, PLANE, clamp } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildWorld } from './world.js';
import { buildPlaneModel, createFlight, forwardVector } from './plane.js';
import { createCourse } from './rings.js';
import { createHud } from './hud.js';
import { parseShot, stageShot } from './shots.js';

const BEST_KEY = 'meridian-run-best';

function bestScore() {
  try {
    return Number(window.localStorage.getItem(BEST_KEY) || '0') || 0;
  } catch {
    return 0;
  }
}
function saveBest(score) {
  try {
    window.localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Private mode: best score just lives for the session.
  }
}

function main() {
  const params = parseShot();
  const seed = params.seed || 1;

  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('scene') });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1; // v5: a touch brighter for contrast

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 6000);

  const world = buildWorld(scene, seed);
  const plane = buildPlaneModel();
  scene.add(plane.group);
  const flight = createFlight();
  const course = createCourse(scene);
  const hud = createHud();
  const input = createInput();
  const audio = createAudio();

  let gameState = 'menu'; // menu | flying | paused | crashed | results
  let cameraMode = 'chase'; // chase | cockpit | orbit
  let elapsed = 0;
  let crashTimer = 0;
  let frozen = false; // a staged ?shot= holds the plane still for the camera
  let orbitAngle = 0.6;
  let orbitRadius = 34;
  let resultShown = false;

  const api = {
    flight,
    course,
    hud,
    camera,
    RINGS,
    RUNWAY,
    startFlight,
    get state() {
      return gameState;
    },
    get cameraMode() {
      return cameraMode;
    },
    getState() {
      return gameState;
    },
    getCameraMode() {
      return cameraMode;
    },
    getBest() {
      return bestScore();
    },
    getElapsed() {
      return elapsed;
    },
    setState(s) {
      gameState = s;
    },
    setCameraMode(m) {
      cameraMode = m;
      hud.setCockpit(m === 'cockpit');
      plane.canopy.visible = m !== 'cockpit';
      // Cockpit: the whole prop stays HIDDEN. A faint prop blur was tried
      // in v4 — but a 3.4 m blade 2.25 m from the camera subtends ~74°,
      // so even at 0.15 opacity it reads as a dark diagonal band across
      // the frame (the v2 slab, back again). The nose cowl at the bottom
      // of the frame is the aircraft cue; the prop blur is not worth the
      // slab. Chase view keeps the full prop + disc.
      plane.prop.visible = m !== 'cockpit';
      plane.bladeMat.opacity = m === 'cockpit' ? 0 : 1;
      // Chase/hero disc reads as a spinning prop blur at 0.14 (was 0.04,
      // nearly invisible in the cover). Cockpit stays 0 — the prop is
      // hidden there entirely, the slab lesson from v2/v4.
      plane.discMat.opacity = m === 'cockpit' ? 0 : 0.14;
    },
    setOrbitAngle(a) {
      orbitAngle = a;
    },
    setOrbitRadius(r) {
      orbitRadius = r;
    },
    setElapsed(s) {
      elapsed = s;
    },
    placeChaseCamera() {
      updateChaseCamera(1);
    },
    placeHeroCamera() {
      updateHeroCamera();
    },
    placeCockpitCamera() {
      updateCockpitCamera();
    },
    placeOrbitCamera() {
      updateOrbitCamera(0);
    },
  };

  function startFlight() {
    course.reset();
    flight.resetTo(RUNWAY.x, RUNWAY.altitude + 2, RUNWAY.z, Math.PI + RUNWAY.heading, 0);
    flight.state.throttle = 0.55;
    elapsed = 0;
    resultShown = false;
    gameState = 'flying';
    cameraMode = 'chase';
    hud.setCockpit(false);
    hud.hideMenu();
    hud.hideResults();
    hud.showToast('Take off — fly through the rings!', 2200);
    audio.unlock();
  }

  function finishFlight() {
    const bonus = course.landingBonus(elapsed);
    const total = course.state.score + bonus;
    course.state.score = total;
    hud.update(flight.state, course, elapsed, cameraMode, 'results'); // HUD score = final total, incl. landing bonus.
    const best = bestScore();
    const isBest = total > best;
    if (isBest) saveBest(total);
    gameState = 'results';
    resultShown = true;
    audio.land();
    hud.showResults({
      score: total,
      rings: course.state.passedCount,
      totalRings: 12,
      seconds: elapsed,
      landingBonus: bonus,
      best: Math.max(best, total),
      isBest,
    });
  }

  function respawn() {
    const cp = course.checkpoint();
    flight.resetTo(cp.x, cp.y, cp.z, cp.yaw, PLANE.cruiseSpeed);
    gameState = 'flying';
    hud.showToast('Back in the air — next ring!', 1500);
  }

  function updateChaseCamera(dt) {
    const fwd = forwardVector(flight.state.yaw, flight.state.pitch);
    const desired = flight.state.pos.clone().addScaledVector(fwd, -10.5).add(new THREE.Vector3(0, 3.4, 0));
    const k = 1 - Math.exp(-5.5 * dt);
    camera.position.lerp(desired, k);
    const look = flight.state.pos.clone().addScaledVector(fwd, 30).add(new THREE.Vector3(0, 1.0, 0));
    camera.lookAt(look);
  }

  // Hero camera (v5 front-left 3/4, RESTORED): nose, spinner, prop blur,
  // cabin windows and cheatline all visible, plane big in frame. A v6
  // rear-left 3/4 was tried so the ring could share the frame — the ring
  // DID appear, but from behind the banked plane reads as a red blob with
  // a giant white wing-bar and the tail clips the frame edge. The ring
  // cannot share the frame with a big plane from any rear angle, and the
  // front hero is the shot that sells the plane — the HUD carries the
  // ring info ("RING 2 / 70 m" + chevron). Never used in live play.
  function updateHeroCamera() {
    const fwd = forwardVector(flight.state.yaw, flight.state.pitch);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const pos = flight.state.pos.clone()
      .addScaledVector(fwd, 10)
      .addScaledVector(right, -13)
      .addScaledVector(up, 3);
    camera.position.copy(pos);
    // Look just ahead of the plane, not 16 m out: the look target sets
    // the frame centre, and a far target pushes the plane itself off the
    // frame edge (52° off-axis).
    // v5.1 sat too close to the wing (5 m): the near wing filled the
    // frame as a flat maroon slab. Pulled back + more to the front, so
    // the wing reads as a wing and the nose + windows carry the shot.
    const look = flight.state.pos.clone().addScaledVector(fwd, 6).addScaledVector(up, 2);
    camera.lookAt(look);
  }

  function updateCockpitCamera() {
    // Sit just behind the nose, above the cowl: the white nose + maroon
    // belly read at the bottom of the frame (v3 sat ahead of the wing and
    // the shot had no aircraft in it at all), the runway stays dead ahead,
    // and the prop is a faint blur 2 m out instead of a slab at 1 m.
    const fwd = forwardVector(flight.state.yaw, flight.state.pitch);
    const up = new THREE.Vector3(0, 1, 0);
    const pos = flight.state.pos.clone().addScaledVector(up, 1.12).addScaledVector(fwd, 1.1);
    camera.position.copy(pos);
    const look = flight.state.pos.clone().addScaledVector(fwd, 120).addScaledVector(up, -5);
    // Roll the horizon with the plane: tilt the camera up vector.
    camera.up.set(Math.sin(-flight.state.roll), Math.cos(flight.state.roll), 0);
    camera.lookAt(look);
  }

  function updateOrbitCamera(dt) {
    orbitAngle += dt * 0.07;
    const r = orbitRadius;
    const target = flight.state.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    camera.position.set(
      target.x + Math.sin(orbitAngle) * r,
      target.y + r * 0.5, // high enough that the horizon and sky stay in
      target.z + Math.cos(orbitAngle) * r, // frame instead of only the slope
    );
    camera.lookAt(target);
  }

  // ---- staged screenshots -------------------------------------------------
  let staged = false;
  if (params.name) {
    staged = stageShot(params.name, api);
    if (staged) {
      frozen = true;
      if (params.name === 'play') updateHeroCamera();
      if (params.name === 'cockpit') updateCockpitCamera();
      if (params.name === 'start' || params.name === 'end') updateOrbitCamera(0);
      hud.update(flight.state, course, elapsed, cameraMode, gameState);
    }
  }
  if (!staged) hud.showMenu(bestScore());

  // ---- input ---------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    audio.unlock();
    if (e.key === 'Enter') {
      if (gameState === 'menu' || gameState === 'results') startFlight();
    } else if (e.key.toLowerCase() === 'p') {
      if (gameState === 'flying') {
        gameState = 'paused';
        hud.showPause(true);
      } else if (gameState === 'paused') {
        gameState = 'flying';
        hud.showPause(false);
      }
    } else if (e.key.toLowerCase() === 'm') {
      audio.toggleMute();
    } else if (e.key.toLowerCase() === 'c') {
      if (gameState === 'flying') {
        cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
        hud.setCockpit(cameraMode === 'cockpit');
      }
    }
  });
  window.addEventListener('pointerdown', () => {
    audio.unlock();
    if (gameState === 'menu' || gameState === 'results') startFlight();
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---- loop -----------------------------------------------------------------
  const clock = new THREE.Clock();
  let firstFrame = true;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const mouse = input.poll();

    if (!frozen) {
      if (gameState === 'flying') {
        elapsed += dt;
        flight.update(dt, input.state);
        const event = course.update(dt, t, flight.state.pos);
        if (event) {
          audio.ring(event.event === 'ring-center');
          hud.showToast(
            event.event === 'ring-center' ? `RING! +${event.points}` : `Near miss +${event.points}`,
            1300,
          );
        }
        if (flight.state.crashed) {
          gameState = 'crashed';
          crashTimer = 1.5;
          audio.crash();
          hud.showToast(flight.state.crashReason === 'sea' ? 'Splash! Respawning…' : 'Crash! Respawning…', 1500);
        } else if (course.checkLanding(flight.state)) {
          finishFlight();
        }
        audio.update(flight.state.throttle, flight.state.speed / PLANE.maxSpeed, true);
      } else if (gameState === 'crashed') {
        crashTimer -= dt;
        if (crashTimer <= 0) respawn();
      } else {
        audio.update(0, 0, false);
      }
      // Mouse look: drag to peek around while flying (optional, subtle).
      if (gameState === 'flying' && mouse.mouseDX !== 0) {
        orbitAngle += mouse.mouseDX * 0.0004;
      }
    }

    // Plane mesh follows the flight state.
    plane.group.position.copy(flight.state.pos);
    plane.group.rotation.set(flight.state.pitch, flight.state.yaw + Math.PI, -flight.state.roll, 'YXZ');
    plane.prop.rotation.z -= flight.state.speed * dt * 0.85 + (gameState === 'menu' ? 0.12 : 0);

    // Cameras.
    if (gameState === 'menu' || gameState === 'results') updateOrbitCamera(frozen ? 0 : dt);
    else if (cameraMode === 'cockpit') updateCockpitCamera();
    else if (cameraMode === 'hero') updateHeroCamera();
    else updateChaseCamera(frozen ? 1 : dt);

    world.update(dt, t, flight.state.pos);
    if (gameState === 'flying' || frozen) hud.update(flight.state, course, elapsed, cameraMode, gameState);

    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      window.__gameReady = true;
    }
  }

  window.__game = api;
  window.addEventListener('error', (e) => {
    window.__gameErrors = window.__gameErrors || [];
    window.__gameErrors.push(String(e.message || e.error));
  });

  frame();
}

main();
