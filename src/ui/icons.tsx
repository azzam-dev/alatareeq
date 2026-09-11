import type { ReactNode } from 'react';
import type { CategoryId, Reminder } from '../core/types';
import { BRAND_BY_ID } from '../core/lexicon';

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Icon = {
  today: (p: { size?: number }) => <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" /></Svg>,
  drive: (p: { size?: number }) => <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /><path d="M12 14.5V21M9.6 11.2 3.3 9.5M14.4 11.2l6.3-1.7" /></Svg>,
  log: (p: { size?: number }) => <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></Svg>,
  settings: (p: { size?: number }) => <Svg {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></Svg>,
  send: (p: { size?: number }) => <Svg {...p}><path d="M5 12h14M11 6l-6 6 6 6" /></Svg>,
  mic: (p: { size?: number }) => <Svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Svg>,
  check: (p: { size?: number }) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>,
  close: (p: { size?: number }) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>,
  pin: (p: { size?: number }) => <Svg {...p}><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></Svg>,
  clock: (p: { size?: number }) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>,
  tag: (p: { size?: number }) => <Svg {...p}><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.5" cy="8.5" r="1.5" /></Svg>,
  pharmacy: (p: { size?: number }) => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></Svg>,
  grocery: (p: { size?: number }) => <Svg {...p}><path d="M3 5h2l2.2 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6" /><circle cx="9" cy="20" r="1.3" /><circle cx="17" cy="20" r="1.3" /></Svg>,
  bookstore: (p: { size?: number }) => <Svg {...p}><path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2V5Z" /><path d="M4 20a2 2 0 0 0 2 1h13v-3" /></Svg>,
  fuel: (p: { size?: number }) => <Svg {...p}><path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10" /><path d="M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3" /></Svg>,
  laundry: (p: { size?: number }) => <Svg {...p}><path d="M12 7a2 2 0 1 0-2-2" /><path d="M12 7v1.5L3 15.5a1 1 0 0 0 .6 1.8h16.8a1 1 0 0 0 .6-1.8L12 8.5" /></Svg>,
  charging: (p: { size?: number }) => <Svg {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></Svg>,
  play: (p: { size?: number }) => <Svg {...p}><path d="M7 4v16l13-8L7 4Z" /></Svg>,
  stop: (p: { size?: number }) => <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>,
  gps: (p: { size?: number }) => <Svg {...p}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Svg>,
  sparkle: (p: { size?: number }) => <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></Svg>,
  arrow: () => (
    <svg viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="12" fill="#0A5F41" stroke="#fff" strokeWidth="2" />
      <path d="M13 5.5 18.5 18 13 15.2 7.5 18Z" fill="#fff" />
    </svg>
  ),
};

export function CategoryIcon({ id, size = 18 }: { id: CategoryId; size?: number }) {
  const C = Icon[id];
  return <C size={size} />;
}

export function ReminderGlyph({ r }: { r: Reminder }) {
  if (r.trigger === 'time' || !r.target) return <Icon.clock size={18} />;
  if (r.target.kind === 'category') return <CategoryIcon id={r.target.categories[0]} />;
  if (r.target.kind === 'brand') {
    const cat = BRAND_BY_ID[r.target.brandId]?.category;
    return cat ? <CategoryIcon id={cat} /> : <Icon.tag size={18} />;
  }
  return <Icon.pin size={18} />;
}
