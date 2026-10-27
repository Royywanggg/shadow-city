import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  cacheDir: loadEnv('development', '.', 'SHADOW_CITY_').SHADOW_CITY_VITE_CACHE_DIR,
})
