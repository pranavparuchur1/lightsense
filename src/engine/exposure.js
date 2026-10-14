// Exposure solver.
//
// The exposure equation (at ISO 100):     EV100 = log2(N² / t)
// Scaled for ISO:                         EV100 = log2(N² / t) − log2(ISO / 100)
//
// We work in stops throughout. `exposureNeed` says how many stops the settings
// under-expose the scene (positive = too dark, negative = too bright). The solver
// starts from a scene's target settings and walks its ordered adjustment steps
// (scene.brighten or scene.darken) until the need is zero or every step hits its limit.

import { APERTURES, ISOS, LIMITS, SENSORS, SHUTTERS, apertureFloor, clamp, fmtAperture, fmtShutter, fmtStops, snap } from './camera.js';
import { SCENES } from './scenes.js';

const log2 = Math.log2;

/** Exposure value of a set of camera settings, normalised to ISO 100. */
export const settingsEv = ({ aperture, shutter, iso }) => log2((aperture * aperture) / shutter) - log2(iso / 100);

/** Stops of under-exposure (positive) or over-exposure (negative) for these settings in a scene of `ev100`. */
export const exposureNeed = (s, ev100) => settingsEv(s) - ev100;

/** Reciprocal rule: slowest safe handheld shutter, in seconds. */
export function handheldLimit(ffFocal, stabStops = 0, factor = 1) {
  return (1 / (ffFocal * factor)) * 2 ** stabStops;
}

/** The 500 rule: longest exposure (s) before stars visibly trail. ffFocal = focal × crop. */
export const rule500 = (ffFocal) => Math.min(LIMITS.slowestShutter, 500 / ffFocal);

const COMMON_ND = [
  { stops: 1, name: 'ND2' },
  { stops: 2, name: 'ND4' },
  { stops: 3, name: 'ND8' },
  { stops: 6, name: 'ND64' },
  { stops: 10, name: 'ND1000' },
  { stops: 15, name: 'ND32000' },
];

/**
 * Build the numeric limits each parameter may move within, for a given scene and gear.
 * Kept separate so the reciprocity sliders can reuse it.
 */
export function buildLimits(scene, { crop, ffFocal, lensMaxAperture, fixedAperture, stabStops, maxIso, useTripod }) {
  const hh = handheldLimit(ffFocal, stabStops, scene.handheldFactor ?? 1);
  const resolveShutter = (v) => {
    if (v === 'handheld') return useTripod ? LIMITS.slowestShutter : hh;
    if (v === 'rule500') return rule500(ffFocal);
    return v;
  };

  let slowest = resolveShutter(scene.shutter.slowest);
  if (!useTripod) slowest = Math.min(slowest, hh); // never slower than you can hold
  const fastest = Math.max(LIMITS.fastestShutter, scene.shutter.fastest ?? LIMITS.fastestShutter);

  const widest = fixedAperture ?? apertureFloor(Math.max(scene.aperture.min, lensMaxAperture ?? LIMITS.minAperture));
  const narrowest = fixedAperture ?? Math.max(widest, scene.aperture.max);

  const isoMax = Math.min(maxIso, scene.iso.max ?? Infinity);
  const isoMin = Math.min(scene.iso.min ?? LIMITS.baseIso, isoMax);

  let apertureTarget = scene.aperture.target;
  if (scene.dofEquivalent) apertureTarget = apertureTarget / crop;
  apertureTarget = fixedAperture ?? clamp(apertureTarget, widest, narrowest);

  let shutterTarget = resolveShutter(scene.shutter.target);
  shutterTarget = clamp(shutterTarget, fastest, Math.max(fastest, slowest));

  return {
    handheld: hh,
    aperture: { target: apertureTarget, widest, narrowest, fixed: fixedAperture != null },
    shutter: { target: shutterTarget, fastest, slowest },
    iso: { target: clamp(scene.iso.start, isoMin, isoMax), min: isoMin, max: isoMax },
  };
}

