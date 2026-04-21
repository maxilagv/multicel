# CAPA DE INTELIGENCIA EMPRESARIAL - OPENCLOW

**Estado actual:** ya existe una base inicial de IA en `ai-python`, controladores LLM en Node.js, pantalla de predicciones y una fase 2 de automatizaciones mas robusta sobre CRM, prioridad comercial, outbox y n8n.  
**Nuevo objetivo:** dejar de pensar la IA como un modulo aislado y convertirla en una capa de inteligencia operativa para toda la empresa. Esta capa debe ayudar a vender mejor, comprar mejor, cobrar mejor, explicar mejor el negocio y ejecutar acciones con seguridad.  
**Prerequisito obligatorio:** esta fase no debe implementarse en codigo sin aplicar antes `09-arquitectura-ia-enterprise.md`.

La meta no es "poner IA". La meta es que el sistema se vuelva una potencia para:

- direccion y dueno
- ventas y seguimiento comercial
- marketing y reactivacion
- administracion y cobranzas
- finanzas y rentabilidad
- stock y reposicion

La idea central es simple:

1. la IA no inventa numeros
2. primero analiza con datos reales
3. despues recomienda
4. solo ejecuta acciones si hay permisos, reglas y auditoria

---

## 1. Vision de negocio

La empresa no necesita un chatbot decorativo. Necesita un sistema que transforme datos en decisiones y decisiones en acciones concretas.

La capa IA debe resolver cinco problemas de alto valor:

1. Saber que va a pasar antes de que pase.
2. Detectar oportunidades comerciales antes de perderlas.
3. Traducir informacion compleja en lenguaje simple para el cliente interno.
4. Cuidar margen, caja y cobranza sin depender de revisiones manuales.
5. Ejecutar automatizaciones utiles sin volver el sistema peligroso o inmanejable.

### Resultado esperado

Cuando esto este bien implementado, el negocio deberia poder:

- ver que productos van a quedar cortos antes de romper stock
- detectar que clientes estan por dejar de comprar antes de perderlos
- sugerir la mejor accion comercial segun tipo de cliente, monto, frecuencia y atraso
- explicar por que bajo el margen o la caja en un lenguaje entendible
- proponer que oferta, mensaje y canal conviene usar con cada segmento
- ayudar a contadores y administracion a encontrar desvios, atrasos y riesgo financiero
- darle al dueno una vista ejecutiva clara, accionable y confiable

---

## 2. Principios de diseno

Este plan no busca el camino facil. Busca el camino dificil pero seguro.

### 2.1 Deterministico primero, LLM despues

Las respuestas importantes del negocio no pueden depender solo de un modelo generativo.

Orden correcto:

1. consultar datos reales
2. correr calculos deterministas o modelos estadisticos
3. generar un resultado estructurado con evidencia
4. usar LLM solo para explicar, resumir o proponer la mejor accion

### 2.2 Toda recomendacion debe venir con evidencia

Cada modulo IA debe devolver:

- que detecto
- por que lo detecto
- que datos uso
- nivel de confianza
- que accion recomienda
- que accion puede ejecutar y cual no

### 2.3 La automatizacion nunca debe quedar suelta

Ningun agente debe mandar mensajes, tocar precios, registrar pedidos o disparar acciones sensibles sin:

- reglas de permiso
- modo simulacion
- bitacora
- estado de aprobacion
- trazabilidad de origen

### 2.4 La experiencia para el usuario debe ser simple

En frontend no se debe hablar de:

- churn
- clustering
- elasticidad
- score vectorial
- inferencia

Eso se traduce a lenguaje de negocio:

- clientes por recuperar
- clientes mas valiosos
- productos con precio para revisar
- plata por cobrar con riesgo
- ventas que merecen seguimiento
- mercaderia que conviene reponer ahora

### 2.5 La IA debe hablar para negocio, no para programadores

Toda interfaz final debe poder ser entendida por:

