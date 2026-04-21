# FASE 3 - CONSOLIDACION DE PROPUESTAS Y ACCIONES

**Fecha:** 2026-04-20  
**Estado:** Pendiente  
**Objetivo:** lograr que toda salida accionable del agente pase por un catalogo tipificado, policy coercitiva, aprobacion trazable y ejecucion auditable.

---

## 1. Por que esta fase sigue abierta

Ya existe una base:

- proposals persistidas
- executions persistidas
- policy engine
- lane de revision de acciones

Pero todavia falta un cierre serio:

- action types incompletos o no congelados
- niveles de riesgo no formalizados para todas las categorias
- aprobaciones y ejecuciones no cerradas como state machine unica
- deduplicacion e idempotencia no demostradas para todos los casos

---

## 2. Objetivo exacto de la fase

Al cerrar esta fase tiene que ser verdad lo siguiente:

- no existe accion libre por fuera del catalogo
- cada accion tiene riesgo, owner y regla de aprobacion
- toda ejecucion deja auditoria clara
- una accion sensible no puede duplicarse por error de interfaz o retry
- el usuario entiende claramente que esta aprobando, ejecutando o descartando

---

## 3. Catalogo oficial a cerrar

### Categorias minimas esperables

- reabastecimiento o reposicion
- reasignacion o transferencia de stock
- reactivacion de cliente
- recordatorio de cobranza
- alerta o escalamiento de anomalia
- recomendacion de precios
- aprobacion de descuento o condicion especial
- creacion de tarea interna
- disparo de automatizacion segura

### Para cada action type definir

- nombre canonico
- descripcion visible
- lane que la emite
- riesgo
- si permite autoejecucion
- si requiere aprobacion humana
- entidad afectada
- idempotency key esperada
- evidencia minima obligatoria

---

## 4. Paquetes de trabajo

### 4.1 Catalogo de action types

Congelar el catalogo oficial en un modulo unico.

No permitir que nuevos action types aparezcan:

- en prompts
- en payloads libres
- en componentes frontend sueltos

### 4.2 Matriz de riesgo

Toda accion debe etiquetarse como:

- informativa
- baja
- media
- alta
- critica

Y cada nivel debe definir:

- si puede ejecutarse automaticamente
- si necesita aprobacion simple
- si necesita aprobacion reforzada
- si queda siempre bloqueada a modo propuesta

### 4.3 Policy engine endurecido

La policy debe decidir con datos verificables:

- permitida
- requiere aprobacion
- bloqueada

Y explicar por que:

- monto
- volumen
- cliente
- rol
- horario
- entidad sensible
- duplicado potencial

### 4.4 Approval state machine

Cerrar estados para propuestas y ejecuciones:

- `proposed`
- `approved`
- `rejected`
- `expired`
- `queued`
- `executing`
- `executed`
- `failed`
- `cancelled` si se adopta

### 4.5 Contrato visible de accion

Cada action card del agente debe mostrar:

- que propone
- por que
- evidencia
- riesgo
- que pasa si se ejecuta
- si necesita aprobacion

### 4.6 Dedupe e idempotencia

Blindar duplicados por:

- doble click
- refresh de UI
- retry del backend
- replay de automatizacion

### 4.7 Auditoria de outcomes

Toda ejecucion debe persistir:

- quien aprobo
- quien ejecuto
- cuando
- sobre que entidad
- con que payload normalizado
- cual fue el resultado
- si hubo compensacion o rollback

### 4.8 Runbooks por tipo de accion

Las acciones sensibles necesitan runbooks especificos:

- que monitorear
- como detectar fallo
- como pausar
- como revertir o compensar

---

## 5. Archivos y modulos a revisar

### Backend

- `backend/server/services/aiActionContracts.js`
- `backend/server/services/aiPolicyEngineService.js`
- `backend/server/services/agentSurfaceContractService.js`
- `backend/server/services/agentLanes/actionReviewLane.js`
- `backend/server/services/aiWorkspaceService.js`
- tablas y repositorios de `ai_action_proposals` y `ai_action_executions`
- integraciones downstream como `n8nService.js` o equivalentes

### Frontend

- `frontend-react/src/pages/AgenteNegocio.tsx`
- `frontend-react/src/types/agent.ts`
- componentes de action cards y aprobaciones si se separan

---

## 6. Cambios de datos que pueden hacer falta

Posibles necesidades:

- columna de `risk_level`
- columna de `approval_policy`
- columna de `idempotency_key`
- columna de `visible_summary`
- tabla o campo de `execution_outcome`

Usar siempre la siguiente version libre de migracion.

---

## 7. Tests obligatorios

### Unitarios

- cada action type se valida correctamente
- policy devuelve decision y motivo
- idempotencia bloquea duplicados

### Integracion

- propuesta pasa a aprobada
- aprobada pasa a ejecutada
- bloqueada no ejecuta
- fallo downstream deja estado correcto

### Seguridad

- usuario sin permiso no puede aprobar
- usuario sin permiso no puede ejecutar

### Regresion

- una surface vieja no puede inyectar acciones fuera del catalogo

---

## 8. Orden de implementacion recomendado

1. congelar catalogo de action types
2. congelar matriz de riesgo
3. endurecer policy engine
4. cerrar approval state machine
5. cerrar contrato visible de accion
6. blindar idempotencia
7. agregar auditoria y tests

---

## 9. Riesgos de esta fase

- dejar que el agente sugiera acciones sin una semantica estable
- ejecutar dos veces por problemas de interfaz o de retry
- aprobar acciones sin contexto suficiente
- tratar como "simple" una accion que realmente es sensible

---

## 10. Criterio de salida

La fase se cierra solo si:

- toda accion emitida por el agente pertenece al catalogo oficial
- toda accion tiene riesgo y regla de aprobacion
- policy decide de forma consistente y visible
- no hay duplicados silenciosos
- la auditoria de propuestas y ejecuciones es completa
