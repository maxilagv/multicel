# PLAN MAESTRO DE IMPLEMENTACION - FASE 10 - MOTOR AGENTE OPERATIVO

**Fecha de creacion:** 2026-04-20  
**Estado:** Plan maestro de aplicacion  
**Objetivo:** convertir el blueprint del documento `10-motor-agente-operativo.md` en una implementacion real, rigurosa y superior a lo esperable, sin dejar huecos de arquitectura, producto, datos, politica ni operacion.

---

## 1. Proposito de este documento

La carpeta `implementacion de fase 10` existe para bajar el documento `10-motor-agente-operativo.md` a una ejecucion concreta.

Este documento no repite la vision general.  
Este documento define:

- que se implementa primero
- que se implementa despues
- sobre que archivos y modulos
- con que entregables
- con que validaciones
- con que riesgos controlados
- con que criterio se considera completada la fase

El objetivo no es "sumar mas IA".  
El objetivo es consolidar el motor del agente como una capa central, precisa, auditable y gobernada.

### Documentos complementarios de esta carpeta

Este plan maestro se ejecuta junto con:

- `01-backend-runtime-y-sesiones.md`
- `02-lanes-contratos-y-superficies.md`
- `03-datos-policy-y-ejecucion.md`
- `04-frontend-ultra-simple-y-bridge.md`
- `05-rollout-validacion-y-checklist.md`

---

## 2. Que significa exactamente "aplicar la fase 10"

Aplicar la fase 10 significa llevar a codigo y operacion real estas decisiones:

- existe un motor central del agente
- existe lifecycle formal de run y sesion
- existe ruteo deterministico por carril
- existe contrato uniforme entre backend y frontend
- existe separacion formal entre analisis, propuesta y ejecucion
- existe memoria operativa util, no improvisada
- existe surface model coherente para respuestas, prioridades y detalle
- existe politica coercitiva sobre todo lo accionable
- existe observabilidad de punta a punta

### Importante

La fase 10 no se considera aplicada si solo:

- se retoca el frontend
- se mejora el prompt
- se agregan endpoints
- se embellece la pantalla actual
- se cambia de modelo LLM

Eso puede mejorar la percepcion, pero no implementa el motor.

---

## 3. Objetivo final de la fase

Al terminar la fase 10, KaisenRP debe tener:

- un runtime de agente unificado
- una sesion de agente visible y trazable
- surfaces dirigidas por contratos
- un catalogo de lanes internos consistente
- un control plane sobre los flujos IA existentes
- una base lista para que la fase de producto consolidado se monte arriba sin rehacer backend

En terminos practicos:

el sistema debe dejar de ser una suma de features IA y pasar a comportarse como un motor coherente.

---

## 4. Estado actual sobre el que se apoya esta fase

La implementacion debe partir del sistema real existente, no de una arquitectura idealizada.

### 4.1 Piezas actuales aprovechables

Backend ya tiene una base importante:

- `backend/server/routes/airoutes.js`
- `backend/server/routes/chatroutes.js`
- `backend/server/routes/internalroutes.js`
- `backend/server/services/aiWorkspaceService.js`
- `backend/server/services/executiveAssistantService.js`
- `backend/server/services/aiPolicyEngineService.js`
- `backend/server/services/aiAutomationSyncService.js`
- `backend/server/services/aiWorkspaceScheduler.js`
- `backend/database/migrations_mysql/V34__ai_enterprise_foundation.sql`

Frontend ya tiene superficies que pueden migrarse:

- `frontend-react/src/pages/AsistenteNegocio.tsx`
- `frontend-react/src/pages/PrioridadesNegocio.tsx`
- `frontend-react/src/pages/Predicciones.tsx`
- `frontend-react/src/components/ChatWidget.tsx`
- `frontend-react/src/layout/navigationConfig.ts`
- `frontend-react/src/layout/Layout.tsx`

### 4.2 Problemas actuales que la fase 10 debe resolver

- runtime IA partido entre carril enterprise y chat legacy
- ausencia de sesion central del agente
- contracts heterogeneos entre experiencias
- respuestas estructuradas en unos carriles y no en otros
- duplicacion de identidad del producto IA
- persistencia de ejecucion pero no de sesion conversacional/utilitaria unificada
- falta de un modelo formal de lane routing
- surfaces no controladas por contratos comunes

---

## 5. Principios de implementacion

