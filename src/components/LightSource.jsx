import { Gauge, X } from 'lucide-react';
import Segmented from './Segmented.jsx';
import { MANUAL_LIGHTING } from '../engine/light.js';
import { fmtEv } from '../engine/camera.js';

const STALE_MIN = 20;

/** Where the scene brightness comes from, and what it works out to. */
export default function LightSource({ source, manualKey, meter, estimate, pro, hasLocation, onSource, onManual, onMeasure, onClearMeter }) {
  const meterAge = meter ? Math.round((Date.now() - meter.at) / 6e4) : null;
  const fullSunDiff = 15 - estimate.ev;
  const stops = Math.round(fullSunDiff);

  let plain;
  if (!hasLocation && source === 'auto') plain = 'No location yet, so this assumes bright sun. Set a location for live conditions, or pick the light manually.';
  else if (estimate.source === 'meter') plain = 'Measured with your phone camera — treat it as an estimate unless you have calibrated it.';
  else if (fullSunDiff > 0.4) plain = `About ${stops} stop${stops === 1 ? '' : 's'} darker than full sun. Each stop is half the light.`;
  else if (fullSunDiff < -0.4) plain = 'Brighter than ordinary full sun.';
  else plain = 'Full-sun brightness — the classic "Sunny 16" light.';

  return (
    <section aria-label="Light source" className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="legend">Light reading</span>
        <Segmented
          size="sm"
          label="Light source"
          value={source}
          onChange={onSource}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'manual', label: 'Manual' },
            { value: 'meter', label: 'Meter' },
          ]}
        />
      </div>

      {source === 'manual' && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(MANUAL_LIGHTING).map(([k, m]) => (
            <button
              key={k}
              onClick={() => onManual(k)}
              aria-pressed={manualKey === k}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                manualKey === k ? 'border-accent bg-accent font-bold text-accent-ink' : 'border-line hover:border-accent'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {source === 'meter' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={onMeasure} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 font-bold text-accent-ink">
            <Gauge size={18} /> {meter ? 'Measure again' : 'Measure light'}
          </button>
          {meter ? (
            <span className="flex items-center gap-1 text-sm text-muted">
              Reading from {meterAge < 1 ? 'just now' : `${meterAge}m ago`}
              {meterAge > STALE_MIN && <span className="text-warn"> — light may have changed</span>}
              <button onClick={onClearMeter} className="rounded-full p-1 hover:text-ink" aria-label="Discard reading">
                <X size={14} />
              </button>
            </span>
          ) : (
            <span className="text-sm text-muted">Until you measure, the auto estimate is used.</span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-baseline gap-3 border-t border-line pt-3">
        <span className="font-mono text-2xl font-bold">EV {fmtEv(estimate.ev)}</span>
        <span className="text-sm text-muted">{estimate.label}</span>
      </div>

      {pro ? (
        <ul className="mt-1.5 space-y-0.5 font-mono text-xs text-muted">
          {estimate.parts.map((p, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span className="font-sans">{p.label}</span>
              <span>{i === 0 ? fmtEv(p.stops) : `${p.stops > 0 ? '+' : '−'}${Math.abs(p.stops).toFixed(1)}`}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">{plain}</p>
      )}
    </section>
  );
}
