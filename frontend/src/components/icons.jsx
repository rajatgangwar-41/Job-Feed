// Small stroke icons, one component each, sized by the caller via className.
// Shared defaults keep every call site short.
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

export const IconFilter = (p) => (<svg {...base} {...p}><path d="M4 6h16M7 12h10M10 18h4" /></svg>);
export const IconSearch = (p) => (<svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const IconClose = (p) => (<svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const IconRefresh = (p) => (<svg {...base} {...p}><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></svg>);
export const IconDensity = (p) => (<svg {...base} {...p}><path d="M4 6h16M4 12h16M4 18h16" /></svg>);
export const IconHelp = (p) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" /><path d="M12 17h.01" /></svg>);
export const IconBookmark = (p) => (<svg {...base} {...p}><path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.5a1 1 0 0 1 1-1z" /></svg>);
export const IconCheck = (p) => (<svg {...base} {...p}><path d="M4.5 12.5l5 5 10-11" /></svg>);
export const IconBan = (p) => (<svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></svg>);
export const IconUndo = (p) => (<svg {...base} {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>);
export const IconMore = (p) => (<svg {...base} {...p}><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>);
export const IconPin = (p) => (<svg {...base} {...p}><path d="M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11z" /><circle cx="12" cy="10" r="2" /></svg>);
export const IconCash = (p) => (<svg {...base} {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></svg>);
export const IconExp = (p) => (<svg {...base} {...p}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>);
export const IconTag = (p) => (<svg {...base} {...p}><path d="M20 13 13 20 3 10V3h7l10 10z" /><circle cx="7.5" cy="7.5" r="1" /></svg>);
export const IconLink = (p) => (<svg {...base} {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>);
export const IconExternal = (p) => (<svg {...base} {...p}><path d="M14 4h6v6M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>);
export const IconEye = (p) => (<svg {...base} {...p}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>);
export const IconSun = (p) => (<svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
export const IconMoon = (p) => (<svg {...base} {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>);
export const IconAuto = (p) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></svg>);
export const IconPlus = (p) => (<svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>);
export const IconTrash = (p) => (<svg {...base} {...p}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a1 1 0 0 1-1 .9H8.8a1 1 0 0 1-1-.9L7 7" /><path d="M10 11v6M14 11v6" /></svg>);
export const IconGrip = (p) => (<svg {...base} {...p}><circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" /></svg>);
export const IconChart = (p) => (<svg {...base} {...p}><path d="M4 20V10M11 20V4M18 20v-7" /></svg>);
export const IconKanban = (p) => (<svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></svg>);
export const IconNote = (p) => (<svg {...base} {...p}><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v3h3M9 11h6M9 15h6" /></svg>);
export const IconChevronDown = (p) => (<svg {...base} {...p}><path d="M6 9l6 6 6-6" /></svg>);
export const IconChevronLeft = (p) => (<svg {...base} {...p}><path d="M15 5l-7 7 7 7" /></svg>);
export const IconChevronRight = (p) => (<svg {...base} {...p}><path d="M9 5l7 7-7 7" /></svg>);

export const IconClock = (p) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></svg>);
export const IconCalendar = (p) => (<svg {...base} {...p}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>);
export const IconLayers = (p) => (<svg {...base} {...p}><path d="M12 3l8 4.5-8 4.5-8-4.5z" /><path d="m4 12.5 8 4.5 8-4.5" /><path d="m4 17 8 4.5 8-4.5" /></svg>);

export const THEME_ICON = { auto: IconAuto, dark: IconMoon, light: IconSun };