Toda decision de esta fase debe respetar estos principios.

### 5.1 Reusar antes de reescribir

No conviene tirar la base enterprise ya creada.  
Conviene encapsularla y convertirla en el nucleo del motor.

### 5.2 Centralizar antes de expandir

Antes de crear nuevas capacidades:

- centralizar runtime
- centralizar contratos
- centralizar politica
- centralizar sesion

### 5.3 Tipificar antes de automatizar

Nada nuevo debe ejecutar acciones sin:

- lane definido
- action type definido
- riesgo definido
- policy definida

### 5.4 Hacer visible la trazabilidad

Si no se puede entender despues:

- que paso
- por que paso
- con que datos
- quien lo pidio
- que produjo

entonces no esta suficientemente implementado.

### 5.5 Preservar lenguaje de negocio en salida

El motor puede ser complejo por dentro.  
Su contrato visible no puede volverse tecnico por accidente.

### 5.6 Facilidad extrema en frontend

La fase 10 debe construirse con una restriccion de producto permanente:

el frontend del agente tiene que ser extremadamente facil de usar, aunque el motor interno sea muy potente.

Eso obliga a que toda decision tecnica respete:

- una entrada principal unica
- una jerarquia visual obvia
- muy pocos pasos para entender y actuar
- contratos que permitan renderizar vistas claras
- minimo texto necesario
- minima necesidad de escribir prompts complejos

La potencia no debe expresarse como mas controles visibles.  
Debe expresarse como mejores respuestas, mejor priorizacion y mejores acciones.

---

## 6. Alcance exacto de la fase 10

### 6.1 Incluye

- runtime central del agente
- session model del agente
- run envelope canonico
- lane router
- registry de tools y datasets
- memory stack minima
- surface contracts canonicos
- control plane de propuestas y ejecuciones
- integracion con policy engine
- integracion con observabilidad
- capa de compatibilidad para migrar frontend actual

### 6.2 No incluye como cierre final

- rediseño visual completo del producto final
- expansion a nuevos canales externos
- autonomia amplia
- memoria larga sofisticada de aprendizaje automatico
- agente multiusuario avanzado con collaboration branching de alto nivel

Esos puntos podran apoyarse sobre esta fase, pero no son condicion para cerrarla.

---

## 7. Resultado esperado por capas

### 7.1 Capa runtime

Debe existir un `Agent Runtime` que reciba una entrada, cree o retome sesion, resuelva lane, arme contexto, invoque al carril correcto, normalice la salida y registre todo.

### 7.2 Capa sesion

Debe existir una entidad de sesion del agente para continuidad operativa.

### 7.3 Capa contracts

Toda salida relevante debe convertirse a un envelope uniforme.

### 7.4 Capa policy

Todo lo accionable debe evaluarse contra politica antes de exponerse como ejecutable.

### 7.5 Capa compatibility

El sistema actual debe seguir funcionando mientras se migra.

---

## 8. Streams oficiales de trabajo

La fase 10 debe ejecutarse en nueve streams sincronizados.

### Stream 1 - Runtime central

Objetivo:

crear el nucleo de orquestacion del agente.

Incluye:

- `agentRuntimeService`
- estado de run canonico
- correlacion entre request, run, steps y outputs
- politica de fallbacks

### Stream 2 - Session model

Objetivo:

crear continuidad de contexto entre interacciones del mismo usuario sobre el agente.

Incluye:

- session id
- conversation id
- session summary
- ultima surface activa
- ultimo objective o intent

### Stream 3 - Lane router

Objetivo:

decidir a que carril va cada entrada del agente.

Lanes iniciales recomendados:

- `executive_overview`
- `daily_priorities`
- `predictive_analysis`
- `action_review`
- `free_question_grounded`

### Stream 4 - Data and tools registry

Objetivo:

tipificar acceso a datos y herramientas para que el runtime no dependa de llamadas ad hoc.

Incluye:

- registry de datasets
- scopes
- freshness
- timeouts
- degradacion

### Stream 5 - Surface contracts

Objetivo:

lograr que frontend y backend hablen un idioma comun del agente.

Incluye:

- `hero_summary`
- `focus_cards`
- `action_list`
- `evidence_block`
- `detail_panel`
- `approval_panel`
- `execution_status`

### Stream 6 - Policy and execution

Objetivo:

asegurar que toda accion accionable quede bajo gobierno.

