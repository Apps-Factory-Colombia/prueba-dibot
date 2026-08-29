# Dibot API y base de datos

Las apps generadas usan esta capa server-side para persistencia. El navegador nunca debe recibir `TURSO_AUTH_TOKEN` ni `TURSO_PLATFORM_API_TOKEN`.

## Flujo MVP

1. Define las tablas de la app en `api/db/schema.ts`.
2. Ejecuta `bun run db:check` para verificar organización, grupo y `TURSO_DATABASE_ID`.
3. Si la app necesita una base nueva, ejecuta `bun run db:create`. Este comando crea una única base nueva, genera su token de conexión y actualiza `.env` y `.env.turso`.
4. Ejecuta `bun run db:push` para sincronizar el schema con Turso.
5. Ejecuta `bun run db:verify` para comprobar la conexión real y que la app no dependa de una base inexistente.
6. Expón handlers tipados desde `api/` y consúmelos desde React con TanStack Query.

## Variables

La creación necesita `TURSO_PLATFORM_API_TOKEN`, `TURSO_ORG_SLUG`, `TURSO_GROUP` y `TURSO_DATABASE_NAME`. La conexión runtime usa `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` y `TURSO_DATABASE_ID`.

`TURSO_PLATFORM_API_TOKEN` es el único token válido para consultar la organización y crear bases. `TURSO_AUTH_TOKEN` es únicamente el token de conexión de una base concreta.

## Storage de archivos e imágenes

El workflow ejecuta `bun run storage:provision` después de preparar Turso. Comprueba que el bucket R2 existe y crea un marcador en un namespace estable para la aplicación, por ejemplo `apps/mi-app-a1b2c3d4e5/`. No se crea un bucket por usuario ni por archivo.

La implementación reusable está en `api/storage/index.ts`:

```ts
import { storage } from './storage'

const uploaded = await storage.upload({
  body: bytes,
  fileName: file.name,
  contentType: file.type,
  visibility: 'private',
  metadata: { ownerId: userId },
  thumbnail: file.type.startsWith('image/'),
})
const url = await storage.getUrl(uploaded.key)
await storage.delete(uploaded.key)
```

En desarrollo usa `STORAGE_PROVIDER=local` y `STORAGE_LOCAL_DIR=.storage`. En producción usa `STORAGE_PROVIDER=s3` o `r2`, `ENDPOINT_S3`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET`. `storage.getUrl` entrega URLs firmadas para objetos privados; los públicos solo usan `STORAGE_PUBLIC_URL` cuando está configurado. El contrato valida tamaño/MIME, conserva metadata y puede crear thumbnails WEBP con `sharp`.

Para rutas HTTP se puede usar `handleStorageRequest` y montar `/api/storage/upload`, `/api/storage/file` y `DELETE /api/storage/file`. El handler exige `requireAuth` automáticamente para subir, eliminar y leer objetos privados; añade `requireRole(request, ...)` en la ruta si la operación es administrativa. El componente `src/components/FilePicker.tsx` cubre selección desde galería y captura desde cámara en móvil.

## Autenticación y sesiones

`api/auth/session.ts` define el protocolo server-side. Usa `createSessionToken` y `sessionHeaders` después de autenticar al usuario; para endpoints privados usa `getSession`, `requireAuth`, `requireRole` y `getCurrentUser`. La sesión vive en una cookie firmada `HttpOnly`, `SameSite=Lax`, con `AUTH_SESSION_SECRET` y vencimiento configurable por `AUTH_SESSION_TTL_SECONDS`. El role nunca se acepta desde el navegador.