/**
 * Move one parameter by up to `want` stops in direction `dir` (+1 brighten, −1 darken).
 * Returns { value, moved } where moved is the number of stops actually applied.
 */
function moveParam(p, value, dir, want, lim, stepTo) {
  if (p === 'aperture') {
    // Opening (smaller f-number) brightens. One stop = factor √2 in f-number.
    if (lim.fixed) return { value, moved: 0, atLimit: true };
    const limit = dir > 0
      ? Math.max(lim.widest, stepTo ?? lim.widest) // never wider than the lens/scene allows
      : Math.min(LIMITS.maxAperture, stepTo ?? lim.narrowest); // a step may go past the scene's max (e.g. f/16)
    const avail = dir > 0 ? 2 * log2(value / limit) : 2 * log2(limit / value);
    const moved = clamp(Math.min(want, avail), 0, Infinity);
    return { value: value / 2 ** ((dir * moved) / 2), moved, atLimit: avail <= want + 1e-9 };
  }
  if (p === 'shutter') {
    const limit = dir > 0 ? Math.min(stepTo ?? lim.slowest, lim.slowest) : Math.max(stepTo ?? lim.fastest, lim.fastest);
    const avail = dir > 0 ? log2(limit / value) : log2(value / limit);
    const moved = clamp(Math.min(want, avail), 0, Infinity);
    return { value: value * 2 ** (dir * moved), moved, atLimit: avail <= want + 1e-9 };
  }
  // iso
  const limit = dir > 0 ? Math.min(stepTo ?? lim.max, lim.max) : Math.max(stepTo ?? lim.min, lim.min);
  const avail = dir > 0 ? log2(limit / value) : log2(value / limit);
  const moved = clamp(Math.min(want, avail), 0, Infinity);
  return { value: value * 2 ** (dir * moved), moved, atLimit: avail <= want + 1e-9 };
}

/** Run the scene's step list against a starting point. Pure; returns final values + a move log. */
function runSteps(scene, start, ev, lim) {
  const s = { ...start };
  const log = [];
  let need = exposureNeed(s, ev);
  const dir = need > 0 ? 1 : -1;
  const steps = dir > 0 ? scene.brighten : scene.darken;
  for (const step of steps) {
    if (Math.abs(need) < 0.01) break;
    const r = moveParam(step.p, s[step.p], dir, Math.abs(need), lim[step.p], step.to);
    if (r.moved > 0.001) {
      s[step.p] = r.value;
      log.push({ p: step.p, dir, stops: r.moved, atLimit: r.atLimit });
      need -= dir * r.moved;
    }
  }
  return { settings: s, need, log };
}

/** Snap to real camera scales. Rounding each value independently can stack up ~⅓ stop of error,
 * so the last parameter the solver moved ("absorber") is re-solved exactly after the other two
 * are snapped, then snapped itself (never past its limit). */
function snapSettings(s, fixedAperture, ev, absorber, lim) {
  const out = {
    aperture: fixedAperture ?? snap(s.aperture, APERTURES),
    shutter: s.shutter > LIMITS.slowestShutter ? Math.round(s.shutter) : snap(s.shutter, SHUTTERS),
    iso: snap(Math.max(LIMITS.baseIso, s.iso), ISOS),
  };
  if (!absorber || ev == null || (absorber === 'aperture' && fixedAperture)) return out;

  const need = exposureNeed(out, ev); // + = too dark
  if (absorber === 'iso') {
    const exact = clamp(out.iso * 2 ** need, lim.iso.min, lim.iso.max);
    out.iso = ISOS.filter((i) => i <= lim.iso.max * 1.01).reduce((b, i) => (Math.abs(Math.log2(i / exact)) < Math.abs(Math.log2(b / exact)) ? i : b), ISOS[0]);
  } else if (absorber === 'shutter') {
    const exact = clamp(out.shutter * 2 ** need, lim.shutter.fastest, lim.shutter.slowest);
    out.shutter = exact > LIMITS.slowestShutter ? Math.round(exact) : snap(exact, SHUTTERS.filter((t) => t <= lim.shutter.slowest * 1.03));
  } else {
    const exact = clamp(out.aperture / 2 ** (need / 2), lim.aperture.widest, LIMITS.maxAperture);
    out.aperture = snap(exact, APERTURES.filter((a) => a >= lim.aperture.widest * 0.97));
  }
  return out;
}

