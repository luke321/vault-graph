// github#145 -- the two debug globals, declared where they are set
// github#145 -- both optional; see github#62, github#135
// github#145 -- not linted, as plugin/bundler-modules.d.ts is not

export {};

declare global {
  interface Window {
    /** github#145 -- src/page.js's api */
    __vg?: import("./page.js").VgApi;
    /** github#145 -- plugin/main.js's last spike report */
    __vgSpikeReport?: unknown;
  }
}