- duenios
- gerentes
- vendedores
- administracion
- usuarios no tecnicos

Reglas obligatorias:

- no mostrar nombres internos de agentes
- no mostrar puntajes crudos sin traduccion
- no usar siglas tecnicas sin explicacion simple
- no obligar al usuario a interpretar JSON o diagnosticos tecnicos
- mostrar siempre primero que pasa, por que importa y que conviene hacer

---

## 3. Base OpenClow para convertirlo en una potencia

La arquitectura debe tomar como base el enfoque OpenClow: agentes especializados, orquestacion, memoria compartida y capacidad de actuar.

### 3.1 Capas del sistema

```text
Frontend simple para el negocio
        |
Node.js API de negocio y permisos
        |
Orquestador IA
        |
Agentes especializados
        |
Capa de datos y herramientas
        |
ERP / CRM / ventas / stock / cobranzas / n8n / WhatsApp / reportes
```

### 3.2 Componentes obligatorios

**1. Orquestador principal**  
Recibe la consulta o el trigger, entiende el objetivo y decide que agentes deben participar.

**2. Agentes especializados**  
Cada agente resuelve un dominio puntual y devuelve salida estructurada.

**3. Memoria de contexto**  
Comparte contexto comun:

- empresa
- sucursal
- cliente
- producto
- vendedor
- periodo
- permisos del usuario

**4. Registry de herramientas**  
Cada agente solo puede usar herramientas aprobadas:

- consultas internas
- metricas
- forecast
- scoring
- generacion de mensajes
- disparo a n8n
- acciones aprobables

**5. Capa de auditoria**  
Todo resultado importante debe guardar:

- consulta o trigger
- datos usados
- agentes invocados
- recomendacion generada
- accion ejecutada o pendiente
- usuario o proceso que la disparo

### 3.3 Separacion sana de responsabilidades

No mezclar todo en un solo "agente magico". La potencia real sale de separar bien:

- agentes que calculan
- agentes que explican
- agentes que recomiendan
- agentes que ejecutan

Eso evita errores, baja costo y hace el sistema mantenible.

---

## 4. Dominios de inteligencia que hay que cubrir

## 4.1 Inteligencia comercial y marketing

Objetivos:

- detectar clientes frios, tibios y activos
- encontrar oportunidades de reactivacion
- sugerir la mejor oferta para cada segmento
- elegir mejor momento, canal y mensaje
- medir impacto real de campanas
- evitar saturar clientes con mensajes repetidos

Capacidades concretas:

- segmentacion automatica por valor, frecuencia, recencia y potencial
- ranking de clientes para seguimiento comercial
- recomendador de campanas por objetivo
- sugerencia de texto de WhatsApp o email adaptado al contexto
- control de fatiga comercial
- lectura de respuesta comercial por segmento
- sugerencia de siguiente mejor accion

Traduccion al lenguaje del cliente interno:

- clientes para recuperar
- clientes mas fieles
- clientes con alto potencial
- clientes dormidos
- clientes que compran poco pero podrian comprar mas

Automatizaciones recomendadas:

- reactivacion semanal de clientes dormidos
- seguimiento automatico a presupuestos o ventas incompletas
- campanas para segmentos segun stock, rubro o temporada
- prioridad de respuesta comercial en base a valor esperado

## 4.2 Inteligencia financiera y contable

Objetivos:

- anticipar tension de caja
- ordenar cobranzas por prioridad real
- detectar desvio de margen por producto, vendedor o sucursal
- encontrar operaciones sospechosas o inconsistentes
- priorizar donde conviene corregir antes

Capacidades concretas:

- proyeccion de caja a 7, 15 y 30 dias
- ranking de clientes por riesgo de cobro
- alertas de cuentas corrientes sensibles
- deteccion de descuentos fuera de patron
- deteccion de ventas con margen anormalmente bajo
- comparativa real entre facturacion, margen y cobranza
- explicaciones simples de por que subio o bajo el resultado

