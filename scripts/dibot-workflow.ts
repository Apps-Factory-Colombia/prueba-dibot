import { config as loadEnv } from 'dotenv'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

loadEnv()

type JsonObject = Record<string, unknown>
type Mode = 'create' | 'update'
type WorkflowInput = { userId: string; appId: string; appName: string; mode: Mode; prompt: string }

const root = process.cwd()

class CommandError extends Error {
  readonly output: string

  constructor(message: string, output: string) {
    super(message)
    this.output = output
  }
}

function formatDuration(durationMs: number) {
  const totalTenths = Math.round(durationMs / 100)
  if (totalTenths < 600) return `${(totalTenths / 10).toFixed(1)} s`
  const minutes = Math.floor(totalTenths / 600)
  const seconds = (totalTenths % 600) / 10
  return `${minutes} min ${seconds.toFixed(1)} s`
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Falta ${name} en .env.`)
  return value
}

function firstString(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const object = value as JsonObject
  for (const key of keys) {
    const candidate = object[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  for (const child of Object.values(object)) {
    const result: string | undefined = firstString(child, keys)
    if (result) return result
  }
  return undefined
}

function redact(value: string) {
  return [
    'DIBOT_AGENT_API_TOKEN',
    'OPENAI_API_KEY',
    'GITHUB_TOKEN',
    'TURSO_AUTH_TOKEN',
    'TURSO_PLATFORM_API_TOKEN',
    'DOKPLOY_API_KEY',
    'R2_TOKEN',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'ENDPOINT_S3',
    'AUTH_SESSION_SECRET',
  ]
    .reduce((result, name) => {
      const secret = process.env[name]
      return secret ? result.split(secret).join('***REDACTED***') : result
    }, value)
}

function slug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function tursoDatabaseName(input: WorkflowInput) {
  const base = slug(`${input.appName}-${input.appId}`) || 'dibot-app'
  const suffix = createHash('sha256').update(`${input.userId}:${input.appId}`).digest('hex').slice(0, 8)
  const prefix = base.slice(0, 50 - suffix.length - 1).replace(/-+$/g, '') || 'dibot'
  return `${prefix}-${suffix}`
}

function parseInput(args: string[]): WorkflowInput {
  const flags = new Map<string, string>()
  const positional: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const separator = arg.indexOf('=')
    if (separator > 2) {
      flags.set(arg.slice(0, separator), arg.slice(separator + 1))
      continue
    }
    flags.set(arg, args[index + 1] ?? '')
    index += 1
  }

  const userId = flags.get('--user-id') ?? positional[0]
  const appId = flags.get('--app-id') ?? positional[1]
  const appName = flags.get('--app-name') ?? positional[2]
  const mode = flags.get('--mode') ?? positional[3]
  const prompt = flags.get('--prompt') ?? positional.slice(4).join(' ')
  if (!userId || !appId || !appName?.trim() || !mode || !prompt.trim()) {
    throw new Error('Uso: bun run dibot:workflow -- <userId> <appId> "<appName>" <create|update> "<prompt>"')
  }
  if (mode !== 'create' && mode !== 'update') throw new Error('mode debe ser create o update.')
  return { userId, appId, appName: appName.trim(), mode, prompt: prompt.trim() }
}

function childEnv(extra: NodeJS.ProcessEnv = {}) {
  return { ...process.env, DIBOT_REQUIRE_PERSISTENCE: '1', DIBOT_REQUIRE_SEED: '1', ...extra }
}

async function run(command: string, args: string[], cwd: string, extraEnv: NodeJS.ProcessEnv = {}) {
  console.log(`\n$ ${redact(`${command} ${args.join(' ')}`)}`)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: childEnv(extraEnv), stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} terminó con código ${code ?? 'null'}${signal ? ` (${signal})` : ''}.`)))
  })
}

