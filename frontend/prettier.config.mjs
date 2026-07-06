import { prettierBase } from '@bratislava/eslint-config-next'

export default {
  ...prettierBase,
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './app/globals.css',
}
