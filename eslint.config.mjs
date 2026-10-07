import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...typescript,
  { files: ["scripts/**"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "prisma/migrations/**"],
  },
  {
    rules: {
      // React Compiler preview rule. It flags the standard "mounted" flag and
      // external-store sync patterns this codebase uses deliberately; kept as a
      // warning so a genuinely new cascading-render bug is still visible.
      "react-hooks/set-state-in-effect": "warn",
      // Server-only modules reach Prisma's driver adapters with `require` on
      // purpose (see src/server/db.ts).
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];


export default config;
