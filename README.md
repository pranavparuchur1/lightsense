# LightSense

A camera-settings assistant. It reads your location, the sun, the weather (and optionally your phone camera), asks what you're shooting, and gives you aperture, shutter speed, ISO, white balance, focus/drive/metering, and a lens recommendation, with a one-line reason for each value.

React + Vite + Tailwind. No backend and no API keys. Works offline as a PWA using the last-known conditions.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine unit tests (vitest)
npm run build      # static site in dist/ — deploy anywhere (relative paths, so sub-paths work)
```

The service worker only registers in production builds (`npm run build && npm run preview`).

## Layout

```
src/
  engine/            ← all the photography logic. Pure JS: no React, no network.
    camera.js          stop scales (⅓-stop apertures/shutters/ISOs), crop factors, snapping, formatting
    light.js           scene brightness model → EV100
    scenes.js          one object per scene: priorities, ranges, AF/WB/drive, explanations
    exposure.js        the solver + reciprocity for the Adjust sliders
    lenses.js          lens scoring, catalog picks, parsing "70-200mm f/4" text
  data/lenses.json   lens catalog (Canon RF, Nikon Z, Sony E, Fujifilm X, MFT, phone cameras)
  services/          browser I/O: sun.js (SunCalc), weather.js (Open-Meteo), lightMeter.js (getUserMedia)
  hooks/             useConditions (live sun + cached weather), useStoredState (localStorage)
  components/        UI
public/sw.js         offline cache: app shell + last weather response
tests/engine.test.js
```

## The exposure math

### 1. The exposure equation

Exposure value at ISO 100:

```
EV100 = log2(N² / t)                      N = f-number, t = shutter in seconds
```

Scaled for ISO (doubling ISO needs one stop *less* light):

```
EV100 = log2(N² / t) − log2(ISO / 100)
```

So any two of N, t and ISO fix the third. Sanity check: Sunny 16 (f/16, 1/125, ISO 100) gives log2(256 × 125) ≈ 15, the textbook EV for bright sun.

Internally everything is in **stops** (log2 units). `exposureNeed(settings, ev)` returns how many stops the settings under-expose the scene: positive means too dark, negative means too bright.

### 2. How bright is the scene? (`engine/light.js`)

The first available source wins:

1. **Light-meter reading + calibration offset.**
2. **Manual lighting pick**, from the classic EV table: bright sun 15, overcast 12–13, open shade 12, golden hour 11, blue hour 7, interiors 6–8, moonlit −3, dark sky −7.
3. **Sun + weather model:**
   - **Clear-sky EV from sun altitude.** The curve is piecewise-linear: ≥20° → 15 (Sunny 16), 10° → 14, 6° → 13, 0° → 11, −4° → 9, −6° → 7, −12° → 3. Below −18° it falls back to the night sky.
   - **Night sky.** EV −7 without a moon. A high full moon raises it to about −2.5, scaled by moon illumination × moon height.
   - **Weather penalties.** Cloud >25% costs −0.5, >50% −1 and >85% −2. Rain, fog and thunderstorms cost −1 each. These apply fully in daylight and golden hour, at half strength in blue hour, and not at all at night.
   - **Indoor scenes** ignore the sun (EV 7–8). **City scenes** get a floor of EV 6 after dark for street lights.

Scenes can add an `evOffset`. Sunset/golden hour uses +1, because you're metering a sky that's brighter than the land.

### 3. Solving for settings (`engine/exposure.js`)

Each scene sets a **starting point** (target aperture, shutter and ISO) and two **ordered step lists**. `brighten` is used when the scene is darker than the targets allow, `darken` when it's brighter. The solver walks the list. Each step moves one parameter as far as it needs to, or until it hits a limit, and the remainder passes to the next step.

| Scene | Starts at | When it's dark |
|---|---|---|
| Wildlife / birds / sports | 1/1000 – 1/2500 s | open up → **raise ISO** → only then slow the shutter (to a floor of 1/500 – 1/1600) |
| Landscape | f/11 (FF), ISO 100 | slow the shutter. A tripod lets it run to 30 s; otherwise it stops at the handheld limit, then ISO rises |
| Portrait | f/1.8 | shutter down to 1/125 → ISO. If it's too bright at 1/8000: stop down to f/2.8 → suggest ND |
| Macro | f/11 (FF), handheld limit ×2 | shutter → ISO → open to f/8. Suggests flash |
| Astro | widest aperture, 500-rule shutter, ISO 1600 | ISO up to 6400. If moonlit: ISO down → stop down to f/2.8 → shorten |
| Waterfall | 1 s at f/11 | if too bright: f/16, then 0.5 s, and **the leftover stops become the ND filter strength** |

The limits come from your gear and these rules:

- **Reciprocal rule** (slowest safe handheld shutter): `1 / (focal × crop) × 2^stabStops`. Macro uses a factor of 2.
- **500 rule** (longest exposure before stars trail): `500 / (focal × crop)`, capped at 30 s.
- **Max ISO**: the lower of your setting and the scene cap.
- **Lens**: you can't open wider than your lens's maximum aperture *at the focal length you'll use*. For variable-aperture zooms this is interpolated, then rounded to the next slower real stop. With no lens info, the scene's recommended lens aperture is assumed.
- **Depth-of-field equivalence** (landscape, macro): the aperture target is divided by the crop factor, so an MFT camera gets about f/5.6 → clamped to the scene's f/8 minimum, instead of a diffraction-soft f/11.

After solving, values snap to real ⅓-stop camera scales. The last parameter the solver moved is re-solved after the other two are snapped, so rounding errors don't add up. Anything left over (more than ⅓ stop) becomes a warning, plus fixes where they apply: tripod (with the shutter you'd use), Bulb duration, flash, the ISO that would work, or an ND filter (ND8 / ND64 / ND1000…).

When a scene *prefers* a tripod (landscape, night city), the card also shows a **"Handheld instead"** alternative.

### 4. Reciprocity sliders

When you change one value, a follower absorbs the difference to keep `log2(N²/t) − log2(ISO/100)` constant:

- aperture → shutter follows (then ISO)
- shutter → ISO follows (then aperture)
- ISO → shutter follows (then aperture)

The exposure scale under the readout shows any error, in viewfinder convention (+ = over).

### 5. The phone light meter (`services/lightMeter.js`)

Phone cameras auto-expose, so raw pixel brightness says little on its own. Two methods:

- **Chrome on Android** exposes the live `exposureTime` and `iso` through `track.getSettings()`. LightSense then computes a real reflected-light reading: `EV100 = log2(1.8² / t) − log2(ISO/100) + log2(Ȳ / 0.18)`, where Ȳ is the frame's mean linear luminance (median of 10 frames).
- **Everywhere else** it falls back to `10 + log2(Ȳ / 0.18)`. That's a guess, so the UI labels it as one and offers **calibration**: meter the same spot with your real camera, enter its settings, and the offset is saved.

## Adding a scene

Add an entry to `SCENES` in `src/engine/scenes.js`. Every field is documented at the top of that file. A minimal example:

```js
fireworks: {
  label: 'Fireworks',
  icon: 'Sparkles',                         // any name mapped in components/Icon.jsx
  setting: 'city',                          // 'outdoor' | 'indoor' | 'city'
  aperture: { target: 8, min: 5.6, max: 11 },
  shutter: { target: 2, slowest: 4, fastest: 1 },
  iso: { start: 100, max: 400 },
  tripod: 'required',
  brighten: [{ p: 'shutter' }, { p: 'iso' }],
  darken: [{ p: 'aperture' }, { p: 'shutter' }],
  lens: { ffFocal: [24, 70], ideal: 35, maxAperture: 4, type: 'Standard zoom', tags: ['standard', 'wide'] },
  focus: 'Manual focus at infinity',
  drive: 'Bulb with a remote, or 2s timer',
  metering: 'Ignore it — bursts are brief',
  why: { aperture: '…', shutter: '…', iso: '…' },
  tips: ['−0.7 EV keeps colours saturated.'],
},
```

It appears in the scene picker automatically. If you use a new icon, add it to `components/Icon.jsx`. Optionally add a sentence to `LENS_WHY` in `components/LensCard.jsx`, then add a test in `tests/engine.test.js`.

## Adding lenses

Append to `lenses` in `src/data/lenses.json`:

```json
{ "id": "rf-24-240", "systems": ["canon"], "name": "Canon RF 24-240mm F4-6.3 IS USM",
  "coverage": "FF", "focal": [24, 240], "aperture": [4, 6.3],
  "tags": ["standard", "telephoto", "zoom"], "tier": "budget", "price": 900 }
