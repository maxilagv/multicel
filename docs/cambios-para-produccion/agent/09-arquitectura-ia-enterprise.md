# ARQUITECTURA IA ENTERPRISE - KAISENRP

**Fecha de creacion:** 2026-04-15  
**Estado:** Documento tecnico de arquitectura  
**Objetivo:** convertir la fase 08 en una implementacion ejecutable, segura, auditable y mantenible, sin atajos

---

## 1. Proposito de este documento

La fase 08 define muy bien la vision de negocio de la capa de inteligencia empresarial, pero para implementarla correctamente hace falta un documento de arquitectura mas estricto.

Este documento existe para cerrar esa brecha.

No describe "ideas". Describe como debe construirse la IA de KaisenRP para que sea:

- confiable
- explicable
- segura
- auditable
- accionable
- mantenible
- vendible como diferencial real

La meta no es sumar endpoints IA. La meta es crear una plataforma interna de inteligencia operativa.

---

## 2. Principio rector

La arquitectura debe obedecer esta regla:

**la IA nunca decide sola sobre el negocio sin pasar por datos confiables, politicas, permisos y trazabilidad**

Eso implica:

1. datos reales primero
2. calculo determinista segundo
3. recomendacion estructurada tercero
4. explicacion LLM despues
5. ejecucion solo con reglas, aprobacion o politicas explicitas

Si cualquier implementacion futura rompe ese orden, se considera incorrecta.

---

## 3. Diagnostico del estado actual

Hoy el proyecto ya tiene una base util, pero todavia no tiene una plataforma IA enterprise.

### 3.1 Lo que ya existe y sirve

- `ai-python` como microservicio inicial
- `backend/server/services/aiService.js` con bastante logica determinista de forecast, pricing, anomalias e insights
- controladores IA ya activos en Node.js
- pantallas de frontend para predicciones, CRM, postventa e informes
- base de automatizacion con outbox y dispatcher
- `n8nService`
- `internalcontroller`
- `internalApiKeyMiddleware`
- `api_keys`
- `automation_events`
- integracion de aprobaciones para acciones sensibles

### 3.2 Lo que todavia falta

- orquestador IA real
- contratos unificados de agentes
- capa interna de datos para IA con datasets estables
- memoria compartida formal de contexto
- registro persistente de corridas IA
- propuestas de accion como entidades de negocio
- evaluacion de calidad de modelos
- observabilidad integral
- policy engine para ejecucion automatica

### 3.3 Conclusiones del diagnostico

La base no esta vacia. Tampoco esta cerrada.

La estrategia correcta no es rehacer todo, sino:

- consolidar lo valioso
- mover logica dispersa a una arquitectura clara
- endurecer seguridad y auditoria
- separar definitivamente analisis, recomendacion, explicacion y ejecucion

---

## 4. Objetivo arquitectonico real

KaisenRP debe pasar de este modelo:

```text
pantalla -> endpoint IA -> LLM o calculo puntual -> respuesta
```

a este:

```text
usuario o trigger
    ->
backend de negocio
    ->
ai data gateway
    ->
runtime IA
    ->
motores deterministas
    ->
agentes por dominio
    ->
respuesta estructurada
    ->
propuesta de accion / aprobacion / outbox
    ->
n8n / WhatsApp / email / tareas / reportes
```

Esta diferencia es central.

El primer modelo sirve para demos.
El segundo sirve para produccion.

---

## 5. Arquitectura objetivo

## 5.1 Capas oficiales del sistema

### Capa 1 - Business API

Responsable de:

- autenticacion
- permisos
- tenancy
- sucursal
- reglas de aprobacion
- exposicion de datos seguros a IA
- persistencia de propuestas y ejecuciones

Tecnologia principal:

- Node.js / Express actual

### Capa 2 - AI Data Gateway

Responsable de:

- exponer datasets internos para IA
- filtrar por empresa, sucursal y rol
- normalizar semantica
- versionar esquemas
- registrar que datos fueron entregados a la capa IA

Tecnologia principal:

- endpoints internos en Node.js protegidos con API key interna

### Capa 3 - AI Runtime

