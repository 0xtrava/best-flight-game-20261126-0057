// MERIDIAN RUN — shared constants, seeded random, course definition.
// One clear job: everything tunable lives here so the other files stay small.

export const WORLD = {
  size: 2400, // world spans -1200..1200 in x and z
  seaLevel: 0,
  sunAzimuth: -0.9, // golden-hour sun, low in the west
  sunElevation: 0.2,
  fogNear: 260,
  fogFar: 1500,
};

export const PLANE = {
  minSpeed: 22, // below this the plane stalls and sinks
  maxSpeed: 95,
  cruiseSpeed: 58,
  turnRate: 0.85, // rad/s at full bank
  pitchRate: 0.7,
  rollRate: 2.4,
  climbRate: 26,
  accel: 14,
};

export const RUNWAY = {
  // The airstrip on the main island. x runs east, z runs north.
  x: -40,
  z: -420,
  heading: 0.12, // radians, runway direction
  length: 260,
  width: 30,
  altitude: 6, // terrain is flattened to this under the strip
};

// The 12-ring course: a loop around the archipelago, starting at the runway
// and ending back over it for the landing. Each ring: centre + the direction
// the pilot should be flying when they pass it (the ring faces that way).
export const RING_RADIUS = 13;
export const RINGS = [
  { x: -40, y: 55, z: -700 },
  { x: 260, y: 70, z: -760 },
  { x: 520, y: 95, z: -520 },
  { x: 640, y: 120, z: -140 },
  { x: 520, y: 110, z: 220 },
  { x: 240, y: 85, z: 420 },
  { x: -120, y: 70, z: 520 },
  { x: -420, y: 95, z: 380 },
  { x: -620, y: 130, z: 80 },
  { x: -560, y: 105, z: -260 },
  { x: -330, y: 70, z: -480 },
  { x: -40, y: 45, z: -640 },
];

// Deterministic random: the same seed always builds the same islands.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Island peaks: [x, z, radius, height]. The terrain height function sums them.
export const PEAKS = [
  [-40, -420, 420, 42], // main island (holds the runway + town)
  [520, -520, 330, 78],
  [620, 60, 300, 96],
  [240, 430, 280, 64],
  [-420, 380, 300, 88],
  [-620, -120, 260, 70],
  [-140, 40, 220, 38],
  [820, -160, 200, 52],
  [60, -820, 240, 58],
  [-760, -560, 220, 46],
];

export function terrainHeight(x, z) {
  let h = 0;
  for (const [px, pz, r, peak] of PEAKS) {
    const dx = (x - px) / r;
    const dz = (z - pz) / r;
    const d2 = dx * dx + dz * dz;
    if (d2 < 4) h += peak * Math.exp(-d2 * 1.6);
  }
  // Gentle rolling noise on top so the ground is never a flat cone.
  h += 2.2 * Math.sin(x * 0.021 + 1.7) * Math.cos(z * 0.017 - 0.6);
  h += 1.1 * Math.sin(x * 0.043 - 0.4) * Math.sin(z * 0.039 + 2.1);
  // Flatten the runway strip so landings are possible.
  const dx = x - RUNWAY.x;
  const dz = z - RUNWAY.z;
  const along = dx * Math.sin(RUNWAY.heading) + dz * Math.cos(RUNWAY.heading);
  const across = dx * Math.cos(RUNWAY.heading) - dz * Math.sin(RUNWAY.heading);
  const flat = Math.max(0, 1 - Math.max(0, Math.abs(along) - RUNWAY.length / 2) / 60)
    * Math.max(0, 1 - Math.max(0, Math.abs(across) - RUNWAY.width / 2) / 45);
  // v7: apron shelf EAST of the strip (terminal, hangars, tower, parked
  // plane) — same altitude as the runway, feathered at its edges so the
  // island's slope takes over beyond it. Only the east side: the west side
  // stays wild hillside. Buildings sit on flat=1 ground at across 15..70.
  const apronSide = clamp((across - 8) / 10, 0, 1);
  const apronAlong = Math.max(0, 1 - Math.max(0, Math.abs(along) - 80) / 40);
  const apronAcross = Math.max(0, 1 - Math.max(0, across - 70) / 30);
  const apron = apronSide * apronAlong * apronAcross;
  const flatAll = Math.max(flat, apron);
  return h * (1 - flatAll) + RUNWAY.altitude * flatAll - 3;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
