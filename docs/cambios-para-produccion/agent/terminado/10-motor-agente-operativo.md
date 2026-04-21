# MOTOR AGENTE OPERATIVO - KAISENRP

**Fecha de creacion:** 2026-04-19  
**Estado:** Blueprint operativo detallado  
**Objetivo:** definir como debe funcionar el motor del agente de KaisenRP en runtime, sin ambiguedades, sin magia y sin depender de interpretaciones informales.

---

## 1. Proposito de este documento

Los documentos `08` y `09` ya dejaron clara la vision y la arquitectura general. Lo que faltaba era bajar eso a un plano operativo exhaustivo:

- que es exactamente "el agente"
- por donde entra trabajo
- como se arma contexto
- que memoria existe y cual no
- como se rutearon dominios
- que contratos produce cada corrida
- como pasa de analisis a accion
- donde termina la IA y donde vuelve a gobernar el backend

Este documento existe para eso.

No es un documento de ideas. Es un documento de operacion.

---

## 2. Referencias externas base

Este blueprint toma patrones de implementacion reales de OpenClaw y Pi, pero adaptados al contexto de KaisenRP.

**Fuentes externas oficiales consultadas el 2026-04-19**

- OpenClaw README: <https://github.com/openclaw/openclaw>
- OpenClaw Pi Integration Architecture: <https://docs.openclaw.ai/pi>
- OpenClaw Channel Routing: <https://docs.openclaw.ai/channels/channel-routing>
- OpenClaw Groups: <https://docs.openclaw.ai/channels/groups>
- OpenClaw Exec Approvals: <https://docs.openclaw.ai/cli/approvals>
- OpenClaw Canvas / A2UI: <https://docs.openclaw.ai/platforms/mac/canvas>
- Pi coding agent README: <https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md>
- Pi compaction: <https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md>

**Patrones que si adoptamos**

- control plane central
- session lifecycle formal
- tool injection controlado
- session persistence
- branching y compaction
- surfaces visuales dirigidas por contratos
- ruteo deterministico
- aprobaciones y sandboxing como mecanismo coercitivo

**Patrones que no copiamos tal cual**

- modelo de asistente personal single-user
- superficie de herramientas demasiado abierta
- skills de terceros con acceso amplio por defecto
- ejecucion local libre sin gobierno de negocio
- prompts con capacidad lateral sin aprobacion empresarial

KaisenRP no esta construyendo un asistente personal. Esta construyendo un motor de inteligencia operativa para negocio.

---

## 3. Decision de producto oficial

KaisenRP debe tener **un solo agente de negocio** con multiples carriles de trabajo, no varios modulos IA sin centro.

Eso significa:

- una sola identidad conceptual para el usuario
- una sola capa de gobierno
- una sola memoria de negocio coherente
- multiples superficies para distintas tareas
- multiples agentes internos por dominio, pero invisibles para el usuario final

### Traduccion practica

Para negocio existe:

- el agente del negocio

Internamente existen:

- router
- agentes por dominio
- motores deterministas
- explicador
- policy engine
- executor controlado

El usuario no debe tener que decidir si usa:

- "chat"
- "predicciones"
- "workspace"
- "motor"
- "llm"
- "crm ia"

El usuario solo debe decidir:

- que necesita entender
- que necesita resolver
- que accion quiere revisar o ejecutar

---

## 4. Definicion oficial del motor

El motor del agente es la combinacion de:

1. un **control plane** en Node.js
2. un **runtime de analisis y orquestacion** en `ai-python`
3. una **capa de datos gobernada** expuesta por el backend
4. una **capa de propuestas y ejecuciones** persistida en base
5. una **capa de surfaces** en React para explicacion y decision
6. una **capa de automatizacion** limitada a contratos aprobados

### Regla de producto

El motor nunca se define por el modelo LLM.

El motor se define por:

- sus contratos
- su memoria
- su routing
- sus politicas
- su evidencia
- su capacidad de accion segura

El LLM es solo un subcomponente.

---

## 5. Topologia operativa oficial