Responsable de:

- orquestacion
- ejecucion de motores deterministas
- evaluacion de hallazgos
- armado de recomendaciones
- uso de LLM solo para explicacion, resumen y redaccion

Tecnologia principal:

- `ai-python`

### Capa 4 - Action Control Plane

Responsable de:

- registrar propuestas de accion
- policy checks
- aprobaciones
- ejecucion controlada
- auditoria de cada accion

Tecnologia principal:

- Node.js
- tablas nuevas de IA
- sistema de aprobaciones existente

### Capa 5 - Execution Layer

Responsable de:

- ejecutar workflows aprobados
- enviar mensajes
- crear tareas
- generar reportes
- notificar resultados

Tecnologia principal:

- `automation_events`
- `automationEventDispatcher`
- `n8n`
- providers de mensajeria

---

## 6. Regla de oro de separacion de responsabilidades

La arquitectura debe prohibir explicitamente este antipatron:

```text
agente IA -> llama directo a WhatsApp o a n8n -> ejecuta
```

El camino correcto es:

```text
agente IA
    ->
devuelve recomendacion estructurada
    ->
backend registra propuesta
    ->
policy engine
    ->
aprobacion si aplica
    ->
outbox
    ->
n8n ejecuta
```

Esto evita:

- automatizaciones sueltas
- acciones sin permiso
- mensajes duplicados
- errores sin trazabilidad
- dependencia excesiva del LLM

---

## 7. Modelo de dominios de inteligencia

Los agentes no deben ser "libres". Deben tener ownership concreto.

## 7.1 Agente de demanda y reposicion

Responsabilidades:

- forecast de demanda
- cobertura
- safety stock
- riesgo de quiebre
- sugerencia de compra
- deteccion de sobrestock

No debe:

- redactar mensajes al proveedor
- ejecutar compras

## 7.2 Agente de pricing y rentabilidad

Responsabilidades:

- detectar margen erosionado
- encontrar descuentos fuera de patron
- sugerir revision de precios
- priorizar productos o familias a revisar

No debe:

- cambiar precios directo
- aprobar rebajas

## 7.3 Agente comercial y CRM

Responsabilidades:

- scoring comercial
- prioridad de seguimiento
- clientes dormidos
- clientes valiosos
- siguiente mejor accion

No debe:

- enviar campañas sin pasar por control

## 7.4 Agente de marketing operativo

Responsabilidades:

- sugerir campaña
- sugerir canal
- sugerir horario
- sugerir mensaje
- controlar fatiga
- interpretar respuesta comercial

No debe:

- decidir solo a quien impactar si no hay scoring previo

## 7.5 Agente financiero y de cobranzas

Responsabilidades:

- riesgo de cobro
- tension de caja
- prioridad de reclamo
- desviaciones de margen
- hallazgos financieros relevantes

No debe:

- reclamar automaticamente sin policy check

## 7.6 Agente ejecutivo

Responsabilidades:

- resumir hallazgos
- priorizar focos del dia
- responder preguntas de negocio
- traducir lenguaje tecnico a lenguaje ejecutivo

No debe:

- inventar datos
- calcular por su cuenta

## 7.7 Agente de guardia y control

Responsabilidades:

- detectar riesgo operativo
- bloquear automatizaciones conflictivas
- degradar acciones a aprobacion humana
- consolidar incidentes relevantes

Este agente es obligatorio si se habilita automatizacion de nivel 4.

---

## 8. Orquestador: como debe funcionar

El orquestador no debe ser un "cerebro creativo". Debe ser un router con playbooks claros.

## 8.1 Tareas del orquestador

- entender objetivo
- resolver contexto
- decidir que agentes participan
- ejecutar pasos en orden
- consolidar salidas
- registrar la corrida completa

## 8.2 Lo que no debe hacer

- consultar datos arbitrariamente sin contrato
- permitir prompts libres con efectos laterales
- elegir herramientas no autorizadas
- saltarse el backend para ejecutar acciones

## 8.3 Ejemplos de ruteo correcto

### Caso A - "que clientes deberia recuperar esta semana"

