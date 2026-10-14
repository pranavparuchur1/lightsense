/** Everything else to set on the camera: WB, metering, focus, drive, exposure-comp tips. */
export default function SetupCard({ scene, kelvin, tips, pro }) {
  const rows = [
    { label: 'White balance', value: `${kelvin} K`, note: pro ? null : wbName(kelvin) },
    { label: 'Metering', value: scene.metering },
    { label: 'Focus', value: scene.focus },
    { label: 'Drive', value: scene.drive },
  ];
  return (
    <section aria-label="Camera setup" className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="legend">Camera setup</h2>
      <dl className="mt-2 divide-y divide-line">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[7.5rem_1fr] gap-3 py-2 text-sm">
            <dt className="text-muted">{r.label}</dt>
            <dd>
              <span className={r.label === 'White balance' ? 'font-mono font-bold' : ''}>{r.value}</span>
              {r.note && <span className="ml-2 text-muted">{r.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {tips.length > 0 && (
        <>
          <h3 className="legend mt-3">Exposure compensation</h3>
          <ul className="mt-1.5 space-y-1 text-sm">
            {tips.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-accent">±</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function wbName(k) {
  // Nearest camera WB preset, for people who don't set Kelvin directly.
  if (k <= 3400) return 'or the Tungsten preset';
  if (k <= 4300) return 'or the Fluorescent preset';
  if (k <= 5700) return 'or the Daylight preset';
  if (k <= 6700) return 'or the Cloudy preset';
  return 'or the Shade preset';
}
