import { FlatCompat } from '@eslint/eslintrc';

const compatibility = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compatibility.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'lib/supabase/database.types.ts',
      '*.tsbuildinfo',
      'next-env.d.ts',
    ],
  },
];

export default eslintConfig;
