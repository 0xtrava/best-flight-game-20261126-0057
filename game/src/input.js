// MERIDIAN RUN — keyboard and mouse input.
// One clear job: turn raw DOM events into a small, testable control state.

export function createInput() {
  const keys = new Set();
  const state = {
    pitch: 0, // -1 (nose down) .. +1 (nose up)
    roll: 0, // -1 (left) .. +1 (right)
    yaw: 0, // -1 (left) .. +1 (right)
    throttleUp: false,
    throttleDown: false,
    fire: false, // edge: Space went down this frame (v8 missile fire)
    mouseDX: 0,
    mouseDY: 0,
    mouseActive: false,
  };

  const down = new Set();
  const pressed = new Set(); // edge-triggered keys, consumed by the game loop

  function onKeyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (!e.repeat) {
      pressed.add(e.key.toLowerCase());
      down.add(e.key.toLowerCase());
    }
    keys.add(e.key.toLowerCase());
  }
  function onKeyUp(e) {
    keys.delete(e.key.toLowerCase());
    down.delete(e.key.toLowerCase());
  }
  function onMouseMove(e) {
    if (!state.mouseActive) return;
    state.mouseDX += e.movementX || 0;
    state.mouseDY += e.movementY || 0;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);

  return {
    state,
    // True once for the frame after the key goes down.
    wasPressed(key) {
      return pressed.has(key.toLowerCase());
    },
    isDown(key) {
      return down.has(key.toLowerCase());
    },
    // Read the analog controls from the current key set, then clear edges.
    poll() {
      const k = keys;
      const up = k.has('arrowup') || k.has('w');
      const dn = k.has('arrowdown') || k.has('s');
      const lf = k.has('arrowleft') || k.has('a');
      const rt = k.has('arrowright') || k.has('d');
      state.pitch = (up ? 1 : 0) - (dn ? 1 : 0); // arcade style: up = climb
      state.roll = (rt ? 1 : 0) - (lf ? 1 : 0);
      // A/D double as yaw when the player holds Q/E-free flying: A/D roll the
      // plane, and the banked turn does the yawing. Q/E give flat rudder yaw.
      state.yaw = (k.has('e') ? 1 : 0) - (k.has('q') ? 1 : 0);
      state.throttleUp = k.has('shift');
      state.throttleDown = k.has('control');
      state.fire = pressed.has(' ');
      pressed.clear();
      const dx = state.mouseDX;
      const dy = state.mouseDY;
      state.mouseDX = 0;
      state.mouseDY = 0;
      return { mouseDX: dx, mouseDY: dy };
    },
  };
}
