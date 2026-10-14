import { describe, it, expect } from 'vitest';
import { settingsEv, solveExposure, reciprocate, rule500, handheldLimit } from '../src/engine/exposure.js';
import { estimateSceneEv, clearSkyEv } from '../src/engine/light.js';
import { recommendCatalog, rankUserLenses, parseUserLens, lensForExposure } from '../src/engine/lenses.js';

const FF = { sensor: 'ff', maxIso: 6400, stabStops: 0, hasTripod: true, lenses: [] };

describe('exposure math', () => {
  it('Sunny 16: f/16, 1/100, ISO 100 ≈ EV 15', () => {
    expect(settingsEv({ aperture: 16, shutter: 1 / 100, iso: 100 })).toBeCloseTo(14.64, 1);
    expect(settingsEv({ aperture: 16, shutter: 1 / 128, iso: 100 })).toBeCloseTo(15, 1);
  });
  it('ISO doubles = one stop less light needed', () => {
    expect(settingsEv({ aperture: 8, shutter: 1 / 250, iso: 200 })).toBeCloseTo(settingsEv({ aperture: 8, shutter: 1 / 250, iso: 100 }) - 1, 6);
  });
  it('reciprocal & 500 rules', () => {
    expect(handheldLimit(400 * 1.5)).toBeCloseTo(1 / 600);
    expect(handheldLimit(100, 2)).toBeCloseTo(1 / 25);
    expect(rule500(14 * 1.5)).toBeCloseTo(23.8, 1);
  });
});

describe('light model', () => {
  it('sun high & clear = 15; golden at horizon = 11', () => {
    expect(clearSkyEv(45)).toBe(15);
    expect(clearSkyEv(0)).toBeCloseTo(11);
  });
  it('heavy overcast takes 2 stops by day, nothing at night', () => {
    expect(estimateSceneEv({ altDeg: 40, weather: { cloudCover: 95 } }).ev).toBe(13);
    expect(estimateSceneEv({ altDeg: -30, weather: { cloudCover: 95 } }).ev).toBe(-7);
  });
  it('meter wins over everything, with calibration', () => {
    const r = estimateSceneEv({ altDeg: 40, manual: 'sun', meter: { ev: 10 }, calibration: 0.5 });
    expect(r.source).toBe('meter');
    expect(r.ev).toBe(10.5);
  });
});

