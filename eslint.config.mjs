// Obsidian's own guideline linter. Running it locally is the point: the community
// directory re-scans EVERY published version with the same rule set, so a rule broken here
// is a rejected release later, not a style opinion.
//
// The recommended preset is aimed at TypeScript plugins. This one is plain JavaScript --
// deliberately, so the plugin has no compile step beyond bundling -- so the type-aware
// rules cannot run and are dropped by `files` scoping below. What is left is every rule
// that reads the syntax tree, which is where the guideline rules live (prefer-create-el,
// no-static-styles-assignment, hardcoded-config-path, detach-leaves, no-global-this).

import obsidianmd from "eslint-plugin-obsidianmd";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    // Only the plugin. src/ is the HTML exporter -- a Node script that never runs inside
    // Obsidian, so Obsidian's rules say nothing about it -- and vendor/ is third-party.
    files: ["plugin/**/*.js", "src/page.js"],
    rules: {
      // THE PRESET SCOPES THIS RULE TO `**/*.{ts,cts,mts,tsx}`, so on a plain-JavaScript
      // plugin it silently never runs -- and the directory's scanner runs it anyway. That
      // gap cost a rejected release: two `revealLeaf` calls flagged upstream while the
      // local run said clean. Turning it on here closes the only known hole between what
      // this repo checks and what the directory checks.
      "obsidianmd/no-unsupported-api": "error",
    },
    languageOptions: {
      ecmaVersion: 2022,
      // MODULE, not commonjs. Getting this wrong is invisible and expensive: eslint keeps
      // treating the file as a script, so every top-level function is a "global" and the
      // `Plugin` import collides with the DOM's own `Plugin` -- seven errors that describe
      // the config rather than the code.
      sourceType: "module",
      // The preset's type-aware rules refuse to load without a program, and a rule that
      // fails to load takes the whole run down rather than skipping itself. tsconfig.json
      // exists only to satisfy this -- see the comment in it.
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
    ignores: ["node_modules/**", "vendor/**", "dist/**", "test-vault/**", "demo-vault/**", "src/build-graph.mjs", "scripts/**"],
  },
]);
