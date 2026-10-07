import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'

const children: ChildProcess[] = []

function start(args: string[]) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  })
  children.push(child)
  child.once('exit', (code) => {
    if (code && code !== 0) process.exitCode = code
    stop()
  })
}

function stop() {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
}

async function apiAlreadyRunning() {
  try {
    const response = await fetch('http://127.0.0.1:3001/healthz')
    return response.ok
  } catch {
    return false
  }
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)

if (existsSync('api/index.ts')) {
  if (await apiAlreadyRunning()) console.log('[dev] API existente detectada en http://127.0.0.1:3001; se reutiliza.')
  else start(['--watch', 'api/index.ts'])
}
start(['node_modules/vite/bin/vite.js'])