describe('scene solver', () => {
  it('wildlife in full sun: shutter ≥ 1/1000, base ISO', () => {
    const r = solveExposure({ sceneKey: 'wildlife', ev100: 15, gear: FF });
    expect(r.shutter).toBeLessThanOrEqual(1 / 1000);
    expect(r.iso).toBeLessThanOrEqual(125);
    expect(Math.abs(r.residual)).toBeLessThan(0.34);
  });
  it('wildlife under heavy overcast at dusk raises ISO before slowing shutter', () => {
    const r = solveExposure({ sceneKey: 'wildlife', ev100: 10, gear: FF });
    expect(r.shutter).toBeLessThanOrEqual(1 / 1000 + 1e-9);
    expect(r.iso).toBeGreaterThan(400);
  });
  it('landscape: f/11 on FF, f/8 on MFT, base ISO', () => {
    expect(solveExposure({ sceneKey: 'landscape', ev100: 15, gear: FF }).aperture).toBe(11);
    expect(solveExposure({ sceneKey: 'landscape', ev100: 15, gear: { ...FF, sensor: 'mft' } }).aperture).toBe(8);
  });
  it('landscape at blue hour uses a tripod and offers a handheld alternative', () => {
    const r = solveExposure({ sceneKey: 'landscape', ev100: 7, gear: FF });
    expect(r.useTripod).toBe(true);
    expect(r.iso).toBe(100);
    expect(r.alternative).toBeTruthy();
    expect(r.alternative.iso).toBeGreaterThan(100);
  });
  it('portrait wide open in bright sun suggests ND (shutter maxes out)', () => {
    const r = solveExposure({ sceneKey: 'portrait', ev100: 16, gear: FF, lens: { ffFocal: 85, maxAperture: 1.4 } });
    expect(r.shutter).toBeCloseTo(1 / 8000);
  });
  it('waterfall in sun needs an ND filter', () => {
    const r = solveExposure({ sceneKey: 'waterfall', ev100: 15, gear: FF });
    expect(r.suggestions.some((s) => s.kind === 'nd')).toBe(true);
    expect(r.shutter).toBe(0.5);
  });
  it('astro: 500 rule shutter, ISO 1600–6400, widest aperture', () => {
    const r = solveExposure({ sceneKey: 'astro', ev100: -7, gear: FF, lens: { ffFocal: 14, maxAperture: 2.8 } });
    expect(r.shutter).toBeGreaterThanOrEqual(25);
    expect(r.aperture).toBe(2.8);
    expect(r.iso).toBeGreaterThanOrEqual(1600);
    expect(r.iso).toBeLessThanOrEqual(6400);
  });
  it('respects max ISO and says so', () => {
    const r = solveExposure({ sceneKey: 'sports', ev100: 5, gear: { ...FF, maxIso: 3200 } });
    expect(r.iso).toBeLessThanOrEqual(3200);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('phone: aperture is fixed', () => {
    const gear = { ...FF, sensor: 'phone', stabStops: 2 };
    const lens = lensForExposure('landscape', gear);
    const r = solveExposure({ sceneKey: 'landscape', ev100: 12, gear, lens });
    expect(r.aperture).toBe(lens.maxAperture);
  });
});

describe('reciprocity', () => {
  it('opening one stop halves the shutter', () => {
    const r = reciprocate({ aperture: 8, shutter: 1 / 250, iso: 100 }, 'aperture', 5.6, settingsEv({ aperture: 8, shutter: 1 / 250, iso: 100 }));
    expect(r.shutter).toBeCloseTo(1 / 500, 4);
    expect(r.iso).toBe(100);
  });
  it('shutter change is absorbed by ISO', () => {
    const ev = settingsEv({ aperture: 5.6, shutter: 1 / 500, iso: 400 });
    const r = reciprocate({ aperture: 5.6, shutter: 1 / 500, iso: 400 }, 'shutter', 1 / 2000, ev);
    expect(r.iso).toBe(1600);
  });
});

describe('lenses', () => {
  it('parses free text', () => {
    expect(parseUserLens('Sony FE 70-200mm F4 G')).toMatchObject({ focal: [70, 200], aperture: [4, 4] });
    expect(parseUserLens('nifty 50mm f/1.8')).toMatchObject({ focal: [50, 50], aperture: [1.8, 1.8] });
    expect(parseUserLens('XF 18-55mm F2.8-4')).toMatchObject({ focal: [18, 55], aperture: [2.8, 4] });
    expect(parseUserLens('my favourite lens')).toBeNull();
  });
  it('wildlife on Sony FF recommends long telephotos in all tiers', () => {
    const recs = recommendCatalog('wildlife', 'ff', 'sony');
    expect(recs.map((r) => r.tier)).toEqual(['budget', 'mid', 'pro']);
    for (const r of recs) expect(r.lens.focal[1]).toBeGreaterThanOrEqual(300);
  });
  it('macro only recommends macro lenses', () => {
    for (const sys of ['canon', 'nikon', 'sony', 'fuji']) {
      const sensor = sys === 'fuji' ? 'apsc' : 'ff';
      for (const r of recommendCatalog('macro', sensor, sys)) expect(r.lens.tags).toContain('macro');
    }
  });
  it('ranks owned lenses', () => {
    const r = rankUserLenses(['24-70mm f/2.8', '85mm f/1.8', '100-400mm f/4.5-5.6'], 'portrait', 'ff');
    expect(r[0].lens.name).toBe('85mm f/1.8');
    const w = rankUserLenses(['24-70mm f/2.8', '85mm f/1.8', '100-400mm f/4.5-5.6'], 'wildlife', 'ff');
    expect(w[0].lens.name).toBe('100-400mm f/4.5-5.6');
  });
});

describe('lens limits & light meter math', () => {
  it('never recommends an aperture wider than the lens can open', async () => {
    const { apertureFloor } = await import('../src/engine/camera.js');
    expect(apertureFloor(5.8)).toBe(6.3);
    expect(apertureFloor(5.6)).toBe(5.6);
    const r = solveExposure({ sceneKey: 'wildlife', ev100: 11, gear: { ...FF, sensor: 'apsc' }, lens: { ffFocal: 400, maxAperture: 5.8 } });
    expect(r.aperture).toBeGreaterThanOrEqual(6.3);
  });
  it('meter: EV from the camera track when exposure settings are exposed, luminance fallback otherwise', async () => {
    const { luminanceToEv } = await import('../src/services/lightMeter.js');
    // f/1.8, 1/1000 s (10 × 100 µs), ISO 100, mid-grey frame → log2(3.24 / 0.001) ≈ 11.66
    const track = { getSettings: () => ({ exposureTime: 10, iso: 100 }) };
    const a = luminanceToEv(0.18, track);
    expect(a.method).toBe('exposure');
    expect(a.ev).toBeCloseTo(11.66, 1);
    const b = luminanceToEv(0.36, null);
    expect(b.method).toBe('luminance');
    expect(b.ev).toBeCloseTo(11, 5);
  });
});