Traduccion al lenguaje del cliente interno:

- plata por cobrar con riesgo
- ventas con ganancia demasiado baja
- clientes que estan pagando cada vez mas tarde
- sucursales que venden bien pero dejan menos margen
- semanas donde puede faltar caja

## 4.3 Inteligencia de stock, compras y reposicion

Objetivos:

- anticipar faltantes
- detectar sobrestock
- recomendar cuanto pedir y cuando pedir
- priorizar productos criticos
- sugerir compras segun rotacion, margen y estacionalidad

Capacidades concretas:

- forecast por producto, familia, sucursal y periodo
- dias estimados de cobertura
- recomendacion de compra por proveedor
- clasificacion de riesgo de quiebre
- deteccion de mercaderia inmovilizada
- sugerencia de accion comercial para productos lentos

## 4.4 Inteligencia ejecutiva para dueno y gerencia

Objetivos:

- responder preguntas de negocio en lenguaje natural
- resumir lo importante sin ruido
- explicar cambios de facturacion, margen, stock y cobranza
- proponer prioridades concretas para hoy

Valor real:

- que esta pasando
- por que esta pasando
- que tiene que mirar primero
- que conviene hacer ahora

Salida ideal:

- que mejoro
- que empeoro
- donde hay riesgo
- donde hay oportunidad
- que accion concreta se recomienda

---

## 5. Agentes propuestos

### 5.1 Agente de demanda y reposicion

Responsable de:

- forecast de ventas
- riesgo de quiebre
- sugerencia de compra
- deteccion de sobrestock

### 5.2 Agente de pricing y rentabilidad

Responsable de:

- sugerencia de precios
- deteccion de margen erosionado
- revision de descuentos
- oportunidades de mejora de rentabilidad

### 5.3 Agente comercial y CRM

Responsable de:

- segmentacion
- prioridad comercial
- clientes a recuperar
- clientes de alto valor
- siguiente mejor accion

### 5.4 Agente de marketing operativo

Responsable de:

- campanas sugeridas
- mensaje recomendado
- canal sugerido
- horario recomendado
- control de fatiga
- lectura de impacto comercial

### 5.5 Agente financiero y de cobranzas

Responsable de:

- riesgo de cobro
- orden sugerido de gestion
- proyeccion de caja
- desvio financiero
- alertas de operaciones sensibles

### 5.6 Agente ejecutivo

Responsable de:

- resumen diario del negocio
- respuesta conversacional
- priorizacion de focos
- traduccion de resultados a lenguaje simple

### 5.7 Agente de alertas y control

Responsable de:

- detectar patrones raros
- escalar alertas
- cortar automatizaciones si detecta riesgo
- consolidar incidentes relevantes

---

## 6. Flujo correcto de trabajo entre agentes

```text
Trigger o pregunta
    ->
Orquestador
    ->
Consulta de datos confiables
    ->
Agente/s deterministas
    ->
Resultado estructurado
    ->
Agente explicador o recomendador
    ->
Salida para UI / n8n / aprobacion
    ->
Auditoria
```

### Ejemplo 1: cliente en riesgo de abandono

1. se detecta baja de actividad
2. el agente CRM valida historial, monto, frecuencia y ultima compra
3. el agente marketing propone accion
4. el sistema genera mensaje sugerido
5. si hay aprobacion o regla habilitada, n8n lo envia
6. se registra el resultado

### Ejemplo 2: margen bajo en una linea de productos

1. el agente financiero detecta deterioro
2. el agente pricing revisa precios, descuentos y costos
3. el agente ejecutivo resume el hallazgo
4. se sugiere accion puntual
5. si se aprueba, queda lista la correccion operativa o la campana comercial necesaria

---

## 7. Contrato tecnico que deben cumplir todos los agentes

Todo agente debe devolver un contrato estable. No alcanza con texto libre.