async function runCapture(command: string, args: string[], cwd: string, extraEnv: NodeJS.ProcessEnv = {}) {
  console.log(`\n$ ${redact(`${command} ${args.join(' ')}`)}`)
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: childEnv(extraEnv), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => { const text = chunk.toString(); output += text; process.stdout.write(text) })
    child.stderr.on('data', (chunk: Buffer) => { const text = chunk.toString(); output += text; process.stderr.write(text) })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve(output)
      else reject(new CommandError(`${command} terminó con código ${code ?? 'null'}${signal ? ` (${signal})` : ''}.`, redact(output)))
    })
  })
}

class JsonApi {
  private readonly baseUrl: string
  private readonly headers: Record<string, string>

  constructor(url: string, headers: Record<string, string>) {
    this.baseUrl = url.startsWith('http') ? url.replace(/\/$/, '') : `https://${url.replace(/\/$/, '')}`
    this.headers = headers
  }

  async request<T = unknown>(route: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}/${route.replace(/^\//, '')}`, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...this.headers, ...init.headers },
    })
    const text = await response.text()
    let body: unknown
    try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }
    if (!response.ok) throw new Error(`API ${response.status}: ${firstString(body, ['message', 'error', 'code']) ?? response.statusText}`)
    return body as T
  }
}

class DibotReporter {
  private jobId: string | undefined
  private readonly input: WorkflowInput
  private readonly api = new JsonApi(required('DIBOT_API_URL'), { Authorization: `Bearer ${required('DIBOT_AGENT_API_TOKEN')}` })

  constructor(input: WorkflowInput) { this.input = input }

  async start() {
    const result = await this.api.request('dibot/agent-jobs', {
      method: 'POST',
      body: JSON.stringify({
        userId: this.input.userId,
        appId: this.input.appId,
        type: 'implementation',
        executor: 'dibot-fast',
        instruction: `${this.input.appName}: ${this.input.prompt}`,
        status: 'running',
        currentStep: 'Preparando base Turso y OpenCode',
        tasks: [
          { name: 'Preparar aplicación y Turso', position: 1, status: 'running' },
          { name: 'Construir frontend, API y seed', position: 2, status: 'pending' },
          { name: 'Verificar base, esbuild, runtime y lint', position: 3, status: 'pending' },
          { name: 'Reportar finalización', position: 4, status: 'pending' },
        ],
      }),
    })
    this.jobId = firstString(result, ['jobId', 'id'])
    if (!this.jobId) throw new Error('DIBOT_AGENT_DATA_API no devolvió jobId.')
    // The Box/Local orchestrator polls this output while the workflow is still
    // running. Emit the id immediately so concurrent executions for the same
    // app can never be confused with the most recently updated job.
    console.log(`Workflow (${this.input.mode}) iniciado. jobId=${this.jobId}`)
  }

  async update(currentStep: string) {
    if (!this.jobId) return
    await this.api.request(`dibot/agent-jobs/${encodeURIComponent(this.jobId)}`, { method: 'PATCH', body: JSON.stringify({ currentStep }) })
  }

  async complete(result: JsonObject) {
    if (!this.jobId) return
    await this.api.request(`dibot/agent-jobs/${encodeURIComponent(this.jobId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed', currentStep: 'App, API, Turso y build verificados', result }) })
  }

  async fail(error: unknown) {
    if (!this.jobId) return
    const message = error instanceof Error ? error.message : String(error)
    try {
      await this.api.request(`dibot/agent-jobs/${encodeURIComponent(this.jobId)}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', currentStep: `Workflow falló: ${redact(message)}` }) })
    } catch (reportError) {
      console.error(`No se pudo reportar el fallo: ${reportError instanceof Error ? reportError.message : String(reportError)}`)
    }
  }

  get id() { return this.jobId }
}

function controlApi() {
  return new JsonApi(required('DIBOT_API_URL'), { Authorization: `Bearer ${required('DIBOT_AGENT_API_TOKEN')}` })
}

