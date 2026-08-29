# Dibot Mobile App Template

Esta carpeta es una plantilla vacia y reutilizable para generar productos moviles con React + Vite. No contiene pantallas, branding, datos mock ni dominio de negocio. El agente debe construir la app solicitada desde el lienzo vacio.

## Velocidad

Usa `dibot-fast` como único agente principal para create, update y reparación. No tiene un límite fijo de pasos: implementa pronto y corrige sus propios errores hasta que `bun run dibot:verify` pase.

## Stack

Conserva React, Vite, TypeScript, Bun, Tailwind, Base UI, Motion, Embla, lucide-react, React Router, Zustand, TanStack Query, React Hook Form, Zod, Drizzle ORM, `@libsql/client`, esbuild y Turso/libSQL. No agregues otra UI framework ni reemplaces la arquitectura.

## UI movil

- Diseña primero para 375–430 px y usa 390 px como referencia.
- Idioma predeterminado: toda la interfaz, textos, etiquetas, mensajes, placeholders, errores, estados, datos de seed y contenido visible al usuario deben estar en español. Solo cambia a otro idioma si el prompt del usuario lo solicita explícitamente; conserva sin traducir los nombres propios y la marca que el usuario haya indicado.
- Mantén safe areas, teclado usable y controles de 44–56 px.
- Define tokens semanticos para fondo, superficies, texto, primary, accent, estados, spacing y radios.
- Usa una sola direccion visual coherente. Las imagenes son referencia de composicion, no una licencia para copiar marca, logo o assets.
- Cuando no haya imagenes adjuntas, `prompt-builder` usa una búsqueda estándar de Mobbin y entrega hasta seis referencias para `dibot-fast`. Extrae color, tipografía, escala, spacing, radios, sombras, navegación, cards, estados y movimiento; no clones pantallas ni uses assets de terceros.
- Reutiliza componentes existentes cuando existan; la plantilla inicial es intencionalmente vacia.
- `src/main.tsx` mantiene el `QueryClientProvider` global. Nunca uses `useQuery` o `useQueryClient` sin ese provider ni crees múltiples `QueryClient` por render.
- `src/main.tsx` mantiene también `BrowserRouter` y `AppErrorBoundary`; no los elimines ni montes routers duplicados.
- Las features importantes contemplan loading, empty, error, populated, submitting y success.

## Storage de archivos e imágenes