```text
Usuario / trigger / canal / scheduler
        |
        v
React surfaces o channel ingress
        |
        v
Node.js Business Control Plane
  - auth
  - scope
  - feature gates
  - data gateway
  - run registry
  - approvals
  - action contracts
        |
        +----------------------+
        |                      |
        v                      v
AI Runtime (ai-python)         Persistence + policy
  - routing                    - ai_runs
  - deterministic engines      - ai_action_proposals
  - domain agents              - ai_action_executions
  - summarization              - approvals
  - memory assembly            - automation_events
        |                      |
        +----------+-----------+
                   |
                   v
Execution layer
  - dispatcher
  - n8n
  - WhatsApp / email / task
  - status sync
```

### Roles por capa

**React**

- renderiza surfaces entendibles
- no toma decisiones de negocio
- no interpreta reglas de aprobacion
- no compone datasets

**Node.js**

- es la fuente de verdad operativa
- controla identidad, permisos y scope
- expone datasets seguros
- persiste corridas y propuestas
- arbitra aprobaciones y ejecuciones

**ai-python**

- resuelve routing interno
- ejecuta analisis
- arma hallazgos
- sugiere respuestas estructuradas
- nunca ejecuta acciones sensibles por si solo

**n8n y dispatcher**

- ejecutan contratos ya aprobados
- informan estados
- no inventan destinatarios
- no recalculan scoring

---

## 6. Entradas oficiales al motor

El agente debe aceptar solo entradas tipadas. Nada de "disparamos IA" sin clasificar.

### 6.1 Entrada por pregunta de usuario

Origenes:

- `/app/agente`
- tarjetas de resumen ejecutivo
- CTA "explicame esto"
- follow-up desde una propuesta

Contrato minimo:

```json
{
  "entry_type": "user_request",
  "surface": "web_app",
  "intent_hint": "overview|cash|clients|stock|custom",
  "question": "Que deberia atender hoy?",
  "requested_by_user_id": 17,
  "company_id": 1,
  "branch_id": 3,
  "session_key": "web:user:17:main",
  "dry_run": true
}
```

### 6.2 Entrada por scheduler

Origenes:

- refresh diario de prioridades
- recalculo nocturno de salud del negocio
- scoring comercial programado
- control de ejecuciones pendientes

Contrato minimo:

```json
{
  "entry_type": "scheduled_run",
  "objective": "prioridades_del_negocio",
  "requested_by_user_id": null,
  "request_source": "scheduler",
  "company_id": 1,
  "branch_id": null,
  "session_key": "system:prioridades:daily",
  "dry_run": true
}
```

### 6.3 Entrada por evento de negocio

Origenes:

- venta registrada
- saldo vencido
- producto bajo stock
- campaña finalizada
- oportunidad CRM sin actividad

Contrato minimo:

```json
{
  "entry_type": "business_event",
  "event_name": "stock_bajo_detectado",
  "entity_type": "producto",
  "entity_id": 442,
  "request_source": "event_bus",
  "company_id": 1,
  "branch_id": 2,
  "dry_run": true
}
```

### 6.4 Entrada por accion humana

Origenes:

- pedir aprobacion
- reenviar a automatizacion
- descartar
- pedir explicacion adicional
- volver a revision

Contrato minimo:

```json
{
  "entry_type": "human_action",
  "action": "request_approval",
  "proposal_id": 981,
  "requested_by_user_id": 17,
  "request_source": "web_action",
  "dry_run": false
}
```

### 6.5 Entrada futura por canal

Inspirada en OpenClaw, pero no copiada literal.

Origenes futuros:

- WhatsApp oficial
- Telegram
- email operacional
- inbox de CRM

Condicion obligatoria:

- siempre con route metadata fija
- siempre con `session_key` deterministico
- siempre con allowlists, mention rules o explicit opt-in

---

## 7. Envelope canonico de corrida

Toda corrida debe convertirse temprano en un envelope canonico.

```json
{
  "run_id": "uuid-o-id-persistente",
  "entry_type": "user_request",
  "objective": "executive_assistant",
  "request_source": "web_app",
  "company_id": 1,
  "branch_id": 3,
  "user": {
    "id": 17,
    "role": "gerente",
    "permissions": ["ai.read", "ai.approve", "clientes.read"]
  },
  "session": {
    "session_key": "web:user:17:main",
    "thread_key": "web:user:17:main:thread:cashflow",
    "surface": "agent_workspace"
  },
  "entity_scope": {
    "cliente_id": null,
    "producto_id": null,
    "campaign_id": null
  },
  "runtime": {
    "dry_run": true,
    "requires_approval": false,
    "priority": "normal",
    "deadline_ms": 15000
  }
}
```