Flujo:

1. resolver contexto
2. pedir dataset comercial
3. invocar `crm_agent`
4. invocar `marketing_agent` si se pide mensaje o campaña
5. invocar `executive_agent` para explicacion
6. registrar resultados

### Caso B - "por que bajo el margen"

Flujo:

1. resolver contexto
2. pedir dataset financiero
3. invocar `finance_agent`
4. invocar `pricing_agent`
5. consolidar hallazgos
6. invocar `executive_agent`

---

## 9. Contrato tecnico obligatorio para todos los agentes

Todo agente debe emitir una salida estructurada y estable.

## 9.1 Contrato base recomendado

```json
{
  "run_id": "uuid",
  "agent": "crm_intelligence",
  "agent_version": "2026-04-15.1",
  "status": "ok",
  "confidence": {
    "level": "alta",
    "score": 0.84,
    "reason": "senales consistentes en 4 variables principales"
  },
  "scope": {
    "company_id": 1,
    "branch_id": 2,
    "period": "2026-04",
    "objective": "reactivar_clientes"
  },
  "summary": "Se detectaron 18 clientes para recuperar esta semana.",
  "evidence": {
    "datasets": [
      {
        "name": "customer_profile_snapshot",
        "version": "v3",
        "records_used": 1823,
        "generated_at": "2026-04-15T10:32:00Z",
        "hash": "sha256:..."
      }
    ],
    "main_signals": [
      "baja de frecuencia",
      "mayor tiempo desde la ultima compra",
      "ticket historico alto"
    ]
  },
  "findings": [],
  "recommended_actions": [],
  "allowed_automations": [],
  "policy": {
    "requires_approval": true,
    "risk_level": "medium",
    "dry_run": true
  },
  "audit": {
    "requested_by": 17,
    "trace_id": "trace-123"
  }
}
```

## 9.2 Campos obligatorios

- `run_id`
- `agent`
- `agent_version`
- `status`
- `confidence`
- `scope`
- `summary`
- `evidence`
- `findings`
- `recommended_actions`
- `allowed_automations`
- `policy`
- `audit`

## 9.3 Regla de implementacion

Si un agente no puede devolver una respuesta compatible con este contrato, no esta listo para produccion.

---

## 10. Capa de datos para IA

Esta es una de las piezas mas importantes de toda la arquitectura.

La IA no debe consultar tablas "como salga". Debe consumir datasets internos estables.

## 10.1 Fuente de verdad

La fuente de verdad sigue siendo Node.js.

Python no debe:

- construir semantica de negocio por su cuenta
- resolver permisos por su cuenta
- tocar tablas core de forma libre

## 10.2 AI Data Gateway

Se debe construir una API interna para IA con autenticacion por API key interna.

Patron a reutilizar:

- `internalroutes.js`
- `internalcontroller.js`
- `internalApiKeyMiddleware.js`
- `api_keys`

## 10.3 Datasets internos obligatorios

### `sales_snapshot`

Debe incluir:

- ventas validas segun semantica de negocio
- sucursal
- cliente
- vendedor
- fecha
- producto
- cantidad
- monto
- costo
- descuento
- margen

### `inventory_snapshot`

Debe incluir:

- producto
- sucursal
- stock disponible
- stock minimo
- reorden
- lead time
- proveedor principal

### `customer_profile_snapshot`

Debe incluir:

- cliente
- recencia
- frecuencia
- monto
- ticket promedio
- ultima respuesta comercial
- ultimo contacto
- deuda
- estado comercial
- opt-in

### `receivables_snapshot`

Debe incluir:

- cliente
- saldo pendiente
- buckets de deuda
- atraso promedio
- comportamiento historico de pago

### `campaign_performance_snapshot`

Debe incluir:

- campaña
- segmento
- canal
- enviados
- aperturas
- respuestas
- conversiones
- fatiga por cliente

### `pricing_snapshot`

Debe incluir:

- producto
- precio actual
- costo
- descuentos aplicados
- margen historico
- rotacion
- stock

## 10.4 Reglas de dataset

Todo dataset debe tener:

