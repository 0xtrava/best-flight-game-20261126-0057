// MERIDIAN RUN — the world: islands, sea, sky, clouds, town, runway.
// One clear job: build every static piece of scenery from the seeded terrain.

import * as THREE from 'three';
import { WORLD, RUNWAY, PEAKS, terrainHeight, mulberry32, clamp } from './config.js';
import { buildTrees } from './trees.js';

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function buildSky(scene, rng) {
  // Gradient dome: deep blue overhead, warm orange at the golden-hour horizon.
  const geo = new THREE.SphereGeometry(2600, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sunDir: { value: new THREE.Vector3(Math.cos(WORLD.sunElevation) * Math.cos(WORLD.sunAzimuth), Math.sin(WORLD.sunElevation), Math.cos(WORLD.sunElevation) * Math.sin(WORLD.sunAzimuth)).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 sunDir;
      void main() {
        float h = clamp(vDir.y, -0.08, 1.0);
        vec3 zenith = vec3(0.10, 0.22, 0.48);
        vec3 mid = vec3(0.45, 0.55, 0.78);
        vec3 horizon = vec3(1.00, 0.55, 0.22);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, zenith, smoothstep(0.18, 0.75, h));
        float sun = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.55, 0.18) * pow(sun, 90.0) * 1.6;
        col += vec3(1.0, 0.62, 0.28) * pow(sun, 7.0) * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(geo, mat);
  scene.add(dome);

  // The sun itself: a bright disc low on the horizon. Kept hidden — the
  // shader glow already draws the sun, and the disc read as a pale oval
  // floating in the glow on the cover shot (v3).
  const sunGeo = new THREE.CircleGeometry(90, 32);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false, transparent: true, opacity: 0.95 });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  const d = mat.uniforms.sunDir.value;
  sun.position.copy(d).multiplyScalar(2400);
  sun.lookAt(0, 0, 0);
  sun.visible = false;
  scene.add(sun);
  return dome;
}

