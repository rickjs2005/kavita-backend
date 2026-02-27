// eslint.config.js (ESLint v9+ - Flat Config)
"use strict";

const globals = require("globals");

module.exports = [
  // Ignora coisas comuns
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "uploads/**",
      "public/**",
      ".next/**",
      "dist/**"
    ],
  },

  // Regras para JS em Node
  {
    files: ["**/*.js", "**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script", // CommonJS
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      // Qualidade básica
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "no-undef": "error",

      // Segurança/robustez leve
      "no-eval": "error",

      // Estilo mínimo (sem brigar com seu código)
      "semi": ["error", "always"],
      "quotes": ["error", "double", { "avoidEscape": true }]
    }
  }
];
