# DATOS, POLICY Y EJECUCION - FASE 10

**Fecha de creacion:** 2026-04-20  
**Estado:** Especificacion de gobierno operativo  
**Objetivo:** definir como el motor del agente accede a datos, como decide si una accion puede exponerse y como se gobierna la ejecucion real sin perder precision ni seguridad.

---

## 1. Proposito

El motor del agente no vale por "hablar bien".  
Vale si:

- interpreta datos correctos
- propone acciones sensatas
- bloquea lo que no debe salir
- deja trazabilidad completa

Este documento cubre justamente esa frontera.

---

## 2. Principio rector

Todo lo que el agente diga o haga debe poder apoyarse en:

- un dataset conocido
- una freshness conocida
- una policy conocida
- un action type conocido

Si uno de esos cuatro puntos falta, la respuesta debe degradar o bloquearse.

---

## 3. Registry de datos del agente

La fase 10 debe formalizar un registro de datasets en backend.

### 3.1 Archivo recomendado

- `backend/server/services/agentDataRegistry.js`

### 3.2 Cada dataset debe declarar

- `dataset_key`
- `source`
- `owner`
- `scope`
- `freshness_seconds`
- `timeout_seconds`
- `fallback_policy`
- `surface_usage`

---

## 4. Datasets iniciales obligatorios

### 4.1 `executive_summary_input`

Fuente:

- `/internal/ai/executive-summary-input`

Uso:

- `executive_overview`
- `free_question_grounded`

### 4.2 `forecast`

Fuente:

- servicios actuales de forecast

Uso:

- `predictive_analysis`
- support de `executive_overview`

### 4.3 `stockouts`

Fuente:

- endpoint actual `/api/ai/stockouts`

Uso:

- `predictive_analysis`
- `daily_priorities`

### 4.4 `anomalias`

Fuente:

- endpoint actual `/api/ai/anomalias`

Uso:

- `predictive_analysis`
- `daily_priorities`

### 4.5 `precios`

Fuente:

- endpoint actual `/api/ai/precios`

Uso:

- `predictive_analysis`
- `action_review`

### 4.6 `workspace_dashboard`

Fuente:

- `aiWorkspaceService.getWorkspaceDashboard`

Uso:

- `daily_priorities`
- `executive_overview`

---

## 5. Reglas de freshness

Cada dataset debe tener tiempo maximo tolerado.

### Propuesta inicial

- `executive_summary_input`: 10 minutos
- `workspace_dashboard`: 10 minutos
- `forecast`: 60 minutos
- `stockouts`: 15 minutos
- `anomalias`: 30 minutos
- `precios`: 60 minutos

### Regla

Si la freshness se supera:

- permitir lectura si sirve solo como referencia
- bloquear acciones si la accion depende de ese dato vencido

---

## 6. Fallback policies

### 6.1 Fallback permitido

Casos validos:

- usar snapshot reciente
- usar lectura parcial sin accion
- responder con resumen acotado

### 6.2 Fallback no permitido

- inventar precision
- mantener accion automatizable con dato vencido
- ocultar que hubo degradacion

### 6.3 Campos que deben declararse

- `fallback_allowed`
- `fallback_mode`
- `degrades_actions`

---

## 7. Policy engine como frontera coercitiva

`aiPolicyEngineService.js` ya existe y debe convertirse en frontera oficial de acciones del runtime.

### 7.1 El runtime debe pedir policy siempre que

- la salida incluya accion
- la accion pueda ejecutarse
- la accion afecte cliente, precio, caja o automatizacion

### 7.2 La policy debe devolver siempre

- `action_type`
- `risk_level`
- `action_level`
- `requires_approval`
- `can_queue_automation`
- `reasons`

### 7.3 Regla importante

El frontend nunca decide por su cuenta si una accion esta habilitada.  
Solo renderiza la evaluacion ya resuelta por backend.

---

## 8. Catalogo inicial de action types

La fase 10 debe fijar un catalogo reducido pero riguroso.

### Action types iniciales

- `customer_reactivation_review`
- `collections_followup_review`
- `inventory_review_workflow`
- `price_review_workflow`
- `manual_followup_required`

