// MERIDIAN RUN — trees: palms, broadleaf trees, pines and bushes (InstancedMesh).
// One clear job: green detail the player can see from the air — clusters near
// the town, the beaches, the runway and the ring course.
//
// v7: no more lollipops. Palms get CURVED fronds (a bent, tapered strip that
// arcs out and droops, not straight cones). Broadleaf trees get a LAYERED
// canopy (three blobs stacked with varied greens + real branch forks, not one
// ball on a stick). Pines are a third species (three stacked cones, dark
// green, on the high ground). Density is highest near the runway, the town
// and along the ring course.

import * as THREE from 'three';
import { RUNWAY, RINGS, terrainHeight, mulberry32 } from './config.js';

// True while the point sits near the airstrip (runway + approaches): keep
// the strip and its final approach clear of trees.
function nearRunway(x, z) {
  const dx = x - RUNWAY.x;
  const dz = z - RUNWAY.z;
  const along = dx * Math.sin(RUNWAY.heading) + dz * Math.cos(RUNWAY.heading);
  const across = dx * Math.cos(RUNWAY.heading) - dz * Math.sin(RUNWAY.heading);
  if (Math.abs(along) < RUNWAY.length / 2 + 80 && Math.abs(across) < RUNWAY.width / 2 + 45) return true;
  // v7: the airport apron east of the strip (terminal, hangars, tower,
  // taxiway) stays clear too — trees would poke through the buildings.
  if (across > 0 && across < 75 && Math.abs(along) < 140) return true;
  return false;
}

