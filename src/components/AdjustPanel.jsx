import { RotateCcw } from 'lucide-react';
import Readout from './Readout.jsx';
import { APERTURES, ISOS, SHUTTERS, fmtAperture, fmtIso, fmtShutter, snap } from '../engine/camera.js';

/**
 * Reciprocity sliders. Moving one value re-solves the others so total exposure stays
 * the same (see engine/exposure.js → reciprocate). Each slider steps in ⅓ stops.
 */
export default function AdjustPanel({ display, adjusted, lastChanged, fixedAperture, widest, maxIso, onChange, onReset }) {
  // Aperture and shutter both run "more light → less light" left to right; ISO runs low → high
  // as every camera shows it. The end labels make each direction explicit.
  const shutterScale = [...SHUTTERS].reverse();
  const apertureScale = APERTURES.filter((a) => a >= widest - 0.01);

  return (
    <section aria-label="Adjust settings" className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="legend">Adjust</h2>
          <p className="mt-0.5 text-xs text-muted">Change one value — the others follow to keep the same exposure.</p>
        </div>
        {adjusted && (
          <button onClick={onReset} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-accent">
            <RotateCcw size={13} /> Reset
          </button>
        )}
      </div>

      <div className="mt-3 space-y-1">
        <Ring
          label="Aperture"
          scale={apertureScale}
          value={display.aperture}
          fmt={fmtAperture}
          ends={['Wide · more light', 'Narrow · more depth']}
          disabled={!!fixedAperture}
          active={lastChanged === 'aperture'}
          onChange={(v) => onChange('aperture', v)}
        />
        <Ring
          label="Shutter"
          scale={shutterScale}
          value={display.shutter}
          fmt={fmtShutter}
          ends={['Slow · motion blur', 'Fast · freeze']}
          active={lastChanged === 'shutter'}
          onChange={(v) => onChange('shutter', v)}
        />
        <Ring
          label="ISO"
          scale={ISOS}
          value={display.iso}
          fmt={fmtIso}
          ends={['Clean', 'Grainy']}
          active={lastChanged === 'iso'}
          warn={display.iso > maxIso}
          onChange={(v) => onChange('iso', v)}
        />
      </div>
      {display.iso > maxIso && <p className="mt-2 text-xs text-warn">Above your max ISO ({maxIso}).</p>}
      {fixedAperture && <p className="mt-2 text-xs text-muted">Phone aperture is fixed at {fmtAperture(fixedAperture)}.</p>}
    </section>
  );
}

function Ring({ label, scale, value, fmt, ends, disabled, active, warn, onChange }) {
  const idx = scale.indexOf(snap(value, scale));
  const id = `ring-${label}`;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className={`text-sm font-bold ${active ? 'text-accent' : ''}`}>
          {label}
        </label>
        <span className={`font-mono text-lg font-bold ${warn ? 'text-warn' : ''}`}>
          <Readout text={fmt(value)} />
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="ring"
        min={0}
        max={scale.length - 1}
        step={1}
        value={idx}
        disabled={disabled}
        aria-valuetext={fmt(value)}
        onChange={(e) => onChange(scale[Number(e.target.value)])}
      />
      <div className="-mt-1 flex justify-between text-[0.68rem] text-muted">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  );
}
