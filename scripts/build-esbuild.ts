import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { build, type Metafile } from 'esbuild'

type BundleEntry = { name: string; entryPoint: string; outdir: string }

const entries: BundleEntry[] = [
  { name: 'api', entryPoint: 'api/index.ts', outdir: 'dist/server/api' },
  { name: 'workers', entryPoint: 'workers/index.ts', outdir: 'dist/server/workers' },
  { name: 'cli', entryPoint: 'cli/index.ts', outdir: 'dist/server/cli' },
  { name: 'internal', entryPoint: 'internal/index.ts', outdir: 'dist/server/internal' },
].filter((entry) => existsSync(entry.entryPoint))

const metafile: Metafile = { inputs: {}, outputs: {} }
const requireApi = process.env.DIBOT_REQUIRE_PERSISTENCE === '1'
const previewOnly = process.env.DIBOT_PREVIEW_ONLY === '1'

if (entries.length === 0) {
  if (requireApi) throw new Error('[esbuild] La app completa requiere api/index.ts, pero no existe.')
  console.log('[esbuild] No hay entradas server-side; se omite el bundle de API/workers/CLI.')
} else {
  const results = await Promise.all(entries.map(async (entry) => {
    const result = await build({
      entryPoints: [entry.entryPoint],
      outdir: entry.outdir,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      packages: previewOnly ? 'bundle' : 'external',
      minify: true,
      sourcemap: 'external',
      metafile: true,
      logLevel: 'info',
    })
    return { entry, result }
  }))

  for (const { entry, result } of results) {
    console.log(`[esbuild] ${entry.name}: ${entry.entryPoint} -> ${entry.outdir}`)
    if (result.metafile) {
      Object.assign(metafile.inputs, result.metafile.inputs)
      Object.assign(metafile.outputs, result.metafile.outputs)
    }
  }
}

await mkdir('dist', { recursive: true })
await writeFile('dist/esbuild-metafile.json', `${JSON.stringify(metafile, null, 2)}\n`, 'utf8')