/**
 * Main solver.
 * @param {object} p
 * @param {string} p.sceneKey
 * @param {number} p.ev100        scene brightness from light.js
 * @param {object} p.gear         { sensor, maxIso, stabStops, hasTripod }
 * @param {object} [p.lens]       { ffFocal, maxAperture, name } — chosen lens (from lenses.js)
 * @param {boolean} [p.forceHandheld]  ignore the tripod (used for the "handheld instead" alternative)
 */
export function solveExposure({ sceneKey, ev100, gear, lens, forceHandheld = false }) {
  const scene = SCENES[sceneKey];
  const sensor = SENSORS[gear.sensor] ?? SENSORS.ff;
  const crop = sensor.crop;
  const ffFocal = lens?.ffFocal ?? scene.lens.ideal;
  // Phones: the aperture is fixed, and differs per camera module (main vs tele).
  const fixedAperture = sensor.fixedAperture != null ? lens?.maxAperture ?? sensor.fixedAperture : null;
  const hasTripod = gear.hasTripod !== false;
  const useTripod =
    !forceHandheld && (scene.tripod === 'required' || (scene.tripod === 'prefer' && hasTripod));

  const ctx = {
    crop,
    ffFocal,
    // No lens known: assume the scene's recommended lens rather than an impossibly fast one.
    lensMaxAperture: lens?.maxAperture ?? scene.lens.maxAperture,
    fixedAperture,
    stabStops: useTripod ? 0 : gear.stabStops ?? 0,
    maxIso: gear.maxIso ?? 6400,
    useTripod,
  };
  const lim = buildLimits(scene, ctx);
  const ev = ev100 + (scene.evOffset ?? 0);

  const start = { aperture: lim.aperture.target, shutter: lim.shutter.target, iso: lim.iso.target };
  const { settings, need, log } = runSteps(scene, start, ev, lim);
  const snapped = snapSettings(settings, fixedAperture, ev, log.at(-1)?.p, lim);
  const residual = exposureNeed(snapped, ev);

  const result = {
    sceneKey,
    ...snapped,
    exact: settings,
    ev100,
    evTarget: ev,
    residual, // stops: + under-exposed, − over-exposed
    handheldLimit: lim.handheld,
    ffFocal,
    crop,
    useTripod,
    fixedAperture,
    limits: lim,
    warnings: [],
    suggestions: [],
    why: explain(scene, log, snapped, lim, ctx),
  };

  addFixes(result, scene, need, settings, ctx, gear);

  // Offer a handheld version when the main answer leans on a tripod the user might not want to use.
  if (useTripod && scene.tripod === 'prefer' && settings.shutter > lim.handheld * 1.01) {
    const alt = solveExposure({ sceneKey, ev100, gear, lens, forceHandheld: true });
    result.alternative = { aperture: alt.aperture, shutter: alt.shutter, iso: alt.iso, residual: alt.residual, label: 'Handheld instead' };
  }
  return result;
}