Incluye:

- integracion formal con `aiPolicyEngineService`
- action contracts tipificados
- criterios de aprobacion
- locks contra duplicidad

### Stream 7 - Observability

Objetivo:

hacer visible el funcionamiento real del motor.

Incluye:

- logs estructurados
- metricas por lane
- latencias
- fallbacks
- degradaciones

### Stream 8 - Compatibility and migration

Objetivo:

migrar sin romper las experiencias IA ya existentes.

Incluye:

- wrappers de compatibilidad
- endpoints puente
- feature flags
- convivencia temporal con chat legacy

### Stream 9 - Verification and release gates

Objetivo:

cerrar la fase con criterios verificables, no por sensacion.

Incluye:

- pruebas unitarias
- pruebas de integracion
- replay de casos
- checklist de salida

---

## 9. Orden oficial de implementacion

El orden importa.  
Si se altera, el riesgo de rehacer trabajo aumenta mucho.

### Etapa 1 - Congelamiento de contratos base

Primero se deben definir y fijar:

- run envelope
- session envelope
- lane catalog
- surface contract base
- status machine

**Salida obligatoria**

Un documento tecnico interno y tipos/contratos canonicos listos para ser implementados.

### Etapa 2 - Nucleo runtime

Despues se construye el runtime central.

Debe poder:

- recibir una entrada
- abrir run
- cargar o crear sesion
- decidir lane
- invocar handler
- normalizar salida
- persistir steps y summary

### Etapa 3 - Integracion con carriles existentes

Una vez exista runtime:

- `executiveAssistantService` se integra como lane
- `aiWorkspaceService` se integra como lane
- predicciones y detalle analitico se integran como lane
- `chatService` pasa a modo compatibilidad o se encapsula

### Etapa 4 - Session y memory minima

Cuando el runtime ya existe:

- agregar session persistence
- agregar compaction corta
- agregar resumen de ultima interaccion
- agregar restoration de objective y filters recientes

### Etapa 5 - Surface contracts y bridge frontend

Con el backend ya estable:

- mapear surfaces a contratos renderizables
- adaptar frontend actual a esos contratos
- evitar parsing libre de textos

### Etapa 6 - Policy profunda y ejecucion

Recien cuando el runtime y surfaces estan consolidados:

- reforzar evaluacion de acciones
- endurecer aprobaciones
- bloquear ejecuciones ambiguas
- tipificar outputs ejecutables

### Etapa 7 - Observabilidad y gates de salida

Al final:

- dashboards de salud
- alertas
- pruebas
- checklist de salida

---

## 10. Modulos nuevos recomendados

Para que la implementacion quede limpia, la fase 10 deberia introducir estos modulos nuevos en backend.

### 10.1 Runtime

Archivos sugeridos:

- `backend/server/services/agentRuntimeService.js`
- `backend/server/services/agentSessionService.js`
- `backend/server/services/agentLaneRouterService.js`
- `backend/server/services/agentSurfaceContractService.js`
- `backend/server/services/agentContextBuilderService.js`

### 10.2 Contracts

Archivos sugeridos:

- `backend/server/services/agentContracts.js`
- `backend/server/services/agentSurfaceSchemas.js`
- `backend/server/services/agentStatusMachine.js`

### 10.3 Persistence

Archivos sugeridos:

- `backend/server/db/repositories/agentSessionRepository.js`
- `backend/server/db/repositories/agentRunRepository.js`

Si conviene mantenerlos dentro del runtime repo actual, se debe respetar una separacion formal equivalente.

### 10.4 API

Rutas sugeridas:

- `POST /api/ai/agent/run`
- `GET /api/ai/agent/session/:id`
- `POST /api/ai/agent/session/:id/continue`
- `GET /api/ai/agent/runs/:id`

Esto no obliga a romper endpoints actuales inmediatamente.  
Puede convivir con adaptadores temporales.

---

## 11. Cambios requeridos sobre modulos existentes

### 11.1 `airoutes.js`

Debe dejar de ser solo una coleccion de endpoints de features y pasar a convivir con el entrypoint del agente.

### 11.2 `chatroutes.js`

Debe pasar a uno de estos estados:

- compatibilidad temporal
- wrapper al runtime central
- retiro progresivo

No debe seguir siendo una segunda arquitectura IA paralela.

### 11.3 `executiveAssistantService.js`

