/** Monospace digits with a narrowed decimal point, so "f/5.6" doesn't read as "f/5. 6". */
export default function Readout({ text }) {
  const i = text.indexOf('.');
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span style={{ letterSpacing: '-0.3em', marginLeft: '-0.08em' }}>.</span>
      {text.slice(i + 1)}
    </>
  );
}
