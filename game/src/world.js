// MERIDIAN RUN — the world: islands, sea, sky, clouds, town, runway.
// One clear job: build every static piece of scenery from the seeded terrain.

import * as THREE from 'three';
import { WORLD, RUNWAY, PEAKS, terrainHeight, mulberry32, clamp } from './config.js';
import { buildTrees } from './trees.js';
import { buildPlaneModel } from './plane.js'; // v7: the parked plane by the hangar

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
        // Warm haze band hugging the horizon so the sky melts into the
        // sea instead of ending in a hard orange line (v5).
        col = mix(col, vec3(1.00, 0.78, 0.55), smoothstep(0.10, 0.0, h) * 0.45);
        float sun = max(dot(normalize(vDir), sunDir), 0.0);
        // Smaller, warmer sun (v5: tighter still): the core stays a small
        // bright point instead of a blown disc, so the plane and the ring
        // stay the brightest readable elements.
        col += vec3(1.0, 0.55, 0.18) * pow(sun, 240.0) * 0.85;
        col += vec3(1.0, 0.62, 0.28) * pow(sun, 18.0) * 0.15;
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
  const SEG = 200; // v7: denser mesh (was 150) — smoother hills, crisper HD read
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
      if (patch2 > 0.55) c.copy(wheat).lerp(c, 0.3); // golden field patches
      else if (patch2 < 0.28) c.lerp(forest, 0.55); // darker forest patches
    } else if (h < 50) c.copy(grassB).lerp(forest, clamp((h - 26) / 24, 0, 1));
    else c.copy(rock).lerp(rockLight, clamp((h - 60) / 40, 0, 1) * 0.6);
    // Farmland stripes on the gentle slopes + large-scale mottling + a
    // finer mottle so the big green fields break up instead of reading flat.
    if (h > 2 && h < 22) {
      const stripe = Math.sin((x + z) * 0.11) > 0 ? 1 : 0.8;
      c.multiplyScalar(stripe);
    }
    const patch3 = 0.5 + 0.5 * Math.sin(x * 0.071 + 0.5) * Math.sin(z * 0.063 - 0.8);
    const patch4 = 0.5 + 0.5 * Math.sin(x * 0.19 + 2.2) * Math.sin(z * 0.17 - 0.4);
    // v7: a fifth, higher-frequency mottle so the ground never reads as flat
    // colour bands at HD — fine grain over the big patches.
    const patch5 = 0.5 + 0.5 * Math.sin(x * 0.41 + 1.1) * Math.sin(z * 0.37 - 2.0);
    c.multiplyScalar(0.94 + patch2 * 0.1);
    c.multiplyScalar(0.96 + patch3 * 0.08);
    c.multiplyScalar(0.95 + patch4 * 0.1);
    c.multiplyScalar(0.97 + patch5 * 0.06);
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
    g.fillStyle = '#0e4a6b';
    g.fillRect(0, 0, s, s);
    // Sun glint: many more warm sparkles, some bigger, so the water
    // reads as glittering instead of a flat dark band (v5).
    for (let i = 0; i < 1500; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const a = 0.15 + Math.random() * 0.55;
      g.fillStyle = `rgba(255, 214, 150, ${a})`;
      const w = 1 + Math.random() * (Math.random() < 0.08 ? 4 : 2);
      g.fillRect(x, y, w, w);
    }
  });
  glitter.repeat.set(32, 32);
  const mat = new THREE.MeshPhongMaterial({
    color: 0x256b87,
    map: glitter,
    shininess: 320,
    specular: 0xffd9a0,
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
  // REAL 3D clouds in v5: each cloud is a cluster of flattened puffs
  // (Lambert-shaded, so the sun warms one side and shades the other).
  // The old billboard sprites always faced the camera and read flat —
  // that is what made the sky look cheap. Normal-blended, never additive:
  // additive clouds looked like glowing orbs and threw a dark diagonal
  // veil across the cockpit shot. A faint normal-blended wisp reads as a
  // cloud; a smooth bright disc does not.
  const group = new THREE.Group();
  const puffs = [];
  const sunDir = new THREE.Vector3(
    Math.cos(WORLD.sunElevation) * Math.cos(WORLD.sunAzimuth),
    Math.sin(WORLD.sunElevation),
    Math.cos(WORLD.sunElevation) * Math.sin(WORLD.sunAzimuth),
  ).normalize();
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  // UNLIT white (Basic): the golden sun tinted Lambert puffs orange-beige
  // and they read as floating potatoes (v5.1). Flat white lumps against
  // the blue sky read as clouds in this low-poly style; the geometry
  // silhouette still gives them shape. The horizon orange eggs were the
  // same tinting on distant low puffs.
  const puffMat = new THREE.MeshBasicMaterial({ color: 0xfff8f0, transparent: true, opacity: 0.95, fog: false });
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    let a = rng() * Math.PI * 2;
    const r = 250 + rng() * 950;
    const y = 220 + rng() * 120;
    let dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    // Wide cone: the staged cameras sit ~750 m from the origin, so the
    // origin-centric check has to clear far more than the sun's own disc —
    // any cloud in the north-east sky can land in the glow from a camera.
    if (dir.dot(sunDir) > 0.5) {
      a += 1.1;
      dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    }
    const n = 5 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Mesh(puffGeo, puffMat);
      const pr = 18 + rng() * 22;
      puff.position.set((rng() - 0.5) * 80, (rng() - 0.5) * 18, (rng() - 0.5) * 36);
      puff.scale.set(pr, pr * 0.62, pr * 0.8);
      cloud.add(puff);
    }
    cloud.position.set(dir.x * r, y, dir.z * r);
    cloud.userData.drift = 1.5 + rng() * 2.5;
    group.add(cloud);
    puffs.push(cloud);
  }
  scene.add(group);
  return puffs;
}