- nombre
- version de esquema
- timestamp de generacion
- hash
- filtros usados
- registros usados
- empresa
- sucursal cuando aplique

---

## 11. Contexto compartido y memoria operativa

La memoria de la corrida no debe ser una idea abstracta. Debe ser un objeto de contexto formal.

## 11.1 Contrato minimo de contexto

```json
{
  "company_id": 1,
  "branch_id": 2,
  "user_id": 17,
  "user_role": "admin",
  "objective": "reactivar_clientes",
  "customer_id": null,
  "product_id": null,
  "period": "2026-04",
  "dry_run": true,
  "request_source": "ui"
}
```

## 11.2 Regla

Toda corrida IA debe arrancar con este contexto resuelto y persistido.

---

## 12. Modelo persistente de corridas y acciones

Para que la IA sea auditable y gobernable, las corridas y las acciones no pueden vivir solo en memoria.

## 12.1 Tablas recomendadas

### `ai_runs`

Una fila por corrida IA.

Campos sugeridos:

- `id`
- `run_uuid`
- `company_id`
- `branch_id`
- `requested_by_user_id`
- `request_source`
- `objective`
- `status`
- `started_at`
- `finished_at`
- `dry_run`
- `requires_approval`
- `error_message`

### `ai_run_steps`

Una fila por paso dentro de la corrida.

Campos sugeridos:

- `id`
- `ai_run_id`
- `step_order`
- `step_type`
- `agent_name`
- `tool_name`
- `status`
- `started_at`
- `finished_at`
- `input_json`
- `output_json`

### `ai_run_artifacts`

Para guardar resultados reutilizables.

Campos sugeridos:

- `id`
- `ai_run_id`
- `artifact_type`
- `artifact_key`
- `payload_json`

### `ai_action_proposals`

Una fila por accion sugerida.

Campos sugeridos:

- `id`
- `ai_run_id`
- `action_type`
- `entity_type`
- `entity_id`
- `title`
- `reason`
- `payload_json`
- `risk_level`
- `requires_approval`
- `status`
- `created_at`

### `ai_action_approvals`

Para aprobaciones humanas.

Campos sugeridos:

- `id`
- `proposal_id`
- `approver_user_id`
- `decision`
- `comment`
- `decided_at`

### `ai_action_executions`

Una fila por ejecucion real.

Campos sugeridos:

- `id`
- `proposal_id`
- `execution_channel`
- `automation_event_id`
- `status`
- `requested_at`
- `executed_at`
- `response_json`
- `error_message`

### `ai_feedback`

Para mejora continua.

Campos sugeridos:

- `id`
- `ai_run_id`
- `proposal_id`
- `feedback_type`
- `feedback_value`
- `comment`
- `created_by_user_id`
- `created_at`

## 12.2 Regla

Sin persistencia de corridas y propuestas, no existe IA enterprise. Solo existen respuestas utiles pero no gobernables.

---

## 13. Politicas de accion y niveles de riesgo

## 13.1 Niveles de accion oficiales

### Nivel 1 - lectura

La IA solo analiza y muestra.

### Nivel 2 - recomendacion

La IA recomienda pero no ejecuta.

### Nivel 3 - preparacion con aprobacion

La IA deja una accion lista para ser aprobada.

### Nivel 4 - automatizacion controlada

La IA puede ejecutar automaticamente solo si:

- la accion es de bajo riesgo
- la policy lo permite
- existe rollback o compensacion razonable
- la auditoria queda completa

## 13.2 Policy engine minimo

Toda accion debe pasar por un policy engine que revise:

- tipo de accion
- riesgo
- rol del solicitante
- sucursal
- horario
- volumen
- fatiga comercial
- opt-in / opt-out
- conflictos con otras automatizaciones

## 13.3 Acciones que siempre requieren aprobacion

- cambio de precios
- envio masivo comercial
- acciones de cobranza intensiva
- mensajes que afecten reputacion de marca
- acciones sobre clientes VIP o cuentas sensibles

---

## 14. Integracion con outbox y n8n

La IA debe aprovechar la base ya iniciada en fase 02.