function buildTerrain(scene) {
  const SEG = 150;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xd9c08a);
  const wetSand = new THREE.Color(0xb89a6a);
  const grassA = new THREE.Color(0x5d8a3c);
  const grassB = new THREE.Color(0x7aa84f);
  const wheat = new THREE.Color(0xc2a95c);
  const forest = new THREE.Color(0x2f5d28);
  const rock = new THREE.Color(0x7d6f5e);
  const rockLight = new THREE.Color(0x9a938a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const patch = 0.5 + 0.5 * Math.sin(x * 0.013 + 2.0) * Math.sin(z * 0.011 - 1.0);
    const patch2 = 0.5 + 0.5 * Math.sin(x * 0.031 - 0.7) * Math.sin(z * 0.027 + 1.3);
    if (h < 0.8) c.copy(wetSand);
    else if (h < 2.5) c.copy(sand);
    else if (h < 26) {
      c.copy(grassA).lerp(grassB, patch);
      if (patch2 > 0.72) c.copy(wheat).lerp(c, 0.3); // golden field patches
    } else if (h < 50) c.copy(grassB).lerp(forest, clamp((h - 26) / 24, 0, 1));
    else c.copy(rock).lerp(rockLight, clamp((h - 60) / 40, 0, 1) * 0.6);
    // Farmland stripes on the gentle slopes + large-scale mottling.
    if (h > 2 && h < 22) {
      const stripe = Math.sin((x + z) * 0.11) > 0 ? 1 : 0.85;
      c.multiplyScalar(stripe);
    }
    c.multiplyScalar(0.94 + patch2 * 0.1);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function buildSea(scene) {
  const glitter = canvasTexture(256, (g, s) => {
    g.fillStyle = '#0b3d5c';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const a = 0.15 + Math.random() * 0.5;
      g.fillStyle = `rgba(255, 214, 150, ${a})`;
      g.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  });
  glitter.repeat.set(24, 24);
  const mat = new THREE.MeshPhongMaterial({
    color: 0x1a5f7a,
    map: glitter,
    shininess: 220,
    specular: 0xffc27a,
    transparent: true,
    opacity: 1.0,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size * 2.4, WORLD.size * 2.4), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = WORLD.seaLevel;
  scene.add(sea);
  return { sea, glitter };
}

function buildClouds(scene, rng) {
  // A lumpy cluster of puffs, not one smooth disc: a single radial
  // gradient reads as a grey oval against the sun glow (v2/v3 cover flaw).
  const tex = canvasTexture(128, (g, s) => {
    const puff = (cx, cy, r, a) => {
      const grad = g.createRadialGradient(cx, cy, 2, cx, cy, r);
      grad.addColorStop(0, `rgba(255, 244, 230, ${a})`);
      grad.addColorStop(0.6, `rgba(255, 236, 220, ${a * 0.5})`);
      grad.addColorStop(1, 'rgba(255, 236, 220, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    };
    puff(s * 0.5, s * 0.55, s * 0.34, 0.9);
    puff(s * 0.3, s * 0.62, s * 0.22, 0.7);
    puff(s * 0.72, s * 0.6, s * 0.24, 0.7);
    puff(s * 0.55, s * 0.4, s * 0.2, 0.6);
  });
  const group = new THREE.Group();
  const puffs = [];
  // The sun's direction, for keeping clouds out of its disc: a
  // semi-transparent white sprite in front of the blown-out sun glow reads
  // as a grey disc in the sky (v2's cover flaw).
  const sunDir = new THREE.Vector3(
    Math.cos(WORLD.sunElevation) * Math.cos(WORLD.sunAzimuth),
    Math.sin(WORLD.sunElevation),
    Math.cos(WORLD.sunElevation) * Math.sin(WORLD.sunAzimuth),
  ).normalize();
  for (let i = 0; i < 26; i++) {
    // Normal blending at low opacity, lumpy texture, wide sun-avoidance:
    // additive clouds looked like glowing orbs and (with the plane in
    // frame) threw a dark diagonal veil across the cockpit shot. A faint
    // normal-blended wisp reads as a cloud; a smooth bright disc does not.
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.15 + rng() * 0.15, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    let a = rng() * Math.PI * 2;
    const r = 250 + rng() * 950;
    const y = 150 + rng() * 110;
    let dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    // Wide cone: the staged cameras sit ~750 m from the origin, so the
    // origin-centric check has to clear far more than the sun's own disc —
    // any cloud in the north-east sky can land in the glow from a camera.
    if (dir.dot(sunDir) > 0.5) {
      a += 1.1;
      dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    }
    sprite.position.set(dir.x * r, y, dir.z * r);
    const w = 100 + rng() * 140;
    sprite.scale.set(w, w * 0.42, 1);
    sprite.userData.drift = 1.5 + rng() * 2.5;
    group.add(sprite);
    puffs.push(sprite);
  }
  scene.add(group);
  return puffs;
}

function buildRunway(scene) {
  const group = new THREE.Group();
  const y = RUNWAY.altitude + 0.15;
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length),
    new THREE.MeshLambertMaterial({ color: 0x565a63 }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.rotation.z = RUNWAY.heading;
  strip.position.set(RUNWAY.x, y, RUNWAY.z);
  strip.receiveShadow = true;
  group.add(strip);

  // Centre dashes and threshold bars.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
  for (let d = -RUNWAY.length / 2 + 18; d < RUNWAY.length / 2 - 10; d += 26) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 12), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.rotation.z = RUNWAY.heading;
    const lx = Math.sin(RUNWAY.heading) * d;
    const lz = Math.cos(RUNWAY.heading) * d;
    dash.position.set(RUNWAY.x + lx, y + 0.05, RUNWAY.z + lz);
    group.add(dash);
  }
  // Edge lights: warm dots down both sides.
  const lightGeo = new THREE.SphereGeometry(0.9, 8, 6);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  for (let d = -RUNWAY.length / 2 + 6; d <= RUNWAY.length / 2 - 6; d += 22) {
    for (const side of [-1, 1]) {
      const lx = Math.sin(RUNWAY.heading) * d + Math.cos(RUNWAY.heading) * side * (RUNWAY.width / 2 + 1.5);
      const lz = Math.cos(RUNWAY.heading) * d - Math.sin(RUNWAY.heading) * side * (RUNWAY.width / 2 + 1.5);
      const dot = new THREE.Mesh(lightGeo, lightMat);
      dot.position.set(RUNWAY.x + lx, y + 0.8, RUNWAY.z + lz);
      group.add(dot);
    }
  }
  scene.add(group);
  return group;
}

function buildTown(scene, rng) {
  const group = new THREE.Group();
  // Lit windows on every wall: the texture is the wall map, tinted per house.
  const winTex = canvasTexture(128, (g, s) => {
    g.fillStyle = '#f2e6c8';
    g.fillRect(0, 0, s, s);
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 5; col++) {
        const lit = rng() > 0.4;
        g.fillStyle = lit ? '#ffd27a' : '#33414f';
        g.fillRect(10 + col * 23, 10 + row * 19, 13, 11);
      }
    }
  });
  const wallColors = [0xf2e6c8, 0xfaf6ea, 0xf0d9a8, 0xe8c9a0, 0xdfd3b8];
  const roofColors = [0xb4502e, 0x9e3d24, 0xc46a3a, 0x7a4a2b, 0xa85438];
  // Three streets running along the coast east of the strip: houses in rows
  // with varied footprints, heights, wall and roof colours.
  const streets = [
    { x: RUNWAY.x + 150, z0: RUNWAY.z - 40, z1: RUNWAY.z + 260 },
    { x: RUNWAY.x + 205, z0: RUNWAY.z - 20, z1: RUNWAY.z + 240 },
    { x: RUNWAY.x + 255, z0: RUNWAY.z + 0, z1: RUNWAY.z + 220 },
  ];
  for (const st of streets) {
    const n = 13;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = st.x + (rng() - 0.5) * 24;
      const z = st.z0 + t * (st.z1 - st.z0) + (rng() - 0.5) * 12;
      const h = terrainHeight(x, z);
      if (h < 1) continue;
      const w = 9 + rng() * 9;
      const d = 9 + rng() * 8;
      const tall = 6 + rng() * 9;
      const wallMat = new THREE.MeshLambertMaterial({
        map: winTex,
        color: wallColors[Math.floor(rng() * wallColors.length)],
        emissive: 0x553311,
      });
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, tall, d), wallMat);
      box.position.set(x, h + tall / 2 - 0.5, z);
      box.rotation.y = (rng() - 0.5) * 0.35;
      box.castShadow = true;
      group.add(box);
      const roofMat = new THREE.MeshLambertMaterial({ color: roofColors[Math.floor(rng() * roofColors.length)] });
      if (rng() > 0.45) {
        // Pyramid roof.
        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.62, 2.5 + rng() * 2.5, 4), roofMat);
        roof.position.set(x, h + tall + 1.2, z);
        roof.rotation.y = Math.PI / 4 + box.rotation.y;
        group.add(roof);
      } else {
        // Gable roof: two sloped slabs meeting at a ridge.
        for (const s of [-1, 1]) {
          const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 0.28, d * 1.06), roofMat);
          slab.position.set(x - s * w * 0.21, h + tall + 1.2, z);
          slab.rotation.z = s * 0.5;
          slab.rotation.y = box.rotation.y;
          group.add(slab);
        }
      }
    }
  }
  // Landmark: a taller white house with a tower in the middle of town.
  const churchX = RUNWAY.x + 185;
  const churchZ = RUNWAY.z + 120;
  const churchH = terrainHeight(churchX, churchZ);
  const churchMat = new THREE.MeshLambertMaterial({ map: winTex, color: 0xfaf6ea, emissive: 0x553311 });
  const church = new THREE.Mesh(new THREE.BoxGeometry(13, 15, 12), churchMat);
  church.position.set(churchX, churchH + 7, churchZ);
  church.castShadow = true;
  group.add(church);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(4.5, 11, 4.5), churchMat);
  tower.position.set(churchX + 4, churchH + 20, churchZ - 3);
  group.add(tower);
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 4.5, 4), new THREE.MeshLambertMaterial({ color: 0x9e3d24 }));
  towerRoof.position.set(churchX + 4, churchH + 28, churchZ - 3);
  towerRoof.rotation.y = Math.PI / 4;
  group.add(towerRoof);
  const churchRoof = new THREE.Mesh(new THREE.ConeGeometry(9.5, 4, 4), new THREE.MeshLambertMaterial({ color: 0xb4502e }));
  churchRoof.position.set(churchX, churchH + 17, churchZ);
  churchRoof.rotation.y = Math.PI / 4;
  group.add(churchRoof);
  // Lighthouse on the shore east of town: white tower, red bands, lit top.
  const lhX = 430;
  const lhZ = -280;
  const lhH = terrainHeight(lhX, lhZ);
  const lhWhite = new THREE.MeshLambertMaterial({ color: 0xfaf6ea });
  const lhRed = new THREE.MeshLambertMaterial({ color: 0xc23a22 });
  const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4, 9, 10), lhWhite);
  lhBase.position.set(lhX, lhH + 4.5, lhZ);
  group.add(lhBase);
  const lhBand = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 3.1, 4, 10), lhRed);
  lhBand.position.set(lhX, lhH + 11, lhZ);
  group.add(lhBand);
  const lhTop = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 5, 10), lhWhite);
  lhTop.position.set(lhX, lhH + 15.5, lhZ);
  group.add(lhTop);
  const lhLamp = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
  );
  lhLamp.position.set(lhX, lhH + 19.5, lhZ);
  group.add(lhLamp);
  scene.add(group);
  return group;
}

