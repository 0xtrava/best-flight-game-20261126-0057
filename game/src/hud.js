// MERIDIAN RUN — HUD, menus and results screens (DOM overlay).
// One clear job: everything the player reads, and every screen between flights.

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    alt: $('hud-alt'),
    spd: $('hud-spd'),
    hdg: $('hud-hdg'),
    compass: $('compass-strip'),
    score: $('hud-score'),
    rings: $('hud-rings'),
    time: $('hud-time'),
    throttleFill: $('throttle-fill'),
    horizon: $('horizon-disc'),
    horizonLine: $('horizon-line'),
    chevron: $('chevron'),
    targetDist: $('target-dist'),
    targetLabel: $('target-label'),
    toast: $('toast'),
    menu: $('menu'),
    menuBest: $('menu-best'),
    pause: $('pause'),
    results: $('results'),
    resultsScore: $('results-score'),
    resultsDetail: $('results-detail'),
    resultsBest: $('results-best'),
    dash: $('dash'),
    dashAlt: $('dash-alt'),
    dashSpd: $('dash-spd'),
    dashHdg: $('dash-hdg'),
    dashThr: $('dash-thr'),
  };

  let toastTimer = 0;
  const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  // Build the sliding compass strip: two identical 720px copies of the
  // 0..360 degree ticks (2px per degree) so it wraps seamlessly.
  (function buildCompass() {
    const strip = el.compass;
    if (!strip) return;
    let html = '';
    for (let copy = 0; copy < 2; copy++) {
      for (let d = 0; d < 360; d += 10) {
        const label = d % 90 === 0 ? CARDINALS[(d / 45) % 8] : d % 30 === 0 ? String(d).padStart(3, '0') : '·';
        html += `<span class="tick" style="left:${copy * 720 + d * 2}px">${label}</span>`;
      }
    }
    strip.innerHTML = html;
  })();

  function headingDeg(yaw) {
    // Bearing clockwise from north (-Z): east = +X, north = -Z.
    const deg = (Math.atan2(Math.sin(yaw), -Math.cos(yaw)) * 180) / Math.PI;
    return Math.round(((deg % 360) + 360) % 360);
  }

  function cardinal(deg) {
    return CARDINALS[Math.round(deg / 45) % 8];
  }

  return {
    headingDeg,
    showToast(text, ms = 1600) {
      el.toast.textContent = text;
      el.toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
    },
    showMenu(best) {
      el.menu.classList.remove('hidden');
      el.results.classList.add('hidden');
      el.pause.classList.add('hidden');
      el.hud.classList.add('dim');
      el.menuBest.textContent = best > 0 ? `Best score: ${best.toLocaleString('en-US')}` : 'First flight — good luck, pilot.';
      // The menu card already explains the rings; keep the chevron off it.
      document.getElementById('chevron').style.display = 'none';
      document.getElementById('target-box').style.display = 'none';
    },
    hideMenu() {
      el.menu.classList.add('hidden');
      el.hud.classList.remove('dim');
      document.getElementById('chevron').style.display = '';
      document.getElementById('target-box').style.display = '';
    },
    showPause(show) {
      el.pause.classList.toggle('hidden', !show);
    },
    showResults({ score, rings, totalRings, seconds, landingBonus, best, isBest }) {
      el.resultsScore.textContent = score.toLocaleString('en-US');
      el.resultsDetail.textContent =
        `Rings ${rings}/${totalRings}  ·  Time ${formatTime(seconds)}  ·  Landing bonus +${landingBonus.toLocaleString('en-US')}`;
      el.resultsBest.textContent = isBest
        ? 'New best score!'
        : `Best: ${best.toLocaleString('en-US')}`;
      el.results.classList.remove('hidden');
    },
    hideResults() {
      el.results.classList.add('hidden');
    },
    setCockpit(on) {
      el.dash.classList.toggle('hidden', !on);
      // In the cockpit the dashboard shows the same numbers: hide the
      // floating attitude panel and the key hint so the view stays clean.
      document.getElementById('panel-attitude').classList.toggle('hidden', on);
      document.getElementById('hint').classList.toggle('hidden', on);
    },
    // Called every frame while flying.
    update(flight, course, elapsed, cameraMode, gameState) {
      const { pos, speed, throttle, pitch, roll, yaw } = flight;
      const knots = Math.round(speed * 1.9);
      const feet = Math.round(pos.y * 3.28);
      const deg = headingDeg(yaw);
      el.alt.textContent = `${feet.toLocaleString('en-US')} ft`;
      el.spd.textContent = `${knots} kt`;
      el.hdg.textContent = `${String(deg).padStart(3, '0')}° ${cardinal(deg)}`;
      el.compass.style.transform = `translateX(${120 - deg * 2}px)`;
      el.score.textContent = course.state.score.toLocaleString('en-US');
      el.rings.textContent = `${course.state.passedCount}/12`;
      el.time.textContent = formatTime(elapsed);
      el.throttleFill.style.height = `${Math.round(throttle * 100)}%`;
      el.horizonLine.style.transform = `rotate(${-roll}rad) translateY(${pitch * 42}px)`;
      el.horizon.style.transform = `rotate(0deg)`;

      // Next-ring chevron: rotate by the bearing relative to the heading.
      // Only while flying — on the menu/results screens the cards own it.
      const target = gameState === 'flying' ? course.nextRing() : null;
      if (gameState !== 'flying') {
        el.chevron.style.opacity = '0';
        document.getElementById('target-box').style.display = 'none';
      } else if (target) {
        document.getElementById('target-box').style.display = '';
        const dx = target.center.x - pos.x;
        const dz = target.center.z - pos.z;
        const bearing = Math.atan2(dx, dz); // bearing in the same frame as yaw
        let rel = bearing - yaw;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        el.chevron.style.transform = `translate(-50%, -50%) rotate(${rel}rad)`;
        const dist = Math.round(Math.hypot(dx, target.center.y - pos.y, dz));
        el.targetDist.textContent = `${dist} m`;
        el.targetLabel.textContent = `RING ${course.state.nextIndex + 1}`;
        el.chevron.style.opacity = '1';
      } else {
        document.getElementById('target-box').style.display = '';
        el.targetLabel.textContent = 'RETURN TO RUNWAY';
        const dx = -40 - pos.x;
        const dz = -420 - pos.z;
        const bearing = Math.atan2(dx, dz);
        let rel = bearing - yaw;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        el.chevron.style.transform = `translate(-50%, -50%) rotate(${rel}rad)`;
        el.targetDist.textContent = `${Math.round(Math.hypot(dx, dz))} m`;
      }
      if (cameraMode === 'cockpit') {
        el.dashAlt.textContent = `${feet}`;
        el.dashSpd.textContent = `${knots}`;
        el.dashHdg.textContent = `${String(deg).padStart(3, '0')}°`;
        el.dashThr.textContent = `${Math.round(throttle * 100)}%`;
      }
    },
  };
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