async function findRegisteredApp(input: WorkflowInput) {
  try { return await controlApi().request(`dibot/apps/${encodeURIComponent(input.appId)}`) }
  catch (error) {
    if (error instanceof Error && error.message.startsWith('API 404')) return undefined
    throw error
  }
}

async function registerApp(input: WorkflowInput) {
  try {
    return await controlApi().request('dibot/apps', {
      method: 'POST',
      body: JSON.stringify({ userId: input.userId, appId: input.appId, appName: input.appName, status: 'creating', lastRequest: { source: 'template', userPrompt: input.prompt } }),
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('API 409')) throw new Error(`La app ${input.appId} ya existe; create no reutiliza apps.`, { cause: error })
    throw error
  }
}

function openCodeBase() {
  const model = process.env.DIBOT_OPENCODE_MODEL?.trim() || 'openai/gpt-5.6-luna'
  const variant = process.env.DIBOT_OPENCODE_VARIANT?.trim() || 'medium'
  const base = ['run', '--model', model, '--variant', variant]
  const attach = process.env.OPENCODE_ATTACH_URL?.trim()
  if (attach) base.push('--attach', attach)
  return base
}

async function applyAppMetadata(input: WorkflowInput) {
  const manifest = JSON.parse(await readFile('package.json', 'utf8')) as JsonObject
  manifest.name = slug(input.appName) || `dibot-${slug(input.appId)}`
  await writeFile('package.json', `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  const html = await readFile('index.html', 'utf8')
  await writeFile('index.html', html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${input.appName}</title>`), 'utf8')

  await mkdir(join(root, '.dibot-runtime'), { recursive: true })
  await writeFile(join(root, '.dibot-runtime', 'app.json'), `${JSON.stringify({ userId: input.userId, appId: input.appId, appName: input.appName, mode: input.mode }, null, 2)}\n`, 'utf8')
  process.env.DIBOT_APP_ID = input.appId
  process.env.DIBOT_APP_NAME = input.appName
}

async function prepareDatabase(input: WorkflowInput) {
  if (input.mode === 'create') {
    const databaseName = tursoDatabaseName(input)
    process.env.TURSO_DATABASE_NAME = databaseName
    await run('bun', ['scripts/provision-turso.ts', 'create'], root, { TURSO_DATABASE_NAME: databaseName })
    loadEnv({ path: join(root, '.env'), override: true })
    process.env.DIBOT_APP_NAME = input.appName
    console.log(`[turso] Base nueva preparada para ${input.appName}.`)
  } else {
    await run('bun', ['run', 'db:check'], root)
    await run('bun', ['run', 'db:snapshot'], root)
  }
}

async function prepareStorage(input: WorkflowInput) {
  // R2 is a shared bucket with an isolated, deterministic namespace per app.
  // This keeps provisioning fast and prevents one app from reading another
  // app's files while allowing updates to reuse the same storage.
  const environment = {
    DIBOT_APP_ID: input.appId,
    DIBOT_APP_NAME: input.appName,
    DIBOT_REQUIRE_STORAGE: '1',
  }
  await run('bun', ['run', 'storage:provision'], root, environment)
  loadEnv({ path: join(root, '.env'), override: true })
  process.env.DIBOT_APP_ID = input.appId
  process.env.DIBOT_APP_NAME = input.appName
}

