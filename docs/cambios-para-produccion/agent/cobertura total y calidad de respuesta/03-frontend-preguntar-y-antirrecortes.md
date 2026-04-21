# FRONTEND DE PREGUNTAR Y ANTI-RESPUESTAS CORTADAS

**Fecha:** 2026-04-20  
**Estado:** Blueprint de producto y rendering  
**Objetivo:** definir como debe renderizarse `Preguntar` para que sea extremadamente facil y al mismo tiempo robusto frente a respuestas cortadas, genericas o de forma equivocada.

---

## 1. Problema actual

Aunque la experiencia ya mejoro, todavia aparecen defectos como:

- respuestas que suenan cortadas
- respuestas que empiezan bien y se caen
- preguntas estrategicas que visualmente se ven toscas
- repeticion de la pregunta en la cabecera
- mezcla ocasional de respuesta directa con bloques demasiado "panel"

Esto significa que el problema ya no es solo de backend.

Tambien es de render.

---

## 2. Regla principal de producto

`Preguntar` no es:

- overview
- dashboard
- modulo de analytics
- lista de propuestas

`Preguntar` es:

- una respuesta del agente a una pregunta del usuario

Todo el diseño debe partir de eso.

---

## 3. Estructura correcta de la surface `ask`

La vista correcta debe tener este orden:

### 3.1 Bloque 1 - Respuesta principal

Debe contener:

- titulo claro
- respuesta completa
- siguiente paso

No debe contener:

- cards tecnicas
- datasets visibles por defecto
- bandeja de acciones completa

### 3.2 Bloque 2 - En simple

Debe contener:

- 2 a 4 highlights maximo
- cada highlight con:
  - foco
  - por que importa
  - siguiente paso

### 3.3 Bloque 3 - Metricas clave

Debe contener:

- 3 o 4 metricas como maximo
- solo las metricas relevantes para la pregunta

### 3.4 Bloque 4 - Seguir

Debe contener:

- follow-ups naturales
- ir a analizar
- ver prioridades
- volver al resumen

---

## 4. Bloques que no deben aparecer por defecto en `ask`

Estos bloques deben quedar fuera salvo modo debug/admin:

- calidad de datos y gobierno
- datasets internos
- action list completa
- approval panel
- execution status
- evidencias genericas del dashboard

Si aparecen en `ask`, deben hacerlo solo si el playbook lo pide explicitamente.

---

## 5. Contrato visual recomendado para `ask`

Se recomienda congelar un contrato propio:

```text
ask_answer_v2
  hero_summary
  ask_highlights
  metric_strip
  optional_warning
  optional_clarification
  follow_ups
```

No debe reutilizar automaticamente:

- `focus_cards`
- `action_list`
- `detail_panel`

salvo casos muy justificados.

---

## 6. Anti-recortes

Este es uno de los puntos mas importantes.

Hay que asumir que el LLM puede devolver:

- texto truncado
- texto incompleto
- frase debil
- respuesta formalmente valida pero inutil

El frontend no debe renderizar eso como si estuviera bien.

### 6.1 Señales de respuesta potencialmente rota

Ejemplos:

- termina en "aunque"
- termina en "pero"
- termina en ","
- termina en ":"
- longitud demasiado corta
- no incluye ninguna recomendacion o cierre
- solo repite datos

### 6.2 Reglas del render

Si el backend ya marco la respuesta como dudosa:

- el frontend no la debe mostrar como respuesta final normal

Debe mostrar:

- fallback seguro
- o un mensaje de reformulacion controlada

### 6.3 Estados de render recomendados

- `ready`
- `degraded`
- `weak_answer_replaced`
- `clarification_needed`
- `response_blocked`

---

## 7. Streaming y cierre visual

Si se usa streaming:

- la respuesta no debe "parecer final" hasta tener cierre

Recomendaciones:

- skeleton de respuesta mientras stream
- estado `analizando`
- confirmar solo al completar
- si el stream se corta, disparar fallback

---

## 8. Reglas de copy

La respuesta visible debe:

- sonar a negocio
- ser directa
- evitar jerga tecnica
- evitar frases vacias

Debe evitar:

- "segun los datos analizados"
- "a nivel general"
- "actualmente"
- "podria decirse que"

si esas frases no agregan valor.

---

## 9. Mobile y desktop

La vista `ask` debe verse como una experiencia principal, no como panel recortado.

### Desktop

- hero claro
- dos columnas maximo
- highlights a la izquierda
- metricas a la derecha

### Mobile

- flujo vertical
- respuesta primero
- highlights despues
- metricas despues
- follow-ups al final

---

## 10. Reglas de accesibilidad y comprension

Cada respuesta debe permitir que un usuario no tecnico entienda:

- que esta pasando
- por que importa
- que conviene hacer

en menos de 20 segundos.

Si no se cumple eso:

- la respuesta esta mal aunque el dato sea correcto

---

## 11. Instrumentacion recomendada

La surface `ask` debe registrar:

- tipo de pregunta
- playbook elegido
- tiempo hasta primera respuesta
- tiempo hasta respuesta final
- feedback util/no util
- clicks en follow-ups
- tasa de fallback
- tasa de respuestas reemplazadas por output QA

---

## 12. Modulos recomendados

Frontend:

- `AskAnswerRenderer`
- `AskHighlightsPanel`
- `AskMetricStrip`
- `AskResponseStateBanner`
- `AskFollowUpsPanel`

Backend:

- `agentAskContractBuilder`
- `agentResponseGuardService`
- `agentWeakAnswerDetector`

---

## 13. Criterio de salida

La surface `Preguntar` queda bien cerrada solo si:

- ya no se siente como dashboard
- no aparecen respuestas cortadas visibles
- no se exponen bloques tecnicos por defecto
- cada pregunta importante se ve como una respuesta, no como un modulo

