import { access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

type PackageManifest = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await sourceFiles(path))
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path)
  }
  return files
}

const manifest = JSON.parse(await readFile('package.json', 'utf8')) as PackageManifest
const dependencies = { ...manifest.dependencies, ...manifest.devDependencies }
const main = await readFile('src/main.tsx', 'utf8')
const files = await sourceFiles('src')
const source = await Promise.all(files.map((file) => readFile(file, 'utf8')))
const queryClientCount = source.reduce((count, content) => count + (content.match(/new QueryClient\s*\(/g)?.length ?? 0), 0)

if (!main.includes('QueryClientProvider')) throw new Error('Contrato roto: src/main.tsx debe montar QueryClientProvider.')
if (!main.includes('<QueryClientProvider') || !main.includes('</QueryClientProvider>')) throw new Error('Contrato roto: App debe estar dentro de QueryClientProvider.')
if (!main.includes('BrowserRouter')) throw new Error('Contrato roto: src/main.tsx debe montar BrowserRouter para useRoutes/useNavigate.')
if (!main.includes('<BrowserRouter') || !main.includes('</BrowserRouter>')) throw new Error('Contrato roto: App debe estar dentro de BrowserRouter.')
if (!main.includes('AppErrorBoundary')) throw new Error('Contrato roto: el entrypoint debe tener un fallback visible para errores de runtime.')
if (queryClientCount !== 1) throw new Error(`Contrato roto: se esperaba un único QueryClient global y se encontraron ${queryClientCount}.`)
if (dependencies['@phosphor-icons/react']) throw new Error('Contrato roto: elimina @phosphor-icons/react; usa lucide-react.')
if (!dependencies['lucide-react']) throw new Error('Contrato roto: falta la dependencia lucide-react.')
if (!dependencies['@hookform/resolvers']) throw new Error('Contrato roto: falta @hookform/resolvers para formularios React Hook Form + Zod.')
for (const dependency of ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner', 'sharp']) {
  if (!dependencies[dependency]) throw new Error(`Contrato roto: falta ${dependency} para el storage de archivos.`)
}
for (const file of ['api/storage/index.ts', 'api/auth/session.ts', 'src/lib/file-upload.ts', 'src/components/FilePicker.tsx', 'scripts/provision-storage.ts']) {
  try {
    await access(file)
  } catch {
    throw new Error(`Contrato roto: falta ${file}.`)
  }
}
const storage = await readFile('api/storage/index.ts', 'utf8')
const auth = await readFile('api/auth/session.ts', 'utf8')
const provisionStorage = await readFile('scripts/provision-storage.ts', 'utf8')
for (const contract of ['upload', 'getUrl', 'delete', 'read', 'STORAGE_PREFIX', 'R2_ACCESS_KEY_ID']) {
  if (!storage.includes(contract)) throw new Error(`Contrato roto: storage no implementa ${contract}.`)
}
for (const contract of ['getSession', 'requireAuth', 'requireRole', 'getCurrentUser', 'HttpOnly', 'AUTH_SESSION_SECRET']) {
  if (!auth.includes(contract)) throw new Error(`Contrato roto: auth no implementa ${contract}.`)
}
if (!provisionStorage.includes('HeadBucketCommand') || !provisionStorage.includes('PutObjectCommand')) {
  throw new Error('Contrato roto: el provisioning R2 no verifica el bucket ni crea el namespace de la app.')
}

console.log('[contracts] QueryClient, lucide-react, storage R2/local y auth de sesiones verificados.')
