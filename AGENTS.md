# Dibot App Template

Construye una aplicación móvil completa con React, Vite, TypeScript, Bun, Turso/libSQL, R2 y auth server-side. La calidad visual y funcional es obligatoria, pero el contexto debe mantenerse compacto.

## Lee primero

- `APP_MANIFEST.md`: estructura, entidades, rutas y roles.
- `DESIGN_BRIEF.md`: referencias y decisiones visuales de Mobbin.
- `PROJECT_STATE.md`: último estado válido, archivos importantes y esquema.

## No reconstruyas

- Auth, navegación base, cliente Turso, cliente R2, configuración Vite/build y primitives compartidos.
- No agregues una UI framework nueva ni reemplaces el stack existente.

## Alcance de edición

- Create: implementa un vertical slice completo y luego amplía las operaciones principales.
- Update: modifica únicamente los archivos afectados por la petición; conserva datos, rutas, auth, APIs y decisiones visuales.
- Prioriza `src/pages/**`, `src/features/**`, `src/components/app/**`, `api/**` y `api/db/**` según el manifest real. No inventes rutas que no existan.

## Diseño móvil y calidad

- Diseña primero para 375–430 px, con 390 px como referencia, safe areas y controles táctiles de 44–56 px.
- Toda la UI visible debe estar en español salvo que el usuario pida otro idioma.
- Usa una dirección visual única y original. Mobbin inspira patrones, no se copian pantallas, marcas ni assets.
- Cada acción visible debe tener handler real, loading, error, empty, success y confirmación cuando corresponda. Elimina botones sin implementación.
- Mantén `QueryClientProvider`, `BrowserRouter` y `AppErrorBoundary` de `src/main.tsx`; no dupliques providers.

## Mobbin

- En create, si `DESIGN_BRIEF.md` está vacío, realiza como máximo una búsqueda fuerte de Mobbin y guarda un brief compacto con layout, navegación, cards, formularios, spacing, jerarquía, CTAs y movimiento.
- En update reutiliza el brief. Solo vuelve a Mobbin si el usuario pide rediseño o cambia explícitamente la dirección visual.

## Turso, R2 y auth

- Turso: schema real en `api/db/schema.ts`, seed idempotente y API server-side. No uses `db:create` en update ni `drizzle-kit push --force`; conserva filas y usa cambios no destructivos.
- R2: usa siempre `storage.upload`, `storage.getUrl`, `storage.delete` y `storage.read` de `api/storage/index.ts`, con `STORAGE_PREFIX` aislado por app. Nunca expongas credenciales al navegador ni uses localStorage para datos de negocio.
- Auth: usa `getSession`, `requireAuth`, `requireRole` y `getCurrentUser` de `api/auth`; las cookies son HttpOnly firmadas con `AUTH_SESSION_SECRET`.

## Prohibido

- Leer o explorar `node_modules`, repetir lecturas idénticas, releer todo el repositorio, usar web search/fetch, ejecutar Git, publicar o desplegar.
- Mostrar secretos o contenido real de `.env`.

## Finalización

- Ejecuta el build una sola vez al finalizar los cambios principales.
- Actualiza `PROJECT_STATE.md` con las decisiones y archivos afectados.
- El workflow externo ejecuta las validaciones de contratos, TypeScript, build, Turso, R2, API y smoke test.