Debe dejar de actuar como experiencia aislada y convertirse en lane del runtime.

### 11.4 `aiWorkspaceService.js`

Debe exponer prioridad y accion como surfaces/outputs del runtime, no como universo separado.

### 11.5 `aiPolicyEngineService.js`

Debe mantenerse como motor de coercion para acciones, pero conectado al nuevo envelope del agente.

### 11.6 `aiWorkspaceScheduler.js`

Debe seguir existiendo, pero su salida tiene que integrarse con el runtime, no quedar lateral al modelo de sesion y run.

---

## 12. Persistencia nueva necesaria

La V34 cubre corridas, steps, propuestas, ejecuciones y feedback.  
Para la fase 10 todavia falta persistencia de sesion del agente.

### 12.1 Nuevas entidades recomendadas

#### `agent_sessions`

Debe guardar:

- id
- usuario solicitante
- estado
- lane actual o principal
- objective actual
- summary compacto
- ultima surface
- scope snapshot
- metadata de filtros recientes
- started_at
- last_activity_at
- closed_at

#### `agent_session_messages` o equivalente

Debe guardar:

- session_id
- role
- message_type
- input_json
- output_json
- run_id asociado
- created_at

#### `agent_session_memory` o equivalente simplificado

Debe guardar:

- session_id
- memory_key
- memory_value_json
- freshness
- updated_at

### 12.2 Regla de persistencia

No guardar "todo el chat" por costumbre.  
Guardar solo lo que aporte continuidad operativa y auditabilidad.

---

## 13. Modelo de sesion minimo viable

La sesion del agente debe responder estas preguntas:

- quien esta trabajando
- sobre que foco
- en que lane estaba
- cual fue la ultima respuesta relevante
- que acciones quedaron abiertas
- que filtros o periodo estaban activos

### 13.1 Memoria minima que si conviene

- ultimo objetivo
- ultimo periodo consultado
- entidad o categoria recientemente analizada
- propuestas abiertas relacionadas
- ultima surface usada
- resumen corto de contexto

### 13.2 Memoria que no conviene aun

- historico conversacional infinito
- aprendizaje libre del usuario sin control
- preferencias ambiguas o inferidas debilmente

---

## 14. Lane router detallado

El router debe ser una pieza explicita, no una intuicion repartida entre prompts.

### 14.1 Inputs del router

- tipo de entrada
- question/preset
- session objective actual
- surface desde la que se dispara
- payload estructurado

### 14.2 Salida del router

Debe decidir:

- lane
- confidence de ruteo
- si requiere aclaracion
- si debe abrir detail o accion

### 14.3 Primer catalogo de lanes

#### `executive_overview`

Para:

- panorama general
- caja
- foco del negocio
- lectura ejecutiva

#### `daily_priorities`

Para:

- lista de temas abiertos
- acciones pendientes
- estado de propuestas y aprobaciones

#### `predictive_analysis`

Para:

- forecast
- faltantes
- anomalias
- precios
- drilldowns analiticos

#### `action_review`

Para:

- pedir aprobacion
- ejecutar
- descartar
- reprogramar

#### `free_question_grounded`

Para:

- preguntas libres, pero solo si pueden responderse con dato de negocio y contratos del agente

---

## 15. Surface contracts minimos

La fase 10 no puede cerrarse sin contracts claros.

### 15.1 Envelope base de respuesta

Toda respuesta relevante del runtime debe incluir como minimo:

- `run`
- `session`
- `lane`
- `response`
- `surfaces`
- `actions`
- `evidence`
- `meta`

### 15.2 Surface `hero_summary`

Debe incluir:

- titulo
- estado general
- mensaje corto
- horizonte temporal
- nivel de confianza

### 15.3 Surface `focus_cards`

Debe incluir lista de tarjetas con:

- titulo
- tono
- resumen
- por que importa
- proximo paso
- impacto esperado

### 15.4 Surface `action_list`

Debe incluir:

- acciones propuestas
- risk level
- requires approval
- status
- action type

### 15.5 Surface `evidence_block`

Debe incluir:

- metricas
- rango temporal
- fuente o dataset
- freshness

### 15.6 Surface `detail_panel`

Debe incluir:

- tipo de detalle
- chart/table payload
- summary contextual
- acciones derivadas posibles

### 15.7 Surface `approval_panel`

Debe incluir:

