// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import icon from 'astro-icon'
import tailwindcss from '@tailwindcss/vite'

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL || 'https://ops-dss.github.io',
  base: process.env.BASE_PATH || '/starter-local-astro',
  output: 'static',
  build: {
    assets: '_astro',
  },
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      noExternal: ['@ops-dss/charts'],
    },
  },
  integrations: [react(), icon()],
})