## 14.1 Regla

Las acciones no se ejecutan "desde Python".

Se ejecutan desde el carril controlado:

- propuesta persistida
- policy check
- aprobacion si aplica
- `automation_events`
- dispatcher
- `n8nService`

## 14.2 Patron recomendado

```text
ai_action_proposal aprobada
    ->
enqueue automation_event
    ->
dispatcher
    ->
n8n
    ->
servicio externo
    ->
estado de ejecucion
```

## 14.3 Casos de uso prioritarios

- reactivacion comercial
- recordatorio de cobranza
- reposicion preventiva
- resumen ejecutivo diario

---

## 15. n8n: rol exacto dentro de la arquitectura

n8n es executor, no cerebro.

### n8n si debe hacer

- cron
- colas
- integraciones
- seguimiento de estado
- notificaciones
- entrega de workflows aprobados

### n8n no debe hacer

- scoring comercial
- scoring financiero
- logica central de pricing
- decision de a quien impactar sin evidencia
- calculo principal del negocio

Si n8n toma decisiones centrales, la arquitectura queda mal diseñada.

---

## 16. Rol del LLM

El LLM es importante, pero no ocupa el centro del sistema.

## 16.1 El LLM si debe usarse para

- explicar resultados
- resumir hallazgos
- redactar mensajes
- responder preguntas del dueno o gerencia
- traducir lenguaje tecnico a lenguaje simple

## 16.2 El LLM no debe usarse para

- inventar cifras
- definir scoring sensible
- decidir montos a cobrar o descontar
- seleccionar clientes sin base determinista
- ejecutar acciones sensibles por prompt libre

## 16.3 Politica de prompts

Todo prompt productivo debe:

- declarar fuente de verdad
- prohibir inventar datos
- exigir mencionar faltantes
- trabajar sobre JSON estructurado
- tener output acotado y verificable

---

## 17. Rediseño recomendado de `ai-python`

Hoy `ai-python` sirve como base, pero no como arquitectura final.

## 17.1 Estructura objetivo

```text
ai-python/
  main.py
  agents/
    base_agent.py
    orchestrator.py
    demand_agent.py
    pricing_agent.py
    crm_agent.py
    marketing_agent.py
    finance_agent.py
    executive_agent.py
    alert_guard_agent.py
  engines/
    forecast_engine.py
    replenishment_engine.py
    crm_scoring_engine.py
    collections_scoring_engine.py
    margin_engine.py
    anomaly_engine.py
  services/
    data_gateway_client.py
    llm_service.py
    cache_service.py
    audit_service.py
    policy_service.py
    action_service.py
  schemas/
    context.py
    contracts.py
    datasets.py
    actions.py
  evaluations/
    forecast_metrics.py
    crm_metrics.py
    collections_metrics.py
  jobs/
    recompute_scores.py
    recompute_forecasts.py
```

## 17.2 Regla de diseño

- `agents/` coordina
- `engines/` calcula
- `services/` integra
- `schemas/` valida contratos
- `evaluations/` mide calidad

No mezclar todo en `main.py`.

---

## 18. Endpoints backend recomendados

No conviene seguir sumando endpoints IA sueltos por feature.

## 18.1 Agrupacion correcta

### `ai-read`

Para lectura y analisis:

- resumenes
- insights
- dashboards
- forecast
- scoring

### `ai-actions`

Para propuestas, aprobaciones y ejecuciones:

- crear propuesta
- listar propuestas
- aprobar
- rechazar
- ejecutar

### `ai-admin`

Para operacion interna:

- auditoria
- jobs
- configuraciones
- metricas
- recalculos

## 18.2 Endpoints sugeridos

- `GET /api/ai-read/opportunities`
- `GET /api/ai-read/business-health`
- `GET /api/ai-read/executive-summary`
- `POST /api/ai-read/ask`
- `GET /api/ai-read/customer-score/:id`
- `GET /api/ai-read/forecast`
- `POST /api/ai-actions/proposals`
- `GET /api/ai-actions/proposals`
- `POST /api/ai-actions/proposals/:id/approve`
- `POST /api/ai-actions/proposals/:id/reject`
- `POST /api/ai-actions/proposals/:id/execute`
- `GET /api/ai-admin/runs`
- `GET /api/ai-admin/runs/:id`
- `POST /api/ai-admin/jobs/recompute`