### Reglas

- `company_id` es obligatorio
- `run_id` existe antes del trabajo pesado
- `session_key` no es opcional en interacciones conversacionales
- `request_source` siempre se guarda
- `dry_run` siempre existe aunque sea `false`
- el envelope se registra antes de invocar al runtime

---

## 8. Claves de sesion oficiales

OpenClaw demuestra que las session keys deben ser deterministicas y semanticamente utiles. KaisenRP debe adoptar ese criterio.

### 8.1 Session keys web

```text
web:user:<user_id>:main
web:user:<user_id>:agent:<surface>
web:user:<user_id>:agent:<surface>:thread:<topic>
```

Ejemplos:

```text
web:user:17:main
web:user:17:agent:overview
web:user:17:agent:thread:cash
web:user:17:agent:thread:cliente:442
```

### 8.2 Session keys por entidad

```text
entity:cliente:<id>
entity:producto:<id>
entity:cobranza:<id>
entity:campana:<id>
```

Estas no son "chats". Son buckets de memoria operacional resumida.

### 8.3 Session keys de sistema

```text
system:prioridades:daily
system:forecast:nightly
system:collections:aging
system:campaign:fatigue-control
```

### 8.4 Session keys de canal futuro

```text
channel:whatsapp:dm:<normalized_sender>
channel:whatsapp:group:<group_id>
channel:telegram:dm:<sender_id>
channel:telegram:group:<group_id>
```

### 8.5 Regla de oro

Nunca mezclar en la misma sesion:

- conversaciones humanas distintas
- scope de sucursales distintas
- grupos con DMs
- analisis de sistema con acciones de usuario

---

## 9. Modelo de memoria oficial

El motor necesita memoria por capas. No una sola bolsa de contexto.

### 9.1 Capa A - turn scratchpad

Duracion:

- solo durante un turno o corrida

Contenido:

- pasos intermedios
- resultados tecnicos
- filtros temporales
- debugging interno

Persistencia:

- no se expone a frontend
- no se usa como memoria historica
- solo puede persistirse como artifact tecnico si la corrida falla

### 9.2 Capa B - run context

Duracion:

- una corrida completa

Contenido:

- envelope canonico
- datasets usados
- agentes invocados
- findings
- decision tree
- salidas generadas

Persistencia:

- `ai_runs`
- `ai_run_steps`
- artifacts opcionales

### 9.3 Capa C - session memory

Duracion:

- conversacion o surface continua

Contenido:

- ultimas preguntas
- preferencias de nivel de detalle
- resumen de decisiones recientes
- branch summaries

Persistencia recomendada:

- tabla o storage de transcript resumido
- no solo memoria RAM

Inspiracion directa de Pi:

- branching
- compaction
- resumen al desbordar contexto

### 9.4 Capa D - entity memory

Duracion:

- mediano plazo

Contenido por entidad:

- ultimo contacto util
- ultima accion sugerida
- ultima accion ejecutada
- estado de fatiga
- issues o incidentes abiertos
- feedback sobre efectividad

Ejemplos:

- cliente 442 ya recibio reactivacion hace 3 dias
- producto 981 ya fue marcado como stock critico 2 veces esta semana
- proveedor 17 tuvo lead time peor de lo previsto en las ultimas 4 compras

### 9.5 Capa E - memory de patrones

Duracion:

- largo plazo

Contenido:

- que tipo de mensaje reactiva mejor por segmento
- que propuestas terminan descartadas con frecuencia
- que alertas generan demasiado ruido
- que recomendaciones tienen mejor precision real

Esta capa no es texto libre. Debe alimentarse desde:

- feedback estructurado
- resultados de ejecucion
- outcome tracking
- evaluaciones

### 9.6 Regla de compaction

Inspirada en Pi, pero adaptada a negocio:

- si una sesion supera el umbral de contexto, se compacta
- la compaction debe preservar:
  - decisiones tomadas
  - entidades activas
  - archivos o datos relevantes
  - acciones pendientes
  - restricciones de usuario
- nunca debe borrar:
  - aprobaciones
  - rechazos
  - errores importantes
  - motivos de seguridad

### 9.7 Regla de privacidad

La memoria nunca puede transformarse en un bypass de permisos.

No se guarda en memoria de un rol sin permiso:

