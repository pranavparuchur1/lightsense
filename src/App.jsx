import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, LocateFixed, SunMoon } from 'lucide-react';

import ConditionStrip from './components/ConditionStrip.jsx';
import LocationSheet from './components/LocationSheet.jsx';
import LightSource from './components/LightSource.jsx';
import LightMeterSheet from './components/LightMeterSheet.jsx';
import ScenePicker from './components/ScenePicker.jsx';
import SettingsCard from './components/SettingsCard.jsx';
import AdjustPanel from './components/AdjustPanel.jsx';
import SetupCard from './components/SetupCard.jsx';
import LensCard from './components/LensCard.jsx';
import GearSheet from './components/GearSheet.jsx';
import Segmented from './components/Segmented.jsx';

import { useStoredState } from './hooks/useStoredState.js';
import { useConditions } from './hooks/useConditions.js';
import { conditionTips, estimateSceneEv } from './engine/light.js';
import { reciprocate, solveExposure } from './engine/exposure.js';
import { lensForExposure } from './engine/lenses.js';
import { SCENES } from './engine/scenes.js';
import { apertureFloor } from './engine/camera.js';
import { fmtCoords } from './services/weather.js';

const DEFAULT_GEAR = { sensor: 'apsc', system: 'sony', maxIso: 6400, stabStops: 0, hasTripod: true, lenses: [] };
const DEFAULT_PREFS = { mode: 'beginner', theme: 'auto', scene: 'landscape', source: 'auto', manualKey: 'sun' };
const THEMES = ['auto', 'day', 'dusk', 'red'];
const THEME_COLOR = { day: '#f2efe8', dusk: '#0d0e10', red: '#000000' };

