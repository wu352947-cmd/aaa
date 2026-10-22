import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'], r3f: ['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', 'postprocessing'] },
      },
    },
  },
})