```json
{
  "agent": "crm_intelligence",
  "status": "ok",
  "confidence": "alta",
  "summary": "Se detectaron 18 clientes para recuperar esta semana.",
  "evidence": {
    "period": "2026-04",
    "records_used": 1823,
    "main_signals": [
      "baja de frecuencia",
      "mayor tiempo desde la ultima compra",
      "ticket historico alto"
    ]
  },
  "findings": [],
  "recommended_actions": [],
  "allowed_automations": [],
  "requires_approval": true
}
```

Campos obligatorios:

- `agent`
- `status`
- `confidence`
- `summary`
- `evidence`
- `findings`
- `recommended_actions`
- `allowed_automations`
- `requires_approval`

Esto hace posible:

- explicar bien en frontend
- auditar
- reusar resultados en n8n
- evitar respuestas vacias o ambiguas

---

## 8. Capa de datos y contexto compartido

La IA no puede conectarse a datos "como salga". Necesita una capa de contexto ordenada.

### 8.1 Fuente de verdad

La fuente principal debe seguir siendo el backend de negocio, no consultas libres desordenadas.

Recomendacion:

Mantener una **API interna de datos para IA** desde Node.js hacia `ai-python`.

Ventajas:

- centraliza permisos
- evita logica duplicada
- permite limpiar y normalizar datos antes de analizarlos
- facilita auditar que se expuso a IA

### 8.2 Conjuntos de datos internos que deben existir

- ventas historicas
- stock actual y stock minimo
- movimientos por sucursal
- cuentas corrientes
- cobranzas
- clientes y actividad
- acciones comerciales realizadas
- respuestas de campanas
- costos, precios y descuentos
- proveedores y tiempos de reposicion

### 8.3 Memoria operativa compartida

Cada corrida del orquestador debe trabajar con un `context` comun:

```json
{
  "company_id": 1,
  "branch_id": 2,
  "user_role": "admin",
  "customer_id": 42,
  "product_id": null,
  "period": "2026-04",
  "objective": "reactivar_clientes"
}
```

---

## 9. Seguridad, permisos y confiabilidad

### 9.1 Niveles de accion

**Nivel 1 - solo lectura**  
La IA analiza y muestra informacion.

**Nivel 2 - recomendacion**  
La IA sugiere una accion, pero no la ejecuta.

**Nivel 3 - ejecucion con aprobacion**  
La IA deja una accion preparada y un humano aprueba.

**Nivel 4 - ejecucion automatica controlada**  
Solo para procesos de bajo riesgo, con reglas muy claras, bitacora y rollback operativo cuando aplique.

### 9.2 Reglas que no se negocian

- nunca inventar datos
- nunca ocultar incertidumbre
- nunca ejecutar acciones sensibles por texto libre sin validacion
- nunca exponer margen, costo o deuda a perfiles sin permiso
- nunca disparar automatizaciones masivas sin control de saturacion

### 9.3 Modo simulacion obligatorio

Antes de habilitar cualquier flujo automatico sensible, debe existir:

- vista previa
- cantidad de afectados
- mensaje o accion propuesta
- razon de recomendacion
- bandera `dry_run`

---

## 10. Frontend: complejo por dentro, simple por fuera

La experiencia tiene que traducir complejidad tecnica a decisiones claras.

### 10.1 Lenguaje que si debe aparecer

- clientes por recuperar
- ventas con seguimiento pendiente
- oportunidades de mejora
- productos para reponer
- plata por cobrar con prioridad
- negocios para revisar hoy
- resumen del dia

### 10.2 Lenguaje que no debe aparecer

- embeddings
- score de inferencia
- cluster
- z-score
- elasticidad
- vector store
- agente multi-step

### 10.3 Pantallas sugeridas

**Centro de oportunidades**

- clientes a contactar
- pagos a reclamar
- precios a revisar
- productos a reponer

**Centro de salud del negocio**

- ventas
- margen
- cobranza
- stock
- alertas

**Asistente ejecutivo**