function completeAppContract(input: WorkflowInput) {
  const previewOnly = process.env.DIBOT_PREVIEW_ONLY === '1'
  const visualResearchRule = previewOnly
    ? '- PREVIEW MODE: prioriza una entrega funcional y rápida. No hagas búsquedas externas ni uses Mobbin; trabaja únicamente con los archivos del repositorio actual.'
    : '- En CREATE MODE ejecuta exactamente una búsqueda visual de Mobbin con mobbin_search_screens, selecciona hasta seis referencias relevantes, analiza su lenguaje visual una sola vez y guarda referencias/README en references/mobbin cuando sea posible. No copies pantallas, marcas ni assets.'
  const updateVisualRule = previewOnly
    ? '- En PREVIEW MODE conserva el lenguaje visual existente y no hagas búsquedas externas.'
    : '- En UPDATE MODE lee siempre references/mobbin/README.md y las referencias visuales antes de modificar la interfaz. Mantén el lenguaje visual existente. Si agregas pantallas o cambias la dirección visual, ejecuta una búsqueda Mobbin complementaria una sola vez; si el cambio es solo de datos/API, no hagas una búsqueda nueva.'
  return `
CONTRATO OBLIGATORIO DEL WORKFLOW
- Esta es una sesión única de dibot-fast. Entiende el prompt natural, crea internamente un brief funcional/visual compacto y programa de inmediato; no llames a prompt-builder ni repitas el brief como una segunda sesión.
- Idioma predeterminado obligatorio: toda la app debe quedar en español, incluyendo UI, navegación, botones, formularios, placeholders, mensajes, errores, estados, datos de seed y contenido visible. Solo cambia de idioma si el prompt del usuario lo solicita explícitamente. Conserva nombres propios, marcas y el nombre exacto de la app.
${visualResearchRule}
${updateVisualRule}
- El producto final debe ser distinto para este pedido: decide una dirección visual original basada en Mobbin, no entregues un dashboard genérico ni una pantalla vacía.
- El nombre exacto es "${input.appName}". Debe aparecer en la UI principal, en <title> y en /api/health como appName.
- La persistencia no es opcional. La base Turso ya fue provisionada por el workflow: no ejecutes db:create. Define tablas reales en api/db/schema.ts, crea api/db/seed.ts idempotente y llena todas las tablas con datos iniciales útiles. En update, el seed debe usar conflictos sin sobrescribir filas existentes ni campos como updated_at.
- Archivos: usa siempre el contrato server-side de api/storage/index.ts: storage.upload, storage.getUrl, storage.delete y storage.read. La app recibe un namespace R2 por aplicación mediante STORAGE_PREFIX; no inventes otra integración, no guardes archivos en localStorage y no expongas credenciales R2 al navegador. Usa handleStorageRequest para el endpoint y exige requireAuth antes de subir o eliminar archivos. FilePicker permite cámara/galería; valida tipo/tamaño y pide thumbnail cuando la interfaz muestre imágenes.
- Autenticación: usa getSession, requireAuth, requireRole y getCurrentUser de api/auth. Las sesiones son cookies HttpOnly firmadas con AUTH_SESSION_SECRET; nunca confíes en un role enviado por el cliente. Crea las tablas de usuarios/roles específicas del producto cuando la app las necesite y devuelve 401/403 de forma clara.
- La app debe sentirse completa: cada acción visible debe tener handler real, estado de carga, error, vacío, éxito y confirmación cuando corresponda. Elimina botones, enlaces, filtros o menús que no tengan implementación funcional.
- La interfaz siempre es mobile-first: diseña como una app móvil (375–430 px), con navegación y gestos/controles táctiles; no construyas una página web de escritorio adaptada al móvil.
- Crea api/index.ts usando startApiServer de api/server.ts. Expón /api/health con { ok: true, database: true, appName: "${input.appName}" } después de consultar Turso, además del CRUD real del flujo principal.
- Crea api/smoke.ts: prueba crear, leer, actualizar y eliminar un registro temporal del dominio principal contra Turso, limpia el registro en finally y falla ante cualquier resultado incorrecto.
- El frontend debe consumir rutas /api/* con TanStack Query. No guardes registros del dominio en localStorage o mocks; Zustand se limita a estado efímero de UI.
- Detente después de implementar; el workflow externo ejecuta una sola vez dibot:verify:fast y después ordena db:push → db:seed → db:verify → build → verify:api → smoke → lint en GitHub Actions.
- En update carga las referencias visuales existentes y no uses drizzle-kit push --force. Añade defaults o columnas nullable y conserva todas las filas existentes; el workflow compara un snapshot antes de aceptar la entrega.
- dibot:verify:fast exige contratos, TypeScript de frontend y servidor, y ESLint. dibot:verify:release añade DB, Vite, esbuild, health runtime y smoke test.
- Trabaja solo en el repositorio actual. No clones, no uses Git, no publiques, no despliegues y no leas ni muestres el contenido de .env.
`
}

