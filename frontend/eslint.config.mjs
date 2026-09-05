import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    rules: {
      // react-hooks 7 (bundled with eslint-config-next 16) flags every
      // setState call inside a useEffect body as an error, including the
      // textbook cases this app actually needs it for: reading localStorage
      // once on mount (it doesn't exist during SSR, so it can't be read
      // during render), a debounced input mirroring an external prop, and
      // fetch-on-mount/poll effects. Those are legitimate "synchronize with
      // an external system" effects, not the props-into-state antipattern
      // the rule is really targeting -- kept as a warning rather than
      // disabled outright, so a genuinely new antipattern still gets flagged.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
