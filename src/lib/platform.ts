// Which key a shortcut is held with: ⌘ on a Mac (and iPad / iPhone), Ctrl everywhere else.
// The shortcuts themselves accept both — this is only what the screen shows.
const nav = typeof navigator === "undefined" ? null : navigator;
// Any of the browser's three answers saying Mac counts (in any case — Chrome says "macOS"): the newer userAgentData can be empty or
// generic in some browsers, the older platform is deprecated, and the user agent is the fallback.
export const isMac = !!nav && [
  (nav as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform,
  nav.platform,
  nav.userAgent,
].some((v) => !!v && /mac|iphone|ipad|ipod/i.test(v));

/** The modifier as written on the key: "⌘" or "Ctrl". */
export const modKey = isMac ? "⌘" : "Ctrl";