async function getSuperPrompt(input: WorkflowInput) {
  // Compatibility shape for the result payload. There is intentionally no
  // second OpenCode/prompt-builder session: dibot-fast receives the natural
  // request and performs the visual brief internally.
  return {
    content: `Nombre obligatorio de la aplicación: ${input.appName}\n\nPedido natural del usuario:\n${input.prompt}`,
    cached: false,
  }
}

async function runInitialAgent(input: WorkflowInput) {
  if (input.mode === 'create') {
    const superPrompt = await getSuperPrompt(input)
    await run('opencode', [...openCodeBase(), '--agent', 'dibot-fast', `Construye la aplicación completa usando este superprompt:\n\n${superPrompt.content}\n${completeAppContract(input)}`], root)
    return superPrompt.cached
  }

  await run('opencode', [...openCodeBase(), '--agent', 'dibot-fast', `UPDATE MODE. Aplica este cambio sin perder la dirección visual, los datos ni la API existentes. Lee primero references/mobbin/README.md y las referencias visuales guardadas. Si agregas pantallas o cambias la dirección visual, ejecuta una búsqueda Mobbin complementaria una sola vez; si el cambio es solo de datos/API, conserva las referencias sin buscar de nuevo. Inspecciona solo los archivos afectados:\n\n${input.prompt}\n${completeAppContract(input)}`], root)
  return false
}

async function verifyFunctionalApp(input: WorkflowInput) {
  await runCapture('bun', ['run', 'dibot:verify:fast'], root)
  if (process.env.DIBOT_PREVIEW_ONLY === '1') {
    // Preview no deploys a container, but its server bundle still reads the
    // app's Turso database at request time. Keep the fast static delivery
    // path while synchronizing and validating the database before the dist
    // is uploaded; otherwise a fresh preview can render and still return 500
    // from every real endpoint because the database is empty.
    console.log('[preview] Sincronizando y validando Turso antes de publicar dist.')
    if (input.mode === 'create' || await schemaChanged()) await runCapture('bun', ['run', 'db:push'], root)
    await runCapture('bun', ['run', 'db:seed'], root)
    if (input.mode === 'update') await runCapture('bun', ['run', 'db:snapshot:verify'], root)
    await runCapture('bun', ['run', 'db:verify'], root)
    await runCapture('bun', ['run', 'test:functional'], root)
    return
  }
  if (input.mode === 'create' || await schemaChanged()) await runCapture('bun', ['run', 'db:push'], root)
  await runCapture('bun', ['run', 'db:seed'], root)
  if (input.mode === 'update') await runCapture('bun', ['run', 'db:snapshot:verify'], root)
  await runCapture('bun', ['run', 'db:verify'], root)
}

async function schemaChanged() {
  const output = await runCapture('git', ['status', '--short', '--', 'api/db/schema.ts', 'drizzle'], root)
  return Boolean(output.trim())
}

async function repairWithDibotFast(input: WorkflowInput, error: unknown, attempt: number) {
  const output = error instanceof CommandError ? error.output : error instanceof Error ? error.message : String(error)
  const diagnostic = redact(output).slice(-14_000)
  const instruction = `REPAIR RUN ${attempt}. Tu propia entrega de ${input.appName} aún no pasa la puerta rápida.\n\nFallo exacto:\n${diagnostic}\n\nCorrige únicamente la causa raíz en el archivo afectado. Después ejecuta solo el check relacionado y bun run dibot:verify:fast. No hagas build, no vuelvas a buscar Mobbin, no explores el repositorio completo y no te limites a explicar o recomendar el siguiente paso.${completeAppContract(input)}`
  await run('opencode', [...openCodeBase(), '--agent', 'dibot-fast', instruction], root)
}

