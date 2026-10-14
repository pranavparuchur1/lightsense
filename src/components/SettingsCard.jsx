import { AlertTriangle, Lightbulb, Hand } from 'lucide-react';
import Readout from './Readout.jsx';
import { fmtAperture, fmtEv, fmtIso, fmtShutter, fmtStops } from '../engine/camera.js';

/**
 * The main readout: f-stop | shutter | ISO, laid out like a camera's top-plate LCD,
 * with a viewfinder exposure scale underneath.
 */
export default function SettingsCard({ result, display, adjusted, pro }) {
  const values = [
    { key: 'aperture', label: 'Aperture', text: fmtAperture(display.aperture) },
    { key: 'shutter', label: 'Shutter', text: fmtShutter(display.shutter) },
    { key: 'iso', label: 'ISO', text: fmtIso(display.iso) },
  ];
  const why = (k) => (adjusted ? null : pro ? result.why[k].pro : result.why[k].beginner);
  const tripodNeeded = result.useTripod && display.shutter > result.handheldLimit * 1.01;

  return (
    <section aria-label="Recommended settings" className="overflow-hidden rounded-2xl border border-line bg-surface">
      {/* minmax(0,1fr): columns must never grow to fit the digits, or the page scrolls sideways.
          Digits are sized to the card (cqw), not the viewport: six mono glyphs ("1/1000") must fit a third of it. */}
      <div className="@container grid grid-cols-[repeat(3,minmax(0,1fr))] divide-x divide-line">
        {values.map((v) => (
          <div key={v.key} className="min-w-0 px-2.5 pt-3 pb-3 sm:px-4">
            <div className="legend">{v.label}</div>
            <output
              aria-label={`${v.label} ${v.text}`}
              className="block font-mono leading-none font-bold tracking-tight whitespace-nowrap"
              style={{ fontSize: 'clamp(1.25rem, calc(8.2cqw - 6px), 3.4rem)', marginTop: '0.35rem' }}
            >
              <Readout text={v.text} />
            </output>
            {why(v.key) && <p className="mt-2 hidden text-[0.8rem] leading-snug text-muted sm:block">{why(v.key)}</p>}
          </div>
        ))}
      </div>

      {/* On phones the three columns are too narrow for prose, so the reasons stack below. */}
      {!adjusted && (
        <ul className="space-y-1.5 border-t border-line px-4 py-3 text-[0.82rem] leading-snug sm:hidden">
          {values.map((v) => (
            <li key={v.key} className="flex gap-2">
              <span className="w-14 shrink-0 font-mono font-bold">{v.text}</span>
              <span className="text-muted">{why(v.key)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-line px-4 pt-3 pb-3">
        <ExposureScale residual={display.residual} />
        <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            {Math.abs(display.residual) < 0.17
              ? 'Correct exposure'
              : `${fmtStops(-display.residual)} EV ${display.residual > 0 ? 'under' : 'over'}`}
            {adjusted && ' · your adjustment'}
          </span>
          {pro && (
            <span className="font-mono">
              EV100 {fmtEv(result.ev100)}
              {result.evTarget !== result.ev100 && ` → ${fmtEv(result.evTarget)}`} · {Math.round(result.ffFocal)}mm eq · hh {fmtShutter(result.handheldLimit)}
            </span>
          )}
        </div>
      </div>

      {(tripodNeeded || result.warnings.length > 0 || result.suggestions.length > 0) && (
        <ul className="space-y-2 border-t border-line bg-surface-2 px-4 py-3 text-sm">
          {tripodNeeded && (
            <li className="flex gap-2">
              <span className="mt-0.5 shrink-0 font-mono text-xs font-bold text-accent">TRIPOD</span>
              <span>Slower than you can hand-hold ({fmtShutter(result.handheldLimit)} at {Math.round(result.ffFocal)}mm) — use a tripod or brace the camera.</span>
            </li>
          )}
          {result.warnings.map((w, i) => (
            <li key={`w${i}`} className="flex gap-2 text-warn">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
          {result.suggestions.map((s, i) => (
            <li key={`s${i}`} className="flex gap-2">
              <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent" />
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      )}

      {result.alternative && !adjusted && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-3 text-sm">
          <Hand size={16} className="text-accent" />
          <span className="font-bold">{result.alternative.label}:</span>
          <span className="font-mono">
            {fmtAperture(result.alternative.aperture)} · {fmtShutter(result.alternative.shutter)} · ISO {result.alternative.iso}
          </span>
          {result.alternative.residual > 0.33 && <span className="text-warn">({fmtStops(-result.alternative.residual)} EV under)</span>}
        </div>
      )}
    </section>
  );
}

/**
 * Viewfinder-style exposure scale from −3 to +3 in ⅓ stops. Camera convention:
 * + means over-exposed, so we plot −residual (our residual is + when too dark).
 */
function ExposureScale({ residual }) {
  const v = -residual;
  const clamped = Math.max(-3, Math.min(3, v));
  const pct = ((clamped + 3) / 6) * 100;
  const ticks = Array.from({ length: 19 }, (_, i) => -3 + i / 3);
  const off = Math.abs(v) >= 0.17;
  return (
    <div aria-hidden="true" className="relative select-none">
      <div className="relative h-7">
        {ticks.map((t, i) => {
          const major = i % 3 === 0;
          return (
            <span
              key={i}
              className={`absolute bottom-0 w-px ${major ? 'h-3 bg-ink' : 'h-1.5 bg-muted'}`}
              style={{ left: `${(i / 18) * 100}%` }}
            />
          );
        })}
        <span
          className={`absolute top-0 -translate-x-1/2 text-[0.7rem] leading-none transition-all ${off ? 'text-warn' : 'text-accent'}`}
          style={{ left: `${pct}%` }}
        >
          ▼
        </span>
        {Math.abs(v) > 3 && <span className={`absolute top-0 text-xs text-warn ${v > 0 ? 'right-0' : 'left-0'}`}>{v > 0 ? '▶' : '◀'}</span>}
      </div>
      <div className="relative mt-1 h-3 font-mono text-[0.65rem] text-muted">
        {[-3, -2, -1, 0, 1, 2, 3].map((n) => (
          <span key={n} className="absolute -translate-x-1/2" style={{ left: `${((n + 3) / 6) * 100}%` }}>
            {n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0'}
          </span>
        ))}
      </div>
    </div>
  );
}
