// Small inline icons (no icon font, no extra dependency). Decorative: hidden from screen readers.
const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const CheckCircle = () => <svg {...base} style={{ color: 'var(--ok)' }}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>;
export const Current = () => <svg {...base} style={{ color: 'var(--accent)' }}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" fill="currentColor" /></svg>;
export const Open = () => <svg {...base} style={{ color: 'var(--muted)' }}><circle cx="12" cy="12" r="9" /></svg>;
export const Lock = () => <svg {...base} style={{ color: 'var(--muted)' }}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
export const Folder = () => <svg {...base}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
export const Bulb = () => <svg {...base}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" /></svg>;
export const Plus = () => <svg {...base}><path d="M12 5v14M5 12h14" /></svg>;
export const Send = () => <svg {...base}><path d="M4 12 20 4l-4 16-4-7z" /><path d="m12 13 8-9" /></svg>;
export const DocIcon = () => <svg {...base}><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>;
export const Pencil = () => <svg {...base} width={15} height={15}><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>;
export const Question = () => <svg {...base} style={{ color: 'var(--warn)' }}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01" /></svg>;
export const Book = () => <svg {...base}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M8 7h7" /></svg>;
export const Gear = () => <svg {...base} width={16} height={16}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></svg>;
