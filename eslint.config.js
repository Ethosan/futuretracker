import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "apps-script/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.browser,
    },
  },
  {
    files: ["public/sw.js"],
    languageOptions: { sourceType: "script", globals: globals.serviceworker },
  },
  {
    files: ["tests/**", "*.config.js"],
    languageOptions: { globals: globals.node },
  },
];