### Regla

No agregar action types libres desde prompts o strings ad hoc.

---

## 9. Matriz de riesgo inicial

### Bajo

- review interna de stock
- seguimiento operativo interno

### Medio

- reactivacion comercial
- seguimiento de cobranza bajo monto

### Alto

- precios
- cobranza de monto alto
- mensajes sensibles a cuentas importantes

### Regla de aprobacion

- riesgo bajo: puede permitir automatizacion controlada
- riesgo medio: aprobacion segun policy
- riesgo alto: aprobacion obligatoria

---

## 10. Reglas de bloqueo por defecto

El runtime debe bloquear acciones cuando ocurra cualquiera de estas condiciones:

- no hay dataset suficiente
- freshness vencida
- entity cooldown excedido
- fuera de horario comercial
- canal no habilitado
- rol no permitido
- cliente o entidad de alto valor
- propuesta descartada
- ejecucion previa reciente conflictiva

### Regla

Bloquear por defecto es correcto si protege precision y negocio.

---

## 11. Integracion con propuestas y ejecuciones actuales

El runtime no debe inventar otra capa paralela de propuestas.

Debe apoyarse en:

- `ai_action_proposals`
- `ai_action_executions`
- `approvals`
- `automation_events`

### 11.1 Propuestas

Toda accion visible del agente debe:

- nacer de una propuesta existente
- o crear una propuesta tipificada antes de exponerse

### 11.2 Ejecuciones

Toda ejecucion real debe:

- tener `proposal_id`
- quedar asociada a `requested_by_usuario_id`
- pasar por `aiActionContracts`

---

## 12. Contrato minimo de evaluacion de policy

El runtime debe trabajar con una forma unificada:

```json
{
  "action_type": "customer_reactivation_review",
  "risk_level": "medium",
  "requires_approval": true,
  "can_execute": false,
  "blocked_reasons": ["La accion cae fuera del horario comercial permitido."],
  "recent_execution_count": 1,
  "evaluated_at": "2026-04-20T12:00:00.000Z"
}
```

### Regla

El frontend solo debe mostrar esta salida; nunca recalcularla.

---

## 13. Seguridad operacional

### 13.1 Lo que el modelo no puede hacer

- leer secretos
- decidir permisos
- saltar aprobaciones
- disparar integraciones por fuera de contracts

### 13.2 Lo que si puede hacer

- interpretar
- priorizar
- sugerir
- estructurar surfaces

### 13.3 Boundary correcta

El modelo participa en inteligencia.  
El backend conserva control.

---

## 14. Observabilidad de datos y policy

### 14.1 Logs obligatorios

- `dataset_requested`
- `dataset_loaded`
- `dataset_stale`
- `dataset_fallback_used`
- `policy_evaluated`
- `policy_blocked`
- `action_queued`
- `action_execution_failed`

### 14.2 Metricas obligatorias

- uso por dataset
- freshness violations
- fallback rate
- block rate por policy
- aprobaciones requeridas
- aprobaciones concedidas
- ejecuciones fallidas

### 14.3 Alertas

- dataset critico caido
- incremento de policy blocks por ruta
- repeticion anormal de ejecuciones bloqueadas

---

## 15. Testing obligatorio

### Debe probarse

- freshness rules por dataset
- fallback behavior
- policy decisions por action type
- bloqueo por horario
- bloqueo por rol
- bloqueo por cooldown
- integracion propuesta -> policy -> ejecucion

### Fixtures minimos

- cliente reactivable
- cliente premium que requiere aprobacion
- cobranza de monto alto
- producto con stock critico
- precio fuera de rango

---

## 16. Criterio de cierre

Datos, policy y ejecucion solo quedan bien cerrados si:

- todos los datasets relevantes ya estan registrados
- cada uno tiene freshness y fallback definidos
- cada accion tiene action type y risk level
- toda accion pasa por policy
- el runtime puede bloquear con explicacion clara
- no existe automatizacion fuera del catalogo tipificado

Si falta uno de esos puntos, la fase 10 queda vulnerable aunque el runtime ya exista.
