// MERIDIAN RUN — the world: islands, sea, sky, clouds, town, runway.
// One clear job: build every static piece of scenery from the seeded terrain.

import * as THREE from 'three';
import { WORLD, RUNWAY, PEAKS, terrainHeight, mulberry32, clamp } from './config.js';

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

  // The sun itself: a bright disc low on the horizon.
  const sunGeo = new THREE.CircleGeometry(90, 32);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false, transparent: true, opacity: 0.95 });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  const d = mat.uniforms.sunDir.value;
  sun.position.copy(d).multiplyScalar(2400);
  sun.lookAt(0, 0, 0);
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
  const grassA = new THREE.Color(0x5d8a3c);
  const grassB = new THREE.Color(0x7aa84f);
  const forest = new THREE.Color(0x3d6b2f);
  const rock = new THREE.Color(0x8a7a68);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const patch = 0.5 + 0.5 * Math.sin(x * 0.013 + 2.0) * Math.sin(z * 0.011 - 1.0);
    if (h < 1.5) c.copy(sand);
    else if (h < 26) c.copy(grassA).lerp(grassB, patch);
    else if (h < 55) c.copy(grassB).lerp(forest, clamp((h - 26) / 29, 0, 1));
    else c.copy(forest).lerp(rock, clamp((h - 55) / 40, 0, 1) * 0.7);
    // Farmland stripes on the gentle slopes of the main island.
    if (h > 2 && h < 22) {
      const stripe = Math.sin((x + z) * 0.11) > 0 ? 1 : 0.88;
      c.multiplyScalar(stripe);
    }
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
    shininess: 140,
    specular: 0xffc27a,
    transparent: true,
    opacity: 0.96,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.size * 2.4, WORLD.size * 2.4), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = WORLD.seaLevel;
  scene.add(sea);
  return { sea, glitter };
}

function buildClouds(scene, rng) {
  const tex = canvasTexture(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255, 244, 230, 0.9)');
    grad.addColorStop(0.55, 'rgba(255, 236, 220, 0.45)');
    grad.addColorStop(1, 'rgba(255, 236, 220, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
  const group = new THREE.Group();
  const puffs = [];
  for (let i = 0; i < 26; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.5 + rng() * 0.35, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    const a = rng() * Math.PI * 2;
    const r = 250 + rng() * 950;
    sprite.position.set(Math.cos(a) * r, 130 + rng() * 110, Math.sin(a) * r);
    const w = 140 + rng() * 220;
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
    new THREE.MeshLambertMaterial({ color: 0x2e3138 }),
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
  const winTex = canvasTexture(128, (g, s) => {
    g.fillStyle = '#e8dcc8';
    g.fillRect(0, 0, s, s);
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 5; col++) {
        const lit = rng() > 0.45;
        g.fillStyle = lit ? '#ffd27a' : '#3a4a5a';
        g.fillRect(10 + col * 23, 10 + row * 19, 13, 11);
      }
    }
  });
  // Buildings are simple boxes with a lit-window texture; the emissive tint
  // makes the town read at golden hour from the air.
  const wall = new THREE.MeshLambertMaterial({ map: winTex, emissive: 0x664411 });
  const base = new THREE.MeshLambertMaterial({ color: 0x8a7a68 });
  const roofs = new THREE.MeshLambertMaterial({ color: 0xb4502e });
  const positions = [];
  for (let i = 0; i < 46; i++) {
    const a = rng() * Math.PI * 2;
    const r = 50 + rng() * 110;
    // Town sits well east of the strip so the runway and the final approach
    // stay clear of buildings.
    const x = RUNWAY.x + 170 + Math.cos(a) * r * 0.9;
    const z = RUNWAY.z + 110 + Math.sin(a) * r * 0.7;
    positions.push([x, z]);
  }
  for (const [x, z] of positions) {
    const h = terrainHeight(x, z);
    if (h < 1) continue;
    const w = 10 + rng() * 14;
    const d = 10 + rng() * 12;
    const tall = 7 + rng() * 11;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, tall, d), base);
    box.position.set(x, h + tall / 2 - 0.5, z);
    box.rotation.y = rng() * Math.PI;
    box.castShadow = true;
    group.add(box);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.6, 3 + rng() * 2.5, 4), roofs);
    roof.position.set(x, h + tall + 1.4, z);
    roof.rotation.y = Math.PI / 4 + rng() * 0.4;
    group.add(roof);
    // One glowing window wall per building, facing the runway.
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, tall * 0.7), wall);
    win.position.set(x, h + tall / 2, z);
    win.rotation.y = Math.atan2(RUNWAY.x - x, RUNWAY.z - z);
    win.translateZ(d / 2 + 0.15);
    group.add(win);
  }
  scene.add(group);
  return group;
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
  scene.add(new THREE.HemisphereLight(0x8fb0e0, 0x5a4a3a, 0.9));
  scene.add(new THREE.AmbientLight(0x604a38, 0.5));

  const dome = buildSky(scene, rng);
  const terrain = buildTerrain(scene);
  const { sea, glitter } = buildSea(scene);
  const clouds = buildClouds(scene, rng);
  buildRunway(scene);
  buildTown(scene, rng);

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
