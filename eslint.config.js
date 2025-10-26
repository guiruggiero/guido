// Imports
import {defineConfig} from "eslint/config";
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import eslintPluginYml from "eslint-plugin-yml";

export default defineConfig([
  // JavaScript configuration
  {
    files: ["**/*.js"],
    ignores: ["eslint.config.js"],
    plugins: {
      js,
      "@stylistic": stylistic,
    },
    extends: ["js/recommended"],
    languageOptions: {
      globals: {
        ...globals.node,
        process: true,
        Buffer: true,
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "@stylistic/indent": ["warn", 4],
      "@stylistic/semi": "error",
      "@stylistic/no-extra-semi": "warn",
      "@stylistic/comma-spacing": ["warn", {"before": false, "after": true}],
      "@stylistic/comma-dangle": ["warn", "always-multiline"],
      "@stylistic/quotes": ["warn", "double"],
      "@stylistic/spaced-comment": ["warn", "always"],
      "@stylistic/arrow-spacing": "warn",
      "@stylistic/block-spacing": ["warn", "never"],
      "@stylistic/key-spacing": "warn",
      "@stylistic/keyword-spacing": "warn",
      "@stylistic/space-before-blocks": "warn",
      "@stylistic/space-before-function-paren": ["warn", {
        "anonymous": "never",
        "named": "never",
        "asyncArrow": "always"
      }],
      "@stylistic/space-in-parens": "warn",
    },
  },

  // YAML configuration
  ...eslintPluginYml.configs["flat/standard"],
  {
    files: ["**/*.yml"],
    rules: {
      "yml/no-empty-mapping-value": "warn",
    },
  },
]);