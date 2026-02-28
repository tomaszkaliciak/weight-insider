import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Standard browser globals
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        console: "readonly",
        history: "readonly",
        location: "readonly",
        performance: "readonly",
        getComputedStyle: "readonly",
        // Timers & animation
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        // Modern browser APIs
        IntersectionObserver: "readonly",
        ResizeObserver: "readonly",
        MutationObserver: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        // Constructors / types
        URL: "readonly",
        Blob: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        HTMLElement: "readonly",
        SVGElement: "readonly",
        Node: "readonly",
        structuredClone: "readonly",
      },
    },
      rules: {
        // Catch real bugs
        "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        "no-undef": "error",
        "no-constant-condition": "error",
        "no-duplicate-case": "error",

        // Code quality
        "eqeqeq": ["warn", "always", { null: "ignore" }],
        "no-var": "warn",
        "prefer-const": "warn",
        "no-console": ["warn", { allow: ["warn", "error"] }],

        // Downgrade pre-existing patterns to warnings rather than blocking the build
        "no-case-declarations": "warn",
        "no-empty": "warn",
        "no-useless-assignment": "warn",
        "no-useless-escape": "warn",

        // Turn off overly strict rules that would generate too much noise on existing code
        "no-prototype-builtins": "off",
      },
  },
  {
    // Test files can use describe/it/expect globals
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        vi: "readonly",
      },
    },
  },
  {
    // Ignore build output and scripts
    ignores: ["dist/**", "node_modules/**", "scripts/**"],
  },
];
