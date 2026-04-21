# BACKEND RUNTIME Y SESIONES - FASE 10

**Fecha de creacion:** 2026-04-20  
**Estado:** Especificacion de implementacion backend  
**Objetivo:** definir con precision como se construye el runtime central del agente, como se integran los carriles actuales y como se agrega persistencia de sesion sin romper la base enterprise ya existente.

---

## 1. Proposito

Este documento baja a backend la fase 10.

Su foco es:

- runtime central
- lifecycle de run
- lifecycle de sesion
- lanes internos
- entrypoints API
- persistencia nueva
- compatibilidad con el sistema actual

No define el producto visual final.  
Define el motor backend que vuelve posible ese producto.

---

## 2. Principio rector

La implementacion backend de la fase 10 no debe crear "otro modulo IA".  
Debe absorber y reorganizar lo que ya existe alrededor de un solo runtime.

Eso implica:

- reusar `aiWorkspaceService.js`
- reusar `executiveAssistantService.js`
- reusar `aiPolicyEngineService.js`
- reusar `aiRuntimeRepository.js`
- encapsular `chatService.js` en modo compatibilidad
- no duplicar logica de negocio ya validada

---

## 3. Estructura backend objetivo

### 3.1 Nuevo nucleo

Se recomienda introducir estos archivos:

- `backend/server/services/agentRuntimeService.js`
- `backend/server/services/agentSessionService.js`
- `backend/server/services/agentLaneRouterService.js`
- `backend/server/services/agentContextBuilderService.js`
- `backend/server/services/agentSurfaceContractService.js`
- `backend/server/services/agentStatusMachine.js`
- `backend/server/services/agentContracts.js`

### 3.2 Nuevos adaptadores de lanes

Para no contaminar el runtime con logica de feature:

- `backend/server/services/agentLanes/executiveOverviewLane.js`
- `backend/server/services/agentLanes/dailyPrioritiesLane.js`
- `backend/server/services/agentLanes/predictiveAnalysisLane.js`
- `backend/server/services/agentLanes/actionReviewLane.js`
- `backend/server/services/agentLanes/freeQuestionGroundedLane.js`

### 3.3 Nueva capa de persistencia

Se recomienda agregar:

- `backend/server/db/repositories/agentSessionRepository.js`
- `backend/server/db/repositories/agentSessionMemoryRepository.js`

### 3.4 Nueva API del runtime

Se recomienda agregar:

- `backend/server/controllers/agentcontroller.js`
- nuevas rutas en `backend/server/routes/airoutes.js`

---

## 4. Estado actual que debe absorber el runtime

### 4.1 Corridas y pasos ya existentes

La base actual ya tiene:

- `ai_runs`
- `ai_run_steps`
- `ai_action_proposals`
- `ai_action_executions`
- `ai_feedback`

Eso debe conservarse como base del runtime.

### 4.2 Carriles ya existentes

Actualmente existen al menos estos carriles funcionales:

- resumen ejecutivo y respuesta ejecutiva
- dashboard de prioridades y acciones
- predicciones y detalle analitico
- chat conversacional legado

### 4.3 Problema actual

El problema no es falta de logica IA.  
El problema es falta de un runtime unificado que:

- orqueste
- enrute
- persista sesion
- normalice salida
- registre todo igual

---

## 5. Entry point canonico del runtime

### 5.1 Endpoint principal

Se recomienda crear:

- `POST /api/ai/agent/run`

Body minimo:

- `surface`
- `question`
- `preset`
- `action`
- `session_id`
- `context`

### 5.2 Endpoints complementarios

- `GET /api/ai/agent/session/:id`
- `POST /api/ai/agent/session/:id/continue`
- `GET /api/ai/agent/runs/:id`

### 5.3 Regla importante

No eliminar de inmediato:

- `/api/ai/executive-assistant`
- `/api/ai/prioridades`
- `/api/ai/predictions-summary`
- `/api/chat/message`

Primero deben pasar a un estado de compatibilidad o wrapper.

---

## 6. Flujo interno del runtime

Toda corrida del agente debe seguir este orden.

### Paso 1 - Normalizar input

El runtime recibe el request y lo convierte a un `agent input envelope`.

Debe normalizar:

- usuario actual
- rol
- surface de origen
- session id si existe
- preset o pregunta
- intencion accionable si existe
- filtros
- metadatos de UI

### Paso 2 - Cargar o crear sesion

`agentSessionService` debe:

- retomar sesion si llega `session_id`
- validar ownership de sesion
- crear sesion nueva si no existe
- cargar memory minima
- devolver snapshot de sesion

### Paso 3 - Abrir run

`agentRuntimeService` debe crear un registro en `ai_runs` con:

- `agent = business_agent_runtime`
- `objective`
- `requested_by_usuario_id`
- `scope_json`
- `status = running`

### Paso 4 - Resolver lane

`agentLaneRouterService` decide:

- lane
- confidence
- si hace falta aclaracion
- si es follow-up de una sesion previa

### Paso 5 - Construir contexto