---

## 19. Caching y performance

El cache es importante, pero tiene que ser semantico y versionado.

## 19.1 Analisis cacheables

- forecast
- scoring comercial
- scoring de cobranzas
- resumen ejecutivo
- salud del negocio
- analisis por sucursal

## 19.2 Clave de cache obligatoria

Toda clave debe incluir como minimo:

- empresa
- sucursal cuando aplique
- periodo
- tipo de analisis
- version de dataset
- fecha de generacion

## 19.3 Regla

Nunca cachear solo por endpoint y parametros de query. Eso genera respuestas semantica o contextualmente equivocadas.

---

## 20. Observabilidad y auditoria

El sistema necesita dos planos distintos.

## 20.1 Auditoria funcional

Debe registrar:

- quien pidio el analisis
- que objetivo tenia
- que datasets se usaron
- que agentes participaron
- que hallazgos salieron
- que acciones se propusieron
- si se aprobaron
- si se ejecutaron

## 20.2 Telemetria tecnica

Debe medir:

- latencia por agente
- tasa de error
- costo de proveedor LLM
- hit ratio de cache
- volumen de corridas
- cantidad de propuestas
- cantidad de aprobaciones
- cantidad de bloqueos por policy

## 20.3 Dashboards internos recomendados

- salud del runtime IA
- rendimiento de agentes
- acciones propuestas vs ejecutadas
- precision de forecast
- efectividad de campañas
- efectividad de cobranzas sugeridas

---

## 21. Evaluacion de calidad

Una IA enterprise no se aprueba por "sentirse bien". Se aprueba por metricas.

## 21.1 Forecast

Medir:

- MAPE
- WAPE
- error por producto
- error por familia
- error por sucursal

## 21.2 Scoring comercial

Medir:

- precision at K
- recall en cohortes de recuperacion
- conversion de clientes sugeridos vs no sugeridos

## 21.3 Scoring de cobranzas

Medir:

- recupero por bucket de score
- tiempo medio de recuperacion
- falsos positivos de riesgo alto

## 21.4 Pricing

Medir:

- impacto en margen
- impacto en ventas
- tasa de aprobacion de sugerencias

## 21.5 Campañas

Medir:

- apertura
- respuesta
- conversion
- fatiga
- uplift incremental

## 21.6 Asistente ejecutivo

Medir:

- exactitud factual
- utilidad percibida
- porcentaje de preguntas resueltas sin escalado

---

## 22. Frontend objetivo

La UI no debe exponer complejidad tecnica. Debe exponer decision.

## 22.1 Pantallas principales recomendadas

### Centro de oportunidades

Debe mostrar:

- clientes a contactar
- cobranzas prioritarias
- presupuestos dormidos
- oportunidades de upsell
- productos a empujar

### Centro de salud del negocio

Debe mostrar:

- ventas
- margen
- caja
- stock
- alertas
- sucursales a revisar

### Bandeja de acciones IA

Debe mostrar:

- acciones sugeridas
- evidencia
- riesgo
- requiere aprobacion o no
- estado de ejecucion

### Asistente ejecutivo

Debe permitir preguntas tipo:

- como viene el mes
- que deberia mirar hoy
- donde se me esta yendo margen
- que estoy cobrando peor
- que clientes deberia recuperar esta semana

## 22.2 Regla de lenguaje

Mostrar:

- clientes por recuperar
- plata por cobrar con prioridad
- productos para reponer
- margen para revisar
- oportunidades del dia

No mostrar:

- embeddings
- z-score
- cluster
- inferencia
- vector store
- multi-agent

---

## 23. Seguridad de datos y acceso

## 23.1 Reglas no negociables

- la IA nunca ve datos fuera del scope permitido
- el rol se valida antes de armar datasets
- costos, deuda y margen no se exponen a roles sin permiso
- toda accion sensible se registra
- toda automatizacion masiva se limita por policy

