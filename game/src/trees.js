// MERIDIAN RUN — trees: palms, broadleaf trees and bushes (InstancedMesh).
// One clear job: green detail the player can see from the air — clusters near
// the town, the beaches and the runway, scattered on the hills.

import * as THREE from 'three';
import { RUNWAY, terrainHeight, mulberry32 } from './config.js';

// True while the point sits near the airstrip (runway + approaches): keep
// the strip and its final approach clear of trees.
function nearRunway(x, z) {
  const dx = x - RUNWAY.x;
  const dz = z - RUNWAY.z;
  const along = dx * Math.sin(RUNWAY.heading) + dz * Math.cos(RUNWAY.heading);
  const across = dx * Math.cos(RUNWAY.heading) - dz * Math.sin(RUNWAY.heading);
  return Math.abs(along) < RUNWAY.length / 2 + 80 && Math.abs(across) < RUNWAY.width / 2 + 45;
}

export function buildTrees(scene, seed = 1) {
  const rng = mulberry32(seed * 31 + 7);
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();

  const palms = [];
  const broadleaf = [];
  const bushes = [];

  // Random scatter over the whole world, classified by ground height.
  for (let i = 0; i < 900; i++) {
    const x = (rng() - 0.5) * 2200;
    const z = (rng() - 0.5) * 2200;
    if (nearRunway(x, z)) continue;
    const h = terrainHeight(x, z);
    if (h < 1.2) continue;
    if (h < 6 && rng() < 0.5) palms.push([x, h, z]);
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
    if (h > 1) palms.push([x, h, z]);
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

  // ---- palms: tilted trunk + a fan of drooping fronds -------------------
  const palmTrunkGeo = new THREE.CylinderGeometry(0.26, 0.42, 7, 6);
  const palmTrunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const palmTrunks = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, palms.length);
  const frondGeo = new THREE.ConeGeometry(0.55, 4.2, 4);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f3a, side: THREE.DoubleSide });
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palms.length * 7);
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
    for (let f = 0; f < 7; f++) {
      const a = (f / 7) * Math.PI * 2 + rng() * 0.3;
      dummy.position.set(topX + Math.cos(a) * 0.9, topY, topZ + Math.sin(a) * 0.9);
      dummy.rotation.set(0, 0, 0);
      dummy.rotation.order = 'YXZ';
      dummy.rotation.y = Math.PI / 2 - a;
      dummy.rotation.x = 2.0 + rng() * 0.3;
      dummy.scale.set(1, 1, 0.3);
      dummy.updateMatrix();
      fronds.setMatrixAt(i * 7 + f, dummy.matrix);
    }
    dummy.rotation.order = 'XYZ';
  });
  palmTrunks.castShadow = true;
  palmTrunks.frustumCulled = false;
  fronds.frustumCulled = false;
  group.add(palmTrunks);
  group.add(fronds);

  // ---- broadleaf: trunk + two-tone canopy spheres ------------------------
  const leafTrunkGeo = new THREE.CylinderGeometry(0.3, 0.48, 4.5, 6);
  const leafTrunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
  const leafTrunks = new THREE.InstancedMesh(leafTrunkGeo, leafTrunkMat, broadleaf.length);
  const canopyGeo = new THREE.IcosahedronGeometry(1, 0);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, broadleaf.length * 2);
  const canopyColors = [new THREE.Color(0x4a7d33), new THREE.Color(0x5d8a3c), new THREE.Color(0x3d6b2f)];
  broadleaf.forEach(([x, h, z], i) => {
    dummy.position.set(x, h + 2.1, z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    leafTrunks.setMatrixAt(i, dummy.matrix);
    const s = 2.6 + rng() * 1.8;
    dummy.position.set(x, h + 4.6, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(s, s * 0.85, s);
    dummy.updateMatrix();
    canopies.setMatrixAt(i * 2, dummy.matrix);
    canopies.setColorAt(i * 2, canopyColors[Math.floor(rng() * 3)]);
    dummy.position.set(x + (rng() - 0.5) * 2.4, h + 5.6, z + (rng() - 0.5) * 2.4);
    dummy.scale.set(s * 0.62, s * 0.55, s * 0.62);
    dummy.updateMatrix();
    canopies.setMatrixAt(i * 2 + 1, dummy.matrix);
    canopies.setColorAt(i * 2 + 1, canopyColors[Math.floor(rng() * 3)]);
  });
  leafTrunks.castShadow = true;
  leafTrunks.frustumCulled = false;
  canopies.castShadow = true;
  canopies.frustumCulled = false;
  group.add(leafTrunks);
  group.add(canopies);

  // ---- bushes: low green blobs --------------------------------------------
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);
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
