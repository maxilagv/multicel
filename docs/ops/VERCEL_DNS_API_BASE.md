Vercel + DNS por instancia

Problema
- Un `vercel.json` compartido con rewrite fija de `/api` mezcla backends entre proyectos.
- En una instancia multi-cliente eso termina enviando `marketcel` al backend o base de otro cliente.

Solucion recomendada
- No usar rewrite global de `/api` en el repo compartido.
- Resolver el backend correcto por proyecto con `VITE_API_URL`.
- Apuntar `VITE_API_URL` a un DNS dedicado de API por instancia.

Configuracion sugerida
1. Frontend `marketcel`
- Dominio web: `https://marketcel.tudominio.com`
- Variable en Vercel: `VITE_API_URL=https://api-marketcel.tudominio.com`

2. Backend `marketcel`
- DNS API: `api-marketcel.tudominio.com`
- Ese DNS debe resolver al backend/router correcto de `marketcel`

3. Backend CORS
- `CORS_ALLOWED_ORIGINS=https://marketcel.tudominio.com,https://multicel.vercel.app`
- `PUBLIC_ORIGIN=https://api-marketcel.tudominio.com`

Notas
- `cliente2` debe tener su propio `VITE_API_URL` y su propio DNS de API.
- No compartir la misma rewrite de `Vercel` entre instancias distintas.
- Si se cambia el origen de API, limpiar `service worker`, `caches` y `localStorage` del navegador.

## Caso real confirmado el 2026-03-31

Mientras `multicel` siga usando rewrite externa en Vercel, la regla valida es:

```json
{
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "http://72.60.14.52/api/$1"
    }
  ]
}
```

Errores concretos que rompen produccion:

- usar `http://72.60.14.52:3000/api/$1`
- dejar un espacio antes de `http`

Sintomas:

- `502 Bad Gateway`: Vercel no puede conectar al origin definido
- `404` o HTML en `/api/...`: la request no esta entrando al backend correcto
