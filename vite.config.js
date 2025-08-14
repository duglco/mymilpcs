import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// If deploying to https://<your-username>.github.io/bases-dashboard/
// keep base as '/bases-dashboard/'. If you change the repo name,
// also change the base to '/<repo-name>/'. For a user site
// (https://<your-username>.github.io/), set base: '/' instead.
export default defineConfig({
  plugins: [react()],
  base: '/mymilpcs/'
})
