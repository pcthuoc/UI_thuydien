import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import type { Connect } from 'vite'

// Backend port for dev server proxy (default: 80 via nginx)
const backendPort = process.env.BACKEND_PORT || '80'
const backendUrl = `http://localhost:${backendPort}`

// Absolute path to the gcode_viewer directory at the repo root
const gcodeViewerDir = path.resolve(__dirname, '../gcode_viewer')

// MIME types for static files served from gcode_viewer/
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.obj':  'model/obj',
  '.mtl':  'model/mtl',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
}

/**
 * Vite dev-server plugin: serves ../gcode_viewer/ at /gcode-viewer/
 * without needing a proxy to uvicorn.  In production uvicorn handles it
 * via the StaticFiles mount in main.py.
 */
function serveGcodeViewer() {
  return {
    name: 'serve-gcode-viewer',
    configureServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/gcode-viewer')) return next()

        // Strip prefix, default to index.html
        let rel = url.slice('/gcode-viewer'.length)
        if (rel === '' || rel === '/') rel = '/index.html'
        // Strip query string
        rel = rel.split('?')[0]

        const absPath = path.join(gcodeViewerDir, rel)

        try {
          const stat = fs.statSync(absPath)
          if (stat.isFile()) {
            const ext = path.extname(absPath).toLowerCase()
            res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
            res.end(fs.readFileSync(absPath))
            return
          }
        } catch {
          // file not found — fall through to index.html
        }

        // SPA fallback: serve index.html for any unmatched /gcode-viewer/* path
        const index = path.join(gcodeViewerDir, 'index.html')
        if (fs.existsSync(index)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(fs.readFileSync(index))
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  // Default base ('/') emits absolute asset URLs (/assets/...). Required so
  // deep SPA routes (camera popup at /camera/<id>, /projects/<id>, kiosk
  // /spoolbuddy/ams, refresh on any nested route) resolve their <script>
  // and <link> tags to /assets/... instead of /<route-prefix>/assets/...,
  // which the SPA fallback would otherwise return as text/html and the
  // browser would refuse to execute (#1221). The earlier `base: ''` partial
  // fix for subpath reverse proxies (#1195, wontfix) is reverted — that
  // audience uses NPM + Cloudflare Tunnel at a real domain per the
  // documented workaround, which doesn't depend on this setting.
  plugins: [react(), serveGcodeViewer()],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  build: {
    outDir: '../static',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('maplibre-gl')) return 'vendor-maplibre';
            if (id.includes('three') || id.includes('gcode')) return 'vendor-3d';
            if (id.includes('lucide-react')) return 'vendor-lucide';
            if (id.includes('@tanstack')) return 'vendor-tanstack';
            if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/')) return 'vendor-react';
          }
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/ws': {
        target: backendUrl,
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/accounts': {
        target: backendUrl,
        changeOrigin: true,
      },
      '^/stations/\\d+': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/static': {
        target: backendUrl,
        changeOrigin: true,
      },
      '/media': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
