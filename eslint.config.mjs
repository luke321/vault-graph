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
