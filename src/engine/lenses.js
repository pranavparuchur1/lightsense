// Lens recommendation engine.
//
// Every lens (catalog or user-owned) is scored 0..1 against the scene's ideal lens:
//   focal fit    (55%) — does the lens reach the ideal focal length, and how much of the
//                        ideal range does it cover? Measured in full-frame-equivalent mm,
//                        compared in log space so 100→200mm counts the same as 300→600mm.
//   aperture fit (35%) — is it at least as fast as the scene wants at that focal length?
//   type fit     (10%) — tag overlap (macro, astro, ultra-wide…). Macro without a macro
//                        lens is heavily penalised: you simply can't focus close enough.

import data from '../data/lenses.json';
import { SENSORS } from './camera.js';
import { SCENES } from './scenes.js';

export const CATALOG = data.lenses;
export const PHONE_CAMERAS = data.phoneCameras;
export const TIERS = ['budget', 'mid', 'pro'];

const log2 = Math.log2;
const W = { focal: 0.55, aperture: 0.35, type: 0.1 };

/** Which lens coverages fit which bodies. FF lenses work (cropped) on APS-C bodies. */
const COVERAGE_OK = { ff: ['FF'], apsc: ['FF', 'APS-C'], mft: ['MFT'], phone: [] };

/** Max aperture at a given real focal length, interpolating variable-aperture zooms in log space. */
export function apertureAt(lens, focal) {
  const [f0, f1] = lens.focal;
  const [a0, a1] = lens.aperture;
  if (f1 === f0) return a0;
  const t = Math.min(1, Math.max(0, log2(focal / f0) / log2(f1 / f0)));
  return a0 * (a1 / a0) ** t;
}

/** The focal length (real mm) this lens would be used at for the scene: the ideal, clamped into its range. */
export function workingFocal(lens, scene, crop) {
  const idealReal = scene.lens.ideal / crop;
  return Math.min(lens.focal[1], Math.max(lens.focal[0], idealReal));
}

/**
 * Score one lens for a scene.
 * @returns {{ score, focal, apertureFit, typeFit, ffRange, workFocal, workAperture, notes:string[] }}
 */
export function scoreLens(lens, sceneKey, crop) {
  const scene = SCENES[sceneKey];
  const [idealLo, idealHi] = scene.lens.ffFocal;
  const ideal = scene.lens.ideal;
  const lo = lens.focal[0] * crop;
  const hi = lens.focal[1] * crop;
  const notes = [];

  // Focal: distance (in stops of focal length) from the ideal to the lens range…
  const dist = ideal < lo ? log2(lo / ideal) : ideal > hi ? log2(ideal / hi) : 0;
  const near = Math.max(0, 1 - dist / 1.5);
  // …and how much of the ideal range it covers.
  const span = Math.max(log2(idealHi / idealLo), 0.25);
  const overlap = Math.max(0, log2(Math.min(hi, idealHi) / Math.max(lo, idealLo)));
  const coverage = Math.min(1, overlap / span);
  const focalFit = 0.65 * near + 0.35 * coverage;
  if (dist > 0.2) {
    notes.push(
      ideal > hi
        ? `Tops out at ${Math.round(hi)}mm equiv. — about ${(ideal / hi).toFixed(1)}× short of the ideal ${ideal}mm; expect to crop.`
        : `Starts at ${Math.round(lo)}mm equiv. — tighter than the ideal ${ideal}mm.`
    );
  }

  // Aperture at the working focal length, vs. what the scene wants.
  const wf = workingFocal(lens, scene, crop);
  const wa = apertureAt(lens, wf);
  const apStops = 2 * log2(wa / scene.lens.maxAperture); // + = slower than wanted
  const apertureFit = apStops <= 0 ? 1 : Math.max(0, 1 - apStops / 3);
  if (apStops > 0.6) notes.push(`f/${wa.toFixed(1)} is ${apStops.toFixed(1)} stops slower than ideal here.`);
  else if (apStops < -0.9) notes.push(`f/${wa.toFixed(1)} is faster than needed — great in low light.`);

  // Type
  const tags = lens.tags ?? [];
  let typeFit = scene.lens.tags.some((t) => tags.includes(t)) ? 1 : 0.4;
  let score = W.focal * focalFit + W.aperture * apertureFit + W.type * typeFit;
  if (sceneKey === 'macro' && !tags.includes('macro')) {
    score *= 0.35;
    typeFit = 0;
    notes.push('Not a macro lens — it can\'t focus close enough for life-size shots.');
  }

  return { score, focalFit, apertureFit, typeFit, ffRange: [lo, hi], workFocal: wf, workAperture: wa, notes };
}

/**
 * Catalog recommendations: the best-scoring lens in each budget tier for a camera system.
 * @returns {{ tier, lens, fit }[]}
 */
