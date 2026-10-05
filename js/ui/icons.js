// Eigene SVG-Symbole (keine Symbol-Bibliothek). Strichstärke 2, currentColor.

const svg = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const ICONS = {
  status: svg('<path d="M3 12h4l3-8 4 16 3-8h4"/>'),
  map: svg('<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>'),
  plan: svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M7.5 14.5h3M7.5 17.5h6"/>'),
  stats: svg('<path d="M4 20V11M10 20V5M16 20v-7M22 20H2"/>'),
  chevronRight: svg('<path d="m9 5 7 7-7 7"/>'),
  chevronLeft: svg('<path d="m15 5-7 7 7 7"/>'),
  display: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  simulation: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'),
  debug: svg('<path d="M8 8V6a4 4 0 0 1 8 0v2"/><rect x="6" y="8" width="12" height="12" rx="6"/><path d="M12 12v4M3 13h3M18 13h3M4 7l2.5 2.5M20 7l-2.5 2.5M4 20l2.5-2.5M20 20l-2.5-2.5"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  logout: svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>'),
  download: svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  warning: svg('<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17.5v.5"/>'),
  copy: svg('<rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 8V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h2"/>'),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  auto: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>'),
  // Status-Zustände (js/model/status.js)
  bike: svg('<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5h6.5L9.5 9.5l-4 7M9.5 9.5H16l2.5 7M16 9.5l-4 7M16 9.5 15 6.5h2.5M8 7.5h3"/>'),
  pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1.5"/><rect x="14" y="4.5" width="4" height="15" rx="1.5"/>'),
  cart: svg('<path d="M2.5 4h2.4l2.4 11h11l2-8.5H6"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>'),
  bed: svg('<path d="M3 5v14M3 15h18v4M21 15v-2.5A3.5 3.5 0 0 0 17.5 9H11v6"/><circle cx="7" cy="11.5" r="2"/>'),
  heart: svg('<path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.2 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  refresh: svg('<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>'),
};
