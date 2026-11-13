import nextPlugin from "@next/eslint-plugin-next";
import tsParser from "@typescript-eslint/parser";

const nextRules = {
  ...nextPlugin.flatConfig.coreWebVitals.rules,
  "@next/next/no-img-element": "off",
};

export default [
  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "data/**", "next-env.d.ts"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "@next/next": nextPlugin },
    rules: nextRules,
  },
  {
    files: ["**/*.{js,mjs}"],
    plugins: { "@next/next": nextPlugin },
    rules: nextRules,
  },
];
