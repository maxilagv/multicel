# ROLLOUT, VALIDACION Y CHECKLIST - FASE 10

**Fecha de creacion:** 2026-04-20  
**Estado:** Plan de salida a implementacion real  
**Objetivo:** definir el orden exacto de ejecucion, la estrategia de rollout, los gates de validacion y los checks finales para cerrar la fase 10 sin errores evitables.

---

## 1. Proposito

La fase 10 es demasiado importante para ejecutarla como bloque unico y opaco.

Necesita:

- slices claros
- gates
- rollback
- validacion tecnica
- validacion de producto

Este documento define justamente esa parte.

---

## 2. Regla principal de rollout

La fase 10 debe salir por capas.

Nunca hacer:

- migracion masiva sin flags
- reemplazo instantaneo de todos los endpoints IA
- cambio visual completo sin runtime estable

Siempre hacer:

- runtime primero
- wrappers despues
- una surface nueva conectada
- rollout progresivo

---

## 3. Secuencia recomendada en entregas

### Entrega 1 - Base del runtime

Incluye:

- migracion de sesiones
- repositories de sesion
- contracts base
- status machine
- runtime service

**Gate**

- tests unitarios del runtime pasan
- no rompe endpoints actuales

### Entrega 2 - Router y lane `executive_overview`

Incluye:

- router
- context builder
- integracion con `executiveAssistantService`
- endpoint `/api/ai/agent/run`

**Gate**

- overview ya corre por runtime nuevo
- responses ya salen en envelope comun

### Entrega 3 - Lane `daily_priorities`

Incluye:

- integracion con `aiWorkspaceService`
- policy en actions visibles
- surfaces de prioridades y aprobaciones

**Gate**

- prioridades ya pueden salir por runtime nuevo
- acciones tienen risk y approval

### Entrega 4 - Lane `predictive_analysis`

Incluye:

- detalle analitico
- drilldowns
- `detail_panel`

**Gate**

- detalle predictivo ya funciona por runtime nuevo

### Entrega 5 - Bridge frontend inicial

Incluye:

- `AgenteNegocio.tsx`
- `useAgentRuntime`
- vista `Hoy`
- vista `Preguntar`

**Gate**

- un usuario de negocio puede usar la nueva entrada principal

### Entrega 6 - Compatibilidad y chat bridge

Incluye:

- wrapper de `ChatWidget`
- bridge de `chatService`
- flags de convivencia

**Gate**

- el sistema ya no tiene dos arquitecturas IA compitiendo

### Entrega 7 - Observabilidad y cierre

Incluye:

- logs estructurados
- metricas
- alertas
- replay tests
- checklist final

**Gate**

- trazabilidad completa
- rollback validado

---

## 4. Feature flags obligatorios

### Flags de backend

- `AI_AGENT_RUNTIME_ENABLED`
- `AI_AGENT_SESSION_ENABLED`
- `AI_AGENT_CHAT_BRIDGE_ENABLED`
- `AI_AGENT_SURFACES_ENABLED`
- `AI_AGENT_ACTION_GATES_STRICT`

### Flags de frontend

- `VITE_AI_AGENT_ENABLED`
- `VITE_AI_AGENT_WIDGET_BRIDGE`

### Regla

Cada slice debe poder activarse o desactivarse sin rollback destructivo.

---

## 5. Checklist tecnico previo a activar runtime nuevo

- migracion V35 aplicada
- repositories nuevos validados
- endpoint nuevo autenticado
- router cubierto por tests
- status machine cubierta por tests
- lanes iniciales operativos
- envelope del runtime estable
- logs estructurados visibles

---

## 6. Checklist previo a conectar frontend nuevo

- overview estable
- priorities estable
- session retrieval operativa
- actions tipificadas
- errors controlados definidos
- degradacion visible en meta
- mobile layout validado sobre mock y datos reales

---

## 7. Replay suite minima

Antes de subir el flag principal se deben correr casos de replay sobre:

- panorama del negocio
- caja sensible
- cliente reactivable
- propuesta con aprobacion
- producto con stock critico
- detalle de forecast

### Cada replay debe validar

- lane elegido
- envelope valido
- evidence presente
- action typing correcto
- policy correcta

---

## 8. QA funcional de negocio

### Escenario 1

Un gerente entra y en menos de un minuto entiende:

- como viene el negocio
- que prioridad atender
- que puede aprobar

### Escenario 2

Un admin pide detalle de una prioridad y puede:

- abrir evidencia
- revisar riesgo
- aprobar o frenar

### Escenario 3

Un usuario pregunta algo ambiguo y el sistema:

- ayuda
- no se rompe
- no dispara acciones

### Escenario 4

Falla un dataset y el sistema:

- degrada
- lo dice
- no inventa certeza

---

## 9. Criterios de aceptacion de producto

La fase 10 no se acepta solo por pasar tests.

Tambien debe cumplirse:

- la nueva entrada del agente es mas simple que la combinacion anterior
- el usuario necesita menos clicks mentales para decidir
- las acciones se entienden mejor
- el detalle tecnico no invade la vista principal
- el widget ya no compite con la identidad del agente

---

## 10. Riesgos de rollout

### Riesgo 1

El runtime nuevo existe pero nadie lo usa.

Mitigacion:

- conectar temprano una surface real

### Riesgo 2

La compatibilidad con chat legacy mantiene la fragmentacion.

Mitigacion:

- bridgearlo rapido
- no sumarle features

### Riesgo 3

El frontend nuevo se vuelve mas complejo.

Mitigacion:

- revisar cada screen contra la regla de facilidad extrema

### Riesgo 4

La policy bloquea de mas o de menos.

Mitigacion:

- replay cases
- logs de block reasons
- calibracion antes de activar strict mode

---

## 11. Rollback plan

Cada entrega debe tener rollback claro.

### Si falla backend nuevo

- apagar `AI_AGENT_RUNTIME_ENABLED`
- mantener endpoints viejos

### Si falla sesion nueva

- apagar `AI_AGENT_SESSION_ENABLED`
- seguir corriendo runtime en modo stateless temporal

### Si falla widget bridge

- apagar `AI_AGENT_CHAT_BRIDGE_ENABLED`
- mantener widget viejo mientras se corrige

### Regla

No introducir cambios irreversibles sin flag.

---

## 12. Checklist final de cierre

### Backend

- runtime central activo
- session model activo
- lanes overview, priorities y predictive funcionando
- action review bajo policy

### Frontend

- nueva entrada del agente funcionando
- overview y prioridades sobre runtime
- experiencia mas simple que antes

### Operacion

- logs
- metricas
- alertas
- replay suite verde
- rollback probado

### Gobierno

- actions tipificadas
- bloqueos claros
- aprobaciones claras
- cero acciones fuera de policy

---

## 13. Criterio final

La fase 10 solo puede darse por cerrada si el sistema queda en esta situacion:

- un solo motor del agente por debajo
- una experiencia mucho mas facil por arriba
- mas potencia operativa sin mas friccion
- mas trazabilidad sin mas caos

Si la fase deja mejor arquitectura pero igual confusion en uso, no alcanza.  
Si deja mejor UX pero sin control plane ni policy, tampoco alcanza.

La fase queda perfecta solo si ambas cosas mejoran juntas.
