module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  plugins: ["@typescript-eslint"],
  ignorePatterns: [
    "node_modules/",
    "**/dist/**",
    "**/.vite/**",
    "coverage/",
    "templates/skills/**",
  ],
  globals: {
    Icons: "readonly",
    createIcon: "readonly",
  },
  rules: {
    "no-control-regex": "off",
    "no-constant-condition": "off",
    "no-useless-escape": "off",
  },
  overrides: [
    {
      files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
      plugins: ["react-hooks", "react-refresh"],
      extends: ["plugin:react-hooks/recommended"],
      rules: {
        "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      },
    },
  ],
};