- costo unitario si no corresponde
- margen detallado si no corresponde
- deuda sensible si no corresponde
- secretos operativos

---

## 10. Ciclo operativo de una corrida

Toda corrida del agente debe seguir exactamente este orden.

### Paso 1 - intake

- validar entrada
- validar auth
- validar scope
- persistir `run`

### Paso 2 - classification

- detectar objetivo
- detectar tipo de surface
- decidir si es lectura, recomendacion o accion

### Paso 3 - context assembly

- cargar envelope
- cargar session memory
- cargar entity memory relevante
- resolver datasets necesarios

### Paso 4 - deterministic pass

- forecast
- scoring
- deteccion de anomalias
- calculo de prioridad
- comparativas

### Paso 5 - routing interno

El router debe usar playbooks, no intuicion.

Ejemplo:

- si pregunta por caja -> finanzas + cobranzas + explicador
- si pregunta por cliente puntual -> CRM + historial + follow-up
- si trigger es stock bajo -> demanda + reposicion + policy

### Paso 6 - synthesis estructurada

Armar una salida intermedia con:

- summary
- evidence
- findings
- candidate_actions
- blockers
- confidence

### Paso 7 - llm explanation

Solo despues de tener evidencia dura:

- resumir
- traducir
- ordenar
- redactar mensajes o propuestas

### Paso 8 - proposal materialization

Si hay accion:

- registrar propuesta
- evaluar policy
- marcar si requiere aprobacion
- generar contract de ejecucion

### Paso 9 - surface rendering

El resultado se transforma en:

- respuesta conversacional
- bandeja de acciones
- tarjeta de resumen
- detalle de entidad

### Paso 10 - audit and feedback hooks

- registrar que se uso
- registrar que se mostro
- registrar decision del usuario si existe

---

## 11. Router del agente

El router no debe ser un "super agente creativo". Debe ser un planificador deterministicamente explicable.

### 11.1 Inputs del router

- objective
- entry_type
- surface
- role
- scope
- entities presentes
- urgency
- available tools

### 11.2 Salidas del router

- lista ordenada de subagentes
- datasets requeridos
- maximo nivel de accion permitido
- nivel de razonamiento LLM permitido
- output contract esperado

### 11.3 Tabla de ruteo minima

| Caso | Dominios | Salida |
|---|---|---|
| "Como viene el negocio" | ejecutivo + finanzas + ventas + stock | resumen ejecutivo |
| "Que debo atender hoy" | workspace + policy + prioridades | action inbox |
| "Que clientes conviene recuperar" | CRM + segmentacion + seguimiento | lista priorizada + mensajes sugeridos |
| "Que stock revisar ya" | demanda + inventario + compras | alertas + propuestas |
| "Explicame por que bajo el margen" | pricing + ventas + gastos | explicacion con evidencia |
| trigger de deuda vencida | cobranzas + policy | propuesta de contacto o tarea |

### 11.4 Cosas que el router no puede hacer

- ejecutar automatizaciones
- inventar tools nuevas
- saltarse policy
- omitir dataset versionado
- leer mas de lo permitido por rol

---

## 12. Taxonomia oficial de herramientas

Las tools deben clasificarse por carril de riesgo.

### 12.1 Clase A - read tools

Ejemplos:

- leer ventas historicas
- leer stock actual
- leer aging de cobranzas
- leer efectividad de campañas

Regla:

- sin efectos laterales

### 12.2 Clase B - analysis tools

Ejemplos:

- forecast
- scoring comercial
- score de cobranza
- deteccion de anomalias
- priorizacion

Regla:

- calculan
- no escriben negocio

### 12.3 Clase C - recommendation tools

Ejemplos:

- redactar mensaje sugerido
- armar propuesta
- resumir hallazgos
- convertir evidencia en copy de negocio

Regla:

- no ejecutan
- producen artefactos para decision

### 12.4 Clase D - preparation tools

Ejemplos:

- crear borrador de tarea
- armar execution contract
- preparar payload para n8n

Regla:

- escriben entidades controladas
- nunca disparan por si solas

### 12.5 Clase E - execution adapters

Ejemplos:

- enqueue automation_event
- marcar entrega
- sincronizar estado de ejecución

Regla:

- solo el backend las usa despues de policy y aprobacion

---

## 13. Contratos de salida oficiales

El motor no devuelve "texto". Devuelve contratos.

### 13.1 Response contract