function buildCrags(scene) {
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x8d8172 });
  // Rocky summits on the tall peaks that sit clear of the ring course.
  const crags = [
    [620, 60, 30, 34],
    [-620, -120, 26, 30],
    [820, -160, 22, 26],
    [-760, -560, 24, 28],
  ];
  crags.forEach(([x, z, r, h], i) => {
    const base = terrainHeight(x, z);
    const crag = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rockMat);
    crag.position.set(x, base + h / 2 - 4, z);
    crag.rotation.y = i * 0.7;
    crag.castShadow = true;
    scene.add(crag);
  });
  // Scattered boulders on the high slopes.
  const rng = mulberry32(99);
  const boulderGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 70; i++) {
    const x = (rng() - 0.5) * 2200;
    const z = (rng() - 0.5) * 2200;
    const h = terrainHeight(x, z);
    if (h < 28 || h > 90) continue;
    const s = 2 + rng() * 4;
    const b = new THREE.Mesh(boulderGeo, rockMat);
    b.position.set(x, h + s * 0.3, z);
    b.scale.setScalar(s);
    b.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    scene.add(b);
  }
}

export function buildWorld(scene, seed = 1) {
  const rng = mulberry32(seed);
  scene.fog = new THREE.Fog(0xe8935a, WORLD.fogNear, WORLD.fogFar);

  // Golden-hour key light + soft sky fill.
  const sunDir = new THREE.Vector3(
    Math.cos(WORLD.sunElevation) * Math.cos(WORLD.sunAzimuth),
    Math.sin(WORLD.sunElevation),
    Math.cos(WORLD.sunElevation) * Math.sin(WORLD.sunAzimuth),
  ).normalize();
  const sun = new THREE.DirectionalLight(0xffb066, 2.6);
  sun.position.copy(sunDir).multiplyScalar(600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 1600;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  // Warm fill from the south-west so the plane's shadowed side (and the
  // front view on the runway) stays readable instead of going black.
  const fill = new THREE.DirectionalLight(0xffd9b0, 0.9);
  fill.position.set(-350, 220, 550);
  scene.add(fill);
  // Cool rim from the south-east so the plane keeps an edge against the sky
  // and sea on its shadowed side instead of going flat.
  const rim = new THREE.DirectionalLight(0xbfd4ff, 0.45);
  rim.position.set(350, 240, 650);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x8fb0e0, 0x5a4a3a, 1.5));
  scene.add(new THREE.AmbientLight(0x604a38, 0.7));

  const dome = buildSky(scene, rng);
  const terrain = buildTerrain(scene);
  const { sea, glitter } = buildSea(scene);
  const clouds = buildClouds(scene, rng);
  buildRunway(scene);
  buildTown(scene, rng);
  buildCrags(scene);
  buildTrees(scene, seed);

  return {
    sun,
    sunDir,
    dome,
    terrain,
    update(dt, t, planePos) {
      // Sea glitter drifts; clouds drift; the shadow frustum follows the plane.
      glitter.offset.x = (t * 0.008) % 1;
      glitter.offset.y = (t * 0.005) % 1;
      for (const c of clouds) {
        c.position.x += c.userData.drift * dt;
        if (c.position.x > 1250) c.position.x = -1250;
      }
      if (planePos) {
        sun.position.set(planePos.x + sunDir.x * 600, planePos.y + 260, planePos.z + sunDir.z * 600);
        sun.target.position.copy(planePos);
        sun.target.updateMatrixWorld();
      }
    },
  };
}
