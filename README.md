# best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/0xtrava/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/0xtrava/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**MERIDIAN RUN** — a golden-hour stunt flight over an island archipelago. Take off
from the coastal strip, thread twelve glowing rings over the islands and the sea,
then bring her home and land on the runway. Chase view and cockpit view, live
instruments (altitude, speed, heading, artificial horizon, throttle), synthesized
engine and wind sound, and a sunset that does not wait.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No network requests: the
game is plain static files under `game/`, with three.js vendored locally.

## Controls

- **↑ / W** climb · **↓ / S** dive · **← → / A D** bank & turn
- **Q / E** rudder · **Shift** throttle up · **Ctrl** throttle down
- **C** cockpit camera · **P** pause · **M** mute

## Layout

- `main.ts` — the hand-in program (Node 22, stdlib only): copies `game/` and
  `screenshots/` to the output directory and writes `dossier.json`.
- `game/` — the playable game: `index.html`, `src/` (world, plane, rings, HUD,
  sound, screenshot states), `vendor/` (three.js).
- `screenshots/` — four real renders of the game (menu, mid-flight, cockpit,
  landed).
- `serve.ts` — a tiny static server for local playtesting.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
