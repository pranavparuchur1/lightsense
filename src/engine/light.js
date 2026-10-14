// Scene brightness model. Produces an EV at ISO 100 (EV100) for the current conditions,
// plus a list of the adjustments that went into it so the UI can explain the number.
//
// Precedence: calibrated light-meter reading > manual lighting pick > sun + weather model.

/**
 * Manual lighting presets, EV100. Values follow the classic exposure-value tables
 * (Sunny 16 = EV 15). Tune freely.
 */
export const MANUAL_LIGHTING = {
  snow: { label: 'Snow / beach, full sun', ev: 16, kelvin: 5500 },
  sun: { label: 'Bright sun', ev: 15, kelvin: 5500 },
  hazy: { label: 'Hazy sun', ev: 14, kelvin: 5800 },
  lightOvercast: { label: 'Light overcast', ev: 13, kelvin: 6500 },
  heavyOvercast: { label: 'Heavy overcast', ev: 12, kelvin: 7000 },
  shade: { label: 'Open shade', ev: 12, kelvin: 7500 },
  golden: { label: 'Golden hour', ev: 11, kelvin: 5200 },
  blue: { label: 'Blue hour', ev: 7, kelvin: 7500 },
  indoorBright: { label: 'Bright indoors', ev: 8, kelvin: 4000 },
  indoor: { label: 'Home interior', ev: 6, kelvin: 3200 },
  cityNight: { label: 'City at night', ev: 6, kelvin: 3800 },
  moonlit: { label: 'Moonlit landscape', ev: -3, kelvin: 4100 },
  darkSky: { label: 'Dark sky / stars', ev: -7, kelvin: 3900 },
};

/** Sun-altitude phases, in degrees. Golden hour and blue hour use the common photographic bounds. */
export function sunPhase(altDeg) {
  if (altDeg >= 6) return 'day';
  if (altDeg >= -4) return 'golden';
  if (altDeg >= -6) return 'blue';
  if (altDeg >= -12) return 'nautical';
  if (altDeg >= -18) return 'astronomical';
  return 'night';
}

export const PHASE_LABELS = {
  day: 'Daylight',
  golden: 'Golden hour',
  blue: 'Blue hour',
  nautical: 'Twilight',
  astronomical: 'Late twilight',
  night: 'Night',
};

const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

/**
 * Natural night-sky brightness. A moonless dark sky is about EV −7 (Milky Way territory);
 * a high full moon brings a landscape up to about EV −2.5.
 */
export function skyEv(moon) {
  if (!moon || moon.altitudeDeg <= 0) return -7;
  const height = Math.min(1, moon.altitudeDeg / 30); // low moon is dimmer
  return -7 + 4.5 * moon.fraction * height;
}

/**
 * Clear-sky EV100 from sun altitude alone. Piecewise-linear through these anchors:
 *   ≥20° → 15 (Sunny 16)   10° → 14   6° → 13   0° → 11   −4° → 9
 *   −6° → 7   −12° → 3     −18° → night sky
 */
export function clearSkyEv(altDeg, moon) {
  const night = skyEv(moon);
  if (altDeg >= 20) return 15;
  if (altDeg >= 10) return lerp(14, 15, (altDeg - 10) / 10);
  if (altDeg >= 6) return lerp(13, 14, (altDeg - 6) / 4);
  if (altDeg >= 0) return lerp(11, 13, altDeg / 6);
  if (altDeg >= -4) return lerp(9, 11, (altDeg + 4) / 4);
  if (altDeg >= -6) return lerp(7, 9, (altDeg + 6) / 2);
  if (altDeg >= -12) return lerp(3, 7, (altDeg + 12) / 6);
  if (altDeg >= -18) return lerp(night, 3, (altDeg + 18) / 6);
  return night;
}

/**
 * Weather penalty in stops (negative). Applied fully while the sun is up or low,
 * half during blue hour, not at all at night (clouds then matter for stars, not exposure).
 */
