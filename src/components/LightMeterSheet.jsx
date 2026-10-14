import { useEffect, useRef, useState } from 'react';
import Sheet from './Sheet.jsx';
import { cameraSupported, measure, startCamera, stopCamera } from '../services/lightMeter.js';
import { APERTURES, ISOS, SHUTTERS, fmtAperture, fmtEv, fmtShutter } from '../engine/camera.js';
import { settingsEv } from '../engine/exposure.js';

/**
 * Phone-camera light meter. Point at a mid-tone (grass, tarmac, a grey card), measure,
 * optionally calibrate against your real camera's meter, then use the reading.
 */
export default function LightMeterSheet({ calibration, onCalibrate, onUse, onClose }) {
  const video = useRef(null);
  const canvas = useRef(null);
  const stream = useRef(null);
  const [state, setState] = useState('starting'); // starting | ready | measuring | done | error
  const [progress, setProgress] = useState(0);
  const [reading, setReading] = useState(null);
  const [error, setError] = useState(null);
  const [cal, setCal] = useState({ aperture: 8, shutter: 1 / 125, iso: 100 });

  useEffect(() => {
    if (!cameraSupported()) {
      setState('error');
      setError("This browser can't access the camera.");
      return undefined;
    }
    let cancelled = false;
    startCamera(video.current)
      .then((s) => {
        if (cancelled) return stopCamera(s);
        stream.current = s;
        setState('ready');
      })
      .catch((e) => {
        setState('error');
        setError(e.name === 'NotAllowedError' ? 'Camera permission was denied. You can still pick the light manually.' : "Couldn't start the camera.");
      });
    return () => {
      cancelled = true;
      stopCamera(stream.current);
    };
  }, []);

  const run = async () => {
    setState('measuring');
    setProgress(0);
    const r = await measure(video.current, canvas.current, stream.current, { onProgress: setProgress });
    setReading(r);
    setState('done');
  };

  const calibrated = reading ? reading.ev + calibration : null;
  const cameraEv = settingsEv(cal);
  const offset = reading ? cameraEv - reading.ev : 0;

  return (
    <Sheet title="Measure light" onClose={onClose}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-black">
        <video ref={video} className="h-full w-full object-cover" playsInline muted />
        {/* spot circle: reminds the user to fill the frame with a mid-tone */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="aspect-square h-1/3 rounded-full border-2 border-white/70" />
        </div>
        {state === 'measuring' && <div className="absolute bottom-0 left-0 h-1 bg-accent transition-all" style={{ width: `${progress * 100}%` }} />}
      </div>
      <canvas ref={canvas} hidden />

      {error ? (
        <p className="mt-3 text-sm text-warn">{error}</p>
      ) : (
        <p className="mt-3 text-sm text-muted">Fill the circle with something mid-toned — grass, a road, a grey card — in the same light as your subject.</p>
      )}

      <button
        onClick={run}
        disabled={state !== 'ready' && state !== 'done'}
        className="mt-3 w-full rounded-xl bg-accent px-4 py-3 font-bold text-accent-ink disabled:opacity-50"
      >
        {state === 'measuring' ? 'Measuring…' : state === 'done' ? 'Measure again' : 'Measure'}
      </button>

      {reading && (
        <div className="mt-4 rounded-xl border border-line p-4">
          <div className="flex items-baseline justify-between">
            <span className="legend">Estimate</span>
            <span className="font-mono text-2xl font-bold">EV {fmtEv(calibrated)}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {reading.method === 'exposure'
              ? "Read from your phone camera's own exposure settings — usually within a stop."
              : "Your browser hides the camera's exposure settings, so this is based on pixel brightness only. It can be several stops off until you calibrate it below."}
            {calibration ? ` Includes your ${calibration > 0 ? '+' : ''}${calibration.toFixed(1)} EV calibration.` : ''}
          </p>

          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-bold">Calibrate against your camera</summary>
            <p className="mt-2 text-xs text-muted">Meter the same spot with your camera, enter what it chose, and LightSense will remember the offset.</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Pick label="Aperture" value={cal.aperture} options={APERTURES} fmt={fmtAperture} onChange={(aperture) => setCal({ ...cal, aperture })} />
              <Pick label="Shutter" value={cal.shutter} options={SHUTTERS} fmt={fmtShutter} onChange={(shutter) => setCal({ ...cal, shutter })} />
              <Pick label="ISO" value={cal.iso} options={ISOS} fmt={String} onChange={(iso) => setCal({ ...cal, iso })} />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted">
                Camera says EV {fmtEv(cameraEv)} → offset {offset >= 0 ? '+' : ''}
                {offset.toFixed(1)}
              </span>
              <span className="flex gap-2">
                {calibration !== 0 && (
                  <button onClick={() => onCalibrate(0)} className="rounded-lg border border-line px-3 py-1.5">
                    Reset
                  </button>
                )}
                <button onClick={() => onCalibrate(offset)} className="rounded-lg border border-accent px-3 py-1.5 font-bold text-accent">
                  Save offset
                </button>
              </span>
            </div>
          </details>

          <button onClick={() => onUse(reading)} className="mt-4 w-full rounded-xl border-2 border-accent px-4 py-2.5 font-bold text-accent">
            Use this reading
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Pick({ label, value, options, fmt, onChange }) {
  return (
    <label className="block">
      <span className="legend">{label}</span>
      <select
        value={options.indexOf(value)}
        onChange={(e) => onChange(options[Number(e.target.value)])}
        className="mt-1 w-full rounded-lg border border-line bg-bg px-2 py-2 font-mono"
      >
        {options.map((o, i) => (
          <option key={i} value={i}>
            {fmt(o)}
          </option>
        ))}
      </select>
    </label>
  );
}