async function main() {
  const startedAt = Date.now()
  let reporter: DibotReporter | undefined
  try {
    const input = parseInput(process.argv.slice(2))
    process.env.DIBOT_APP_ID = input.appId
    process.env.DIBOT_APP_NAME = input.appName
    const registeredApp = await findRegisteredApp(input)
    const partialCreateRecovery = process.env.DIBOT_PARTIAL_CREATE_RECOVERY === '1'
    if (input.mode === 'create') {
      if (registeredApp && !partialCreateRecovery) throw new Error(`La app ${input.appId} ya existe; create no reutiliza apps.`)
      if (!registeredApp) await registerApp(input)
    } else {
      if (!registeredApp) throw new Error(`La app ${input.appId} no existe; update no crea apps.`)
      const owner = firstString(registeredApp, ['userId', 'user_id'])
      if (owner && owner !== input.userId) throw new Error(`La app ${input.appId} no pertenece a ${input.userId}.`)
    }

    reporter = new DibotReporter(input)
    await reporter.start()
    await applyAppMetadata(input)
    await reporter.update(`Preparando Turso para ${input.appName}`)
    await prepareDatabase(input)
    await reporter.update(`Preparando almacenamiento seguro para ${input.appName}`)
    await prepareStorage(input)
    await run('opencode', ['--version'], root)

    await reporter.update(`dibot-fast construyendo ${input.appName}`)
    const openCodeStartedAt = Date.now()
    const superPromptCached = await runInitialAgent(input)
    let repairRuns = 0
    const maxRepairRuns = Math.max(0, Math.min(2, Number(process.env.DIBOT_MAX_REPAIR_RUNS ?? 2)))

    while (true) {
      try {
        await reporter.update(`Verificando DB, API, esbuild y frontend (intento ${repairRuns + 1})`)
        await verifyFunctionalApp(input)
        break
      } catch (verificationError) {
        if (repairRuns >= maxRepairRuns) {
          throw new Error(`La validación falló y se alcanzó el máximo de reparaciones (${maxRepairRuns}). ${redact(verificationError instanceof Error ? verificationError.message : String(verificationError))}`, { cause: verificationError })
        }
        repairRuns += 1
        await reporter.update(`dibot-fast corrigiendo su entrega (reparación ${repairRuns})`)
        await repairWithDibotFast(input, verificationError, repairRuns)
      }
    }

    const openCodeDurationMs = Date.now() - openCodeStartedAt
    const durationMs = Date.now() - startedAt
    const result = {
      appId: input.appId,
      appName: input.appName,
      mode: input.mode,
      databaseId: process.env.TURSO_DATABASE_ID,
      databaseName: process.env.TURSO_DATABASE_NAME,
      superPromptCached,
      planningMode: 'single dibot-fast session',
      verificationPassed: true,
      apiRuntimeVerified: true,
      databaseSeedVerified: true,
      storageProvider: process.env.STORAGE_PROVIDER || 's3',
      storagePrefix: process.env.STORAGE_PREFIX,
      authProtocol: 'signed HttpOnly session cookie',
      repairRuns,
      durationMs,
      duration: formatDuration(durationMs),
      openCodeDurationMs,
      openCodeDuration: formatDuration(openCodeDurationMs),
      workspace: root,
      externalSteps: ['publicar en GitHub', 'desplegar en Dokploy'],
    }
    await reporter.complete(result)
    console.log(`\nWorkflow (${input.mode}) terminó correctamente en ${formatDuration(durationMs)}. jobId=${reporter.id}`)
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    if (reporter) await reporter.fail(error)
    console.error(`\nWorkflow falló: ${redact(error instanceof Error ? error.message : String(error))}`)
    process.exitCode = 1
  } finally {
    console.log(`Tiempo total del workflow: ${formatDuration(Date.now() - startedAt)}`)
  }
}

await main()