## 23.2 Scope obligatorio

Toda corrida debe quedar asociada a:

- empresa
- sucursal
- usuario
- rol
- objetivo

## 23.3 Reglas de secreto y credenciales

- `ai-python` usa API key interna dedicada
- los proveedores externos no se exponen al runtime si no hace falta
- los secretos viven en variables de entorno o vault, nunca en prompts

---

## 24. Riesgos si se implementa mal

## Riesgo 1 - endpoints IA sueltos

Consecuencia:

- sistema fragmentado
- duplicacion de logica
- mantenimiento caro

## Riesgo 2 - LLM haciendo calculos de negocio

Consecuencia:

- respuestas no auditables
- errores silenciosos
- perdida de confianza

## Riesgo 3 - n8n tomando decisiones

Consecuencia:

- logica de negocio fuera del core
- comportamiento dificil de explicar

## Riesgo 4 - automatizaciones sin policy engine

Consecuencia:

- saturacion comercial
- acciones sensibles sin control
- daño reputacional

## Riesgo 5 - sin corridas persistidas

Consecuencia:

- imposibilidad de auditar
- imposibilidad de aprender del uso real

---

## 25. Orden de implementacion recomendado

Este es el orden correcto si se quiere hacer bien.

## Etapa 1 - Plataforma IA

Objetivo:

- crear columna vertebral

Entregables:

- tablas `ai_runs`, `ai_run_steps`, `ai_action_proposals`, `ai_action_executions`, `ai_feedback`
- contrato base de agentes
- servicios de auditoria

## Etapa 2 - AI Data Gateway

Objetivo:

- exponer datasets estables

Entregables:

- endpoints internos versionados
- autenticacion interna por API key
- filtros por empresa y sucursal

## Etapa 3 - Refactor de `ai-python`

Objetivo:

- separar runtime, engines y services

Entregables:

- nueva estructura de carpetas
- orchestrator base
- agentes y engines desacoplados

## Etapa 4 - Motores deterministas

Objetivo:

- construir la capa dura

Entregables:

- forecast robusto
- reposicion
- scoring comercial
- scoring cobranzas
- margen y descuentos fuera de patron

## Etapa 5 - Bandeja de acciones

Objetivo:

- convertir hallazgos en acciones gobernables

Entregables:

- propuestas persistidas
- aprobacion
- ejecucion
- estado

## Etapa 6 - Integracion total con outbox y n8n

Objetivo:

- ejecutar sin romper control

Entregables:

- mapping de propuestas a `automation_events`
- workflows n8n por dominio

## Etapa 7 - Asistente ejecutivo

Objetivo:

- entregar experiencia premium

Entregables:

- respuestas ejecutivas sobre datos estructurados
- panel diario y semanal

## Etapa 8 - Evaluacion continua

Objetivo:

- mejorar con datos reales

Entregables:

- metricas
- dashboards internos
- recalibracion por negocio

---

## 26. Criterios de aprobacion de la arquitectura

La arquitectura se considera bien implementada solo si cumple todo esto:

- el calculo principal es determinista
- el LLM explica pero no inventa
- toda corrida queda persistida
- toda accion queda trazada
- n8n ejecuta, no decide
- los datasets estan versionados
- la UI habla en lenguaje de negocio
- existe policy engine
- existe `dry_run`
- existen aprobaciones para acciones sensibles
- existe medicion de calidad

Si faltan dos o mas de estos puntos, la fase no debe considerarse cerrada.

---

## 27. Decision final recomendada

La implementacion correcta de la fase 08 no es:

- sumar mas endpoints IA
- meter prompts mas largos
- conectar n8n directo al razonamiento

La implementacion correcta es:

- construir una plataforma interna de inteligencia operativa
- usar Node como capa de gobierno
- usar Python como runtime de analisis y orquestacion
- usar datasets internos estables
- usar contratos fuertes
- usar propuestas persistidas
- usar outbox y n8n como capa de ejecucion

Ese es el camino dificil.

Y tambien es el unico camino que deja una IA realmente especialista, segura y vendible.