`agentContextBuilderService` arma el contexto minimo util:

- summary de sesion
- filtros vigentes
- proposals abiertas relevantes
- rango temporal activo
- metadata de negocio visible

### Paso 6 - Ejecutar lane

El lane correspondiente:

- consulta datos
- construye interpretacion
- genera surfaces
- declara acciones posibles
- devuelve `lane result envelope`

### Paso 7 - Validar acciones

Antes de exponer cualquier accion:

- pasar por `aiPolicyEngineService`
- tipificar con `aiActionContracts`
- bloquear si falta claridad o policy

### Paso 8 - Normalizar salida

`agentSurfaceContractService` transforma el resultado del lane a un envelope comun.

### Paso 9 - Persistir resumen de sesion

`agentSessionService` actualiza:

- ultimo lane
- objective vigente
- ultima surface
- summary compacto
- ultima actividad

### Paso 10 - Cerrar run

El run se cierra con:

- `status = completed` o `failed`
- `summary_json`
- `completed_at`

---

## 7. Modelo de sesion requerido

### 7.1 Objetivo

La sesion no debe guardar un chat infinito.  
Debe guardar continuidad operativa.

### 7.2 Nuevas tablas recomendadas

#### `agent_sessions`

Campos recomendados:

- `id BIGINT UNSIGNED AUTO_INCREMENT`
- `session_key VARCHAR(80)` unico y publico
- `usuario_id BIGINT UNSIGNED`
- `status VARCHAR(20)`
- `primary_lane VARCHAR(50)`
- `current_objective VARCHAR(120)`
- `current_surface VARCHAR(50)`
- `summary_json JSON`
- `scope_json JSON`
- `metadata_json JSON`
- `started_at DATETIME`
- `last_activity_at DATETIME`
- `closed_at DATETIME`
- `created_at DATETIME`
- `updated_at DATETIME`

#### `agent_session_events`

Campos recomendados:

- `id`
- `session_id`
- `run_id`
- `role`
- `event_type`
- `input_json`
- `output_json`
- `created_at`

#### `agent_session_memory`

Campos recomendados:

- `id`
- `session_id`
- `memory_key`
- `memory_value_json`
- `fresh_until`
- `updated_at`

### 7.3 Nueva migracion

Se recomienda:

- `backend/database/migrations_mysql/V35__agent_runtime_sessions.sql`

### 7.4 Indices minimos

- `uq_agent_sessions_session_key`
- `ix_agent_sessions_user_status_last_activity`
- `ix_agent_session_events_session_created`
- `uq_agent_session_memory_key`

---

## 8. Session summary minimo

Cada sesion debe poder reconstruir rapidamente:

- que queria el usuario
- en que lane estaba
- que periodo o filtros estaban activos
- que entidad estaba mirando
- que propuestas quedaron abiertas
- cual fue la ultima respuesta significativa

### 8.1 Keys recomendadas para `summary_json`

- `objective`
- `last_lane`
- `last_surface`
- `active_range`
- `active_filters`
- `active_entity`
- `open_proposal_ids`
- `recent_decisions`
- `short_context`

### 8.2 Rule of compaction

El resumen debe ser corto y deterministico.  
Nunca debe depender de volver a leer conversaciones largas.

---

## 9. Integracion exacta de lanes

### 9.1 `executive_overview`

Debe usar como base:

- `reportExecutiveService.js`
- `executiveAssistantService.js`

Responsabilidad:

- overview ejecutivo
- respuestas de negocio
- lectura de caja, ventas, clientes y stock

Salida esperada:

- `hero_summary`
- `focus_cards`
- `evidence_block`
- `action_list` resumida

### 9.2 `daily_priorities`

Debe usar como base:

- `aiWorkspaceService.js`
- `aiRuntimeRepository.js`

Responsabilidad:

- propuestas abiertas
- estado de aprobacion
- estado de ejecucion
- lista de trabajo del dia

Salida esperada:

- `focus_cards`
- `action_list`
- `approval_panel`
- `execution_status`

### 9.3 `predictive_analysis`

Debe usar como base:

- `aicontroller`
- endpoints actuales de forecast, stockouts, anomalias y precios
- services de datos ya existentes

Responsabilidad:

- detalle analitico
- drilldowns
- comparativas
- explicaciones cortas apoyadas en evidencia

Salida esperada:

- `detail_panel`
- `evidence_block`
- `focus_cards` de hallazgos

### 9.4 `action_review`

Debe usar como base:

- `aiPolicyEngineService.js`
- `aiActionContracts.js`
- `aiWorkspaceService.js`

Responsabilidad:

- aprobar
- bloquear
- descartar
- ejecutar
- reintentar

Salida esperada:

- `approval_panel`
- `execution_status`
- `meta.policy`

### 9.5 `free_question_grounded`

Debe usar como base:

- `executiveAssistantService.js`
- `reportExecutiveService.js`
- datasets gobernados

Responsabilidad:

- responder preguntas libres de negocio
- nunca salirse del terreno de datos reales y contratos del agente

