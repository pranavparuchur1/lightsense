// Camera constants, stop scales and formatting helpers.
// Everything here is pure: no React, no browser APIs.

/** Sensor formats. `crop` converts real focal length to full-frame equivalent. */
export const SENSORS = {
  ff: { label: 'Full frame', crop: 1 },
  apsc: { label: 'APS-C', crop: 1.5 }, // Canon is 1.6; 1.5 is close enough for advice
  mft: { label: 'Micro Four Thirds', crop: 2 },
  phone: { label: 'Phone', crop: 6, fixedAperture: 1.8 }, // typical 1/1.3" main camera
};

/** Which brands/systems make sense for each sensor. */
export const SYSTEMS_BY_SENSOR = {
  ff: ['canon', 'nikon', 'sony'],
  apsc: ['canon', 'nikon', 'sony', 'fuji'],
  mft: ['mft'],
  phone: [],
};

export const SYSTEM_LABELS = {
  canon: 'Canon RF',
  nikon: 'Nikon Z',
  sony: 'Sony E',
  fuji: 'Fujifilm X',
  mft: 'OM System / Panasonic',
};

// Standard 1/3-stop scales, as printed on real cameras.
export const APERTURES = [
  1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10,
  11, 13, 14, 16, 18, 20, 22,
];

// Shutter speeds in seconds, fastest first.
export const SHUTTERS = [
  1 / 8000, 1 / 6400, 1 / 5000, 1 / 4000, 1 / 3200, 1 / 2500, 1 / 2000, 1 / 1600, 1 / 1250,
  1 / 1000, 1 / 800, 1 / 640, 1 / 500, 1 / 400, 1 / 320, 1 / 250, 1 / 200, 1 / 160, 1 / 125,
  1 / 100, 1 / 80, 1 / 60, 1 / 50, 1 / 40, 1 / 30, 1 / 25, 1 / 20, 1 / 15, 1 / 13, 1 / 10, 1 / 8,
  1 / 6, 1 / 5, 1 / 4, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.3, 1.6, 2, 2.5, 3.2, 4, 5, 6, 8, 10, 13, 15,
  20, 25, 30,
];

export const ISOS = [
  100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000,
  5000, 6400, 8000, 10000, 12800, 16000, 20000, 25600, 32000, 51200,
];

export const LIMITS = {
  minAperture: 1.0,
  maxAperture: 22,
  fastestShutter: 1 / 8000,
  slowestShutter: 30, // beyond this you need Bulb mode
  baseIso: 100,
};

/** Snap a value to the nearest entry of a scale, comparing in log space (i.e. in stops). */
export function snap(value, scale) {
  let best = scale[0];
  let bestDist = Infinity;
  for (const s of scale) {
    const d = Math.abs(Math.log2(s) - Math.log2(value));
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

/** Round an f-number to the nearest standard stop that is not wider than it (a lens can't beat its max). */
export const apertureFloor = (n) => APERTURES.find((a) => a >= n - 0.05) ?? APERTURES[APERTURES.length - 1];

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** "f/5.6" */
export const fmtAperture = (n) => `f/${n >= 10 ? Math.round(n) : Number(n.toFixed(1))}`;

/** "1/250", "0.5s", "2s" */
export function fmtShutter(t) {
  if (t >= 0.3) return `${Number(t.toFixed(1))}s`;
  return `1/${Math.round(1 / t)}`;
}

export const fmtIso = (iso) => `${Math.round(iso)}`;

export const fmtEv = (ev) => `${ev >= 0 ? '' : '−'}${Math.abs(ev).toFixed(1)}`;

/** "+⅔", "−1⅓" style stop amounts for compact display. */
export function fmtStops(stops) {
  const sign = stops > 0 ? '+' : stops < 0 ? '−' : '±';
  const a = Math.round(Math.abs(stops) * 3) / 3;
  const whole = Math.floor(a + 1e-6);
  const third = Math.round((a - whole) * 3);
  const frac = third === 1 ? '⅓' : third === 2 ? '⅔' : '';
  return `${sign}${whole || !frac ? whole : ''}${frac}`;
}
