import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const launcherProject = path.join(repoRoot, 'tools/LocalScanLauncher/LocalScanLauncher.csproj')

let launcherProc: ChildProcess | null = null

function localHelperPlugin(): Plugin {
  return {
    name: 'local-helper-launcher',
    configureServer() {
      if (process.platform !== 'win32') return

      void fetch('http://127.0.0.1:9181/health', { signal: AbortSignal.timeout(1500) })
        .then((res) => {
          if (res.ok) return
          throw new Error('not running')
        })
        .catch(() => {
          launcherProc = spawn('dotnet', ['run', '--project', launcherProject], {
            cwd: repoRoot,
            stdio: 'ignore',
            detached: true,
            windowsHide: true,
          })
          launcherProc.unref()
        })
    },
  }
}

export default defineConfig({
  plugins: [react(), localHelperPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
