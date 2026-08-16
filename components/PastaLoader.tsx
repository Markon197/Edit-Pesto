// A little steaming-bowl animation, shared by the Edit tab's "Checking…"
// state and the Calendar tab's scan states — keeps the loading moment
// on-theme instead of a blank panel that could read as broken.
export default function PastaLoader({ label }: { label: string }) {
  return (
    <div className="checking-state">
      <svg className="pasta-bowl" viewBox="0 0 80 60" width="72" height="54" aria-hidden="true">
        <g className="steam" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round">
          <path className="steam-1" d="M28 26c-3-4 3-6 0-11" />
          <path className="steam-2" d="M40 24c-3-4 3-6 0-11" />
          <path className="steam-3" d="M52 26c-3-4 3-6 0-11" />
        </g>
        <path
          d="M14 30c0 12 11.6 22 26 22s26-10 26-22"
          fill="none"
          stroke="var(--ink-soft)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <ellipse cx="40" cy="30" rx="26" ry="6" fill="none" stroke="var(--ink)" strokeWidth="2" />
        <path
          d="M25 29c3-2 6 1 9-1s6 1 9-1 6 1 9-1"
          fill="none"
          stroke="var(--pesto)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      <p className="checking-text">{label}</p>
    </div>
  );
}
