import Icon from './Icon.jsx';
import { SCENES, SCENE_KEYS } from '../engine/scenes.js';

/** Scene chips: a horizontal strip on phones, a wrapping grid on wider screens. */
export default function ScenePicker({ value, onChange }) {
  return (
    <section aria-label="What are you shooting?">
      <h2 className="legend mb-2 px-1">What are you shooting?</h2>
      <div role="radiogroup" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {SCENE_KEYS.map((k) => {
          const s = SCENES[k];
          const on = value === k;
          return (
            <button
              key={k}
              role="radio"
              aria-checked={on}
              onClick={() => onChange(k)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm whitespace-nowrap transition-colors ${
                on ? 'border-accent bg-accent font-bold text-accent-ink' : 'border-line bg-surface hover:border-accent'
              }`}
            >
              <Icon name={s.icon} size={17} />
              {s.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
