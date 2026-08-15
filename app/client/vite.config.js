import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Requests to /api/* during `npm run dev` get forwarded to the
      // backend, so the browser never sees a cross-origin request and
      // you don't need cors() on the backend at all during development.
      // Change the target below once your real backend port is decided.
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true,
      },
    },
  },
})
