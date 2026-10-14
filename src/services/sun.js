// Sun & moon via SunCalc, plus golden/blue-hour windows and the "next event" countdown.
import SunCalc from 'suncalc';
import { sunPhase } from '../engine/light.js';

// SunCalc ships golden hour at +6° and dawn/dusk at −6°. Add −4° so we can bound
// golden hour (+6° → −4°) and blue hour (−4° → −6°) the way photographers use them.
SunCalc.addTime(-4, 'blueEndMorning', 'blueStartEvening');

const DEG = 180 / Math.PI;
const valid = (d) => d instanceof Date && !Number.isNaN(d.getTime());

/** Golden/blue windows for the calendar day containing `date`. Invalid (polar) times are dropped. */
function windowsFor(date, lat, lon) {
  const t = SunCalc.getTimes(date, lat, lon);
  return [
    { kind: 'blue', label: 'Blue hour', start: t.dawn, end: t.blueEndMorning },
    { kind: 'golden', label: 'Golden hour', start: t.blueEndMorning, end: t.goldenHourEnd },
    { kind: 'golden', label: 'Golden hour', start: t.goldenHour, end: t.blueStartEvening },
    { kind: 'blue', label: 'Blue hour', start: t.blueStartEvening, end: t.dusk },
  ].filter((w) => valid(w.start) && valid(w.end));
}

/**
 * Everything the app needs about the sky right now.
 * @returns {{ altitudeDeg, azimuthDeg, phase, times, moon, current, next }}
 *   current: the golden/blue window we're inside (or null)
 *   next:    the next golden/blue window to start (or null near the poles)
 */
export function getSunInfo(date, lat, lon) {
  const pos = SunCalc.getPosition(date, lat, lon);
  const altitudeDeg = pos.altitude * DEG;
  // SunCalc azimuth is measured from south, clockwise-west; convert to compass bearing.
  const azimuthDeg = (pos.azimuth * DEG + 180 + 360) % 360;
  const times = SunCalc.getTimes(date, lat, lon);

  const moonPos = SunCalc.getMoonPosition(date, lat, lon);
  const moonIll = SunCalc.getMoonIllumination(date);
  const moon = { altitudeDeg: moonPos.altitude * DEG, fraction: moonIll.fraction, phase: moonIll.phase };

  const day = 864e5;
  const windows = [-1, 0, 1].flatMap((d) => windowsFor(new Date(date.getTime() + d * day), lat, lon));
  const now = date.getTime();
  const current = windows.find((w) => w.start <= now && now < w.end) ?? null;
  const next = windows.filter((w) => w.start > now).sort((a, b) => a.start - b.start)[0] ?? null;

  return { altitudeDeg, azimuthDeg, phase: sunPhase(altitudeDeg), times, moon, current, next };
}

/** "1h 12m", "8m", "now" */
export function fmtCountdown(ms) {
  if (ms <= 30e3) return 'now';
  const m = Math.round(ms / 6e4);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export function moonName(phase) {
  if (phase < 0.03 || phase > 0.97) return 'New moon';
  if (phase < 0.22) return 'Waxing crescent';
  if (phase < 0.28) return 'First quarter';
  if (phase < 0.47) return 'Waxing gibbous';
  if (phase < 0.53) return 'Full moon';
  if (phase < 0.72) return 'Waning gibbous';
  if (phase < 0.78) return 'Last quarter';
  return 'Waning crescent';
}