function buildRunway(scene) {
  const group = new THREE.Group();
  const y = RUNWAY.altitude + 0.15;
  // Lighter strip so the runway reads in the menu/end shots instead of a
  // black void (v3 flaw): warm light-grey asphalt, sun landing on it.
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length),
    new THREE.MeshLambertMaterial({ color: 0x75787e }),
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
  // v7: threshold piano-key stripes at both ends — six white bars across
  // the strip, the mark of a real runway, not a grey road.
  for (const end of [-1, 1]) {
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 10), dashMat);
      bar.rotation.x = -Math.PI / 2;
      bar.rotation.z = RUNWAY.heading;
      const d = end * (RUNWAY.length / 2 - 9);
      const lx = Math.sin(RUNWAY.heading) * d + Math.cos(RUNWAY.heading) * k * 4.6;
      const lz = Math.cos(RUNWAY.heading) * d - Math.sin(RUNWAY.heading) * k * 4.6;
      bar.position.set(RUNWAY.x + lx, y + 0.06, RUNWAY.z + lz);
      group.add(bar);
    }
  }
  // v7: runway numbers. Heading ~7° → runway 01 (south end, read by a
  // pilot approaching from the south) and 19 (north end). Texture top
  // points north with rotation.z = heading, south with +PI.
  const numberTex = (text) => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#f5f2e8';
    g.font = 'bold 150px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 136);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  };
  const number = (text, along, rotZ) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 13),
      new THREE.MeshBasicMaterial({ map: numberTex(text), transparent: true }),
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rotZ;
    const lx = Math.sin(RUNWAY.heading) * along;
    const lz = Math.cos(RUNWAY.heading) * along;
    m.position.set(RUNWAY.x + lx, y + 0.06, RUNWAY.z + lz);
    group.add(m);
  };
  number('01', RUNWAY.length / 2 - 30, RUNWAY.heading);
  number('19', -(RUNWAY.length / 2 - 30), RUNWAY.heading + Math.PI);
  scene.add(group);
  return group;
}

// v7: the airport. A proper small island airport east of the strip —
// terminal, two hangars, control tower, taxiway + apron, windsock, one
// parked plane. The runway position and heading are NEVER touched (the
// flight model and landing logic depend on them); everything here sits on
// the apron shelf (config.js flattens it to runway altitude) at strip
// level, so the buildings read as standing on the apron, not floating.
// `along` runs down the runway (south +, north -), `across` runs east (+).
function runwayPoint(along, across, y) {
  const h = RUNWAY.heading;
  return new THREE.Vector3(
    RUNWAY.x + across * Math.cos(h) + along * Math.sin(h),
    y,
    RUNWAY.z - across * Math.sin(h) + along * Math.cos(h),
  );
}

