import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repo = 'mymilpcs'; // <- your repo

export default defineConfig({
  plugins: [react()],
  base: `/${repo}/`,
})