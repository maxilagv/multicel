# EVALUACION DE CALIDAD, OUTPUT QA Y GATES DE SALIDA

**Fecha:** 2026-04-20  
**Estado:** Plan de aseguramiento de calidad  
**Objetivo:** definir como se garantiza que el agente no entregue respuestas toscas, cortadas o de forma equivocada cuando la arquitectura nueva este implementada.

---

## 1. Principio central

El agente no puede depender de:

- "parece que responde bien"

Necesita:

- evaluacion repetible
- validacion por family
- gates de salida

---

## 2. Capas de calidad obligatorias

### 2.1 Calidad de clasificacion

Mide:

- si la pregunta entra en la family correcta
- si detecta follow-up correctamente
- si evita secuestro por continuidad de sesion

### 2.2 Calidad de datos

Mide:

- si uso datasets correctos
- si degrado honestamente
- si no contesto con datos insuficientes sin avisar

### 2.3 Calidad de respuesta

Mide:

- si responde la pregunta real
- si la forma es la correcta
- si no esta cortada
- si no es demasiado generica

### 2.4 Calidad de producto

Mide:

- tiempo hasta entender que hacer
- tasa de feedback util
- necesidad de reformular

---

## 3. Output QA

Debe existir una capa formal previa al frontend.

### 3.1 Checks minimos

- longitud minima
- cierre de oracion valido
- no terminar en conectores colgando
- no contradiccion interna obvia
- presencia de recomendacion o conclusion
- compatibilidad con contrato visual

### 3.2 Resultado posible

- `pass`
- `weak`
- `truncated`
- `invalid_shape`
- `fallback_required`

### 3.3 Comportamiento

Si la salida es `pass`:

- se entrega

Si la salida es `weak`:

- se intenta fallback deterministicamente mejor

Si la salida es `truncated`:

- se bloquea la salida directa
- se reemplaza por fallback

Si la salida es `invalid_shape`:

- se reconstruye via contract builder

---

## 4. Replay suites por family

No alcanza con una suite general.

Se necesitan suites por family:

- `overview_suite`
- `cash_suite`
- `clients_suite`
- `stock_suite`
- `catalog_suite`
- `promotion_suite`

Cada suite debe tener:

- casos claros
- casos ambiguos
- casos degradados
- casos con follow-up
- casos con respuesta de fallback

---

## 5. Casos obligatorios para catalogo

Hay que medir como minimo:

### Caso A

Pregunta:

- "quiero hacer mi catalogo web, que tendria que implementar ya"

Debe responder:

- bloque minimo viable
- no overview generico

### Caso B

Pregunta:

- "que productos me conviene promocionar en la web"

Debe responder:

- shortlist
- criterio
- advertencia por stock si aplica

### Caso C

Pregunta:

- "si saco el catalogo, con que empiezo"

Debe responder:

- secuencia
- cantidad inicial razonable
- no intentar publicar todo

---

## 6. Scorecards recomendados

Cada family debe tener score de:

- `intent_accuracy`
- `dataset_fitness`
- `answer_completeness`
- `answer_relevance`
- `ui_contract_fitness`
- `fallback_rate`
- `user_helpfulness`

---

## 7. Thresholds minimos

Antes de considerar este programa cerrado:

- `intent_accuracy >= 92%` en families principales
- `answer_completeness >= 97%`
- `visible_truncated_answers = 0`
- `ui_contract_fitness >= 95%`
- `fallback_rate` controlado por family
- `user_helpfulness >= 80%` en preguntas frecuentes

---

## 8. Telemetria obligatoria

Cada corrida de `ask` debe registrar:

- question_text_normalized
- detected_family
- detected_sub_intent
- selected_playbook
- datasets_used
- output_guard_result
- fallback_used
- render_contract
- user_feedback

---

## 9. Gates de salida

No se habilita como "cerrado" hasta cumplir:

### Gate 1 - Tecnico

- no hay respuestas cortadas visibles
- suites pasan
- contracts renderizan bien

### Gate 2 - Producto

- la pregunta se entiende y la respuesta ayuda
- `Preguntar` ya no se siente tosco

### Gate 3 - Negocio

- preguntas frecuentes de negocio se resuelven con forma util
- catalogo, caja, stock, clientes y prioridades tienen calidad estable

---

## 10. Roadmap sugerido de aplicacion

1. congelar intent families y playbooks
2. construir output QA
3. rehacer `ask` contracts
4. agregar replay suites
5. medir feedback real
6. subir thresholds

---

## 11. Criterio de salida

Este programa se considera bien documentado y listo para bajar a codigo cuando:

- ya existe una definicion de calidad concreta
- ya no se discute "si se siente bien" sin metricas
- los casos frecuentes del negocio tienen suite propia
- el equipo sabe exactamente que significa "respuesta aceptable"

