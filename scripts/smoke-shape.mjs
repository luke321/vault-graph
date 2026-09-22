// github#155, decisions/0016 -- the lane, and how Chrome is launched

/* ------------------------------------------------------------------- lanes */

// github#113, github#155, decisions/0016
export const LANES = ["all", "fast", "walk"];

/** @param {{ clock?: string }} check @returns {"walk" | "fast"} */
export function laneOf(check) {
  return check && check.clock === "real" ? "walk" : "fast";
}

/**
 * github#155
 * @param {string} v
 * @returns {"all" | "fast" | "walk"}
 */
export function parseLane(v) {
  const lane = String(v || "all").trim().toLowerCase();
  if (LANES.indexOf(lane) < 0) {
    throw new Error(`--lane ${v}: expected one of ${LANES.join(", ")}`);
  }
  return /** @type {"all" | "fast" | "walk"} */ (lane);
}

/**
 * github#155
 * @template {{ clock?: string }} T
 * @param {T[]} checks
 * @param {string} lane
 * @returns {T[]}
 */
export function pickLane(checks, lane) {
  const want = parseLane(lane);
  return want === "all" ? checks.slice() : checks.filter((c) => laneOf(c) === want);
}

/* ---------------------------------------------------------------- headless */

// github#155, decisions/0016 -- asked for, never inferred. CI does NOT imply it.
/**
 * @param {{ argv?: string[], env?: Record<string, string | undefined> }} [opts]
 * @returns {boolean}
 */
export function wantsHeadless({ argv = [], env = {} } = {}) {
  if (argv.indexOf("--headed") >= 0) return false;
  if (argv.indexOf("--headless") >= 0) return true;
  // github#155 -- VG_HEADLESS=false is a no, the way a person would read it
  const on = (v) => !!v && v !== "0" && String(v).toLowerCase() !== "false";
  return on(env.VG_HEADLESS);
}

/* ------------------------------------------------------------ the launch */

// github#155 -- every flag, in one place
const ALWAYS = [
  "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--disable-component-update", "--disable-client-side-phishing-detection",
  "--disable-sync", "--no-service-autorun", "--disable-domain-reliability",
  "--metrics-recording-only", "--no-pings", "--mute-audio",
  "--disable-breakpad", "--disable-crash-reporter",
  // github#7
  "--disable-features=Translate,TranslateUI,CalculateNativeWinOcclusion",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
];

/**
 * github#155
 * @param {{ url: string, port: number, profile: string, headless?: boolean, windowPos?: (string|null), windowSize?: string }} opts
 * @returns {string[]}
 */
export function chromeArgs({ url, port, profile, headless = false,
                             windowPos = null, windowSize = "1600,1000" }) {
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, ...ALWAYS];
  if (headless) {
    // github#155, decisions/0016 -- no position, and the URL positional, not --app=
    args.push("--headless=new");
    args.push(`--window-size=${windowSize}`);
    args.push(url);
    return args;
  }
  if (windowPos) args.push(windowPos);
  args.push(`--window-size=${windowSize}`, `--app=${url}`);
  return args;
}

/* ------------------------------------------------------- the viewport */

// github#155, decisions/0016 -- the inner size every threshold here was tuned in
export const TUNED_VIEWPORT = { w: 1584, h: 961 };

// github#155, decisions/0016 -- self-calibrating, never hardcoded per platform
/**
 * @param {{ width: number, height: number }} bounds the window's current OUTER bounds
 * @param {{ w: number, h: number }} got what the page reports seeing
 * @param {{ w: number, h: number }} want
 * @returns {{ width: number, height: number } | null} null when it already fits
 */
export function nextBounds(bounds, got, want) {
  const dw = want.w - got.w, dh = want.h - got.h;
  if (!dw && !dh) return null;
  return { width: Math.max(200, bounds.width + dw), height: Math.max(200, bounds.height + dh) };
}
