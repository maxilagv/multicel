# Instancia Cliente2 - 2026-03-26

Registro puntual del alta de la segunda instancia aislada en el VPS.

## Resultado

Instancia creada correctamente a nivel aplicacion y base de datos.

## Identidad de la instancia

- slug: `cliente2`
- carpeta: `/home/ubuntu/kaisen-cliente2`
- proceso PM2: `kaisen-cliente2`
- puerto interno: `3001`
- base MySQL: `sistema_gestion_cliente2`

## Tareas ejecutadas

- copia del backend base hacia una carpeta nueva
- creacion de base MySQL exclusiva para cliente2
- creacion de usuario MySQL exclusivo para cliente2
- generacion de `.env` exclusivo para cliente2
- generacion de secretos JWT nuevos
- configuracion de `REDIS_KEY_PREFIX=kaisen_cliente2`
- configuracion de `WHATSAPP_WEB_SESSION_NAME=cliente2`
- ejecucion completa de migraciones `V1` a `V24`
- alta del proceso PM2 `kaisen-cliente2`
- guardado de la lista de procesos con `pm2 save`

## Verificacion final

- health interno:
  - `curl http://127.0.0.1:3001/api/readyz`
  - resultado: `status=ok`
- setup inicial:
  - `curl http://127.0.0.1:3001/api/setup/status`
  - resultado: `requiresSetup=true`
- escucha de proceso:
  - `0.0.0.0:3001`

## Credencial inicial cargada

Se completo el setup inicial de `cliente2` con:

- email: `electro@gmail.com`
- nombre: `Electro Admin`

La contrasena fue la indicada por el usuario en la conversacion y no se registra en este archivo.

Verificacion hecha:

- `POST /api/setup/admin` -> `{"ok":true}`
- `GET /api/setup/status` -> `{"requiresSetup":false}`
- `POST /api/login` -> login correcto

## Restriccion encontrada

Desde fuera del VPS, el puerto `3001` no responde aunque:

- el proceso esta escuchando
- `iptables` ya tiene regla `ACCEPT` para `3001`

Conclusion:

- la instancia esta creada y funcional en el servidor
- la exposicion publica sigue bloqueada por la capa de red del proveedor o una regla superior externa al sistema operativo

## Solucion aplicada

Para no depender de abrir mas puertos publicos, se monto un router publico sobre `:3000`.

Ruta publica final de `cliente2`:

- `http://163.176.174.59:3000/cliente2/api`

Verificaciones hechas desde fuera del VPS:

- `GET /cliente2/api/readyz` -> OK
- `POST /cliente2/api/login` -> login correcto para `electro@gmail.com`

## Siguiente accion necesaria

Para usar esta instancia desde un frontend externo hace falta una de estas dos:

- abrir `3001/TCP` en la red del proveedor
- o montar un reverse proxy publico y rutear `cliente2` a `127.0.0.1:3001`

## Secrets

Los secretos de esta instancia no se guardaron en el repo.

Quedaron solo en:

- `/home/ubuntu/kaisen-cliente2/backend/server/.env`