/** Warnings and the tripod / flash / ND / ISO suggestions when the target can't be reached. */
function addFixes(result, scene, need, settings, ctx, gear) {
  const under = need > 0.33;
  const over = need < -0.33;

  if (scene.tripod === 'required' && gear.hasTripod === false) {
    result.warnings.push(`${scene.label} needs a tripod or a steady surface.`);
  }

  if (under) {
    result.warnings.push(`About ${fmtStops(need).replace('+', '')} stops too dark even after every adjustment.`);
    if (!ctx.useTripod && scene.tripod !== 'never') {
      const t = settings.shutter * 2 ** need;
      result.suggestions.push({
        kind: 'tripod',
        text: `On a tripod: ${fmtShutter(Math.min(t, 30))}${t > 30 ? ' (or Bulb)' : ''} at the same aperture and ISO.`,
      });
    }
    if (ctx.useTripod && settings.shutter >= LIMITS.slowestShutter * 0.99) {
      const t = settings.shutter * 2 ** need;
      result.suggestions.push({ kind: 'bulb', text: `Bulb mode: ${fmtDuration(t)} at the same aperture and ISO (use a remote or the self-timer).` });
    }
    if (scene.flash) result.suggestions.push({ kind: 'flash', text: 'Add flash (bounced if indoors) to light your subject.' });
    if (settings.iso >= ctx.maxIso * 0.99 && ctx.maxIso < 25600) {
      const needIso = snap(settings.iso * 2 ** need, ISOS);
      result.suggestions.push({ kind: 'iso', text: `Allowing ISO ${needIso} would fix it — modern sensors handle more than you think.` });
    }
    if (scene.tripod === 'never' && !scene.flash) {
      result.suggestions.push({ kind: 'lens', text: 'A faster (wider-aperture) lens is the real fix here.' });
    }
  }

  if (over) {
    const stops = -need;
    const nd = COMMON_ND.find((n) => n.stops >= stops - 0.33) ?? COMMON_ND[COMMON_ND.length - 1];
    result.warnings.push(`About ${fmtStops(stops).replace('+', '')} stops too bright for these settings.`);
    result.suggestions.push({
      kind: 'nd',
      text: `ND filter: ${nd.name} (${nd.stops} stops) keeps ${fmtAperture(result.aperture)} at ${fmtShutter(
        settings.shutter * 2 ** (nd.stops - stops) // shutter after the ND absorbs the excess
      )}.`,
    });
  }

  if (result.sceneKey === 'astro' && result.ev100 > -1) {
    result.warnings.push('Too bright for stars right now — wait for full darkness.');
  }
}

/** "45s", "2m 10s" */
function fmtDuration(t) {
  if (t < 60) return `${Math.round(t)}s`;
  const m = Math.floor(t / 60);
  const sec = Math.round(t % 60);
  return sec ? `${m}m ${sec}s` : `${m} min`;
}

