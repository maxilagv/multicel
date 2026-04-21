CRM y Postventa

Migracion
- Ejecutar `npm run migrate` en `backend/server`.
- En la implementacion actual, las tablas base de CRM/Postventa se crean desde
  `backend/database/migrations_mysql/V1__core_cloud.sql`:
  - `crm_oportunidades`
  - `crm_actividades`
  - `tickets`
  - `ticket_eventos`
- No se requiere `backend/database/schema.sql` ni existe una migracion
  `V2__crm_postventa.sql` en este proyecto.

Endpoints CRM
- GET `/api/crm/oportunidades` Lista con filtros: `q`, `fase`, `cliente_id`, `owner_id`, `limit`, `offset`.
- POST `/api/crm/oportunidades` Crea oportunidad.
- PUT `/api/crm/oportunidades/:id` Actualiza oportunidad.
- GET `/api/crm/actividades` Lista con filtros: `cliente_id`, `oportunidad_id`, `estado`, `limit`, `offset`.
- POST `/api/crm/actividades` Crea actividad (llamada|reunion|tarea; estado por defecto: pendiente).
- PUT `/api/crm/actividades/:id` Actualiza actividad (incluye `estado` -> completado/cancelado).

Endpoints Tickets (Postventa)
- GET `/api/tickets` Lista con filtros: `q`, `estado`, `prioridad`, `cliente_id`, `limit`, `offset`.
- POST `/api/tickets` Crea ticket.
- PUT `/api/tickets/:id` Actualiza ticket (estado, prioridad, asignacion, etc.).
- GET `/api/tickets/:id/eventos` Historial de eventos.
- POST `/api/tickets/:id/eventos` Agrega evento. Para `tipo=cambio_estado` se puede enviar `detalle="nuevo_estado:<estado>"`.

Auth y roles
- Todas las rutas requieren JWT (`auth`).
- Crear/actualizar requiere rol `admin|gerente|vendedor` (ajustable en `routes/*`).