```

- `focal` is the real focal length. The engine applies the crop factor itself.
- `aperture` is `[at wide end, at long end]`.
- `coverage`: `FF` lenses are offered for FF and APS-C bodies of the same system. `APS-C` and `MFT` lenses only for their own sensor.
- `systems` can list several mounts, for third-party lenses.
- `tags` add a small bonus when they match the scene's `lens.tags`. The `macro` tag is required for the Macro scene. Add `"magnification": 0.5` for half-life-size "macro" lenses.
- `tier`: one pick per tier (`budget` / `mid` / `pro`) is shown, the best-scoring lens in that tier.

**Scoring** (`engine/lenses.js`, 0–1):
- 55% focal fit: distance from the scene's ideal focal length plus coverage of the ideal range, in full-frame-equivalent mm, measured in log space.
- 35% aperture fit: the lens's max aperture at the working focal length vs. the scene's ideal.
- 10% type/tag match.

Your own lenses are free text ("70-200mm f/4"), parsed by `parseUserLens` and ranked with the same score. The best one also feeds the exposure solver (its focal length drives the handheld limit, its aperture limits how wide the solver can open).

Prices are approximate street prices in USD, for orientation only.

## Data sources

- Weather: [Open-Meteo](https://open-meteo.com/) forecast + geocoding APIs (free, no key).
- Sun & moon: [SunCalc](https://github.com/mourner/suncalc). Golden hour is taken as sun altitude +6° → −4°, blue hour −4° → −6°.
- Fonts: B612 / B612 Mono (bundled), designed for cockpit displays, which suits reading at a glance in bad light.