export function recommendCatalog(sceneKey, sensorKey, system) {
  const crop = SENSORS[sensorKey]?.crop ?? 1;
  const okCoverage = COVERAGE_OK[sensorKey] ?? [];
  const pool = CATALOG.filter((l) => l.systems.includes(system) && okCoverage.includes(l.coverage));
  const scored = pool.map((lens) => ({ lens, fit: scoreLens(lens, sceneKey, crop) }));
  // Prefer native-coverage lenses on crop bodies when scores tie (they're smaller/cheaper).
  const bonus = (x) => (sensorKey === 'apsc' && x.lens.coverage === 'APS-C' ? 0.02 : 0);

  const out = [];
  for (const tier of TIERS) {
    const best = scored
      .filter((x) => x.lens.tier === tier)
      .sort((a, b) => b.fit.score + bonus(b) - (a.fit.score + bonus(a)))[0];
    if (best && best.fit.score > 0.35) out.push({ tier, ...best });
  }
  return out;
}

/** Pick the phone camera closest to the scene's ideal focal length. */
export function recommendPhone(sceneKey) {
  const ideal = SCENES[sceneKey].lens.ideal;
  return [...PHONE_CAMERAS].sort((a, b) => Math.abs(log2(a.ffFocal / ideal)) - Math.abs(log2(b.ffFocal / ideal)))[0];
}

/**
 * Parse a free-text lens description the user typed, e.g.
 *   "Sony 70-200 f/4", "50mm f1.8", "XF 18-55mm F2.8-4 R", "Tamron 150-500 macro"
 * @returns a lens-shaped object, or null if no focal length could be found.
 */
export function parseUserLens(text) {
  const raw = text.trim();
  if (!raw) return null;
  // Focal: prefer "NN-NNmm" / "NNmm"; fall back to a bare "NN-NN" range.
  const fm =
    raw.match(/(\d{1,4})\s*(?:-|–|to)\s*(\d{1,4})\s*mm/i) ??
    raw.match(/(\d{1,4})\s*mm/i) ??
    raw.match(/(?:^|\s)(\d{1,4})\s*(?:-|–)\s*(\d{1,4})(?:\s|$)/);
  if (!fm) return null;
  const f0 = Number(fm[1]);
  const f1 = Number(fm[2] ?? fm[1]);
  // Aperture: "f/2.8", "F2.8-4", "f1.8", "1:2.8"
  // The lookbehind stops "XF 18-55" being read as f/18.
  const am = raw.match(/(?:(?<![a-z])f\s*\/?\s*|1\s*:\s*)(\d+(?:\.\d+)?)(?:\s*(?:-|–)\s*(\d+(?:\.\d+)?))?/i);
  const a0 = am ? Number(am[1]) : 4; // unknown → assume a typical f/4 zoom
  const a1 = am?.[2] ? Number(am[2]) : a0;
  const tags = [];
  if (/macro|\bmc\b/i.test(raw)) tags.push('macro');
  if (f0 === f1) tags.push('prime');
  return {
    id: `user:${raw}`,
    name: raw,
    focal: [Math.min(f0, f1), Math.max(f0, f1)],
    aperture: [a0, a1],
    tags,
    guessedAperture: !am,
  };
}

/**
 * Rank the user's own lenses for this scene. Returns them best-first with a plain explanation.
 * @param {string[]} lensTexts free-text entries
 */
export function rankUserLenses(lensTexts, sceneKey, sensorKey) {
  const crop = SENSORS[sensorKey]?.crop ?? 1;
  return lensTexts
    .map(parseUserLens)
    .filter(Boolean)
    .map((lens) => ({ lens, fit: scoreLens(lens, sceneKey, crop) }))
    .sort((a, b) => b.fit.score - a.fit.score)
    .map((x, i) => ({ ...x, rank: i + 1, verdict: verdict(x.fit.score) }));
}

const verdict = (s) => (s >= 0.85 ? 'Ideal' : s >= 0.65 ? 'Good fit' : s >= 0.45 ? 'Workable' : 'Poor fit');

/**
 * The lens the exposure engine should assume: user's best lens if any, the right phone camera
 * on a phone, otherwise null (engine falls back to the scene's ideal focal length).
 * @returns {{ ffFocal, maxAperture, name } | null}
 */
export function lensForExposure(sceneKey, gear) {
  const sensor = SENSORS[gear.sensor] ?? SENSORS.ff;
  if (gear.sensor === 'phone') {
    const cam = recommendPhone(sceneKey);
    return { ffFocal: cam.ffFocal, maxAperture: cam.aperture, name: cam.name };
  }
  const ranked = rankUserLenses(gear.lenses ?? [], sceneKey, gear.sensor);
  if (!ranked.length) return null;
  const { lens, fit } = ranked[0];
  return { ffFocal: fit.workFocal * sensor.crop, maxAperture: fit.workAperture, name: lens.name };
}

/** "67–267mm on APS-C (100–400mm full-frame equivalent)" */
export function focalAdvice(sceneKey, sensorKey) {
  const scene = SCENES[sceneKey];
  const crop = SENSORS[sensorKey]?.crop ?? 1;
  const [a, b] = scene.lens.ffFocal;
  const ff = a === b ? `${a}mm` : `${a}–${b}mm`;
  if (crop === 1) return { real: ff, ff, crop };
  const r = (x) => Math.round(x / crop);
  return { real: a === b ? `${r(a)}mm` : `${r(a)}–${r(b)}mm`, ff, crop };
}
