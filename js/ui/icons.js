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
  refresh: svg('<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>'),
};