- accion
- justificacion
- riesgo
- impacto esperado
- evidencia
- operador
- resultado esperado

---

## 16. Integracion con frontend actual

La fase 10 debe dejar listo un bridge ordenado hacia frontend.

### 16.1 Objetivo real

No rehacer todas las pantallas de golpe.  
Primero crear un contrato central para que luego el frontend pueda consolidarse sin depender de endpoints sueltos.

Pero esa consolidacion tiene una condicion no negociable:

- la experiencia final debe ser mucho mas facil que la actual
- no se puede trasladar complejidad del runtime a la UI
- no se puede exigir al usuario entender lanes, states internos o tecnicismos

### 16.2 Adaptaciones esperadas

#### `AsistenteNegocio.tsx`

Debe empezar a consumir el runtime del agente, no un carril aislado.

#### `PrioridadesNegocio.tsx`

Debe pasar a consumir `action_list`, `approval_panel` y `execution_status` del runtime.

#### `Predicciones.tsx`

Debe pasar a comportarse como surface `detail_panel` del lane `predictive_analysis`.

#### `ChatWidget.tsx`

Debe dejar de hablar con un backend paralelo y pasar a ser:

- acceso rapido al mismo runtime
- o compatibilidad temporal degradada

### 16.3 Regla de migracion visual

No mezclar migracion de runtime con rediseño estetico grande.  
Primero estabilizar contrato y comportamiento.

### 16.4 Criterios UX minimos de la fase 10

Aunque el rediseño visual completo pertenezca a una fase posterior, esta fase ya debe dejar asegurado que:

- el agente tiene un punto de entrada obvio
- la vista inicial responde "que pasa y que hago"
- el usuario puede actuar desde la primera pantalla
- las preguntas frecuentes se resuelven con presets o follow-ups guiados
- el detalle profundo queda detras de una accion de profundizacion y no expuesto de entrada
- el sistema se siente mas facil a medida que gana potencia, no al reves

---

## 17. Politica, acciones y coercion

La fase 10 debe endurecer la frontera entre lo que el agente entiende y lo que el agente puede hacer.

### 17.1 Regla principal

Toda accion debe estar tipificada.

### 17.2 Campos obligatorios de toda accion

- `action_type`
- `risk_level`
- `requires_approval`
- `can_execute`
- `blocked_reasons`
- `execution_channel`
- `related_proposal_id`

### 17.3 Casos que deben bloquearse por defecto

- falta de evidencia suficiente
- session inconsistente
- policy no satisfecha
- entidad en cooldown
- fuera de horario
- alta sensibilidad comercial
- ambiguedad de destino o canal

---

## 18. Observabilidad que debe implementarse dentro de esta fase

La fase 10 no se debe dejar para "despues monitoreamos".  
Tiene que salir con observabilidad.

### 18.1 Logs estructurados obligatorios

- `run_started`
- `session_loaded`
- `lane_selected`
- `datasets_loaded`
- `fallback_used`
- `surface_built`
- `action_blocked`
- `action_ready`
- `run_completed`
- `run_failed`

### 18.2 Metricas minimas

- runs por lane
- latencia total por lane
- latencia por paso
- error rate por lane
- porcentaje de degradacion
- porcentaje de fallback
- porcentaje de surfaces incompletas
- acciones bloqueadas vs habilitadas

### 18.3 Alertas

- incremento de `run_failed`
- caida de gateway interno
- explosión de latencia
- crecimiento anormal de bloqueos por policy
- surfaces construidas sin evidencia suficiente

---

## 19. Testing obligatorio

Esta fase necesita pruebas de verdad.

### 19.1 Unit tests

Debe cubrir:

- router
- status machine
- surface builders
- policy mapping
- session summarization
- fallback rules

### 19.2 Integration tests

Debe cubrir:

- run completo por lane
- reanudacion de sesion
- integracion con `aiWorkspaceService`
- integracion con `executiveAssistantService`
- integracion con gateway interno
- bloqueo de acciones

### 19.3 Regression tests

Debe garantizar que:

- el carril actual de prioridades no se rompe
- el resumen ejecutivo no pierde funcionalidad
- el detalle predictivo sigue accesible
- la capa de compatibilidad del chat no rompe el sistema existente

### 19.4 Replay tests

Debe existir un set de casos reales o sinteticos para probar:

- overview
- caja
- cliente a recuperar
- riesgo de stock
- accion que requiere aprobacion

