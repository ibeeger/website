import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { staticResumePlugin } from './src/seo/vite-plugin-static-resume'

export default defineConfig({
  plugins: [
    react(),
    staticResumePlugin({ name: 'cuixiaohan', url: 'https://github.com/cuixiaohan' }),
  ],
  base: process.env.VITE_BASE ?? '/',
})
