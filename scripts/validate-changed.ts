import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'

type Check = { name: string; args: string[] }

function run(check: Check): Promise<void> {
  console.log(`[validate] ${check.name}`)
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, check.args, { stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${check.name} terminó con código ${code ?? 'null'}${signal ? ` (${signal})` : ''}.`))
    })
  })
}

async function changedFiles(): Promise<string[]> {
  const child = spawn('git', ['status', '--short'], { windowsHide: true })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
  if (exitCode !== 0) throw new Error(`No se pudo detectar los archivos modificados: ${stderr}`)
  return stdout.split(/\r?\n/)
    .map((line) => line.trim().replace(/^[ MARC?UD]{1,2}\s+/, '').replace(/^"|"$/g, ''))
    .filter(Boolean)
}

const mode = process.argv[2] === 'create' ? 'create' : 'update'
const files = await changedFiles()
const all = files.join('\n').toLowerCase()
const checks: Check[] = [
  { name: 'contratos runtime', args: ['run', 'verify:contracts'] },
  { name: 'contratos generados', args: ['run', 'verify:generated'] },
]

if (mode === 'create') {
  checks.push(
    { name: 'TypeScript app', args: ['run', 'typecheck:app'] },
    { name: 'TypeScript tooling', args: ['run', 'typecheck:node'] },
    { name: 'TypeScript server', args: ['run', 'typecheck:server'] },
    { name: 'ESLint', args: ['run', 'lint'] },
  )
} else {
  const frontendChanged = /(^|\n)(src\/|app\/|components\/|index\.html|tsconfig\.app\.json)/.test(all)
  const serverChanged = /(^|\n)(api\/|server\/|tsconfig\.server\.json)/.test(all)
  const toolingChanged = /(^|\n)(scripts\/|vite\.config|tsconfig\.node\.json|package\.json|bun\.lock|drizzle\/)/.test(all)
  const lintConfigChanged = /(^|\n)(eslint|\.eslintrc|tsconfig|package\.json)/.test(all)

  if (frontendChanged) checks.push({ name: 'TypeScript app', args: ['run', 'typecheck:app'] })
  if (serverChanged) checks.push({ name: 'TypeScript server', args: ['run', 'typecheck:server'] })
  if (toolingChanged) checks.push({ name: 'TypeScript tooling', args: ['run', 'typecheck:node'] })

  const lintFiles = files
    .filter((file) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file) && existsSync(file))
  if (lintConfigChanged || lintFiles.length > 0) {
    checks.push(lintConfigChanged
      ? { name: 'ESLint', args: ['run', 'lint'] }
      : { name: 'ESLint archivos afectados', args: ['node_modules/eslint/bin/eslint.js', ...lintFiles] })
  }
}

for (const check of checks) await run(check)
console.log(`[validate] VALIDATION_OK mode=${mode} files=${files.length} checks=${checks.length}`)