export function buildTrees(scene, seed = 1) {
  const rng = mulberry32(seed * 31 + 7);
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();

  const palms = [];
  const broadleaf = [];
  const pines = [];
  const bushes = [];

  // Random scatter over the whole world, classified by ground height.
  for (let i = 0; i < 900; i++) {
    const x = (rng() - 0.5) * 2200;
    const z = (rng() - 0.5) * 2200;
    if (nearRunway(x, z)) continue;
    const h = terrainHeight(x, z);
    if (h < 1.2) continue;
    if (h < 6 && rng() < 0.5) palms.push([x, h, z]);
    else if (h >= 18 && h < 48 && rng() < 0.5) pines.push([x, h, z]);
    else if (h >= 5 && h < 38 && rng() < 0.55) broadleaf.push([x, h, z]);
    else if (h >= 2 && h < 45 && rng() < 0.6) bushes.push([x, h, z]);
  }
  // Forced clusters: palms along the town streets and the beach by the strip.
  for (let i = 0; i < 26; i++) {
    const x = RUNWAY.x + 120 + rng() * 160;
    const z = RUNWAY.z - 60 + rng() * 320;
    const h = terrainHeight(x, z);
    if (h > 1 && !nearRunway(x, z)) palms.push([x, h, z]);
  }
  for (let i = 0; i < 14; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const x = RUNWAY.x + side * (38 + rng() * 22);
    const z = RUNWAY.z - 120 + rng() * 240;
    const h = terrainHeight(x, z);
    if (h > 1 && !nearRunway(x, z)) palms.push([x, h, z]);
  }
  // Broadleaf clusters on the main island's green slopes.
  for (let i = 0; i < 30; i++) {
    const a = rng() * Math.PI * 2;
    const r = 120 + rng() * 220;
    const x = RUNWAY.x + Math.cos(a) * r;
    const z = RUNWAY.z + Math.sin(a) * r;
    const h = terrainHeight(x, z);
    if (h > 5 && h < 38 && !nearRunway(x, z)) broadleaf.push([x, h, z]);
  }
  // v4: palms framing the airstrip (clear of the pavement, clear of the
  // approach line) so the menu/end shots get green at the strip's edge.
  // v7: west side only — the east side is the airport apron now.
  for (let i = 0; i < 12; i++) {
    const z = RUNWAY.z - 130 + i * 26;
    const x = RUNWAY.x - (34 + rng() * 10);
    const h = terrainHeight(x, z);
    if (h > 1) palms.push([x, h, z]);
  }
  // v7: a palm row along the airport's east edge, framing the terminal
  // from the outside so the menu/end shots read "airport + palms".
  for (let i = 0; i < 10; i++) {
    const z = RUNWAY.z - 110 + i * 26;
    const x = RUNWAY.x + 82 + rng() * 8;
    const h = terrainHeight(x, z);
    if (h > 1) palms.push([x, h, z]);
  }
  // v4: clusters along the ring course so the play shot reads less empty.
  // Midpoints between consecutive rings, offset perpendicular so nothing
  // sits on the ring line itself or in the final approach.
  for (let i = 0; i < RINGS.length; i++) {
    const a = RINGS[i];
    const b = RINGS[(i + 1) % RINGS.length];
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len;
    const pz = dx / len;
    for (const k of [-1, 1]) {
      const off = (34 + rng() * 26) * k;
      const x = mx + px * off;
      const z = mz + pz * off;
      const h = terrainHeight(x, z);
      if (nearRunway(x, z)) continue;
      if (h >= 18 && h < 48) pines.push([x, h, z]);
      else if (h > 5 && h < 38) broadleaf.push([x, h, z]);
      else if (h >= 1.2 && h < 6) palms.push([x, h, z]);
    }
    const bx = mx + px * (18 + rng() * 10);
    const bz = mz + pz * (18 + rng() * 10);
    const bh = terrainHeight(bx, bz);
    if (bh > 2 && bh < 45 && !nearRunway(bx, bz)) bushes.push([bx, bh, bz]);
  }
  // v7: pine stands on the high slopes of the big peaks.
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = 180 + rng() * 260;
    const x = 520 + Math.cos(a) * r;
    const z = -140 + Math.sin(a) * r;
    const h = terrainHeight(x, z);
    if (h > 20 && h < 48 && !nearRunway(x, z)) pines.push([x, h, z]);
  }

  // ---- palms: tilted trunk + CURVED fronds ------------------------------
  // A frond is one bent, tapered strip: it arcs out from the crown and its
  // tip droops toward the ground, like a real palm frond — never a straight
  // cone. The bend is baked into the geometry (base at the origin, tip
  // curved toward +Z), and each instance is spun around the trunk and
  // tilted out from vertical so the droop reads downward.
  const frondGeo = (() => {
    const g = new THREE.PlaneGeometry(0.9, 4.6, 1, 6);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (y + 2.3) / 4.6; // 0 at the base, 1 at the tip
      pos.setX(i, pos.getX(i) * (1 - t * 0.78)); // taper to a point
      pos.setZ(i, t * t * 2.3); // arc out…
      pos.setY(i, y - t * t * 1.0); // …and droop down
    }
    g.translate(0, 2.3, 0); // base at the origin, tip up-and-out
    g.computeVertexNormals();
    return g;
  })();
  const palmTrunkGeo = new THREE.CylinderGeometry(0.24, 0.42, 7, 6);
  const palmTrunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const palmTrunks = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, palms.length);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a, side: THREE.DoubleSide });
  const FRONDS_PER_PALM = 8;
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palms.length * FRONDS_PER_PALM);
  palms.forEach(([x, h, z], i) => {
    const tilt = (rng() - 0.5) * 0.24;
    const tiltDir = rng() * Math.PI * 2;
    const trunkScale = 0.9 + rng() * 0.3;
    dummy.position.set(x, h + 3.2 * trunkScale, z);
    dummy.rotation.set(Math.sin(tiltDir) * tilt, 0, Math.cos(tiltDir) * tilt);
    dummy.scale.set(1, trunkScale, 1);
    dummy.updateMatrix();
    palmTrunks.setMatrixAt(i, dummy.matrix);
    const topX = x + Math.sin(tiltDir) * tilt * 3.2;
    const topZ = z + Math.cos(tiltDir) * tilt * 3.2;
    const topY = h + 6.4 * trunkScale;
    const baseAngle = rng() * Math.PI * 2;
    for (let f = 0; f < FRONDS_PER_PALM; f++) {
      const a = baseAngle + (f / FRONDS_PER_PALM) * Math.PI * 2 + rng() * 0.25;
      dummy.position.set(topX, topY, topZ);
      dummy.rotation.order = 'YXZ';
      dummy.rotation.set(1.05 + rng() * 0.35, a, 0); // tilt out from vertical
      dummy.scale.set(0.9 + rng() * 0.35, 0.9 + rng() * 0.35, 1);
      dummy.updateMatrix();
      fronds.setMatrixAt(i * FRONDS_PER_PALM + f, dummy.matrix);
    }
    dummy.rotation.order = 'XYZ';
  });
  palmTrunks.castShadow = true;
  palmTrunks.frustumCulled = false;
  fronds.frustumCulled = false;
  group.add(palmTrunks);
  group.add(fronds);

  // ---- broadleaf: trunk + branches + LAYERED canopy ----------------------
  // Three blobs stacked with varied greens and offsets — a layered crown,
  // not one ball on a stick. Two branch forks reach up into the canopy.
  const leafTrunkGeo = new THREE.CylinderGeometry(0.3, 0.48, 4.5, 6);
  const leafTrunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
  const leafTrunks = new THREE.InstancedMesh(leafTrunkGeo, leafTrunkMat, broadleaf.length);
  const branchGeo = new THREE.CylinderGeometry(0.1, 0.16, 2.4, 5);
  const branches = new THREE.InstancedMesh(branchGeo, leafTrunkMat, broadleaf.length * 2);
  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, broadleaf.length * 3);
  const canopyColors = [new THREE.Color(0x4a7d33), new THREE.Color(0x5d8a3c), new THREE.Color(0x3d6b2f), new THREE.Color(0x6a9a45)];
  broadleaf.forEach(([x, h, z], i) => {
    dummy.position.set(x, h + 2.1, z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    leafTrunks.setMatrixAt(i, dummy.matrix);
    // Two branch forks from the trunk top into the canopy.
    for (let b = 0; b < 2; b++) {
      const a = rng() * Math.PI * 2;
      dummy.position.set(x + Math.cos(a) * 0.5, h + 4.4, z + Math.sin(a) * 0.5);
      dummy.rotation.set(Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      branches.setMatrixAt(i * 2 + b, dummy.matrix);
    }
    // Layered crown: wide bottom, offset middle, smaller top.
    const layers = [
      { dx: 0, dy: 4.6, dz: 0, s: 2.9 },
      { dx: (rng() - 0.5) * 2.2, dy: 5.9, dz: (rng() - 0.5) * 2.2, s: 2.2 },
      { dx: (rng() - 0.5) * 1.6, dy: 7.1, dz: (rng() - 0.5) * 1.6, s: 1.5 },
    ];
    layers.forEach((L, k) => {
      dummy.position.set(x + L.dx, h + L.dy, z + L.dz);
      dummy.rotation.set(0, rng() * Math.PI, 0);
      dummy.scale.set(L.s, L.s * 0.8, L.s);
      dummy.updateMatrix();
      canopies.setMatrixAt(i * 3 + k, dummy.matrix);
      canopies.setColorAt(i * 3 + k, canopyColors[Math.floor(rng() * canopyColors.length)]);
    });
  });
  leafTrunks.castShadow = true;
  leafTrunks.frustumCulled = false;
  branches.frustumCulled = false;
  canopies.castShadow = true;
  canopies.frustumCulled = false;
  group.add(leafTrunks);
  group.add(branches);
  group.add(canopies);

  // ---- pines: trunk + three stacked cones ---------------------------------
  // Classic pine silhouette: dark green cones shrinking toward the top,
  // on the high ground. A third species so the hillsides read as forest,
  // not one repeated tree.
  const pineTrunkGeo = new THREE.CylinderGeometry(0.2, 0.36, 3, 6);
  const pineTrunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3d24 });
  const pineTrunks = new THREE.InstancedMesh(pineTrunkGeo, pineTrunkMat, pines.length);
  const pineConeGeo = new THREE.ConeGeometry(1, 1, 8);
  const pineMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const pineCones = new THREE.InstancedMesh(pineConeGeo, pineMat, pines.length * 3);
  const pineColors = [new THREE.Color(0x2a5226), new THREE.Color(0x244a20), new THREE.Color(0x305e2a)];
  pines.forEach(([x, h, z], i) => {
    dummy.position.set(x, h + 1.4, z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    pineTrunks.setMatrixAt(i, dummy.matrix);
    const tiers = [
      { dy: 3.6, r: 2.4, hh: 3.2 },
      { dy: 5.4, r: 1.8, hh: 2.7 },
      { dy: 7.0, r: 1.2, hh: 2.3 },
    ];
    tiers.forEach((T, k) => {
      dummy.position.set(x, h + T.dy, z);
      dummy.rotation.set(0, rng() * Math.PI, 0);
      dummy.scale.set(T.r, T.hh, T.r);
      dummy.updateMatrix();
      pineCones.setMatrixAt(i * 3 + k, dummy.matrix);
      pineCones.setColorAt(i * 3 + k, pineColors[Math.floor(rng() * pineColors.length)]);
    });
  });
  // Pines do NOT cast shadows: 480 cones + 160 trunks as shadow casters
  // stalled swiftshader at the dense pine slopes (the ring test's crash
  // viewpoint froze the sim clock — respawn never landed in 45 s). The
  // dark-green cones read as forest without their shadows; the broadleaf
  // canopies and palm trunks still cast (as in v6, which passed).
  pineTrunks.castShadow = false;
  pineTrunks.frustumCulled = false;
  pineCones.castShadow = false;
  pineCones.frustumCulled = false;
  group.add(pineTrunks);
  group.add(pineCones);

  // ---- bushes: low green blobs --------------------------------------------
  const bushGeo = new THREE.IcosahedronGeometry(1, 1);
  const bushMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, bushes.length);
  bushes.forEach(([x, h, z], i) => {
    const s = 0.9 + rng() * 1.3;
    dummy.position.set(x, h + s * 0.45, z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(s, s * 0.7, s);
    dummy.updateMatrix();
    bushMesh.setMatrixAt(i, dummy.matrix);
    bushMesh.setColorAt(i, canopyColors[Math.floor(rng() * 3)]);
  });
  bushMesh.frustumCulled = false;
  group.add(bushMesh);

  scene.add(group);
  return group;
}