- como viene el mes
- que se vendio mejor
- que estoy cobrando peor
- donde se me esta yendo margen
- que deberia atacar primero

### 10.4 Regla de presentacion para usuarios no tecnicos

Cada bloque visual debe responder en este orden:

1. que esta pasando
2. por que importa
3. que conviene hacer

Ejemplos correctos:

- "Hay 12 clientes que conviene contactar esta semana"
- "Esta semana podria faltar stock en 4 productos importantes"
- "Estas ventas dejaron poca ganancia y conviene revisarlas"
- "Hay cobros atrasados que merecen seguimiento hoy"

Ejemplos incorrectos:

- "Cluster comercial con score 0.71"
- "Z-score negativo en margen"
- "Segmentacion RFM con churn"
- "Inferencia multi-agent completada"

### 10.5 Criterios visuales obligatorios

El frontend de IA debe:

- mostrar pocas prioridades, no ruido
- usar titulos claros y accionables
- explicar riesgos sin dramatizar
- destacar accion sugerida y evidencia breve
- evitar bloques de texto tecnico largos
- permitir aprobacion o descarte de acciones sensibles de forma obvia

---

## 11. Integracion con n8n

La fase de automatizaciones ya deja una base muy buena. Esta capa IA debe apoyarse en esa base, no reinventarla.

### 11.1 Rol real de n8n

n8n no debe tomar decisiones complejas por su cuenta. Debe ejecutar flujos aprobados o disparados por resultados ya calculados.

n8n debe usarse para:

- cron y disparadores
- colas de acciones
- integracion con WhatsApp, email y servicios externos
- notificaciones internas
- seguimiento de estado de una automatizacion

n8n no debe usarse para:

- calcular logica de negocio central
- definir scoring sensible
- tomar decisiones sin evidencia

### 11.2 Flujos prioritarios

**Reactivacion comercial**

- IA detecta clientes para recuperar
- prepara prioridad, motivo y mensaje
- n8n ejecuta envio o deja aprobado
- se registra resultado en CRM

**Seguimiento de cobranza**

- IA ordena a quien reclamar primero
- n8n dispara recordatorios por regla
- se registra contacto, respuesta y estado

**Reposicion preventiva**

- IA detecta riesgo de faltante
- prepara sugerencia de compra
- n8n genera tarea o mensaje al proveedor
- se registra decision

**Resumen ejecutivo diario**

- IA consolida lo importante del dia
- n8n lo entrega por canal definido
- queda registro del resumen enviado

---

## 12. Implementacion tecnica propuesta

### 12.1 Estructura objetivo en `ai-python`

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
    alert_agent.py
  services/
    data_service.py
    llm_service.py
    cache_service.py
    audit_service.py
    permissions_service.py
  models/
    schemas.py
    agent_contracts.py
