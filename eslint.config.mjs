// Obsidian's own guideline linter, plus typescript-eslint's type-aware rules on our own
// JavaScript. Running both locally is the point: the community directory re-scans EVERY
// published version with the same rule set, so a rule broken here is a rejected release
// later, not a style opinion -- and its review of 1.9.0 showed 77 findings where this run
// showed 28, because it also runs the five no-unsafe-* rules the preset ships off (github#55).
//
// The recommended preset is aimed at TypeScript plugins. The plugin and the page are plain
// JavaScript -- deliberately, so there is no compile step beyond bundling; the engine under
// src/engine is TypeScript (github#58), which esbuild compiles as part of that same bundling.
// "Plain JavaScript" used to be read as
// "so the type-aware rules cannot run", and it is not so: typescript-eslint builds a program
// from tsconfig.json (allowJs) and the type-aware rules read it whether a file says .ts or
// .js, which is exactly how the directory runs them on our .js. What the preset's own `files`
// scoping keeps on `**/*.{ts,...}` is switched on by hand below, where it matters.
//
// THREE SCOPES. The plugin and the page run inside Obsidian, so every guideline rule and the
// type-aware set apply to them. The exporter (src/*.mjs) and scripts/ are Node programs that
// never run inside Obsidian, so Obsidian's rules say nothing about them and are off there;
// the syntax rules and no-unused-vars still run. (vendor/ was a fourth, ignored scope until
// github#58 replaced the two bundles it held with the engine.)

import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig } from "eslint/config";
import { METER_RULES } from "./scripts/lint-summary.mjs";

// THE FIVE no-unsafe RULES, AS ERRORS. The community directory's review runs them on every
// published version and the 0.4.1 preset leaves them off, so a finding here is a rejected
// release later rather than a style opinion.
//
// They were WARNINGS under a budget until github#60 finished. Measured on develop@972daca
// they fired 6,977 times (510 in plugin/main.js, 6,467 in src/page.js) -- as errors that
// would have been a wall, so the gate was on the COUNT: `--budget N` at exactly the measured
// total, failing in either direction, which made the number a progress meter that could only
// go down. It went down in eleven batches over 2026-09-04 and reached zero, and a budget that
// reads zero is just a slower way of saying "error". So: error, and the budget is retired.
//
// The list lives in scripts/lint-summary.mjs and is imported here, so what the formatter
// counts and what this file enables cannot drift apart.
const METER = Object.fromEntries(METER_RULES.map((rule) => [rule, "error"]));

// Every obsidianmd rule, off -- for the Node-side scope below. Generated from the plugin's own
// rule list rather than written out, so a rule the next preset version adds is off there too.
const OBSIDIAN_OFF = Object.fromEntries(
  Object.keys(obsidianmd.rules).map((name) => ["obsidianmd/" + name, "off"]));

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    // THE PLUGIN, THE PAGE AND THE ENGINE: what actually runs inside Obsidian. The engine
    // (src/engine, github#58) is the one TypeScript here, and listing it in this block is
    // what puts the five no-unsafe-* errors and no-unsupported-api on it; the preset's own
    // `**/*.ts`-scoped rules reach it on their own.
    files: ["plugin/**/*.js", "src/page.js", "src/engine/**/*.ts"],
    rules: {
      // THE PRESET SCOPES THIS RULE TO `**/*.{ts,cts,mts,tsx}`, so on a plain-JavaScript
      // plugin it silently never runs -- and the directory's scanner runs it anyway. That
      // gap cost a rejected release: two `revealLeaf` calls flagged upstream while the
      // local run said clean. Turning it on here closes that hole between what this repo
      // checks and what the directory checks; the five below close the other one.
      "obsidianmd/no-unsupported-api": "error",
      ...METER,
      // An empty catch is the teardown idiom here as much as in the scripts (kill what may
      // already be gone), and github#61 took the comment out of every one of them; the block
      // is the statement. Anything else empty is still a finding.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // settings-tab/prefer-setting-definitions was off here until github#59 landed: the tab
      // implements getSettingDefinitions() now, with display() kept as the fallback for
      // minAppVersion 1.7.2 through 1.12, against obsidian 1.13.1's typings.
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
  // THE ENGINE IS HOST-AGNOSTIC: the same src/engine code draws inside Obsidian and inside the
  // standalone page opened off a disk, where Obsidian's DOM helpers do not exist. prefer-create-el
  // used to be off for it here with that as the reason -- and the directory's scanner ran it
  // anyway and flagged both sites. They are gone: colour parsing goes through an OffscreenCanvas
  // and the layer canvases come from createEl when the container has it, so the rule runs on the
  // engine like everywhere else.
  {
    // plugin/**/*.d.ts: declarations for the type program (the bundler's `raw:`/`b64:`
    // modules), not code -- there is nothing in one for a rule to say, and the preset's
    // `**/*.ts` scoping would otherwise run its type-aware rules on it with no
    // parserOptions and abort the whole run. tsconfig.json names them; this file need not.
    ignores: ["node_modules/**", "dist/**", "test-vault/**", "demo-vault/**",
              ".fixtures/**", "scripts/layout-snapshots/**", "plugin/**/*.d.ts"],
  },
]);
