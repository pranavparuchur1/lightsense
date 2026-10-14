import { MapPin, WifiOff } from 'lucide-react';
import Icon from './Icon.jsx';
import { describeWeather } from '../services/weather.js';
import { fmtCountdown, moonName } from '../services/sun.js';
import { PHASE_LABELS } from '../engine/light.js';

/** Top strip: where, what the sky is doing, and when the good light is. */
export default function ConditionStrip({ location, sun, weather, status, now, onLocation }) {
  const w = weather ? describeWeather(weather.weatherCode, weather.isDay) : null;
  const age = weather ? Math.round((now - weather.fetchedAt) / 6e4) : null;

  let window = null;
  if (sun?.current) window = { label: sun.current.label, text: `ends in ${fmtCountdown(sun.current.end - now)}`, live: true };
  else if (sun?.next) window = { label: sun.next.label, text: `in ${fmtCountdown(sun.next.start - now)}` };

  return (
    <section aria-label="Current conditions" className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <button onClick={onLocation} className="flex min-w-0 items-center gap-1.5 text-sm font-bold hover:text-accent">
          <MapPin size={15} className="shrink-0 text-accent" />
          <span className="truncate">{location ? location.name : 'Set location'}</span>
        </button>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
          {status === 'loading' && 'Updating…'}
          {status === 'ok' && age != null && (age < 1 ? 'Live' : `Updated ${age}m ago`)}
          {(status === 'offline' || status === 'error') && (
            <>
              <WifiOff size={13} /> {weather ? `Offline · ${age}m old` : 'Offline'}
            </>
          )}
        </span>
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4">
        <Cell label="Sky">
          {w ? (
            <span className="flex items-center gap-1.5">
              <Icon name={w.icon} size={18} className="text-accent" />
              {w.label}
              <span className="text-muted">{Math.round(weather.temperature)}°</span>
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </Cell>
        <Cell label="Cloud">
          {weather ? (
            <span>
              <span className="font-mono">{weather.cloudCover}%</span>
              {weather.visibility < 2000 && <span className="ml-1.5 text-xs text-muted">vis {(weather.visibility / 1000).toFixed(1)}km</span>}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </Cell>
        <Cell label="Sun">
          {sun ? (
            <span>
              <span className="font-mono">{sun.altitudeDeg.toFixed(0)}°</span>{' '}
              <span className="text-xs text-muted">{PHASE_LABELS[sun.phase]}</span>
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </Cell>
        <Cell label={window ? window.label : sun ? 'Moon' : 'Next light'}>
          {window ? (
            <span className={window.live ? 'font-bold text-accent' : ''}>{window.text}</span>
          ) : sun ? (
            <span className="text-sm">
              {moonName(sun.moon.phase)} <span className="font-mono text-muted">{Math.round(sun.moon.fraction * 100)}%</span>
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </Cell>
      </dl>
    </section>
  );
}

function Cell({ label, children }) {
  return (
    <div className="border-line px-4 py-2.5 [&:nth-child(odd)]:border-r sm:border-r sm:last:border-r-0 [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0">
      <dt className="legend">{label}</dt>
      <dd className="mt-0.5 text-[0.95rem]">{children}</dd>
    </div>
  );
}
