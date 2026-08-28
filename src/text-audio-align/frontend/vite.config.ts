import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    proxy: {
      // Dev-only: Flask job server on :5000, no CORS layer on the backend.
      '/api': { target: 'http://127.0.0.1:5000', changeOrigin: true },
    },
  },
})
