// MERIDIAN RUN — the battle: enemy jets, explosions, tracers, flak, smoke.
// One clear job: make the sky read as a fight, not a peaceful sunset flight.
//
// v8: the war scene. Enemy jets fly attack patterns around the course,
// explosions and flak pop in the sky, tracers arc past the player, smoke
// columns rise from the town and the far islands, and a brown-grey smoke
// haze hangs near the horizon. Plus the player missile mechanic: Space
// fires at the nearest bandit ahead — a hit is an explosion, +300, and the
// bandit respawns later. Visual-only tracers/flak never damage the player;
// the rings and landing are untouched, so the core flow cannot break.

import * as THREE from 'three';
import { RINGS, terrainHeight, mulberry32 } from './config.js';
import { buildJetModel, forwardVector } from './plane.js';

const ENEMY_COUNT = 4;
const EXPLOSION_POOL = 4;
const TRACER_POOL = 6;
const TRAIL_POOL = 24;

export function createBattle(scene, onEvent = () => {}) {
  const rng = mulberry32(7);
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  // ---- enemy jets --------------------------------------------------------
  // Dark jets (same builder as the player, no gear, no missiles). Each flies
  // a circle around a course point at altitude, banking into the turn.
  const enemies = [];
  const enemyCenters = [
    { ring: 2, alt: 130, radius: 160, speed: 0.10 },
    { ring: 5, alt: 100, radius: 140, speed: -0.12 },
    { ring: 8, alt: 150, radius: 180, speed: 0.09 },
    { ring: 11, alt: 110, radius: 130, speed: -0.11 },
  ];
  for (let i = 0; i < ENEMY_COUNT; i++) {
    const jet = buildJetModel({ dark: true, withGear: false, withMissiles: false });
    jet.group.scale.setScalar(1.15); // a touch bigger so they read at range
    scene.add(jet.group);
    const c = enemyCenters[i];
    const center = new THREE.Vector3(RINGS[c.ring].x, c.alt, RINGS[c.ring].z);
    enemies.push({
      group: jet.group,
      afterburner: jet.afterburner,
      center,
      radius: c.radius,
      speed: c.speed,
      phase: rng() * Math.PI * 2,
      alive: true,
      held: false, // staged shots pin this enemy in place
      respawnAt: 0,
    });
  }
  function placeEnemy(e, t) {
    const a = e.phase + t * e.speed;
    e.group.position.set(
      e.center.x + Math.cos(a) * e.radius,
      e.center.y + Math.sin(t * 0.5 + e.phase) * 8,
      e.center.z + Math.sin(a) * e.radius,
    );
    const yaw = Math.atan2(-Math.sin(a), Math.cos(a));
    e.group.rotation.set(0, yaw + Math.PI, -Math.sign(e.speed) * 0.35, 'YXZ');
  }

  // ---- explosions ----------------------------------------------------------
  // Pool of fireballs: emissive orange core + additive glow + 3 dark smoke
  // puffs that rise and fade. drawExplosion() sets the visuals from age, so
  // staged shots can freeze one mid-burst.
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const explosions = [];
  for (let i = 0; i < EXPLOSION_POOL; i++) {
    const g = new THREE.Group();
    const fire = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0, fog: false }),
    );
    g.add(fire);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff6611, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    g.add(glow);
    const smoke = [];
    for (let j = 0; j < 3; j++) {
      const s = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0x2a2a2e, transparent: true, opacity: 0, fog: false }));
      g.add(s);
      smoke.push(s);
    }
    g.visible = false;
    scene.add(g);
    explosions.push({ group: g, fire, glow, smoke, age: 0, life: 2.8, size: 1, active: false });
  }
  function drawExplosion(e) {
    const a = e.age;
    const s = e.size;
    if (a < 0.4) {
      const k = a / 0.4;
      e.fire.scale.setScalar(Math.max(0.01, s * 7 * k));
      e.fire.material.opacity = 0.95;
      e.glow.scale.setScalar(Math.max(0.01, s * 11 * k));
      e.glow.material.opacity = 0.55;
    } else {
      const k = Math.max(0, 1 - (a - 0.4) / 1.6);
      e.fire.scale.setScalar(Math.max(0.01, s * 7 * (0.6 + 0.4 * k)));
      e.fire.material.opacity = 0.9 * k;
      e.glow.scale.setScalar(Math.max(0.01, s * 11 * k));
      e.glow.material.opacity = 0.5 * k;
    }
    e.smoke.forEach((puff, j) => {
      const rise = Math.max(0, a - 0.3) * 7;
      puff.position.set((j - 1) * s * 1.6, rise + j * s * 0.8, (j % 2 ? 1 : -1) * s * 1.2);
      const sc = s * (1.5 + Math.max(0, a - 0.3) * 2.2);
      puff.scale.setScalar(Math.max(0.01, sc));
      puff.material.opacity = a > 0.3 ? Math.max(0, 0.55 * (1 - (a - 0.3) / 2.2)) : 0;
    });
  }
  function triggerExplosion(pos, size = 1) {
    const e = explosions.find((x) => !x.active) || explosions[0];
    e.active = true;
    e.age = 0;
    e.size = size;
    e.group.position.copy(pos);
    e.group.visible = true;
    drawExplosion(e);
    return e;
  }

  // ---- tracers -------------------------------------------------------------
  // Thin additive streaks that cross the sky fast. Visual only.
  const tracers = [];
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  for (let i = 0; i < TRACER_POOL; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 16), tracerMat);
    m.visible = false;
    scene.add(m);
    tracers.push({ mesh: m, from: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, traveled: 0, speed: 320, active: false });
  }
  function spawnTracer(from, to) {
    const tr = tracers.find((x) => !x.active) || tracers[0];
    tr.from.copy(from);
    tr.dir.copy(to).sub(from);
    tr.dist = tr.dir.length();
    tr.dir.normalize();
    tr.traveled = 0;
    tr.active = true;
    tr.mesh.visible = true;
    tr.mesh.position.copy(from);
    tr.mesh.lookAt(to.x, to.y, to.z);
  }

  // ---- ground smoke columns --------------------------------------------------
  // Three permanent plumes rising from the town and the far islands: dark
  // puffs that rise, grow and fade in a loop. War on the ground, too.
  const columns = [];
  const columnSpots = [
    [180, -100], // over the town
    [620, 60], // far east island
    [240, 430], // south island
  ];
  for (const [x, z] of columnSpots) {
    const base = Math.max(terrainHeight(x, z), 1) + 2;
    const puffs = [];
    for (let j = 0; j < 5; j++) {
      const p = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0x2e2a26, transparent: true, opacity: 0.5, fog: true }));
      p.position.set(x, base, z);
      scene.add(p);
      // Fixed lateral offset per puff (re-randomising per frame shimmers).
      puffs.push({ mesh: p, phase: j / 5, ox: (rng() - 0.5) * 4, oz: (rng() - 0.5) * 4 });
    }
    columns.push({ x, z, base, puffs });
  }

  // ---- horizon smoke haze ----------------------------------------------------
  // Big dark puffs near the horizon, drifting slowly — distant battle smoke.
  const haze = [];
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI * 2;
    const r = 900 + rng() * 250;
    const p = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0x453a30, transparent: true, opacity: 0.5, fog: false }));
    const s = 45 + rng() * 30;
    p.scale.set(s, s * 0.5, s * 0.7);
    p.position.set(Math.cos(a) * r, 95 + rng() * 45, Math.sin(a) * r);
    scene.add(p);
    haze.push({ mesh: p, drift: 1 + rng() * 1.5 });
  }

  // ---- player missiles --------------------------------------------------------
  const missiles = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.2, 8), new THREE.MeshPhongMaterial({ color: 0xd8d8d8 }));
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 8), new THREE.MeshPhongMaterial({ color: 0x333333 }));
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.75;
    g.add(tip);
    g.visible = false;
    scene.add(g);
    missiles.push({ group: g, vel: new THREE.Vector3(), target: null, life: 0, active: false, trailTimer: 0 });
  }
  // Missile smoke trail: small white puffs that fade fast.
  const trail = [];
  for (let i = 0; i < TRAIL_POOL; i++) {
    const p = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0, fog: false }));
    p.visible = false;
    scene.add(p);
    trail.push({ mesh: p, age: 0, life: 1.1, active: false });
  }
  function spawnTrail(pos) {
    const p = trail.find((x) => !x.active) || trail[0];
    p.active = true;
    p.age = 0;
    p.mesh.visible = true;
    p.mesh.position.copy(pos);
    p.mesh.scale.setScalar(0.7);
    p.mesh.material.opacity = 0.7;
  }

  const combat = {
    ammo: 6,
    maxAmmo: 6,
    kills: 0,
    get enemiesAlive() {
      return enemies.filter((e) => e.alive).length;
    },
  };

  let ambientTimer = 4;
  let tracerTimer = 1.5;
  let cooldown = 0;
  let ammoTimer = 0;

  function nearestEnemyAhead(planeState) {
    const fwd = forwardVector(planeState.yaw, planeState.pitch);
    let best = null;
    let bestD = 500;
    for (const e of enemies) {
      if (!e.alive) continue;
      tmp.copy(e.group.position).sub(planeState.pos);
      const d = tmp.length();
      if (d > bestD) continue;
      if (tmp.normalize().dot(fwd) < 0.5) continue; // ~60° cone ahead
      best = e;
      bestD = d;
    }
    return best;
  }

  function fireMissile(planeState) {
    if (combat.ammo <= 0 || cooldown > 0) return false;
    const slot = missiles.find((m) => !m.active);
    if (!slot) return false;
    const fwd = forwardVector(planeState.yaw, planeState.pitch);
    slot.group.position.copy(planeState.pos).addScaledVector(fwd, 4).add(new THREE.Vector3(0, 0.5, 0));
    slot.vel.copy(fwd).multiplyScalar(planeState.speed + 70);
    slot.target = nearestEnemyAhead(planeState);
    slot.life = 4;
    slot.trailTimer = 0;
    slot.active = true;
    slot.group.visible = true;
    slot.group.lookAt(
      slot.group.position.x + fwd.x,
      slot.group.position.y + fwd.y,
      slot.group.position.z + fwd.z,
    );
    combat.ammo--;
    cooldown = 0.8;
    onEvent({ type: 'fire' });
    return true;
  }

  function killEnemy(e, t) {
    e.alive = false;
    e.group.visible = false;
    e.respawnAt = t + 8;
    combat.kills++;
    onEvent({ type: 'kill', points: 300 });
  }

  // Stage a deterministic battle for a screenshot. `planeState` is the
  // flight state (pos/yaw/pitch). Held enemies and explosions do not move
  // while the shot is frozen, so the frame is exactly what was staged.
  function stage(name, planeState) {
    const fwd = forwardVector(planeState.yaw, planeState.pitch);
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const at = (f, r, u) => planeState.pos.clone().addScaledVector(fwd, f).addScaledVector(right, r).addScaledVector(up, u);
    if (name === 'play') {
      // v8.1: the hero camera sits 8m ahead and 11m LEFT of the jet,
      // looking back at it — its view ray is roughly -fwd + right, i.e.
      // behind-right of the plane. v8 staged the bandit + explosion AHEAD
      // of the plane (+fwd), which is BEHIND the camera: invisible. Both
      // go behind-right, on the view ray: bandit near frame centre,
      // fireball up-right behind it. Bandit flies toward the plane
      // (head-on intercept: its flight yaw is the player's + 90°).
      const e = enemies[0];
      e.held = true;
      e.alive = true;
      e.group.visible = true;
      e.group.position.copy(at(-5, 40, 5));
      e.group.rotation.set(0, planeState.yaw + Math.PI / 2 + Math.PI, -0.3, 'YXZ');
      const ex = triggerExplosion(at(-18, 60, 14), 1.4);
      ex.age = 0.35;
      drawExplosion(ex);
    } else if (name === 'cockpit') {
      // Distant burst straight down the approach, plus a tracer crossing it.
      const ex = triggerExplosion(at(230, 0, 30), 1.2);
      ex.age = 0.5;
      drawExplosion(ex);
      spawnTracer(at(180, -60, 20), at(180, 60, 10));
      const tr = tracers.find((x) => x.active);
      if (tr) {
        tr.traveled = tr.dist * 0.5;
        tr.mesh.position.copy(tr.from).addScaledVector(tr.dir, tr.traveled);
        tr.mesh.scale.z = 2.5; // v8.1: 40 m streak — at 16 m the tracer
        // was a speck at 180 m; a long streak reads as a shot fired.
      }
    }
  }

  function reset() {
    for (const e of enemies) {
      e.alive = true;
      e.held = false;
      e.group.visible = true;
      e.respawnAt = 0;
    }
    for (const ex of explosions) {
      ex.active = false;
      ex.group.visible = false;
    }
    for (const m of missiles) {
      m.active = false;
      m.group.visible = false;
    }
    for (const tr of tracers) {
      tr.active = false;
      tr.mesh.visible = false;
    }
    combat.ammo = combat.maxAmmo;
    combat.kills = 0;
    cooldown = 0;
    ammoTimer = 0;
    ambientTimer = 4;
    tracerTimer = 1.5;
  }

  function update(dt, t, planePos, planeFwd, frozen, flying) {
    if (frozen) return; // staged shots hold the exact staged frame
    // Enemies: pattern flight, or respawn after a kill.
    for (const e of enemies) {
      if (!e.alive) {
        if (t >= e.respawnAt) {
          e.alive = true;
          e.group.visible = true;
          const ri = Math.floor(rng() * RINGS.length);
          e.center.set(RINGS[ri].x, 90 + rng() * 60, RINGS[ri].z);
          e.phase = rng() * Math.PI * 2;
          placeEnemy(e, t);
        }
        continue;
      }
      if (!e.held) placeEnemy(e, t);
    }
    // Ambient war: an explosion or flak burst every 6–10 s near the course,
    // a tracer from a random bandit every ~2.5 s while flying.
    ambientTimer -= dt;
    if (ambientTimer <= 0) {
      ambientTimer = 6 + rng() * 4;
      const ring = RINGS[Math.floor(rng() * RINGS.length)];
      if (rng() < 0.4) {
        // Flak burst: small, high up.
        triggerExplosion(new THREE.Vector3(ring.x + (rng() - 0.5) * 200, 170 + rng() * 60, ring.z + (rng() - 0.5) * 200), 0.6);
      } else {
        triggerExplosion(new THREE.Vector3(ring.x + (rng() - 0.5) * 260, 60 + rng() * 100, ring.z + (rng() - 0.5) * 260), 1 + rng() * 0.5);
      }
    }
    if (flying) {
      tracerTimer -= dt;
      if (tracerTimer <= 0) {
        tracerTimer = 2 + rng() * 1.5;
        const alive = enemies.filter((e) => e.alive);
        if (alive.length) {
          const e = alive[Math.floor(rng() * alive.length)];
          tmp.copy(planePos).add(new THREE.Vector3((rng() - 0.5) * 80, (rng() - 0.5) * 30, (rng() - 0.5) * 80));
          spawnTracer(e.group.position, tmp);
        }
      }
    }
    // Explosions age out.
    for (const e of explosions) {
      if (!e.active) continue;
      e.age += dt;
      if (e.age >= e.life) {
        e.active = false;
        e.group.visible = false;
        continue;
      }
      drawExplosion(e);
    }
    // Tracers fly and die.
    for (const tr of tracers) {
      if (!tr.active) continue;
      tr.traveled += tr.speed * dt;
      if (tr.traveled >= tr.dist) {
        tr.active = false;
        tr.mesh.visible = false;
        continue;
      }
      tr.mesh.position.copy(tr.from).addScaledVector(tr.dir, tr.traveled);
    }
    // Smoke columns rise and loop.
    for (const col of columns) {
      for (const p of col.puffs) {
        const cycle = ((t * 0.08 + p.phase) % 1);
        p.mesh.position.set(col.x + p.ox, col.base + cycle * 65, col.z + p.oz);
        p.mesh.scale.setScalar(2.5 + cycle * 5);
        p.mesh.material.opacity = 0.5 * (1 - cycle);
      }
    }
    // Haze drifts.
    for (const h of haze) {
      h.mesh.position.x += h.drift * dt;
      if (h.mesh.position.x > 1250) h.mesh.position.x = -1250;
    }
    // Missiles steer, hit, fizzle.
    for (const m of missiles) {
      if (!m.active) continue;
      m.life -= dt;
      if (m.target && m.target.alive) {
        tmp.copy(m.target.group.position).sub(m.group.position).normalize();
        tmp2.copy(m.vel).normalize().lerp(tmp, Math.min(1, 2.5 * dt)).normalize();
        m.vel.copy(tmp2).multiplyScalar(150);
        if (m.group.position.distanceTo(m.target.group.position) < 9) {
          triggerExplosion(m.target.group.position.clone(), 1.6);
          killEnemy(m.target, t);
          m.active = false;
          m.group.visible = false;
          continue;
        }
      }
      m.group.position.addScaledVector(m.vel, dt);
      tmp.copy(m.vel).normalize();
      m.group.lookAt(m.group.position.x + tmp.x, m.group.position.y + tmp.y, m.group.position.z + tmp.z);
      m.trailTimer -= dt;
      if (m.trailTimer <= 0) {
        m.trailTimer = 0.05;
        spawnTrail(m.group.position);
      }
      if (m.life <= 0) {
        m.active = false;
        m.group.visible = false;
      }
    }
    // Trail puffs fade.
    for (const p of trail) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      const k = 1 - p.age / p.life;
      p.mesh.material.opacity = 0.7 * k;
      p.mesh.scale.setScalar(0.7 + (1 - k) * 1.6);
    }
    // Ammo regen + cooldown, while flying.
    if (flying) {
      cooldown = Math.max(0, cooldown - dt);
      if (combat.ammo < combat.maxAmmo) {
        ammoTimer += dt;
        if (ammoTimer >= 12) {
          ammoTimer = 0;
          combat.ammo++;
        }
      }
    }
  }

  // Initial placement so the first frame already has bandits in the sky.
  for (const e of enemies) placeEnemy(e, 0);

  return { enemies, combat, update, stage, reset, fireMissile, triggerExplosion };
}