Para surfaces de lectura:

```json
{
  "type": "agent_response",
  "intent": "cash",
  "summary": "La caja esta bajo presion esta semana.",
  "why_it_matters": "Entran menos cobros de los que salen en pagos y gastos.",
  "next_step": "Priorizar cobranzas altas y frenar compras no urgentes.",
  "evidence": [],
  "cards": [],
  "followups": []
}
```

### 13.2 Finding contract

Para hallazgos internos:

```json
{
  "finding_type": "stock_risk",
  "entity": { "type": "producto", "id": 442, "name": "Heladera X" },
  "severity": "high",
  "confidence": 0.83,
  "evidence": {
    "available_units": 2,
    "daily_avg": 1.4,
    "days_until_break": 1.4
  }
}
```

### 13.3 Proposal contract

Para acciones:

```json
{
  "type": "action_proposal",
  "category": "stock",
  "title": "Revisar reposicion de Heladera X",
  "summary": "Puede quedarse sin stock esta semana.",
  "why_text": "La cobertura es menor a dos dias.",
  "recommended_action": "Validar compra pendiente y proveedor alternativo.",
  "requires_approval": false
}
```

### 13.4 Surface contract

Para UI server-driven:

```json
{
  "surface_type": "business_overview",
  "layout": "stacked_cards",
  "sections": [],
  "actions": []
}
```

Regla:

- el LLM no genera HTML crudo para el frontend web principal
- genera contratos para componentes React permitidos

---

## 14. Runtime states y transiciones

Toda corrida debe tener estados claros.

### 14.1 Estados de corrida

- `accepted`
- `context_loading`
- `routed`
- `deterministic_running`
- `synthesizing`
- `llm_explaining`
- `proposal_persisting`
- `completed`
- `failed`
- `cancelled`

### 14.2 Estados de propuesta

- `pendiente`
- `en_revision`
- `aprobacion_pendiente`
- `aprobada`
- `programada`
- `ejecutada`
- `descartada`
- `vencida`

### 14.3 Estados de ejecucion

- `pendiente`
- `programada`
- `en_proceso`
- `reintentando`
- `entregada`
- `fallida`

### 14.4 Regla

Nunca usar un estado ambiguo como:

- `done`
- `ok`
- `handled`
- `processed`

Los estados deben servir para:

- UI
- auditoria
- reintentos
- runbooks

---

## 15. Estrategia de modelos y failover

OpenClaw y Pi muestran una idea correcta: el runtime no debe casarse con un solo proveedor.

KaisenRP debe adoptar eso, pero con politica empresarial propia.

### 15.1 Roles de modelo

**Clase X - explicacion**

- bajo costo
- baja latencia
- foco en claridad

**Clase Y - reasoning operativo**

- mejor razonamiento
- usado cuando hay ambiguedad o synthesis compleja

**Clase Z - redaccion sensible**

- mensajes a clientes
- copy comercial
- respuestas ejecutivas finas

### 15.2 Regla de uso

- primero se intenta con modelo primario por tipo de tarea
- si falla, se usa fallback compatible
- la corrida registra proveedor y modelo usados
- un cambio de modelo nunca puede cambiar permisos o scope

### 15.3 Requisito futuro

Agregar una capa similar a auth profile rotation de OpenClaw/Pi para:

- rotacion de credenciales
- cooldown por fallo
- failover por proveedor
- degradacion controlada

---

## 16. Integracion de surfaces tipo Canvas / A2UI

OpenClaw demuestra una ventaja importante: el agente no solo responde texto, tambien puede empujar una surface.

KaisenRP debe adoptar el principio, pero no la ejecucion abierta.

### 16.1 Lo que si tomamos

- server-driven surfaces
- actualizaciones incrementales
- separación entre datos y presentacion
- posibilidad de drilldown sin rehacer toda la pantalla

### 16.2 Lo que no tomamos

- HTML arbitrario generado por LLM en el cliente principal
- JS libre ejecutado desde la respuesta del modelo
- surfaces sin whitelist de componentes

### 16.3 Modelo oficial para KaisenRP

El runtime devuelve un `surface contract` y React renderiza solo componentes permitidos:

- hero ejecutivo
- metric card
- insight card
- action card
- evidence list
- ranked list
- timeline
- chart series
- approval banner
- entity detail

### 16.4 Update model

