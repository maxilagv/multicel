# FASE 1 - CONSOLIDACION DEL CONTROL PLANE

**Fecha:** 2026-04-20  
**Estado:** Pendiente de cierre formal  
**Objetivo:** garantizar que todo el comportamiento importante del agente pase por un runtime central, trazable y auditable, sin carriles IA invisibles ni rutas paralelas sin gobierno.

---

## 1. Por que esta fase sigue abierta

La base ya existe:

- runtime nuevo
- sesiones
- lane router
- envelope comun
- bridge del widget

Pero sigue faltando cerrar el monopolio del control plane.

Hoy todavia hay riesgo de:

- rutas que llamen servicios IA directos
- respuestas importantes sin run canonico
- criterios heterogeneos de estado, retry o degradacion
- superficies que no lean siempre del mismo contrato

---

## 2. Objetivo exacto de la fase

Al cerrar esta fase tiene que ser verdad lo siguiente:

- toda corrida importante del agente tiene `run_id`
- toda sesion util del agente tiene `session_id`
- todo ingreso importante entra por el runtime central o por wrappers que lo usan
- los estados de run son uniformes
- los pasos importantes quedan logueados con estructura comun
- ya no hay rutas IA importantes operando al margen del runtime

---

## 3. Resultado esperado

### En backend

- un runtime central rector
- wrappers legacy absorbidos
- status machine oficial y estable
- idempotencia para operaciones sensibles
- retries y degradacion consistentes

### En frontend

- historial y continuidad coherente
- surfaces leyendo un envelope uniforme
- posibilidad de inspeccionar estado y degradacion sin improvisacion

---

## 4. Paquetes de trabajo

### 4.1 Inventario definitivo de entradas IA

Hay que listar y clasificar todas las entradas actuales:

- `/api/ai/agent/run`
- `/api/ai/agent/session/:id`
- `/api/ai/agent/session/:id/continue`
- `/api/chat/message`
- `/api/ai/executive-assistant`
- `/api/ai/predictions-summary`
- cualquier endpoint IA adicional que siga llamando servicios de forma directa

Para cada una, registrar:

- si ya entra al runtime
- si solo es compatibilidad
- si debe quedar viva
- si debe redirigirse
- si debe quedar deprecada

### 4.2 Monopolio del runtime

El criterio final tiene que ser:

- ninguna respuesta de negocio relevante debe salir sin pasar por `agentRuntimeService`

Eso obliga a:

- revisar `reportaicontroller.js`
- revisar `chatcontroller.js`
- revisar cualquier llamada directa a `executiveAssistantService`
- revisar cualquier llamada directa a predicciones desde superficies visibles del agente

### 4.3 Modelo canonico de identificadores

Hay que cerrar reglas formales para:

- `run_id`
- `session_id`
- `proposal_id`
- `execution_id`
- `trace_id` o correlativo equivalente
- `request_id` de entrada HTTP si se usa en logs

Reglas minimas:

- todo id debe ser estable y auditable
- la sesion no se mezcla entre usuarios
- una accion nunca se ejecuta dos veces por ambiguedad de ids

### 4.4 Status machine completa

Hay que congelar una tabla oficial de estados para corridas:

- `queued`
- `running`
- `completed`
- `degraded`
- `failed`
- `cancelled` si se adopta

Y para cada estado dejar definido:

- quien lo emite
- cuando se usa
- si permite retry
- como aparece en frontend

### 4.5 Step logging y event ledger

Cada corrida debe dejar pasos estructurados, no solo logs de texto.

Minimo obligatorio:

- lane resuelto
- datasets pedidos
- degradaciones
- policy decisions
- proposals emitidas
- ejecuciones disparadas
- errores controlados

### 4.6 Idempotencia y retries

Cerrar reglas para:

- reenvio de acciones
- refresh de sesiones
- retries de lanes
- retry de integraciones downstream

Decisiones que deben quedar explicitas:

- que se puede reintentar automaticamente
- que requiere intervencion humana
- que debe bloquearse por riesgo de duplicado

### 4.7 Historial y recuperacion de sesion

El producto visible ya necesita un historial real del agente.

Minimo esperado:

- obtener ultimas corridas por sesion
- ver resumen de estado
- ver timestamp, lane y degradacion
- poder retomar una sesion valida

### 4.8 Deprecacion controlada de bypasses

No hace falta borrar todo lo legacy en esta fase, pero si dejarlo bajo reglas:

- o queda como wrapper del runtime
- o queda marcado como deprecado
- o deja de ser utilizado por las surfaces visibles

---

## 5. Archivos y modulos a revisar

### Backend

- `backend/server/controllers/agentcontroller.js`
- `backend/server/controllers/chatcontroller.js`
- `backend/server/controllers/reportaicontroller.js`
- `backend/server/routes/airoutes.js`
- `backend/server/routes/chatroutes.js`
- `backend/server/services/agentRuntimeService.js`
- `backend/server/services/agentSessionService.js`
- `backend/server/services/agentStatusMachine.js`
- `backend/server/services/agentContracts.js`
- `backend/server/services/agentSurfaceContractService.js`
- `backend/server/db/repositories/agentSessionRepository.js`
- `backend/server/db/repositories/aiRuntimeRepository.js`

### Frontend

- `frontend-react/src/pages/AgenteNegocio.tsx`
- `frontend-react/src/hooks/useAgentRuntime.ts`
- `frontend-react/src/hooks/useChatAI.ts`
- `frontend-react/src/types/agent.ts`

---

## 6. Cambios de datos que pueden hacer falta

Si la base actual no alcanza, agregar una migracion nueva con la siguiente version disponible para:

- claves de idempotencia
- correlacion de corridas y sesiones
- campos de estado mas duros
- resumen persistido de sesion si hace falta

No abrir esta migracion sin antes revisar:

- que ya existe en `V34`
- que ya existe en `V35`
- que datos realmente deben persistirse y cuales no

---

## 7. Tests obligatorios

### Unitarios

- lane resolution
- input normalization
- status transitions
- retry policy
- idempotencia de acciones sensibles

### Integracion

- endpoint legacy entrando al runtime
- widget entrando al runtime
- overview entrando al runtime
- errores degradados sin romper contrato

### Regresion

- no se rompe compatibilidad de rutas viejas
- no se duplica una accion por retry

---

## 8. Orden de implementacion recomendado

1. cerrar inventario de entradas IA
2. congelar tabla de estados e ids
3. endurecer `agentRuntimeService`
4. convertir rutas legacy en wrappers del runtime
5. agregar historial y recuperacion
6. agregar tests de integracion y regresion

---

## 9. Riesgos de esta fase

- romper compatibilidad de pantallas viejas
- dejar dos caminos distintos para el mismo tipo de respuesta
- mezclar ids de sesion con ids de corrida
- permitir refresh o retry con resultados ambiguos

---

## 10. Criterio de salida

La fase se cierra solo si:

- toda surface importante del agente corre sobre el runtime central
- no queda una ruta de negocio importante fuera del control plane
- la trazabilidad de run y sesion es completa
- retries e idempotencia estan definidos y probados
- el historial del agente es legible y util