function buildAirport(scene) {
  const group = new THREE.Group();
  const y = RUNWAY.altitude + 0.2; // apron level = strip level
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x2e5a74, shininess: 160, specular: 0x99ccdd, emissive: 0x1a3344 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a5a6a });
  const hangarMat = new THREE.MeshLambertMaterial({ color: 0x8a94a0 });
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x2c3138 });

  // Apron slab: concrete under the terminal, hangars and tower. Spans
  // across 13..73 so it OVERLAPS the strip edge (15) — a 1 m gap there
  // showed the green terrain below as a band across the menu/end shots.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 175),
    new THREE.MeshLambertMaterial({ color: 0x8f9296 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.rotation.z = RUNWAY.heading;
  apron.position.copy(runwayPoint(0, 43, y));
  apron.receiveShadow = true;
  group.add(apron);
  // Taxiway: strip edge -> apron, at along +45.
  const taxi = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 9),
    new THREE.MeshLambertMaterial({ color: 0x7d8085 }),
  );
  taxi.rotation.x = -Math.PI / 2;
  taxi.rotation.z = RUNWAY.heading;
  taxi.position.copy(runwayPoint(45, 30, y + 0.02));
  taxi.receiveShadow = true;
  group.add(taxi);

  // A building group aligned with the runway: local +Z = along, local +X
  // = across (east). Walls sit on the apron (base y), never floating.
  const building = (along, across) => {
    const g = new THREE.Group();
    g.position.copy(runwayPoint(along, across, y));
    g.rotation.y = RUNWAY.heading;
    group.add(g);
    return g;
  };
  const box = (g, w, h, d, x, yOff, z, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, yOff + h / 2, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  // Terminal: long white block facing the runway, glass front, flat roof
  // with an overhang, and a MERIDIAN sign above the glass.
  const term = building(-10, 50);
  box(term, 12, 7, 26, 0, 0, 0, wallMat);
  box(term, 12.6, 5, 24, -0.4, 0.8, 0, glassMat); // glass front, runway side
  // Mullions break the big blue glass slab into window panes.
  for (const z of [-6, 0, 6]) {
    const mull = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5, 0.35), wallMat);
    mull.position.set(-6.78, 3.3, z);
    term.add(mull);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 24), wallMat);
  rail.position.set(-6.78, 3.3, 0);
  term.add(rail);
  box(term, 14, 0.5, 28, 0, 7, 0, roofMat); // roof overhang
  const signTex = canvasTexture(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.fillStyle = '#20344a';
    g.font = 'bold 52px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('MERIDIAN', 128, 128);
  });
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 2.2),
    new THREE.MeshBasicMaterial({ map: signTex, transparent: true }),
  );
  sign.position.set(-6.85, 6.3, 0); // proud of the glass face, under the roof
  sign.rotation.y = -Math.PI / 2;
  term.add(sign);

  // Hangar 1 (north): gable block with a big dark door facing the runway.
  const h1 = building(52, 52);
  box(h1, 14, 7, 18, 0, 0, 0, hangarMat);
  box(h1, 14.6, 5.5, 15, -0.4, 0.5, 0, doorMat);
  const roof1 = new THREE.Mesh(new THREE.ConeGeometry(13, 3, 4), roofMat); // square base ~18.4, covers 14×18
  roof1.position.set(0, 8.4, 0);
  roof1.rotation.y = Math.PI / 4;
  roof1.castShadow = true;
  h1.add(roof1);
  // Hangar 2 (south): same shape, smaller, door facing the runway.
  const h2 = building(-62, 54);
  box(h2, 12, 6, 15, 0, 0, 0, hangarMat);
  box(h2, 12.6, 4.5, 12.5, -0.4, 0.5, 0, doorMat);
  const roof2 = new THREE.Mesh(new THREE.ConeGeometry(11, 2.6, 4), roofMat); // square base ~15.6, covers 12×15
  roof2.position.set(0, 7.2, 0);
  roof2.rotation.y = Math.PI / 4;
  roof2.castShadow = true;
  h2.add(roof2);

  // Control tower: slim shaft + glass cab + roof disc, south of the terminal.
  const tower = building(-82, 44);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.4, 15, 10), wallMat);
  shaft.position.set(0, 7.5, 0);
  shaft.castShadow = true;
  tower.add(shaft);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 2.6, 2.8, 10), glassMat);
  cab.position.set(0, 16.2, 0);
  cab.castShadow = true;
  tower.add(cab);
  const cabRoof = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.5, 10), roofMat);
  cabRoof.position.set(0, 17.8, 0);
  tower.add(cabRoof);

  // Windsock: west side near the north end, clear of the approach line.
  const sock = new THREE.Group();
  sock.position.copy(runwayPoint(95, -26, y));
  group.add(sock);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 6), new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }));
  pole.position.y = 3.5;
  pole.castShadow = true;
  sock.add(pole);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 2.6, 8),
    new THREE.MeshLambertMaterial({ color: 0xff7a1a }),
  );
  cone.rotation.z = Math.PI / 2;
  cone.position.set(1.4, 6.7, 0);
  sock.add(cone);

  // Apron floodlight poles: two tall lights so the apron reads at dusk.
  for (const along of [-58, 48]) {
    const p = new THREE.Group();
    p.position.copy(runwayPoint(along, 66, y));
    group.add(p);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 9, 6), new THREE.MeshLambertMaterial({ color: 0x666666 }));
    mast.position.y = 4.5;
    p.add(mast);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    lamp.position.y = 9.1;
    p.add(lamp);
  }

  // Parked plane on the open apron south of the terminal: the same Cessna
  // model, in frame from the menu/end orbit. (At along +45 it sat inside
  // hangar 1's footprint; at along +28 it fell off the frame's right edge
  // past the terminal.)
  const parked = buildPlaneModel();
  parked.group.position.copy(runwayPoint(-40, 42, RUNWAY.altitude + 2));
  parked.group.rotation.y = Math.PI / 2 + RUNWAY.heading; // nose toward the runway
  group.add(parked.group);

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
    // Never near the airstrip: boulders on the hillside behind the runway
    // read as beige blobs floating on the slope in the menu/end shots (v3).
    if (Math.hypot(x - RUNWAY.x, z - RUNWAY.z) < 350) continue;
    const s = 2 + rng() * 4;
    const b = new THREE.Mesh(boulderGeo, rockMat);
    b.position.set(x, h - s * 0.15, z); // sunk into the slope, clearly grounded
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
  const sun = new THREE.DirectionalLight(0xffb066, 3.2); // v7: stronger key for HD contrast
  sun.position.copy(sunDir).multiplyScalar(600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); // restored: 1024 did not move the
  // swiftshader stall at the crash viewpoint (the test's 20 s watchdog
  // fires on the frozen sim clock by design while crashed), so the
  // verified 2x screenshots — taken with 2048 — stand as-is.
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 1600;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  // Warm fill from the south-west so the plane's shadowed side (and the
  // front view on the runway) stays readable instead of going black.
  // Stronger in v5: the hero camera looks at the plane's shaded side.
  const fill = new THREE.DirectionalLight(0xffd9b0, 1.05); // v7: a touch less fill — more contrast
  fill.position.set(-350, 220, 550);
  scene.add(fill);
  // Cool rim from the south-east so the plane keeps an edge against the sky
  // and sea on its shadowed side instead of going flat.
  const rim = new THREE.DirectionalLight(0xbfd4ff, 0.7); // v7: stronger rim edge
  rim.position.set(350, 240, 650);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x8fb0e0, 0x5a4a3a, 1.8));
  scene.add(new THREE.AmbientLight(0x604a38, 0.8));

  const dome = buildSky(scene, rng);
  const terrain = buildTerrain(scene);
  const { sea, glitter } = buildSea(scene);
  const clouds = buildClouds(scene, rng);
  buildRunway(scene);
  buildAirport(scene); // v7: terminal, hangars, tower, taxiway, windsock, parked plane
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
