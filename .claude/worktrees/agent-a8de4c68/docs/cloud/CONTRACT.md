# Cloud API contract (cloud-only)

Base URL: `https://<tu-backend-hostinger>`

## Health
### GET /api/healthz
Respuesta:
```
{ "status": "ok", "db": "ok" }
```

## Setup inicial
### GET /api/setup/status
Respuesta:
```
{ "requiresSetup": true|false }
```

### POST /api/setup/admin
Body:
```
{ "nombre": "Admin", "email": "admin@empresa.com", "password": "******" }
```
Respuesta: `201 { "ok": true }`

## Auth
### POST /api/login
### POST /api/login-step1
### POST /api/login-step2
### POST /api/refresh-token
### POST /api/logout

## Usuarios
### GET /api/usuarios
### POST /api/usuarios
### PUT /api/usuarios/:id
### GET /api/usuarios/vendedores

Regla actual:
- Creacion/edicion restringida por rol (`admin`).
- No hay activacion por licencia ni install_id.

## Catalogo
### GET /api/catalogo/config
### PUT /api/catalogo/config
Campos relevantes:
- `nombre`
- `logo_url`
- `destacado_producto_id`
- `publicado`
- `price_type`
- `slug`

### GET /api/catalogo/public/:slug
Entrega catalogo publico ya centralizado en cloud.

## Endpoints removidos en cloud-only
- `/api/server-info`
- `/api/license/*`
- `/api/cloud/*`
- `/api/backup/*`
- `/api/config/network`
