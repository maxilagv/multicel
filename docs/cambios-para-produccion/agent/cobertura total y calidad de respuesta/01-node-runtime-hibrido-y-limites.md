# NODE, RUNTIME HIBRIDO Y LIMITES REALES

**Fecha:** 2026-04-20  
**Estado:** Decision arquitectonica  
**Objetivo:** responder formalmente si este agente puede quedar excelente con Node y dejar claro que debe vivir en Node, que no, y donde si conviene usar componentes auxiliares.

---

## 1. Respuesta corta

Si.

Se puede construir un agente excelente con Node.

Node no bloquea:

- orquestacion
- sesiones
- policy
- playbooks
- data gateway
- contratos
- output QA
- streaming
- surfaces web
- evaluacion

Lo que no conviene hacer es confundir:

- "runtime del agente"

con

- "motor numerico especializado"

Node puede ser el control plane principal.

No hace falta abandonarlo para lograr un agente de negocio serio.

---

## 2. Que debe vivir en Node

Node es ideal para:

### 2.1 Runtime central del agente

Responsable de:

- recibir el input
- clasificar la intencion
- manejar sesiones
- resolver playbooks
- coordinar datasets
- disparar guards
- construir envelopes

### 2.2 Policy y gobierno

Responsable de:

- permisos
- aprobaciones
- action contracts
- idempotencia
- limites operativos
- shadow mode
- kill switches

### 2.3 Data gateway del negocio

Responsable de:

- exponer datasets internos
- respetar permisos
- devolver datos canonicos
- consolidar fuentes heterogeneas

### 2.4 Output QA

Responsable de:

- detectar respuestas flojas
- detectar respuestas cortadas
- validar estructura
- decidir fallback

### 2.5 Frontend contracts

Responsable de:

- definir shapes de salida
- mantener surfaces consistentes
- evitar que el frontend tenga que "entender IA"

### 2.6 Evaluacion online

Responsable de:

- replay suite ligera
- scorecards
- telemetry
- feedback persistido

---

## 3. Que no conviene meter como logica ad hoc en Node

Node no es malo para esto.

Pero no conviene resolverlo como codigo desordenado dentro del runtime:

### 3.1 Forecasting numerico pesado

Ejemplos:

- series temporales avanzadas
- modelos estadisticos complejos
- scoring numerico especializado

Eso puede vivir en:

- Python
- servicio separado
- jobs batch

### 3.2 Batch evaluation pesado

Ejemplos:

- miles de replays
- comparadores offline
- ranking de variantes

### 3.3 Pipelines de embeddings o retrieval pesados

Si el agente llegara a necesitar:

- indices vectoriales grandes
- ranking semantico complejo
- reingesta de corpus muy grande

ahi si puede convenir:

- servicio auxiliar
- worker especializado

---

## 4. Decision correcta para KaisenRP

La arquitectura recomendada es:

```text
React
  -> Node runtime principal
     -> MySQL
     -> Redis
     -> APIs LLM
     -> servicios internos de negocio
     -> workers especializados opcionales
```

Node debe seguir siendo:

- el cerebro operacional
- el punto de control
- el punto de contrato
- el punto de seguridad

Python o cualquier worker externo debe ser:

- herramienta especializada
- nunca superficie principal
- nunca runtime rector

---

## 5. Lo que hoy falla no es por Node

Los defectos observados no son:

- latencia propia de Node
- limitacion de concurrencia del runtime
- imposibilidad de hablar con LLMs

Los defectos observados son de capa de producto y respuesta:

- taxonomia insuficiente de intenciones
- reuse excesivo del `overview`
- falta de playbooks
- falta de output QA duro
- surfaces que todavia mezclan demasiadas cosas

Esto es importante.

Porque evita tomar una mala decision:

- migrar de runtime por frustracion cuando el problema real es de arquitectura funcional

---

## 6. Runtime hibrido recomendado

### 6.1 Node como control plane oficial

Modulos recomendados:

- `agentIntentResolverService`
- `agentPlaybookRegistryService`
- `agentQuestionPlannerService`
- `agentResponseGuardService`
- `agentAnswerRendererService`
- `agentEvaluationScoreService`

### 6.2 Workers especializados solo donde sumen

Opcionales:

- forecast worker
- ranking comercial offline
- catalog curation assistant offline
- replay worker por lotes

### 6.3 Regla no negociable

Aunque exista un worker externo:

- la sesion vive en Node
- la policy vive en Node
- la decision visible vive en Node
- la respuesta final al frontend sale por Node

---

## 7. Anti-patrones a evitar

### 7.1 Un solo prompt universal

Eso produce:

- respuestas genericas
- poca cobertura real
- comportamiento impredecible

### 7.2 Meter demasiada inteligencia en el frontend

Eso produce:

- duplicacion de logica
- contratos debiles
- UI confusa

### 7.3 Responder todo con el mismo renderer

Eso produce:

- toscas
- dashboards reciclados
- perdida de precision percibida

### 7.4 Usar el LLM como unica capa de calidad

Eso produce:

- frases cortadas
- respuestas vagas
- alucinaciones suaves

---

## 8. Decision formal

Para este proyecto la decision recomendada es:

- mantener Node como runtime central del agente
- agregar una capa de playbooks e intent families
- agregar una capa de output QA dura
- usar workers auxiliares solo para calculo especializado u offline

---

## 9. Criterio de salida

Este documento se considera absorbido en arquitectura cuando:

- no se discute mas "si Node alcanza"
- esta claro que Node es el control plane oficial
- esta definido que modulos nuevos deben entrar al runtime
- cualquier worker adicional queda subordinado al runtime y no al reves

