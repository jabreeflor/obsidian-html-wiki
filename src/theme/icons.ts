// Hand-drawn SVG icons for the Quiet Reference chrome.
// 1.5px strokes, 16px viewBox, currentColor — no emoji, no flat fills.

const COMMON = 'width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

export const ICON_HOME = `<svg ${COMMON}><path d="M2.5 7.2 8 2.5l5.5 4.7"/><path d="M3.8 6.6v6.4h8.4V6.6"/></svg>`;

export const ICON_TAGS = `<svg ${COMMON}><path d="M2.5 8 8 2.5h4.5V7L7 12.5z"/><circle cx="10.2" cy="5.2" r="0.7"/></svg>`;

export const ICON_GRAPH = `<svg ${COMMON}><circle cx="3.5" cy="11" r="1.6"/><circle cx="12.5" cy="11" r="1.6"/><circle cx="8" cy="3.5" r="1.6"/><path d="M5 10 7 5"/><path d="M11 10 9 5"/><path d="M5 11h6"/></svg>`;

export const ICON_SEARCH = `<svg ${COMMON}><circle cx="7" cy="7" r="4"/><path d="m10 10 3.5 3.5"/></svg>`;

export const ICON_HASH = `<svg ${COMMON}><path d="M5.5 2.5 4 13.5"/><path d="M11.5 2.5 10 13.5"/><path d="M2.5 5.5h11"/><path d="M1.8 10.5h11"/></svg>`;

export const ICON_LINK = `<svg ${COMMON}><path d="M6.5 9.5 9.5 6.5"/><path d="M7.5 4.5 9 3a3 3 0 0 1 4 4l-1.5 1.5"/><path d="M8.5 11.5 7 13a3 3 0 0 1-4-4l1.5-1.5"/></svg>`;
