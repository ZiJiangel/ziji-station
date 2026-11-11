import { useState } from 'react';

interface Props {
  defaultChecked?: boolean;
  onChange?: (on: boolean) => void;
  label?: string;
  id?: string;
}

export default function SquishSwitch({ defaultChecked = false, onChange, label, id }: Props) {
  const [on, setOn] = useState(defaultChecked);

  function toggle() {
    const next = !on;
    setOn(next);
    onChange?.(next);
  }

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={toggle}
      className={`squish-switch ${on ? 'on' : ''}`}
    >
      <span className="thumb" />
      <style>{`
        .squish-switch {
          position: relative;
          width: 44px; height: 26px;
          border-radius: 99px;
          background: var(--border-hi);
          border: none;
          cursor: pointer;
          padding: 0;
          transition: background 0.3s var(--ease-out);
          flex: 0 0 auto;
        }
        .squish-switch .thumb {
          position: absolute;
          top: 3px; left: 3px;
          width: 20px; height: 20px;
          border-radius: 50%;
          background: var(--surface);
          box-shadow: 0 1px 4px oklch(0 0 0 / .22);
          transition:
            transform 0.42s cubic-bezier(.34, 1.56, .64, 1),
            width 0.2s var(--ease-out),
            background 0.3s;
        }
        .squish-switch:active .thumb { width: 26px; }
        .squish-switch.on { background: var(--accent); }
        .squish-switch.on .thumb {
          transform: translateX(18px);
          background: var(--bg);
        }
        .squish-switch.on:active .thumb { transform: translateX(12px); }
      `}</style>
    </button>
  );
}
