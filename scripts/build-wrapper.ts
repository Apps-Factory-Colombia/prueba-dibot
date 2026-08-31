import { spawn } from 'node:child_process'

const MAX_OUTPUT = 20_000
let output = ''
const child = spawn(process.execPath, ['run', 'build'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

const collect = (chunk: Buffer) => {
  output = `${output}${chunk.toString()}`.slice(-MAX_OUTPUT)
}
child.stdout.on('data', collect)
child.stderr.on('data', collect)

const code = await new Promise<number>((resolve, reject) => {
  child.once('error', reject)
  child.once('exit', (exitCode) => resolve(exitCode ?? 1))
})

if (code !== 0) {
  console.error('BUILD_FAILED')
  console.error(output)
  process.exitCode = code
} else {
  console.log('BUILD_OK')
}
