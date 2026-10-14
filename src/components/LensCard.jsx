import { useState } from 'react';
import Segmented from './Segmented.jsx';
import Readout from './Readout.jsx';
import { SENSORS, SYSTEMS_BY_SENSOR, SYSTEM_LABELS, apertureFloor } from '../engine/camera.js';
import { focalAdvice, rankUserLenses, recommendCatalog, recommendPhone } from '../engine/lenses.js';

const TIER_LABEL = { budget: 'Budget', mid: 'Mid', pro: 'Pro' };
const VERDICT_TONE = { Ideal: 'text-ok', 'Good fit': 'text-ok', Workable: 'text-accent', 'Poor fit': 'text-warn' };

/** Lens advice: the ideal lens, the user's own lenses ranked, and catalog picks by budget. */
export default function LensCard({ sceneKey, scene, gear, pro, onEditGear }) {
  const systems = SYSTEMS_BY_SENSOR[gear.sensor] ?? [];
  const [system, setSystem] = useState(null);
  const activeSystem = systems.includes(system) ? system : systems.includes(gear.system) ? gear.system : systems[0];
  const focal = focalAdvice(sceneKey, gear.sensor);
  const sensorLabel = SENSORS[gear.sensor].label;

  const owned = rankUserLenses(gear.lenses ?? [], sceneKey, gear.sensor);
  const catalog = activeSystem ? recommendCatalog(sceneKey, gear.sensor, activeSystem) : [];
  const phoneCam = gear.sensor === 'phone' ? recommendPhone(sceneKey) : null;

  return (
    <section aria-label="Lens recommendation" className="rounded-2xl border border-line bg-surface">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="legend">Lens</h2>
          <span className="rounded-full border border-line px-2.5 py-0.5 text-xs">{scene.lens.type}</span>
        </div>

        {phoneCam ? (
          <div className="mt-2">
            <div className="text-2xl font-bold">{phoneCam.name}</div>
            <p className="mt-1 text-sm text-muted">
              ≈{phoneCam.ffFocal}mm equivalent. Ideal for {scene.label.toLowerCase()} is {focal.ff} (full-frame equivalent)
              {phoneCam.ffFocal < scene.lens.ffFocal[0] ? ' — get closer, or crop later.' : '.'}
            </p>
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-4">
            <div>
              <div className="font-mono text-2xl font-bold">{focal.real}</div>
              <div className="text-xs text-muted">
                {focal.crop === 1 ? 'full frame' : `on ${sensorLabel} · ${focal.ff} FF equiv.`}
              </div>
            </div>
            <div>
              <div className="font-mono text-2xl font-bold">
                <Readout text={`f/${scene.lens.maxAperture}`} />
              </div>
              <div className="text-xs text-muted">or faster</div>
            </div>
          </div>
        )}
        {!pro && !phoneCam && <p className="mt-2 text-sm text-muted">{lensWhy(sceneKey)}</p>}
      </div>

      {owned.length > 0 && (
        <div className="border-t border-line p-4">
          <h3 className="legend">Your lenses</h3>
          <ol className="mt-2 space-y-2.5">
            {owned.map((o) => (
              <li key={o.lens.id} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={o.rank === 1 ? 'font-bold' : ''}>
                    {o.rank === 1 && <span className="mr-1.5 rounded bg-accent px-1.5 py-0.5 text-[0.65rem] font-bold text-accent-ink">USE</span>}
                    {o.lens.name}
                  </span>
                  <span className={`shrink-0 text-xs font-bold ${VERDICT_TONE[o.verdict]}`}>
                    {o.verdict}
                    {pro && <span className="ml-1 font-mono font-normal text-muted">{Math.round(o.fit.score * 100)}</span>}
                  </span>
                </div>
                {o.rank === 1 && (
                  <p className="mt-0.5 text-xs text-muted">
                    Use it at about {Math.round(o.fit.workFocal)}mm, f/{apertureFloor(o.fit.workAperture)}.{' '}
                    {o.fit.notes[0] ?? 'Covers what this scene needs.'}
                    {o.lens.guessedAperture && ' (Aperture not given — assumed f/4.)'}
                  </p>
                )}
                {o.rank > 1 && o.fit.notes[0] && <p className="mt-0.5 text-xs text-muted">{o.fit.notes[0]}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {!phoneCam && (
        <div className="border-t border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="legend">{owned.length ? 'If you’re buying' : 'Good options'}</h3>
            {systems.length > 1 && (
              <Segmented
                size="sm"
                label="Camera system"
                value={activeSystem}
                onChange={setSystem}
                options={systems.map((s) => ({ value: s, label: SYSTEM_LABELS[s].split(' ')[0] }))}
              />
            )}
          </div>
          {catalog.length ? (
            <ul className="mt-2 divide-y divide-line">
              {catalog.map((c) => (
                <li key={c.lens.id} className="grid grid-cols-[3.5rem_1fr_auto] items-baseline gap-2 py-2.5 text-sm">
                  <span className="legend">{TIER_LABEL[c.tier]}</span>
                  <span>
                    <span className="font-bold">{c.lens.name}</span>
                    {c.fit.notes[0] && <span className="mt-0.5 block text-xs text-muted">{c.fit.notes[0]}</span>}
                  </span>
                  <span className="font-mono text-xs text-muted">~${c.lens.price.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No catalog lens fits well for this system yet — add one in src/data/lenses.json.</p>
          )}
          {!owned.length && (
            <button onClick={onEditGear} className="mt-2 text-sm font-bold text-accent hover:underline">
              Add the lenses you own to get them ranked →
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const LENS_WHY = {
  wildlife: 'Long reach lets you fill the frame without disturbing the animal.',
  birds: 'Birds are small and far away — reach matters more than anything.',
  landscape: 'Wide angles take in the whole view and exaggerate depth from foreground to horizon.',
  portrait: 'A short telephoto flatters faces and blurs the background.',
  street: 'A small, quiet prime that sees roughly what your eye sees.',
  sports: 'Fast telephoto: reach plus enough light for fast shutter speeds.',
  macro: 'A true 1:1 macro focuses close enough to show a subject life-size on the sensor.',
  astro: 'Wide to fit the sky in, fast to gather starlight in the time the 500 rule allows.',
  nightCity: 'Wide for architecture; fast if you want to shoot handheld.',
  indoor: 'Fast aperture is the priority — indoor light is dim.',
  waterfall: 'Wide-to-normal frames the whole fall; aperture speed doesn’t matter on a tripod.',
  sunset: 'Wide for the whole sky, or telephoto to make the sun look huge.',
};
const lensWhy = (k) => LENS_WHY[k] ?? '';
