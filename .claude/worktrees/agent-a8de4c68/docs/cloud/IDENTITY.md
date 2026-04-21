# Identity rules (cloud-only)

## Roles de acceso
- `admin`: gestion completa, usuarios y configuracion.
- `gerente`: operacion ampliada (sin tareas criticas de administracion global).
- `vendedor`: operacion comercial diaria.

## Usuario vendedor
- Se crea desde backend central (`/api/usuarios`) con `rol: "vendedor"`.
- Inicia sesion en el mismo login cloud que el resto (`/api/login`).

## Catalog slug
- Campo: `catalogo_slug` en `parametros_sistema`.
- Normalizacion:
  - minusculas,
  - `a-z`, `0-9`, `-`,
  - sin espacios,
  - sin prefijo/sufijo `-`.
- Se publica por `GET /api/catalogo/public/:slug`.

## Eliminado del modelo de identidad
- install_id por equipo,
- activacion por codigo de licencia,
- token de emparejamiento local-cloud,
- device_id para sync bridge.
