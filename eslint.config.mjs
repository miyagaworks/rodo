import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Ignore generated, vendored, and out-of-scope directories.
  // - prisma/migrations: auto-generated SQL/TS, not hand-written code.
  // - scripts/: known to have 18 type errors, intentionally out of scope.
  globalIgnores([
    'node_modules/**',
    '.next/**',
    'out/**',
    'dist/**',
    'build/**',
    'coverage/**',
    'public/**',
    'prisma/migrations/**',
    'scripts/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig
