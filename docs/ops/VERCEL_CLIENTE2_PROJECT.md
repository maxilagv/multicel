# Vercel Cliente2

Guia corta para crear el proyecto frontend de `cliente2` sin crear otro repo.

Estado pensado para el esquema:

- mismo repo
- mismo frontend
- otro proyecto en Vercel
- routing del API definido a nivel proyecto en Vercel

## 1. Crear el proyecto

En Vercel:

1. New Project
2. Import Git Repository
3. Elegir el mismo repo actual
4. Root Directory:
   - `frontend-react`
5. Framework Preset:
   - `Vite`
6. Crear el proyecto con un nombre distinto, por ejemplo:
   - `multicel-cliente2`

## 2. No tocar el repo para este cliente

No hace falta:

- crear otro repositorio
- duplicar el frontend
- cambiar `frontend-react/vercel.json`

La diferencia de `cliente2` se define en el proyecto nuevo de Vercel.

## 3. Configurar routing del API desde el dashboard

Segun docs oficiales de Vercel, las reglas de routing se pueden configurar a nivel proyecto desde el dashboard sin redeploy del codigo.

Fuente oficial:

- https://vercel.com/docs/routing/

En el proyecto nuevo:

1. Entrar a Settings
2. Buscar la seccion de Routing / Project Routes / CDN
3. Agregar una rewrite externa:

```text
Source:      /api/:path*
Destination: http://163.176.174.59:3000/cliente2/api/:path*
```

Con eso:

- el frontend sigue llamando `/api/...`
- Vercel proxya esas requests al backend `cliente2`
- el navegador sigue en HTTPS sobre el dominio de Vercel
- no hay problema de mixed content

## 3.1 Si Vercel muestra la regla como JSON `routes`

En algunas pantallas de Vercel la regla termina representada como `routes` con campos `src` y `dest`.

En ese caso, usar sintaxis de regex y grupos de captura:

```json
{
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "http://163.176.174.59:3000/cliente2/api/$1"
    }
  ]
}
```

No mezclar `routes` con `:path*`. El caso:

```json
{
  "routes": [
    {
      "src": "/api/:path*",
      "dest": "http://163.176.174.59:3000/cliente2/api/:path*"
    }
  ]
}
```

dio `404 Cannot GET /api/setup/status*` en la URL real de `cliente2` el 26 de marzo de 2026.

## 4. Variables de entorno

Para este esquema, no hace falta `VITE_API_BASE_URL`.

Dejarla vacia o no configurarla, asi el frontend usa rutas relativas `/api/...` y Vercel hace la rewrite.

## 5. Credencial inicial

- email: `electro@gmail.com`
- la contrasena se administra por fuera de este archivo

## 6. Nota

Si en el futuro se migra a subdominios propios, la rewrite puede cambiarse sin tocar el repo:

```text
/api/:path* -> https://api-cliente2.tudominio.com/api/:path*
```
