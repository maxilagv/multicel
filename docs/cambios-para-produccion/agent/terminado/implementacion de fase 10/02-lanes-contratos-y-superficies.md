# LANES, CONTRATOS Y SUPERFICIES - FASE 10

**Fecha de creacion:** 2026-04-20  
**Estado:** Especificacion de contratos del runtime  
**Objetivo:** definir con exactitud como se enruta una entrada del agente y que forma deben tener las salidas para que backend y frontend compartan un lenguaje unico.

---

## 1. Proposito

Este documento resuelve dos huecos criticos:

- como decide el agente que carril usar
- como responde el agente de forma estructurada y coherente

Si esto no esta bien definido:

- el runtime se vuelve opaco
- el frontend vuelve a depender de respuestas informales
- la potencia del motor termina ensuciando la experiencia

---

## 2. Principio general

El runtime no debe depender de prompts para decidir su arquitectura.  
La arquitectura debe ser deterministica.

Eso significa:

- lane router explicito
- envelopes tipificados
- surfaces tipificadas
- acciones tipificadas

El modelo puede ayudar a interpretar, pero no debe decidir la estructura base del sistema.

---

## 3. Catalogo inicial de lanes

### 3.1 `executive_overview`

Usos:

- "como viene el negocio"
- "como esta la caja"
- "que debo mirar hoy"
- "decime si hay que preocuparse"

Entradas tipicas:

- preset `overview`
- preset `today`
- preset `cash`
- preguntas ejecutivas cortas

### 3.2 `daily_priorities`

Usos:

- ver prioridades abiertas
- ver estado de propuestas
- revisar acciones programadas
- pedir refresh del dia

Entradas tipicas:

- apertura de surface `Hoy`
- surface `Prioridades`
- follow-up de una accion propuesta

### 3.3 `predictive_analysis`

Usos:

- detalle de forecast
- stockouts
- precios
- anomalias
- drilldown por producto o categoria

Entradas tipicas:

- click en "ver detalle"
- surface `Analizar`
- request con `detail_target`

### 3.4 `action_review`

Usos:

- solicitar aprobacion
- aprobar
- descartar
- ejecutar
- revisar resultado

Entradas tipicas:

- `action.intent = request_approval`
- `action.intent = execute`
- `action.intent = reject`

### 3.5 `free_question_grounded`

Usos:

- preguntas libres de negocio

Condicion:

- solo si pueden anclarse a datasets conocidos y a surfaces del agente

No debe responder:

- temas fuera del negocio
- preguntas de IA general
- prompts de creatividad sin dato

---

## 4. Reglas de ruteo

### 4.1 Inputs que debe evaluar el router

- `surface`
- `question`
- `preset`
- `action.intent`
- `action.proposal_id`
- `context.active_entity`
- `session.primary_lane`
- `session.current_objective`

### 4.2 Orden de prioridad del router

1. acciones explicitas
2. detalle explicitamente pedido
3. preset reconocido
4. continuidad de sesion
5. clasificacion de pregunta libre

### 4.3 Regla de seguridad

Si la entrada es ambigua y puede tocar accion:

- no asumir
- pedir aclaracion
- o devolver solo lectura, nunca accion directa

---

## 5. Tabla de decision de lanes

### Caso 1

Input:

- `action.intent = execute`

Decision:

- `action_review`

### Caso 2

Input:

- `surface = prioridades`

Decision:

- `daily_priorities`

### Caso 3

Input:

- `surface = analizar`
- `detail_target = producto|categoria|forecast`

Decision:

- `predictive_analysis`

### Caso 4

Input:

- `preset in [overview, today, cash, clients, stock]`

Decision:

- `executive_overview`

### Caso 5

Input:

- `question` libre con terminos de negocio

Decision:

- `free_question_grounded`

### Caso 6

Input:

- `session.primary_lane` reciente
- follow-up corto

Decision:

- continuar en lane anterior si la confianza de continuidad es alta

---

## 6. Input envelope canonico

Toda entrada del runtime debe normalizarse a esta forma.

```json
{
  "surface": "today|ask|priorities|analyze|history|widget",
  "question": "string",
  "preset": "overview|today|cash|clients|stock|null",
  "session_id": "string|null",
  "context": {
    "range": { "desde": "string|null", "hasta": "string|null" },
    "filters": {},
    "active_entity": null,
    "detail_target": null
  },
  "action": {
    "intent": null,
    "proposal_id": null,
    "execution_id": null
  }
}
```

### Regla

El frontend puede enviar menos campos, pero el backend siempre debe completar el envelope interno.

---

## 7. Output envelope canonico

Toda salida del runtime debe compartir esta forma base.

```json
{
  "run": {},
  "session": {},
  "lane": {},
  "response": {},
  "surfaces": [],
  "actions": [],
  "evidence": [],
  "meta": {}
}
```

### 7.1 `run`

Debe incluir:

- `id`
- `status`
- `degraded`
- `started_at`
- `completed_at`

### 7.2 `session`

Debe incluir:

- `id`
- `status`
- `primary_lane`
- `current_surface`
- `summary`

### 7.3 `lane`

Debe incluir:

- `key`
- `confidence`
- `continued_from_session`

### 7.4 `response`

Debe incluir:

- `title`
- `message`
- `next_best_step`

### 7.5 `meta`

Debe incluir:

- `requires_clarification`
- `degraded`
- `used_fallback`
- `range`
- `freshness`

---

## 8. Surface contracts