export default function App() {
  const [gear, setGear] = useStoredState('ls.gear', DEFAULT_GEAR);
  const [prefs, setPrefs] = useStoredState('ls.prefs', DEFAULT_PREFS);
  const [location, setLocation] = useStoredState('ls.location', null);
  const [meter, setMeter] = useStoredState('ls.meter', null); // { ev, method, at }
  const [calibration, setCalibration] = useStoredState('ls.calibration', 0);
  const [sheet, setSheet] = useState(null); // 'location' | 'gear' | 'meter'
  const [adjust, setAdjust] = useState(null); // { values, lastChanged }

  const setPref = (patch) => setPrefs((p) => ({ ...p, ...patch }));
  const pro = prefs.mode === 'pro';
  const sceneKey = SCENES[prefs.scene] ? prefs.scene : 'landscape';
  const scene = SCENES[sceneKey];

  const { now, sun, weather, status } = useConditions(location);

  // Refresh a GPS location silently if permission was already granted on an earlier visit.
  useEffect(() => {
    if (location?.source !== 'gps' || !navigator.permissions) return;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((p) => {
        if (p.state !== 'granted') return;
        navigator.geolocation.getCurrentPosition((pos) =>
          setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: fmtCoords(pos.coords.latitude, pos.coords.longitude), source: 'gps' })
        );
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- The pipeline: conditions → scene EV → exposure → display ---------------------------
  const useMeter = prefs.source === 'meter' && meter;
  const estimate = estimateSceneEv({
    altDeg: sun?.altitudeDeg ?? 45, // no location yet: assume high sun (Sunny 16)
    moon: sun?.moon,
    weather,
    manual: prefs.source === 'manual' ? prefs.manualKey : null,
    meter: useMeter ? meter : null,
    calibration,
    setting: scene.setting,
  });

  const lens = useMemo(() => lensForExposure(sceneKey, gear), [sceneKey, gear]);
  const result = useMemo(() => solveExposure({ sceneKey, ev100: estimate.ev, gear, lens }), [sceneKey, estimate.ev, gear, lens]);

  // Manual slider adjustments are discarded whenever the inputs to the solver change.
  const resetKey = `${sceneKey}|${estimate.ev.toFixed(2)}|${JSON.stringify(gear)}`;
  useEffect(() => setAdjust(null), [resetKey]);

  const display = adjust?.values ?? result;
  const onAdjust = (param, value) => {
    const base = adjust?.values ?? result;
    const values = reciprocate(base, param, value, result.evTarget, {
      maxIso: 51200,
      widest: apertureFloor(lens?.maxAperture ?? 1.0),
      fixedAperture: result.fixedAperture,
    });
    setAdjust({ values, lastChanged: param });
  };

  // ---- Theme: auto follows the sun; astro after dark switches to red night mode -------------
  const autoTheme =
    sceneKey === 'astro' && (sun?.altitudeDeg ?? 0) < -6 ? 'red' : !sun || ['day', 'golden'].includes(sun.phase) ? 'day' : 'dusk';
  const theme = prefs.theme === 'auto' ? autoTheme : prefs.theme;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  }, [theme]);
  const cycleTheme = () => setPref({ theme: THEMES[(THEMES.indexOf(prefs.theme) + 1) % THEMES.length] });

  const closeSheet = useCallback(() => setSheet(null), []);
  const tips = [...conditionTips({ manual: prefs.source === 'manual' ? prefs.manualKey : null, weather }), ...scene.tips];

  return (
    <div className="mx-auto max-w-5xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-12">
      <header className="flex items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-2">
          <ApertureMark />
          <span className="hidden text-lg font-bold tracking-tight min-[360px]:inline">LightSense</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Segmented
            size="sm"
            label="Explanation level"
            value={prefs.mode}
            onChange={(mode) => setPref({ mode })}
            options={[
              { value: 'beginner', label: 'Beginner' },
              { value: 'pro', label: 'Pro' },
            ]}
          />
          <button
            onClick={cycleTheme}
            className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1.5 text-xs font-bold"
            aria-label={`Theme: ${prefs.theme}. Tap to change.`}
            title="Theme"
          >
            <SunMoon size={15} />
            <span className="hidden capitalize sm:inline">{prefs.theme === 'red' ? 'Night red' : prefs.theme}</span>
          </button>
          <button onClick={() => setSheet('gear')} className="flex items-center gap-1 rounded-full border border-line px-2.5 py-1.5 text-xs font-bold" aria-label="Your gear">
            <Camera size={15} />
            <span className="hidden sm:inline">Gear</span>
          </button>
        </div>
      </header>

      <div className="mt-2 space-y-4">
        {!location && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent bg-surface p-4">
            <p className="text-sm">
              <span className="font-bold">Get live conditions.</span> <span className="text-muted">Sun position and weather for where you are.</span>
            </p>
            <button onClick={() => setSheet('location')} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-ink">
              <LocateFixed size={16} /> Set location
            </button>
          </div>
        )}

        <ConditionStrip location={location} sun={sun} weather={weather} status={status} now={now} onLocation={() => setSheet('location')} />

        <ScenePicker value={sceneKey} onChange={(s) => setPref({ scene: s })} />

        {/* Phones: one column in reading order. Large screens: settings left, lens right.
            The column wrappers are `display: contents` on phones so `order` can interleave cards. */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <div className="contents lg:flex lg:flex-col lg:gap-4">
            <div className="order-1 lg:order-none">
              <SettingsCard result={result} display={display} adjusted={!!adjust} pro={pro} />
            </div>
            <div className="order-3 lg:order-none">
              <AdjustPanel
                display={display}
                adjusted={!!adjust}
                lastChanged={adjust?.lastChanged}
                fixedAperture={result.fixedAperture}
                widest={apertureFloor(lens?.maxAperture ?? 1.0)}
                maxIso={gear.maxIso}
                onChange={onAdjust}
                onReset={() => setAdjust(null)}
              />
            </div>
            <div className="order-4 lg:order-none">
              <LightSource
                source={prefs.source}
                manualKey={prefs.manualKey}
                meter={meter}
                estimate={estimate}
                pro={pro}
                hasLocation={!!location}
                onSource={(source) => {
                  setPref({ source });
                  if (source === 'meter' && !meter) setSheet('meter');
                }}
                onManual={(manualKey) => setPref({ manualKey })}
                onMeasure={() => setSheet('meter')}
                onClearMeter={() => setMeter(null)}
              />
            </div>
          </div>
          <div className="contents lg:flex lg:flex-col lg:gap-4">
            <div className="order-2 lg:order-none">
              <LensCard sceneKey={sceneKey} scene={scene} gear={gear} pro={pro} onEditGear={() => setSheet('gear')} />
            </div>
            <div className="order-5 lg:order-none">
              <SetupCard scene={scene} kelvin={scene.kelvin ?? estimate.kelvin} tips={tips} pro={pro} />
            </div>
          </div>
        </div>

        <footer className="pt-4 text-center text-xs text-muted">
          Weather by Open-Meteo · Sun & moon by SunCalc · Settings are a starting point — check your histogram.
        </footer>
      </div>

      {sheet === 'location' && (
        <LocationSheet
          onClose={closeSheet}
          onPick={(loc) => {
            setLocation(loc);
            closeSheet();
          }}
        />
      )}
      {sheet === 'gear' && <GearSheet gear={gear} onChange={setGear} onClose={closeSheet} />}
      {sheet === 'meter' && (
        <LightMeterSheet
          calibration={calibration}
          onCalibrate={setCalibration}
          onClose={closeSheet}
          onUse={(r) => {
            setMeter({ ev: r.ev, method: r.method, at: Date.now() });
            setPref({ source: 'meter' });
            closeSheet();
          }}
        />
      )}
    </div>
  );
}

/** Six-blade aperture mark (same geometry as public/icon.svg). */
function ApertureMark() {
  return (
    <svg viewBox="-160 -160 320 320" className="h-7 w-7 text-accent" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <circle r="150" strokeWidth="24" />
        <path d={APERTURE_PATH} strokeWidth="20" />
      </g>
    </svg>
  );
}
const APERTURE_PATH = (() => {
  // Hexagonal opening (r=62); each blade edge runs from one vertex out to the barrel (R=150).
  const R = 150;
  const r = 62;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 90) * Math.PI) / 180;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  return pts
    .map(([x0, y0], i) => {
      const [x1, y1] = pts[(i + 1) % 6];
      let dx = x1 - x0;
      let dy = y1 - y0;
      const L = Math.hypot(dx, dy);
      dx /= L;
      dy /= L;
      const b = -(x0 * dx + y0 * dy);
      const t = -b + Math.sqrt(b * b - (x0 * x0 + y0 * y0 - R * R));
      return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${(x0 - t * dx).toFixed(1)} ${(y0 - t * dy).toFixed(1)}`;
    })
    .join(' ');
})();
