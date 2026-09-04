// Obsidian's own guideline linter, plus typescript-eslint's type-aware rules on our own
// JavaScript. Running both locally is the point: the community directory re-scans EVERY
// published version with the same rule set, so a rule broken here is a rejected release
// later, not a style opinion -- and its review of 1.9.0 showed 77 findings where this run
// showed 28, because it also runs the five no-unsafe-* rules the preset ships off (github#55).
//
// The recommended preset is aimed at TypeScript plugins. This one is plain JavaScript --
// deliberately, so the plugin has no compile step beyond bundling. That used to be read as
// "so the type-aware rules cannot run", and it is not so: typescript-eslint builds a program
// from tsconfig.json (allowJs) and the type-aware rules read it whether a file says .ts or
// .js, which is exactly how the directory runs them on our .js. What the preset's own `files`
// scoping keeps on `**/*.{ts,...}` is switched on by hand below, where it matters.
//
// THREE SCOPES. The plugin and the page run inside Obsidian, so every guideline rule and the
// type-aware set apply to them. The exporter (src/*.mjs) and scripts/ are Node programs that
// never run inside Obsidian, so Obsidian's rules say nothing about them and are off there;
// the syntax rules and no-unused-vars still run. vendor/ is third-party and ignored -- the
// directory scans it too, and its findings are github#58's, not ours to fix.

import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig } from "eslint/config";
import { METER_RULES } from "./scripts/lint-summary.mjs";

// THE METER: the five rules the directory's review runs and the 0.4.1 preset leaves off.
// WARN, NOT ERROR -- measured on develop@972daca they fire 6,977 times (510 in plugin/main.js,
// 6,467 in src/page.js), so as errors they would be a wall. The gate is on the COUNT instead:
// package.json's lint script runs scripts/lint.mjs with `--budget N` at exactly the measured
// total, and the wrapper fails when the meter differs from N in EITHER direction: a new one
// fails the push, and taking one off means lowering N in the same commit. That makes this the
// progress meter for #55's later phases -- every `any` that gets a type takes findings off it --
// and scripts/lint-summary.mjs is what keeps a 7,000-warning run readable. The list lives there,
// imported here, so what is counted and what is warned cannot drift apart.
const METER = Object.fromEntries(METER_RULES.map((rule) => [rule, "warn"]));

// Every obsidianmd rule, off -- for the Node-side scope below. Generated from the plugin's own
// rule list rather than written out, so a rule the next preset version adds is off there too.
const OBSIDIAN_OFF = Object.fromEntries(
  Object.keys(obsidianmd.rules).map((name) => ["obsidianmd/" + name, "off"]));

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    // THE PLUGIN AND THE PAGE: what actually runs inside Obsidian.
    files: ["plugin/**/*.js", "src/page.js"],
    rules: {
      // THE PRESET SCOPES THIS RULE TO `**/*.{ts,cts,mts,tsx}`, so on a plain-JavaScript
      // plugin it silently never runs -- and the directory's scanner runs it anyway. That
      // gap cost a rejected release: two `revealLeaf` calls flagged upstream while the
      // local run said clean. Turning it on here closes that hole between what this repo
      // checks and what the directory checks; the five below close the other one.
      "obsidianmd/no-unsupported-api": "error",
      ...METER,
      // OFF, WITH THE REASON, and off HERE rather than by a disable comment: the preset's
      // eslint-comments/no-restricted-disable forbids disabling any obsidianmd/* inline.
      // The rule asks the PluginSettingTab for getSettingDefinitions() so its settings show
      // up in 1.13's settings search. On 1.13 a non-empty return REPLACES display() -- the
      // tab is rendered from the definitions -- and this tab is ~350 lines of folder-colour
      // picker that would need `render`-type definitions plus display() kept as the fallback
      // for minAppVersion 1.7.2, against typings (obsidian 1.13.1) this repo does not pin.
      // That is its own change, github#59. An empty-array stub would satisfy the rule and
      // gain nothing. The directory's board keeps this one warning until #59 lands.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
    languageOptions: {
      ecmaVersion: 2022,
      // MODULE, not commonjs. Getting this wrong is invisible and expensive: eslint keeps
      // treating the file as a script, so every top-level function is a "global" and the
      // `Plugin` import collides with the DOM's own `Plugin` -- seven errors that describe
      // the config rather than the code.
      sourceType: "module",
      // The type-aware rules read a program, and tsconfig.json is that program's config and
      // nothing else -- see the comment in it, including why its `include` names src/page.js.
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        performance: "readonly",
        URL: "readonly",
        Blob: "readonly",
        URLSearchParams: "readonly",
        require: "readonly",
        module: "writable",
      },
    },
  },
  {
    // THE EXPORTER AND THE TOOLING: Node programs, never loaded by Obsidian. No type program
    // here -- nothing type-aware is on for them, so none is built -- and Node's globals rather
    // than the page's.
    files: ["src/**/*.mjs", "scripts/**/*.mjs"],
    rules: {
      ...OBSIDIAN_OFF,
      // AND THE PRESET'S OBSIDIAN-FLAVOURED CORE RULES. Beyond obsidianmd/*, the recommended set
      // configures a few core and third-party rules for code that runs inside Obsidian -- a
      // global `fetch` is told to use `requestUrl`, DOM sinks are policed -- and a Node script
      // that fetches, or has no DOM, is not what they are about. import/no-extraneous-dependencies
      // stays on: a script importing a package that package.json does not declare is a finding.
      "no-restricted-globals": "off",
      "@typescript-eslint/no-restricted-imports": "off",
      "no-alert": "off",
      "@microsoft/sdl/no-document-write": "off",
      "@microsoft/sdl/no-inner-html": "off",
      "no-unsanitized/method": "off",
      "no-unsanitized/property": "off",
      // `try { ... } catch {}` is the teardown idiom in every harness here -- kill the child,
      // close the socket, remove the profile -- and none of those failing is news. All 25
      // empty blocks the widened scope found were that shape. The plugin and the page keep
      // the strict rule; they have none.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
  },
  {
    // plugin/**/*.d.ts: declarations for the type program (the bundler's `raw:`/`b64:`
    // modules), not code -- there is nothing in one for a rule to say, and the preset's
    // `**/*.ts` scoping would otherwise run its type-aware rules on it with no
    // parserOptions and abort the whole run. tsconfig.json names them; this file need not.
    ignores: ["node_modules/**", "vendor/**", "dist/**", "test-vault/**", "demo-vault/**",
              ".fixtures/**", "scripts/layout-snapshots/**", "plugin/**/*.d.ts"],
  },
]);
