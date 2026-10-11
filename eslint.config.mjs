import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", ".tmp/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { "@typescript-eslint/consistent-type-imports": "error" },
  },
  {
    files: ["**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        fetch: "readonly",
        Buffer: "readonly",
        AbortSignal: "readonly",
      },
    },
  },
  {
    files: ["src/contracts/**", "src/client/**", "src/app/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@/server/**",
            "**/server/**",
            "pg",
            "drizzle-orm",
            "node:*",
            "server-only",
          ],
        },
      ],
    },
  },
);