---

## 20. Feature flags y migracion segura

No conviene soltar el nuevo motor de una vez sin red.

### 20.1 Flags recomendados

- `AI_AGENT_RUNTIME_ENABLED`
- `AI_AGENT_SESSION_ENABLED`
- `AI_AGENT_SURFACES_ENABLED`
- `AI_AGENT_CHAT_BRIDGE_ENABLED`
- `AI_AGENT_ACTION_GATES_STRICT`

### 20.2 Estrategia de rollout

#### Fase A

runtime nuevo activo en shadow mode, sin frontend nuevo.

#### Fase B

una sola surface conecta al runtime nuevo.

#### Fase C

prioridades y asistente pasan al runtime nuevo.

#### Fase D

predicciones se integran como lane de detalle.

#### Fase E

chat legacy queda en compatibilidad o se retira.

---

## 21. Riesgos mayores y su mitigacion

### Riesgo 1 - Crear otra capa mas sin desactivar fragmentacion

Mitigacion:

- prohibir nuevos endpoints IA aislados durante esta fase
- hacer que todo pase por runtime central

### Riesgo 2 - Intentar resolver todo con prompt engineering

Mitigacion:

- contratos estrictos
- router explicito
- surfaces tipificadas

### Riesgo 3 - Romper frontend actual durante la migracion

Mitigacion:

- compatibilidad temporal
- flags
- adaptadores

### Riesgo 4 - Agregar memoria excesiva y poco gobernada

Mitigacion:

- memoria minima
- session summary corto
- datos operativos puntuales

### Riesgo 5 - Exponer acciones sin coercion suficiente

Mitigacion:

- politica conectada al envelope del runtime
- bloqueo por defecto cuando falte claridad

---

## 22. Entregables exactos de la fase

La fase 10 deberia cerrar con estos entregables concretos.

### Backend

- runtime central implementado
- router implementado
- contracts implementados
- surface builders implementados
- session persistence minima implementada
- integracion de lanes actuales implementada
- feature flags implementadas
- logs y metricas base implementadas

### Base de datos

- migracion nueva para sesiones del agente
- indices adecuados para sesiones y mensajes

### Frontend

- al menos una surface consumiendo el runtime nuevo
- bridge definido para las demas surfaces
- criterios UX de facilidad extrema fijados y convertidos en contratos consumibles

### Documentacion

- contrato del runtime
- contrato de surfaces
- tabla de lanes
- tabla de estados
- runbook de rollout

### Validacion

- tests unitarios
- tests de integracion
- replay minimo
- checklist de salida firmado

---

## 23. Checklist de salida de fase

La fase 10 solo puede marcarse como aplicada si todo esto da verdadero.

- existe entrypoint central del agente
- existe runtime service
- existe lane router explicito
- existe session model persistido
- existe response envelope uniforme
- existen surface contracts comunes
- los carriles actuales ya pueden correr via runtime
- el chat legacy ya no es una arquitectura paralela sin control
- toda accion pasa por policy y action contracts
- existen logs y metricas del motor
- existen tests de router, runtime y surfaces
- existe estrategia de rollout con flags
- el runtime nuevo deja al frontend mas simple, no mas complejo
- la vista principal del agente puede entenderse y usarse sin aprendizaje tecnico

Si uno de estos puntos falta, la fase no esta cerrada.

---

## 24. Secuencia recomendada de ejecucion real

Para implementarla mejor de lo esperado, la secuencia concreta recomendada es:

1. definir contracts y status machine
2. crear runtime service y router
3. crear persistencia de sesion
4. integrar executive overview
5. integrar daily priorities
6. integrar predictive analysis
7. integrar action review
8. crear bridge de frontend
9. activar observabilidad y flags
10. correr replay y regression suite
11. habilitar rollout progresivo

---

## 25. Criterio final de excelencia

La fase 10 no debe aspirar solo a "funcionar".

Debe aspirar a esto:

- el backend IA queda ordenado alrededor de un solo motor
- el frontend deja de depender de piezas inconexas
- la politica deja de ser un accesorio y pasa a ser parte estructural
- la observabilidad permite confiar en lo que ocurre
- la siguiente fase de producto puede construirse sin rehacer el core

Si eso se logra, KaisenRP no solo queda mejor que antes.  
Queda mejor posicionado de lo esperable para evolucionar hacia un verdadero agente enterprise de negocio.
