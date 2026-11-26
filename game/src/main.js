// MERIDIAN RUN — boot, state machine, cameras, game loop.
// One clear job: wire the world, plane, course, HUD and sound into a game.

import * as THREE from 'three';
import { RUNWAY, RINGS, PLANE, clamp } from './config.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildWorld } from './world.js';
import { buildPlaneModel, createFlight, forwardVector } from './plane.js';
import { createCourse } from './rings.js';
import { createBattle } from './battle.js';
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
  // v8: the war. onEvent feeds missile kills back into the score + toast.
  const battle = createBattle(scene, (ev) => {
    if (ev.type === 'kill') {
      course.state.score += ev.points;
      hud.showToast(`SPLASH! +${ev.points}`, 1500);
    }
  });
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
    battle,
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
      // Cockpit: the whole afterburner stays HIDDEN. The jet's tail is
      // behind the pilot anyway; the pointed nose cone at the bottom of
      // the frame is the aircraft cue. Chase view keeps the full flame.
      plane.prop.visible = m !== 'cockpit';
      plane.bladeMat.opacity = m === 'cockpit' ? 0 : 1;
      // Chase/hero flame reads as an afterburner at 0.85 (its own material
      // opacity). Cockpit stays 0 — the flame is hidden there entirely.
      plane.discMat.opacity = m === 'cockpit' ? 0 : 0.75;
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
    battle.reset();
    flight.resetTo(RUNWAY.x, RUNWAY.altitude + 2, RUNWAY.z, Math.PI + RUNWAY.heading, 0);
    flight.state.throttle = 0.55;
    elapsed = 0;
    resultShown = false;
    gameState = 'flying';
    cameraMode = 'chase';
    hud.setCockpit(false);
    hud.hideMenu();
    hud.hideResults();
    hud.showToast('Scramble! Fly the rings — splash the bandits!', 2200);
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

  // Hero camera (v8: pulled a touch closer — the fighter's span is half
  // the Cessna's, so the old v5 distances left it small in frame). Nose,
  // canopy, swept wings and afterburner all visible, jet big in frame.
  // Never used in live play.
  function updateHeroCamera() {
    const fwd = forwardVector(flight.state.yaw, flight.state.pitch);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const pos = flight.state.pos.clone()
      .addScaledVector(fwd, 8)
      .addScaledVector(right, -11)
      .addScaledVector(up, 2.5);
    camera.position.copy(pos);
    // Look just ahead of the plane, not 16 m out: the look target sets
    // the frame centre, and a far target pushes the plane itself off the
    // frame edge (52° off-axis).
    // v5.1 sat too close to the wing (5 m): the near wing filled the
    // frame as a flat maroon slab. Pulled back + more to the front, so
    // the wing reads as a wing and the nose + windows carry the shot.
    const look = flight.state.pos.clone().addScaledVector(fwd, 5).addScaledVector(up, 1.5);
    camera.lookAt(look);
  }

  function updateCockpitCamera() {
    // Sit just behind the nose, above the nose cone: the pointed grey nose
    // reads at the bottom of the frame (v3 sat ahead of the wing and the
    // shot had no aircraft in it at all), the runway stays dead ahead,
    // and the canopy is hidden so the pilot sees out.
    const fwd = forwardVector(flight.state.yaw, flight.state.pitch);
    const up = new THREE.Vector3(0, 1, 0);
    const pos = flight.state.pos.clone().addScaledVector(up, 1.32).addScaledVector(fwd, 0.7);
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
      hud.update(flight.state, course, elapsed, cameraMode, gameState, battle.combat);
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
        if (input.state.fire) battle.fireMissile(flight.state);
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
    // v8.1: gear retracts once airborne — wheels dangling under a fighter
    // in the air read wrong. On the ground (menu, takeoff roll, landed)
    // it stays down.
    if (plane.gear) plane.gear.visible = !flight.state.airborne;
    plane.prop.rotation.z -= flight.state.speed * dt * 0.85 + (gameState === 'menu' ? 0.12 : 0);
    // v8: afterburner flicker — the flame breathes while the jet flies.
    if (plane.afterburner) {
      const f = 1 + Math.sin(t * 38) * 0.12 + Math.sin(t * 61) * 0.08;
      plane.afterburner.scale.set(f, f, 1 + Math.sin(t * 47) * 0.18);
    }
    // v8: the war runs every frame (frozen staged shots hold their frame).
    battle.update(dt, t, flight.state.pos, forwardVector(flight.state.yaw, flight.state.pitch), frozen, gameState === 'flying');

    // Cameras.
    if (gameState === 'menu' || gameState === 'results') updateOrbitCamera(frozen ? 0 : dt);
    else if (cameraMode === 'cockpit') updateCockpitCamera();
    else if (cameraMode === 'hero') updateHeroCamera();
    else updateChaseCamera(frozen ? 1 : dt);

    world.update(dt, t, flight.state.pos);
    if (gameState === 'flying' || frozen) hud.update(flight.state, course, elapsed, cameraMode, gameState, battle.combat);

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