```

### 12.2 Backends Node.js que hay que consolidar

Ya existe base en:

- `backend/server/controllers/aicontroller.js`
- `backend/server/controllers/llmcontroller.js`
- `backend/server/controllers/reportaicontroller.js`

Lo correcto no es seguir agregando endpoints sueltos. Lo correcto es ordenar por dominios:

- `ai-read` para analisis
- `ai-actions` para recomendaciones y aprobaciones
- `ai-admin` para auditoria, jobs y configuracion

### 12.3 Caching y performance

Se recomienda cachear:

- forecast
- scoring comercial
- resumen ejecutivo
- proyeccion de caja
- analisis por sucursal

Pero nunca cachear sin versionar contexto. Toda clave debe incluir:

- empresa
- sucursal cuando aplique
- periodo
- tipo de analisis
- fecha de generacion

---

## 13. Roadmap corregido para dejarlo perfecto

Este orden esta pensado para potencia real y bajo riesgo.

**Nota de implementacion:** la fase 08 visible no comienza hasta que exista la fundacion del documento `09-arquitectura-ia-enterprise.md`, incluyendo contratos, API interna de datos, corridas persistidas, auditoria y policy engine.

### Etapa 1 - Fundacion de datos, contratos y seguridad

Objetivo: que toda IA trabaje con datos consistentes y trazables.

- definir contratos de salida unificados para agentes
- crear API interna de datos para IA
- centralizar permisos por rol y sucursal
- agregar auditoria de consultas y acciones
- estandarizar `dry_run`, `requires_approval` y bitacora

### Etapa 2 - Motores deterministas de alto valor

Objetivo: construir la capa dura que sostiene todo lo demas.

- mejorar forecast y reposicion
- consolidar scoring comercial y riesgo de abandono
- crear scoring financiero y de cobranza
- crear deteccion de margen bajo y descuentos fuera de patron
- crear resumen estructurado para direccion

### Etapa 3 - Agentes de marketing y finanzas

Objetivo: convertir el sistema en una herramienta de crecimiento y control.

- agente de marketing operativo
- agente financiero y de cobranzas
- sugeridor de campanas
- proyeccion de caja
- seguimiento inteligente de cuentas corrientes

### Etapa 4 - Asistente ejecutivo y explicaciones

Objetivo: que la IA responda bien y de forma entendible.

- orquestador principal
- agente ejecutivo
- respuestas en lenguaje de negocio
- justificacion con evidencia
- panel de resumen diario y semanal

### Etapa 5 - Automatizaciones seguras

Objetivo: ejecutar sin perder control.

- integracion total con n8n usando contratos estables
- aprobaciones humanas donde corresponda
- flujos de reactivacion, cobranza, reposicion y resumen ejecutivo
- dashboards de ejecucion y auditoria

### Etapa 6 - Mejora continua

Objetivo: que el sistema aprenda del uso real.

- medir tasa de apertura, respuesta y conversion de campanas
- medir precision de forecast
- medir efectividad de sugerencias de cobranza
- medir impacto de recomendaciones de precio
- recalibrar reglas y umbrales por negocio

---

## 14. Que hace que esto sea una potencia de verdad

No alcanza con sumar muchos modulos. Se vuelve una potencia cuando las piezas se conectan.

Senales de que esta bien hecho:

- una alerta comercial se transforma en accion concreta
- una caida de margen se explica y se corrige
- una cuenta riesgosa entra sola en seguimiento
- el dueno entiende el negocio sin leer veinte reportes
- marketing sabe a quien hablarle, con que mensaje y para que
- administracion sabe donde mirar primero
- el sistema guarda memoria de lo que funciono y de lo que no

Diferencial comercial real:

- un sistema que ayuda a vender mas
- un sistema que ayuda a cobrar mejor
- un sistema que ayuda a cuidar margen
- un sistema que reduce decisiones a ciegas
- un sistema que ordena la empresa y la vuelve mas rapida

---

## 15. Criterios de calidad para aprobar esta fase

Esta fase debe considerarse bien disenada solo si cumple todo esto:

- la IA explica siempre en lenguaje simple
- ninguna accion sensible queda sin permiso ni trazabilidad
- las recomendaciones muestran evidencia
- marketing, ventas, administracion y direccion reciben valor real
- los agentes pueden crecer sin duplicar logica
- n8n ejecuta, pero no reemplaza la inteligencia central
- el sistema sigue siendo entendible y mantenible
- el frontend principal puede ser entendido por usuarios no tecnicos

---

## 16. Conclusion ejecutiva

La evolucion correcta no es agregar un chatbot y un par de endpoints mas. La evolucion correcta es crear una capa de inteligencia empresarial sobre el ecosistema que ya existe.

Si se implementa asi, KaisenRP deja de ser solo un sistema de gestion y pasa a ser:

- un copiloto comercial
- un radar financiero
- un asistente ejecutivo
- un motor de automatizaciones seguras

Ese es el camino para convertirlo en una plataforma fuerte, vendible y dificil de reemplazar.
