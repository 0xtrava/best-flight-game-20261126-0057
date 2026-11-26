// MERIDIAN RUN — boot, state machine, cameras, game loop.
// One clear job: wire the world, plane, course, HUD and sound into a game.

import * as THREE from 'three';
import { RUNWAY, PLANE, clamp } from './config.js';
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
  renderer.toneMappingExposure = 1.06;

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
  let resultShown = false;

  const api = {
    flight,
    course,
    hud,
    camera,
    setState(s) {
      gameState = s;
    },
    setCameraMode(m) {
      cameraMode = m;
      hud.setCockpit(m === 'cockpit');
    },
    setElapsed(s) {
      elapsed = s;
    },
    placeChaseCamera() {
      updateChaseCamera(1);
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
    const desired = flight.state.pos.clone().addScaledVector(fwd, -13.5).add(new THREE.Vector3(0, 4.6, 0));
    const k = 1 - Math.exp(-5.5 * dt);
    camera.position.lerp(desired, k);
    const look = flight.state.pos.clone().addScaledVector(fwd, 26).add(new THREE.Vector3(0, 1.2, 0));
    camera.lookAt(look);
  }

  function updateCockpitCamera() {
    const fwd = forwardVector(flight.state.yaw, flight.state.pitch);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const pos = flight.state.pos.clone()
      .addScaledVector(up, 1.15)
      .addScaledVector(fwd, 0.4)
      .addScaledVector(right, 0);
    camera.position.copy(pos);
    const look = flight.state.pos.clone().addScaledVector(fwd, 120).addScaledVector(up, -4);
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    // Roll the horizon with the plane: tilt the camera up vector.
    camera.up.set(Math.sin(-flight.state.roll), Math.cos(flight.state.roll), 0);
    camera.lookAt(look);
  }

  function updateOrbitCamera(dt) {
    orbitAngle += dt * 0.07;
    const r = 24;
    const target = flight.state.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
    camera.position.set(
      target.x + Math.sin(orbitAngle) * r,
      target.y + 7.5,
      target.z + Math.cos(orbitAngle) * r,
    );
    camera.lookAt(target);
  }

  // ---- staged screenshots -------------------------------------------------
  let staged = false;
  if (params.name) {
    staged = stageShot(params.name, api);
    if (staged) {
      frozen = true;
      if (params.name === 'play') updateChaseCamera(1);
      if (params.name === 'cockpit') updateCockpitCamera();
      if (params.name === 'start' || params.name === 'end') updateOrbitCamera(0);
      hud.update(flight.state, course, elapsed, cameraMode);
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
    else updateChaseCamera(frozen ? 1 : dt);

    world.update(dt, t, flight.state.pos);
    if (gameState === 'flying' || frozen) hud.update(flight.state, course, elapsed, cameraMode);

    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      window.__gameReady = true;
    }
  }

  window.__game = {
    get state() {
      return gameState;
    },
    get cameraMode() {
      return cameraMode;
    },
    flight,
    course,
    startFlight,
    setState(s) {
      gameState = s;
    },
  };
  window.addEventListener('error', (e) => {
    window.__gameErrors = window.__gameErrors || [];
    window.__gameErrors.push(String(e.message || e.error));
  });

  frame();
}

main();