No debe convertirse en un segundo chat libre.

---

## 10. Wrappers y compatibilidad

### 10.1 `executiveAssistantService.js`

Debe pasar de:

- servicio de experiencia final

a:

- implementacion interna del lane `executive_overview`

### 10.2 `aiWorkspaceService.js`

Debe pasar de:

- backend de modulo independiente

a:

- proveedor principal del lane `daily_priorities`

### 10.3 `chatService.js`

Debe pasar a uno de estos estados:

- wrapper temporal que llama al runtime con lane `free_question_grounded`
- servicio legacy desactivable por flag

No debe seguir creciendo como arquitectura paralela.

---

## 11. Cambios recomendados por archivo existente

### `backend/server/routes/airoutes.js`

Agregar:

- `POST /ai/agent/run`
- `GET /ai/agent/session/:id`
- `POST /ai/agent/session/:id/continue`
- `GET /ai/agent/runs/:id`

Mantener temporalmente el resto.

### `backend/server/routes/chatroutes.js`

Cambiar para que:

- siga existiendo por compatibilidad
- pero use `agentRuntimeService` si `AI_AGENT_CHAT_BRIDGE_ENABLED=true`

### `backend/server/controllers/aiworkspacecontroller.js`

No romperlo.  
Debe mantenerse hasta que `daily_priorities` tenga frontend conectado.

### `backend/server/controllers/reportaicontroller.js`

Debe poder convivir mientras `executive_overview` entra por el runtime nuevo.

---

## 12. Controlador nuevo recomendado

`agentcontroller.js` debe tener al menos:

- `runAgent`
- `getSession`
- `continueSession`
- `getRun`

### 12.1 `runAgent`

Debe:

- validar input
- derivar usuario y rol
- llamar a `agentRuntimeService.run(...)`
- devolver envelope comun

### 12.2 `getSession`

Debe:

- verificar ownership
- devolver snapshot usable por frontend

### 12.3 `continueSession`

Debe:

- aceptar follow-up
- retomar lane si corresponde
- abrir nuevo run asociado a la sesion

### 12.4 `getRun`

Debe:

- devolver trazabilidad suficiente para debugging o historial

---

## 13. Status machine del runtime

### 13.1 Estados de run

Estados recomendados:

- `running`
- `completed`
- `failed`
- `degraded`
- `cancelled`

### 13.2 Estados de sesion

Estados recomendados:

- `active`
- `idle`
- `closed`
- `archived`

### 13.3 Regla de degradacion

Si un lane devuelve resultado util con datos parciales o fallback:

- el run no debe marcarse `completed` normal
- debe marcarse `degraded` o dejar `meta.degraded = true`

---

## 14. Feature flags backend

Agregar como minimo:

- `AI_AGENT_RUNTIME_ENABLED`
- `AI_AGENT_SESSION_ENABLED`
- `AI_AGENT_CHAT_BRIDGE_ENABLED`
- `AI_AGENT_SURFACES_ENABLED`

### Regla

Ningun cambio de migracion de flujo debe depender de deploy ciego.  
Todo debe poder encenderse y apagarse gradualmente.

---

## 15. Logging backend obligatorio

Cada run debe registrar:

- `run_started`
- `session_loaded`
- `session_created`
- `lane_selected`
- `lane_completed`
- `surface_contract_built`
- `policy_evaluated`
- `run_failed`
- `run_completed`

### Atributos base de todos los logs

- `run_id`
- `session_id`
- `lane`
- `user_id`
- `role`
- `surface`
- `degraded`
- `duration_ms`

---

## 16. Testing backend obligatorio

### 16.1 Unit tests nuevos

Crear pruebas para:

- `agentLaneRouterService`
- `agentStatusMachine`
- `agentSessionService`
- `agentSurfaceContractService`
- `agentRuntimeService`

### 16.2 Integration tests nuevos

Crear pruebas para:

- run completo `executive_overview`
- run completo `daily_priorities`
- run completo `predictive_analysis`
- `continueSession`
- bridge de `chatService`

### 16.3 Regression tests

Verificar que sigan funcionando:

- `executiveAssistantService`
- `aiWorkspaceService`
- endpoints actuales de predicciones

---

## 17. Orden tecnico recomendado

1. crear migracion V35 para sesiones
2. crear repositories de sesion
3. crear contracts y status machine
4. crear runtime service
5. crear router
6. integrar `executive_overview`
7. integrar `daily_priorities`
8. integrar `predictive_analysis`
9. agregar bridge de chat
10. exponer controlador y rutas nuevas
11. agregar tests

---

## 18. Criterio de cierre backend

El backend de fase 10 solo se considera listo si:

- existe un runtime unico del agente
- existe persistencia minima de sesion
- los lanes actuales pueden correr via runtime
- la salida del runtime ya es uniforme
- el chat legacy no crece por fuera del runtime
- el backend puede degradar sin romper trazabilidad
- existen logs y tests nuevos del motor

Si falta cualquiera de esos puntos, backend no esta cerrado.