export function weatherAdjustments(weather, altDeg) {
  if (!weather) return [];
  const scale = altDeg >= -4 ? 1 : altDeg >= -6 ? 0.5 : 0;
  if (scale === 0) return [];
  const out = [];
  const c = weather.cloudCover ?? 0;
  if (c > 85) out.push({ label: `Heavy overcast (${c}% cloud)`, stops: -2 });
  else if (c > 50) out.push({ label: `Light overcast (${c}% cloud)`, stops: -1 });
  else if (c > 25) out.push({ label: `Hazy / broken cloud (${c}%)`, stops: -0.5 });
  if ((weather.precipitation ?? 0) > 0.2) out.push({ label: 'Rain or snow falling', stops: -1 });
  if (weather.visibility != null && weather.visibility < 1000) out.push({ label: 'Fog / mist', stops: -1 });
  if ((weather.weatherCode ?? 0) >= 95) out.push({ label: 'Thunderstorm', stops: -1 });
  return out.map((a) => ({ ...a, stops: a.stops * scale }));
}

/**
 * Main entry point.
 * @param {object} p
 * @param {number} p.altDeg       sun altitude in degrees
 * @param {object} [p.moon]       { fraction 0..1, altitudeDeg }
 * @param {object} [p.weather]    { cloudCover %, precipitation mm, visibility m, weatherCode }
 * @param {string} [p.manual]     key of MANUAL_LIGHTING, or null for auto
 * @param {object} [p.meter]      { ev } raw reading from the phone light meter
 * @param {number} [p.calibration] stops added to meter readings
 * @param {string} [p.setting]    'outdoor' | 'indoor' | 'city' — scene context from the scene definition
 * @returns {{ ev:number, source:string, label:string, parts:{label:string, stops:number}[], kelvin:number }}
 */
export function estimateSceneEv({ altDeg = 45, moon, weather, manual, meter, calibration = 0, setting = 'outdoor' }) {
  if (meter && Number.isFinite(meter.ev)) {
    const ev = meter.ev + calibration;
    return {
      ev,
      source: 'meter',
      label: 'Measured with camera',
      parts: [
        { label: 'Phone light-meter reading', stops: meter.ev },
        ...(calibration ? [{ label: 'Your calibration offset', stops: calibration }] : []),
      ],
      kelvin: kelvinFor(altDeg, weather, setting),
    };
  }

  if (manual && MANUAL_LIGHTING[manual]) {
    const m = MANUAL_LIGHTING[manual];
    return { ev: m.ev, source: 'manual', label: m.label, parts: [{ label: m.label, stops: m.ev }], kelvin: m.kelvin };
  }

  // Indoor scenes ignore the sun: interiors are lit by lamps (and windows by day).
  if (setting === 'indoor') {
    const ev = altDeg > 0 ? 8 : 7;
    return {
      ev,
      source: 'auto',
      label: 'Typical interior',
      parts: [{ label: altDeg > 0 ? 'Interior with some window light' : 'Interior, artificial light', stops: ev }],
      kelvin: altDeg > 0 ? 4500 : 3200,
    };
  }

  const base = clearSkyEv(altDeg, moon);
  const parts = [{ label: `Clear sky, sun at ${altDeg.toFixed(0)}°`, stops: base }];
  const adj = weatherAdjustments(weather, altDeg);
  parts.push(...adj);
  let ev = base + adj.reduce((s, a) => s + a.stops, 0);

  // Street lights put a floor under city scenes after dark.
  if (setting === 'city' && ev < 6) {
    parts.push({ label: 'Street & building lights', stops: 6 - ev });
    ev = 6;
  }

  return { ev, source: 'auto', label: PHASE_LABELS[sunPhase(altDeg)], parts, kelvin: kelvinFor(altDeg, weather, setting) };
}

/** Suggested white balance in Kelvin. */
export function kelvinFor(altDeg, weather, setting) {
  if (setting === 'city' && altDeg < -4) return 3800;
  const phase = sunPhase(altDeg);
  if (phase === 'golden') return 5600; // slightly high so the camera doesn't neutralise the warmth
  if (phase === 'blue') return 7000;
  if (phase !== 'day') return 4000; // night sky: ~3900–4200 K renders a neutral-blue sky
  const c = weather?.cloudCover ?? 0;
  if (c > 85) return 7000;
  if (c > 50) return 6500;
  return 5500;
}

/** Exposure-compensation tips that come from the conditions rather than the scene. */
export function conditionTips({ manual, weather }) {
  const tips = [];
  if (manual === 'snow') tips.push('Snow or sand: +1 EV, or the meter turns it grey.');
  if (weather?.visibility != null && weather.visibility < 1000) tips.push('Fog: +0.3 to +0.7 EV to keep it bright and airy.');
  const code = weather?.weatherCode ?? 0;
  if (code >= 71 && code <= 77) tips.push('Falling snow: +0.7 EV.');
  return tips;
}
