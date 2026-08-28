import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

export type ApiHandler = (request: Request) => Promise<Response> | Response

type PreviewHandlerRegistry = Map<string, ApiHandler>
type PreviewGlobal = typeof globalThis & {
  __dibotPreviewApiHandlers?: PreviewHandlerRegistry
}

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) throw new Error('Se esperaba application/json.')
  return await request.json() as T
}

async function toRequest(request: IncomingMessage, port: number) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const method = request.method ?? 'GET'
  const body = method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks)
  return new Request(`http://${request.headers.host ?? `127.0.0.1:${port}`}${request.url ?? '/'}`, {
    method,
    headers: request.headers as HeadersInit,
    body,
  })
}

async function sendWebResponse(response: ServerResponse, webResponse: Response) {
  response.statusCode = webResponse.status
  webResponse.headers.forEach((value, key) => response.setHeader(key, value))
  response.end(Buffer.from(await webResponse.arrayBuffer()))
}

async function serveStatic(pathname: string, response: ServerResponse) {
  const distRoot = resolve('dist')
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  let filePath = resolve(distRoot, requested)
  if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${sep}`)) {
    response.writeHead(403).end('Forbidden')
    return
  }

  try {
    if (!(await stat(filePath)).isFile()) throw new Error('Not a file')
  } catch {
    if (extname(requested)) {
      response.writeHead(404).end('Not found')
      return
    }
    filePath = resolve(distRoot, 'index.html')
  }

  const body = await readFile(filePath)
  response.writeHead(200, { 'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream' })
  response.end(body)
}

export function startApiServer(handler: ApiHandler) {
  if (process.env.DIBOT_PREVIEW_BUNDLE === '1') {
    const key = process.env.DIBOT_PREVIEW_HANDLER_KEY || 'default'
    const global = globalThis as PreviewGlobal
    const handlers = global.__dibotPreviewApiHandlers || new Map<string, ApiHandler>()
    handlers.set(key, handler)
    global.__dibotPreviewApiHandlers = handlers
    return { close: () => undefined }
  }

  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.HOST ?? '127.0.0.1'
  const server = createServer(async (nodeRequest, nodeResponse) => {
    try {
      const pathname = new URL(nodeRequest.url ?? '/', `http://${nodeRequest.headers.host ?? `${host}:${port}`}`).pathname
      if (pathname === '/healthz') {
        await sendWebResponse(nodeResponse, json({ ok: true, ready: true }))
        return
      }
      if (pathname.startsWith('/api/')) {
        await sendWebResponse(nodeResponse, await handler(await toRequest(nodeRequest, port)))
      } else {
        await serveStatic(pathname, nodeResponse)
      }
    } catch (error) {
      console.error('[api] Request failed:', error instanceof Error ? error.message : String(error))
      await sendWebResponse(nodeResponse, json({ error: 'Internal server error' }, { status: 500 }))
    }
  })

  server.listen(port, host, () => console.log(`[api] Listening on http://${host}:${port}`))
  return server
}