- Usa siempre el contrato server-side de `api/storage/index.ts`: `storage.upload`, `storage.getUrl`, `storage.delete` y `storage.read`.
- `bun run storage:provision` verifica el bucket R2 y crea/reutiliza un namespace privado y estable en `STORAGE_PREFIX` para esta app. Nunca crees un bucket por request, nunca compartas el namespace con otra app y nunca subas credenciales al frontend o al repositorio.
- En desarrollo el provider puede ser `local` y guarda archivos en `STORAGE_LOCAL_DIR`. En producción usa `s3`/`r2` con `ENDPOINT_S3`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET`.
- `storage.getUrl()` devuelve una URL pública solo cuando el objeto es público y hay `STORAGE_PUBLIC_URL`; en cualquier otro caso devuelve una URL firmada temporal. Usa `storage.delete()` para limpiar el objeto y su thumbnail.
- Valida siempre tamaño y MIME type antes de guardar. Para imágenes usa `thumbnail: true` o dimensiones explícitas. La metadata devuelta debe guardarse en la tabla de negocio cuando la app necesite listar archivos.
- El selector `src/components/FilePicker.tsx` permite galería y cámara móvil mediante `accept`/`capture`. Debe tener estados de error y carga, y jamás una acción visual sin handler.

## Autenticación y sesiones

- Usa `getSession`, `requireAuth`, `requireRole` y `getCurrentUser` desde `api/auth`.
- Las sesiones son cookies firmadas `HttpOnly`, `SameSite=Lax`, con `AUTH_SESSION_SECRET`; en producción la cookie se marca `Secure`. Nunca confíes en un role enviado desde el navegador.
- Protege todos los endpoints de subida, eliminación y administración con `requireAuth` y `requireRole` cuando corresponda. Devuelve 401 para sesión ausente y 403 para rol insuficiente.

## Calidad de la entrega

- La interfaz siempre se diseña como app móvil, primero para 375–430 px; no conviertas una página de escritorio en una app al final.
- Cada botón, enlace, filtro, menú y formulario debe tener una implementación real. Si una acción no puede funcionar con los datos y APIs disponibles, elimínala.
- Entrega un flujo completo, no una sola pantalla vacía: navegación móvil coherente, estados loading/empty/error/success y las operaciones principales conectadas a Turso/R2.

## API y Turso

- Todo acceso a Turso ocurre en `api/` o en un backend server-side. Nunca expongas `TURSO_AUTH_TOKEN` ni `TURSO_PLATFORM_API_TOKEN` al navegador ni uses `VITE_` para secretos.
- Usa Drizzle ORM + `@libsql/client` y define las tablas en `api/db/schema.ts`.
- Toda app generada define schema, seed idempotente y API real. Usa `bun run db:push` y `bun run db:seed`; generate/migrate queda para migraciones versionadas.
- Verifica `TURSO_DATABASE_ID` contra Turso antes de usar una base existente. La URL y el token de conexion son `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.
- Provisioning usa `TURSO_PLATFORM_API_TOKEN`, `TURSO_ORG_SLUG`, `TURSO_GROUP` y `TURSO_DATABASE_NAME`. `TURSO_DATABASE` es un JWT de conexion, no un token de Platform API.
- El flujo de provisioning solo puede crear una base nueva con `bun run db:create`; nunca reutilices una base sin verificar su `TURSO_DATABASE_ID`.
- En update está prohibido `drizzle-kit push --force`. Usa defaults, columnas nullable o migraciones en dos fases; el workflow compara una instantánea para impedir pérdida de filas.
- Para cambios sobre una app existente, el workflow ejecuta `dibot-fast` en UPDATE MODE y conserva la dirección visual y el `TURSO_DATABASE_ID`.

## Mobbin MCP

El servidor se llama `mobbin` y esta configurado en `opencode.json`. Su autenticacion es OAuth con `opencode mcp auth mobbin`; no requiere una API key en `.env`. Usa `prompt-builder` para convertir una idea corta en un superprompt y luego pega ese resultado en `dibot-fast`.

## Flujo minimo

1. Lee `package.json`, `src/`, `api/`, rutas, tokens y configuracion relevante.
2. Define en una frase producto, usuario, tono, navegacion y direccion visual.
3. Implementa un vertical slice funcional.
4. Crea schema, seed y API; ejecuta `bun run db:check`, `bun run db:push`, `bun run db:seed` y `bun run db:verify`.
5. Ejecuta `bun run dibot:verify`; corrige tus errores y repite hasta que frontend, API, Turso, esbuild y lint pasen.

## Archivos clave

- `src/App.tsx`: lienzo vacio de la UI.
- `api/README.md`: contrato de API y base de datos.
- `api/db/client.ts`: cliente server-side Drizzle/Turso.
- `api/db/schema.ts`: schema que cada app debe completar.
- `drizzle.config.ts`: configuracion Turso para Drizzle Kit.
- `scripts/provision-turso.ts`: check por ID y creación no destructiva de una base nueva.
- `scripts/provision-storage.ts`: verifica R2 y crea el namespace aislado de la app, además de preparar la configuración no secreta del provider.
- `api/storage/index.ts`: contrato común de almacenamiento local/R2, URLs firmadas, metadata, validación y thumbnails.
- `api/auth/session.ts`: contrato común de sesiones firmadas y autorización.
- `.opencode/prompts/`: instrucciones para build, features, API y fixes.
