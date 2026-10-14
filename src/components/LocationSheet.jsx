import { useEffect, useState } from 'react';
import { LocateFixed, Search } from 'lucide-react';
import Sheet from './Sheet.jsx';
import { fmtCoords, searchPlaces } from '../services/weather.js';

/** Choose a location: device GPS, or search a city (fallback when permission is denied). */
export default function LocationSheet({ onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [geoState, setGeoState] = useState('idle'); // idle | asking | denied | unavailable
  const [searchErr, setSearchErr] = useState(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        setSearchErr(null);
        setResults(await searchPlaces(query.trim(), ctrl.signal));
      } catch (e) {
        if (e.name !== 'AbortError') setSearchErr('Search needs a connection.');
      }
    }, 300);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [query]);

  const useGps = () => {
    if (!navigator.geolocation) return setGeoState('unavailable');
    setGeoState('asking');
    navigator.geolocation.getCurrentPosition(
      (p) => onPick({ lat: p.coords.latitude, lon: p.coords.longitude, name: fmtCoords(p.coords.latitude, p.coords.longitude), source: 'gps' }),
      (err) => setGeoState(err.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60e3 }
    );
  };

  return (
    <Sheet title="Location" onClose={onClose}>
      <p className="mb-4 text-sm text-muted">Used for sun position and weather. It stays on this device.</p>
      <button
        onClick={useGps}
        disabled={geoState === 'asking'}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 font-bold text-accent-ink disabled:opacity-60"
      >
        <LocateFixed size={18} /> {geoState === 'asking' ? 'Locating…' : 'Use my location'}
      </button>
      {geoState === 'denied' && <p className="mt-2 text-sm text-warn">Location permission was denied — search for a place instead.</p>}
      {geoState === 'unavailable' && <p className="mt-2 text-sm text-warn">Couldn't get a position — search for a place instead.</p>}

      <label className="mt-5 block">
        <span className="legend">Or search a place</span>
        <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line bg-bg px-3">
          <Search size={16} className="text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Yosemite, Reykjavík, Kyoto…"
            className="w-full bg-transparent py-3 outline-none placeholder:text-muted/70"
            autoComplete="off"
          />
        </div>
      </label>
      {searchErr && <p className="mt-2 text-sm text-warn">{searchErr}</p>}
      <ul className="mt-2 divide-y divide-line">
        {results.map((r) => (
          <li key={`${r.lat},${r.lon}`}>
            <button onClick={() => onPick({ ...r, source: 'search' })} className="w-full py-2.5 text-left hover:text-accent">
              <span className="font-bold">{r.name}</span> <span className="text-sm text-muted">{r.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
