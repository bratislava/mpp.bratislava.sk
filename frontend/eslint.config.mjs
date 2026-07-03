import { createNextConfig } from '@bratislava/eslint-config-next'

export default [
  ...createNextConfig({
    // *.md ignored: the shared config's markdown processor crashes core rules
    // on plain markdown files (sourceCode.getAllComments is not a function).
    ignores: ['.next/**', 'next-env.d.ts', 'node_modules/**', '**/*.md'],
  }).flat(Infinity),
  {
    settings: {
      'better-tailwindcss': {
        // tailwindcss 4: css-based config entry file
        entryPoint: 'app/globals.css',
      },
    },
  },
]