### 8.1 `hero_summary`

Uso:

- apertura de `Hoy`
- resumen ejecutivo

Campos:

- `title`
- `status_tone`
- `summary`
- `why_it_matters`
- `next_step`
- `range_label`
- `freshness_label`

### 8.2 `focus_cards`

Uso:

- focos prioritarios
- puntos a mirar

Campos por item:

- `id`
- `title`
- `tone`
- `summary`
- `why_it_matters`
- `next_step`
- `impact`
- `linked_action_id`
- `linked_detail_target`

### 8.3 `action_list`

Uso:

- propuestas
- acciones listas o bloqueadas

Campos por item:

- `id`
- `title`
- `summary`
- `action_type`
- `risk_level`
- `requires_approval`
- `can_execute`
- `status`
- `blocked_reasons`
- `proposal_id`

### 8.4 `evidence_block`

Uso:

- respaldo visible de la recomendacion

Campos:

- `items`
- `range`
- `freshness`
- `source_label`

Campos por item:

- `label`
- `value`
- `tone`

### 8.5 `detail_panel`

Uso:

- analisis profundo

Campos:

- `detail_type`
- `title`
- `summary`
- `chart`
- `table`
- `derived_actions`

### 8.6 `approval_panel`

Uso:

- revision de aprobaciones

Campos:

- `proposal_id`
- `title`
- `reason`
- `risk_level`
- `expected_impact`
- `evidence`
- `approval_status`
- `can_approve`

### 8.7 `execution_status`

Uso:

- estado de automatizacion o accion

Campos:

- `execution_id`
- `status`
- `channel`
- `message`
- `updated_at`
- `error`

---

## 9. Reglas de construccion de surfaces

### 9.1 Regla de simplicidad

No devolver surfaces que el frontend no necesita.

### 9.2 Regla de prioridad

La surface principal debe responder primero:

- que pasa
- por que importa
- que hacer

### 9.3 Regla de progresive disclosure

El detalle profundo debe ir en `detail_panel` o follow-up.  
No debe contaminar la vista inicial.

### 9.4 Regla de evidencia

Toda surface accionable debe tener al menos un `evidence_block`.

---

## 10. Mapping desde servicios actuales

### 10.1 `executiveAssistantService`

Debe mapear a:

- `response`
- `hero_summary`
- `focus_cards`
- `action_list`
- `evidence_block`

### 10.2 `aiWorkspaceService`

Debe mapear a:

- `focus_cards`
- `action_list`
- `approval_panel`
- `execution_status`

### 10.3 Predicciones actuales

Debe mapear a:

- `detail_panel`
- `focus_cards` de hallazgos
- `evidence_block`

### 10.4 Chat legacy

Si se mantiene por compatibilidad:

- nunca debe devolver solo `reply`
- debe envolverse en `response` y surfaces minimas

---

## 11. Contrato de acciones

Toda accion del runtime debe tener esta forma base:

```json
{
  "id": "string",
  "title": "string",
  "action_type": "string",
  "risk_level": "low|medium|high",
  "requires_approval": true,
  "can_execute": false,
  "blocked_reasons": [],
  "proposal_id": 123,
  "status": "pending|review|approved|queued|executed|blocked"
}
```

### Regla

Si una accion no puede ser tipificada asi, no debe exponerse como accion del agente.

---

## 12. Contrato de follow-up

Toda respuesta del agente debe poder sugerir proximo paso sin obligar al usuario a inventarlo.

### Forma sugerida

```json
{
  "follow_ups": [
    { "label": "Ver detalle", "intent": "open_detail" },
    { "label": "Preparar accion", "intent": "prepare_action" },
    { "label": "Comparar periodo", "intent": "compare_range" }
  ]
}
```

### Regla de UX

El usuario no debe necesitar prompts largos para llegar al siguiente nivel.

---

## 13. Estados de degradacion

El envelope debe poder indicar claramente cuando hubo degradacion.

### Casos validos

- dataset faltante
- timeout de provider
- fallback a lectura parcial
- policy que bloqueo accion

### Campos minimos

- `meta.degraded = true`
- `meta.degradation_reason`
- `meta.used_fallback`

### Regla

La degradacion no debe romper la forma de la respuesta.

---

## 14. Tipos de error controlado

### `clarification_required`

Se usa cuando:

- la entrada es demasiado ambigua
- el usuario parece querer una accion sensible sin contexto

### `data_unavailable`

Se usa cuando:

- falta dataset
- freshness excedida

### `policy_blocked`

Se usa cuando:

- la accion no cumple politicas

### `partial_result`

Se usa cuando:

- se pudo responder parcialmente

---

## 15. Testing de contracts

### Debe probarse

- que cada lane devuelve envelope valido
- que ninguna surface rompe el contrato base
- que las acciones siempre traen `risk_level` y `requires_approval`
- que la degradacion no quiebra el shape
- que la compatibilidad con servicios actuales sigue funcionando

### Estrategia

- tests unitarios de builders
- fixtures por lane
- snapshot tests de envelopes

---

## 16. Criterio de cierre

Lanes y contratos solo quedan cerrados si:

- el router es deterministico
- cada lane tiene input y output definidos
- el envelope del runtime es uniforme
- las surfaces cubren overview, prioridades, detalle y aprobacion
- las acciones ya salen tipificadas
- el frontend puede consumir todo sin parsing informal

Si falta uno de estos puntos, el motor todavia no esta listo para sostener una UX realmente simple.
