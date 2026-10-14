import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import Sheet from './Sheet.jsx';
import Segmented from './Segmented.jsx';
import { ISOS, SENSORS, SYSTEMS_BY_SENSOR, SYSTEM_LABELS } from '../engine/camera.js';
import { parseUserLens } from '../engine/lenses.js';

const ISO_CHOICES = ISOS.filter((i) => i >= 800);

/** Gear profile: sensor, system, ISO ceiling, stabilisation, tripod, owned lenses. Saved to localStorage. */
export default function GearSheet({ gear, onChange, onClose }) {
  const [draft, setDraft] = useState('');
  const set = (patch) => onChange({ ...gear, ...patch });
  const systems = SYSTEMS_BY_SENSOR[gear.sensor];
  const parsedDraft = draft.trim() ? parseUserLens(draft) : null;

  const addLens = () => {
    if (!parsedDraft) return;
    set({ lenses: [...(gear.lenses ?? []), draft.trim()] });
    setDraft('');
  };

  return (
    <Sheet title="Your gear" onClose={onClose}>
      <Field label="Sensor">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(SENSORS).map(([k, s]) => (
            <button
              key={k}
              onClick={() => set({ sensor: k, system: SYSTEMS_BY_SENSOR[k].includes(gear.system) ? gear.system : SYSTEMS_BY_SENSOR[k][0] ?? null })}
              aria-pressed={gear.sensor === k}
              className={`rounded-full border px-3 py-1.5 text-sm ${gear.sensor === k ? 'border-accent bg-accent font-bold text-accent-ink' : 'border-line'}`}
            >
              {s.label}
              {k !== 'ff' && <span className="ml-1 font-mono text-xs opacity-70">×{s.crop}</span>}
            </button>
          ))}
        </div>
      </Field>

      {systems.length > 0 && (
        <Field label="Camera system">
          <Segmented value={gear.system} onChange={(system) => set({ system })} label="Camera system" options={systems.map((s) => ({ value: s, label: SYSTEM_LABELS[s] }))} size="sm" />
        </Field>
      )}

      <Field label={`Highest ISO you're happy with: ${gear.maxIso}`}>
        <input
          type="range"
          className="ring"
          min={0}
          max={ISO_CHOICES.length - 1}
          value={Math.max(0, ISO_CHOICES.indexOf(gear.maxIso))}
          onChange={(e) => set({ maxIso: ISO_CHOICES[Number(e.target.value)] })}
          aria-valuetext={`ISO ${gear.maxIso}`}
        />
        <p className="text-xs text-muted">Older or smaller sensors: ~3200. Recent full frame: 12800 is often fine.</p>
      </Field>

      <Field label={`Stabilisation: ${gear.stabStops ? `${gear.stabStops} stops` : 'none'}`}>
        <input type="range" className="ring" min={0} max={6} value={gear.stabStops} onChange={(e) => set({ stabStops: Number(e.target.value) })} />
        <p className="text-xs text-muted">In-body or lens IS lets you hand-hold slower shutter speeds. Be conservative — rated stops are optimistic.</p>
      </Field>

      <label className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm font-bold">I have a tripod with me</span>
        <input type="checkbox" checked={gear.hasTripod} onChange={(e) => set({ hasTripod: e.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />
      </label>

      {gear.sensor !== 'phone' && (
        <Field label="Lenses you own">
          <ul className="space-y-1.5">
            {(gear.lenses ?? []).map((l, i) => {
              const p = parseUserLens(l);
              return (
                <li key={`${l}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <span>
                    {l}
                    {p && (
                      <span className="ml-2 font-mono text-xs text-muted">
                        {p.focal[0] === p.focal[1] ? p.focal[0] : `${p.focal[0]}–${p.focal[1]}`}mm f/{p.aperture[0]}
                        {p.aperture[1] !== p.aperture[0] && `–${p.aperture[1]}`}
                      </span>
                    )}
                  </span>
                  <button onClick={() => set({ lenses: gear.lenses.filter((_, j) => j !== i) })} className="text-muted hover:text-warn" aria-label={`Remove ${l}`}>
                    <X size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLens()}
              placeholder="e.g. 70-200mm f/4, 50mm f1.8"
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button onClick={addLens} disabled={!parsedDraft} className="flex items-center gap-1 rounded-lg bg-accent px-3 text-sm font-bold text-accent-ink disabled:opacity-40">
              <Plus size={16} /> Add
            </button>
          </div>
          {draft.trim() && !parsedDraft && <p className="mt-1 text-xs text-warn">Include the focal length, like “24-70mm” or “85mm”.</p>}
        </Field>
      )}
    </Sheet>
  );
}

function Field({ label, children }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="legend mb-1.5">{label}</div>
      {children}
    </div>
  );
}