Inspirado en A2UI:

- `surface_begin`
- `surface_patch`
- `data_patch`
- `surface_delete`

Uso recomendado:

- futuras actualizaciones incrementales del workspace del agente
- no necesario para la primera version si complica
- obligatorio antes de introducir chat con surfaces vivas

---

## 17. Seguridad operativa del motor

### 17.1 Regla fundamental

La seguridad real no depende del prompt. Depende de la arquitectura.

### 17.2 Reglas no negociables

- `ai-python` no escribe tablas core de negocio libremente
- ningun modelo invoca n8n directo
- todo dataset pasa por Node
- todo execution contract se firma logica y semanticamente en backend
- toda automatizacion queda asociada a una propuesta
- toda propuesta tiene source y evidence

### 17.3 Hardening que debe existir

- API key interna dedicada
- permisos internos por capability
- timeouts por etapa
- idempotencia en ejecuciones
- expiracion de propuestas viejas
- rate limits por surface
- logs con request id y run id

### 17.4 Aislamiento futuro recomendado

Si el runtime crece, evaluar:

- worker separado por dominio
- colas por objetivo
- sandbox de ejecucion para tareas de alto riesgo
- lock por entidad para evitar dobles acciones

---

## 18. Manejo de fallos

### 18.1 Si falla el data gateway

Respuesta permitida:

- explicar que falta contexto confiable
- no inventar
- no continuar a automatizacion

### 18.2 Si falla el LLM

Respuesta permitida:

- usar fallback deterministicamente redactado
- conservar findings y evidence
- registrar `used_llm=false`

### 18.3 Si falla la persistencia de propuesta

Respuesta permitida:

- no mostrar CTA ejecutable
- degradar a recomendacion de solo lectura

### 18.4 Si falla n8n o dispatcher

Respuesta permitida:

- la propuesta vuelve a revision segura
- se registra error
- no se repite envio sin idempotencia

### 18.5 Si hay inconsistencia de scope

Respuesta permitida:

- abortar corrida
- registrar incidente
- no mostrar datos parciales dudosos

---

## 19. Mapeo con el repo actual

### 19.1 Ya existente y reutilizable

- `backend/server/services/aiWorkspaceService.js`
- `backend/server/services/executiveAssistantService.js`
- `backend/server/services/aiDataGatewayService.js`
- `backend/server/services/aiPolicyEngineService.js`
- `backend/server/services/aiActionContracts.js`
- `backend/server/services/aiAutomationSyncService.js`
- `backend/server/services/aiWorkspaceScheduler.js`
- `backend/server/routes/internalroutes.js`
- `backend/database/migrations_mysql/V34__ai_enterprise_foundation.sql`

### 19.2 Existe pero debe converger

- `chatService.js`
- `ChatWidget.tsx`
- `Predicciones.tsx`
- endpoints IA de lectura muy feature-specific

### 19.3 Falta o esta incompleto

- session memory formal del agente web
- compaction y branch summaries de negocio
- router declarativo con playbooks persistibles
- outcome tracking por propuesta
- model failover empresarial
- surface contracts server-driven
- telemetry de calidad por objetivo

---

## 20. Definicion de listo para construir

Antes de empezar a codificar la "version final" del agente, deben estar cerradas estas decisiones:

- nombre oficial del producto IA para el usuario
- surfaces oficiales
- session key strategy
- contratos canonicos de corrida
- niveles de accion
- datasets v1 obligatorios
- criterio de compaction
- formato de surface contract
- owner de policy
- owner de evaluaciones

Si faltan tres o mas de estas decisiones, la implementacion entra en riesgo de fragmentarse otra vez.

---

## 21. Criterios de aprobacion de este documento

Este documento se considera bueno solo si deja sin ambiguedad:

- que es el motor
- que no es el motor
- como entra trabajo
- como se persiste una corrida
- como vive la memoria
- como se enruta una consulta
- como se producen propuestas
- como se ejecuta con seguridad
- como se adaptan patrones de OpenClaw y Pi sin copiar sus riesgos

---

## 22. Decision final

KaisenRP no necesita otro modulo IA.

Necesita un motor de agente con:

- control plane fuerte
- runtime embebible
- memoria por capas
- session keys claras
- surfaces dirigidas por contratos
- policy antes de accion
- auditoria antes de automatizacion

Ese motor es la base real para todo lo demas.