/** Explanations for each value, in two registers: plain English and terse/pro. */
function explain(scene, log, s, lim, ctx) {
  const moved = (p) => log.filter((l) => l.p === p);
  const sum = (arr) => arr.reduce((a, l) => a + l.dir * l.stops, 0);
  const focalTxt = `${Math.round(ctx.ffFocal)}mm`;
  const out = {};

  // Aperture
  {
    const m = moved('aperture');
    const delta = sum(m);
    let beginner = scene.why.aperture;
    if (ctx.fixedAperture) beginner = 'Phone lenses have a fixed aperture — only shutter and ISO change.';
    else if (delta > 0.05) {
      beginner =
        Math.abs(s.aperture - lim.aperture.widest) < 0.15 && ctx.lensMaxAperture && lim.aperture.widest === ctx.lensMaxAperture
          ? 'Opened all the way — that\'s as wide as your lens goes.'
          : 'Opened up to let in more light.';
    } else if (delta < -0.05) beginner = 'Stopped down to tame the bright light.';
    const pro = ctx.fixedAperture
      ? 'Fixed'
      : `${delta ? `${fmtStops(delta)} st from target · ` : 'Scene target · '}range ${fmtAperture(lim.aperture.widest)}–${fmtAperture(lim.aperture.narrowest)}`;
    out.aperture = { beginner, pro };
  }

  // Shutter
  {
    const m = moved('shutter');
    const delta = sum(m);
    let beginner = scene.why.shutter;
    const atSlowest = m.some((l) => l.atLimit && l.dir > 0);
    if (scene.shutter.target === 'rule500') {
      const max = rule500(ctx.ffFocal);
      beginner = `500 rule: 500 ÷ ${focalTxt} (full-frame equivalent) ≈ ${fmtShutter(max)} before stars trail.`;
      if (s.shutter < max * 0.8) beginner += ` ${fmtShutter(s.shutter)} is enough in this light.`;
    } else if (ctx.useTripod && s.shutter > lim.handheld * 1.01) {
      beginner = 'Too slow to hand-hold — put the camera on a tripod.';
    } else if (delta > 0.05 && atSlowest && Math.abs(lim.shutter.slowest - lim.handheld) / lim.handheld < 0.02) {
      beginner = `The slowest you can hand-hold at ${focalTxt} without shake.`;
    } else if (delta > 0.05) beginner = 'Slowed down to let in more light.';
    else if (delta < -0.05) beginner = 'Sped up because there\'s plenty of light.';
    const hh = `handheld ≥ ${fmtShutter(lim.handheld)} (1/(${focalTxt}${scene.handheldFactor ? `×${scene.handheldFactor}` : ''})${ctx.stabStops ? `×2^${ctx.stabStops}` : ''})`;
    const pro = scene.shutter.target === 'rule500' ? `500/${Math.round(ctx.ffFocal)} = ${(500 / ctx.ffFocal).toFixed(1)}s` : `${delta ? `${fmtStops(delta)} st · ` : ''}${ctx.useTripod ? 'tripod' : hh}`;
    out.shutter = { beginner, pro };
  }

  // ISO
  {
    const m = moved('iso');
    const delta = sum(m);
    let beginner = scene.why.iso;
    if (delta > 0.05) {
      beginner = s.iso >= ctx.maxIso * 0.99 ? `Capped at your max ISO (${ctx.maxIso}).` : 'Raised to keep the other settings where this scene needs them.';
    } else if (delta < -0.05) beginner = 'Lowered because there\'s plenty of light.';
    const pro = `${delta ? `${fmtStops(delta)} st · ` : ''}cap ${lim.iso.max}`;
    out.iso = { beginner, pro };
  }
  return out;
}

/**
 * Reciprocity for the Adjust sliders: the user changes one value; a follower compensates
 * to keep exposure equal, and anything the follower can't absorb spills to the third value.
 *   aperture changed → shutter follows, then ISO
 *   shutter changed  → ISO follows, then aperture
 *   iso changed      → shutter follows, then aperture
 * @returns {{ aperture, shutter, iso, residual }}
 */
export function reciprocate(current, changed, value, ev, { maxIso = 51200, widest = 1.0, fixedAperture = null } = {}) {
  const s = { ...current, [changed]: value };
  const order = {
    aperture: ['shutter', 'iso'],
    shutter: ['iso', 'aperture'],
    iso: ['shutter', 'aperture'],
  }[changed].filter((p) => !(p === 'aperture' && fixedAperture));

  const lim = {
    aperture: { widest: Math.max(widest, LIMITS.minAperture), narrowest: LIMITS.maxAperture, fixed: fixedAperture != null },
    shutter: { fastest: LIMITS.fastestShutter, slowest: LIMITS.slowestShutter },
    iso: { min: LIMITS.baseIso, max: maxIso },
  };

  let need = exposureNeed(s, ev);
  for (const p of order) {
    if (Math.abs(need) < 0.01) break;
    const dir = need > 0 ? 1 : -1;
    const r = moveParam(p, s[p], dir, Math.abs(need), lim[p]);
    s[p] = r.value;
    need -= dir * r.moved;
  }
  const snapped = snapSettings(s, fixedAperture);
  snapped[changed] = value; // never re-snap what the user explicitly chose
  return { ...snapped, residual: exposureNeed(snapped, ev) };
}
