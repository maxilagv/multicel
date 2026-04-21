# ENTREGA, EVALUACION Y GOBIERNO DEL AGENTE - KAISENRP

**Fecha de creacion:** 2026-04-19  
**Estado:** Plan maestro de ejecucion  
**Objetivo:** detallar los pasos, controles, evaluaciones y responsabilidades necesarias para llevar el agente de KaisenRP a un nivel enterprise real sin improvisacion.

---

## 1. Proposito de este documento

Los documentos `08`, `09`, `10` y `11` ya cubren:

- vision
- arquitectura
- motor operativo
- producto y superficies

Lo que faltaba era lo mas incomodo y mas importante:

- como se entrega de verdad
- en que orden
- con que criterios de salida
- como se evalua
- como se gobierna
- cuando una feature IA puede pasar a produccion y cuando no

Este documento existe para evitar el error mas comun en proyectos de agentes:

tener una idea poderosa, un prototipo llamativo y una base parcial, pero sin disciplina de entrega ni control de riesgo.

---

## 2. Referencias externas base

**Fuentes externas oficiales consultadas el 2026-04-19**

- OpenClaw README: <https://github.com/openclaw/openclaw>
- OpenClaw Pi Integration Architecture: <https://docs.openclaw.ai/pi>
- OpenClaw Channel Routing: <https://docs.openclaw.ai/channels/channel-routing>
- OpenClaw Groups: <https://docs.openclaw.ai/channels/groups>
- OpenClaw Exec Approvals: <https://docs.openclaw.ai/cli/approvals>
- OpenClaw Canvas / A2UI: <https://docs.openclaw.ai/platforms/mac/canvas>
- Pi coding agent README: <https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md>
- Pi compaction: <https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md>

**Aprendizajes que impactan esta hoja de ruta**

- un agente serio necesita runtime, sesion, herramientas y politica antes de expandir interfaz
- el sistema debe tolerar branching, retries, fallbacks y compaction sin perder gobernabilidad
- las aprobaciones no pueden agregarse al final; deben existir desde el diseno
- los canales y vistas se escalan mejor cuando la logica central ya esta consolidada
- la calidad de un agente no se mide solo por "lo bien que habla", sino por precision operativa, trazabilidad y control de accion

---

## 3. Diagnostico de madurez actual

KaisenRP no esta en cero.

Eso es importante porque el siguiente paso no es "inventar un agente desde la nada".  
El siguiente paso es consolidar una base que ya existe parcialmente.

### 3.1 Capacidades reales ya presentes

Hoy ya existen piezas relevantes:

- rutas IA productivas
- forecasting, stockouts, anomalias y precios
- workspace de prioridades
- corridas persistidas
- propuestas persistidas
- ejecuciones persistidas
- feedback persistido
- policy engine
- sincronizacion con automatizaciones
- scheduler diario
- gateway interno de datos
- aprobaciones

### 3.2 Problemas reales que siguen abiertos

Tambien siguen abiertos puntos criticos:

- identidad de producto fragmentada
- coexistencia entre chat legacy y carril enterprise
- contratos heterogeneos
- falta de session model visible de punta a punta
- memoria todavia acotada
- ausencia de un framework formal de evaluacion
- observabilidad IA todavia incompleta
- rollout sin fases explicitamente documentadas

### 3.3 Conclusión operativa

No falta "agregar IA".

Lo que falta es:

- consolidacion
- criterios de calidad
- plan de entrega por fases
- evaluacion sistematica
- gobierno estricto de accion

---

## 4. Principio rector de implementacion

La implementacion del agente debe seguir esta secuencia:

1. consolidar control plane
2. consolidar datos y contratos
3. consolidar surfaces y experiencia
4. consolidar evaluacion y observabilidad
5. expandir automatizacion bajo gobierno

Nunca al reves.

### Regla fundamental

No se deben sumar nuevas capacidades visibles del agente si antes no esta claro:

- de donde sale el dato
- quien puede verlo
- que riesgo tiene
- como se audita
- como se mide si fue util

---

## 5. Corrientes de trabajo obligatorias

La entrega debe dividirse en seis corrientes paralelas pero coordinadas.

### 5.1 Corriente de runtime

Incluye:

- run lifecycle
- session lifecycle
- memory layers
- retries
- expiracion
- ejecucion controlada

### 5.2 Corriente de datos

Incluye:

- gateway interno
- datasets canonicos
- frescura
- permisos por scope
- cobertura de entidades

### 5.3 Corriente de producto

Incluye:

- unificacion de IA bajo `Agente`
- surfaces
- lenguaje
- aprobaciones visibles
- drilldowns consistentes

### 5.4 Corriente de evaluacion

Incluye:

- datasets de prueba
- replay de casos reales
- precision de recomendaciones
- precision de acciones
- validacion de contratos

### 5.5 Corriente de observabilidad

Incluye:

- logs
- metricas
- trazas
- dashboards
- incidentes

### 5.6 Corriente de gobierno

Incluye:

- permisos
- aprobaciones
- politicas de riesgo
- ownership
- release gates

---

## 6. Fases oficiales de entrega

La entrega del agente debe seguir fases formales.

No se debe declarar "terminado" por tener una demo convincente.

### Fase 0 - Congelamiento conceptual

**Objetivo**

Cerrar definiciones de producto y arquitectura para dejar de sumar modulo IA por intuicion.

**Entregables**

- carpeta `agent/` consolidada
- vision oficial del agente
- blueprint del motor
- blueprint de producto
- plan de entrega y gobierno

**Criterio de salida**

- todas las decisiones base estan documentadas
- no quedan dudas sobre identidad unica del producto
- no se crean nuevas rutas o pantallas IA por fuera de esta estructura

### Fase 1 - Consolidacion del control plane

**Objetivo**

Formalizar el agente como runtime central y no como suma de handlers.

**Trabajo**

- definir envelope canonico de run
- definir session id y conversation id
- normalizar step logging
- normalizar status machine de corridas
- unificar naming de agentes internos

**Entregables**

- contrato de run canonico
- tabla de estados oficial
- criterios de idempotencia
- reglas de reintento

**Criterio de salida**

- toda corrida importante del agente se puede auditar de punta a punta
- no hay rutas IA invisibles al runtime central

### Fase 2 - Consolidacion de datos y gateway

**Objetivo**

Garantizar que el agente trabaja con datos confiables, scope correcto y frescura observable.

**Trabajo**

- canonizar datasets del gateway
- documentar owners por dataset
- definir freshness por dataset
- definir fallbacks cuando un dataset no esta disponible
- validar permisos internos por clase de dataset

**Entregables**

- inventario de datasets IA
- tabla de freshness y fallback
- pruebas de permisos
- estrategia de degradacion

**Criterio de salida**

- cada insight y accion puede rastrearse a datasets concretos
- si un dataset falla, el sistema degrada sin inventar precision

### Fase 3 - Consolidacion de propuestas y acciones

**Objetivo**

Hacer que toda salida accionable del agente pase por contratos, politica y trazabilidad.

**Trabajo**

- tipificar propuestas por categoria
- tipificar acciones
- endurecer policy engine
- endurecer contratos de ejecucion
- cerrar estados de aprobacion y ejecucion

**Entregables**

- catalogo oficial de action types
- tabla de riesgo por accion
- reglas de aprobacion por accion
- tests de politica y de ejecucion

**Criterio de salida**

- no existe accion libre fuera del catalogo
- toda automatizacion emitida deja contrato, aprobacion y resultado

### Fase 4 - Consolidacion del producto visible

**Objetivo**

Transformar la IA actual en un producto unico llamado `Agente`.

**Trabajo**

- unificar navegacion
- integrar `Asistente`, `Prioridades` y `Predicciones`
- redefinir widget global
- crear experiencia `Hoy`, `Preguntar`, `Prioridades`, `Analizar`, `Historial`
- traducir tecnicismo a lenguaje de negocio

**Entregables**

- IA entrypoint unico
- surfaces internas coherentes
- copys oficiales
- responsive behavior validado

**Criterio de salida**

- cualquier usuario entiende como usarlo en menos de un minuto
- deja de existir la sensacion de modulos IA desconectados

### Fase 5 - Evaluacion y shadow mode

**Objetivo**

Probar utilidad real antes de aumentar autonomia.

**Trabajo**

- ejecutar el agente en paralelo sin impactar operacion
- comparar recomendaciones con decisiones humanas
- medir utilidad por categoria
- medir precision de falsos positivos y falsos negativos

**Entregables**

- tablero de precision por categoria
- tablero de utilidad por rol
- reporte de falsos positivos
- reporte de acciones que el humano habria hecho distinto

**Criterio de salida**

- el agente demuestra valor consistente en escenarios repetidos
- los errores se entienden y son corregibles

### Fase 6 - Produccion controlada

**Objetivo**

Permitir acciones reales, primero bajo supervision y luego en carriles acotados.

**Trabajo**

- habilitar aprobaciones reales
- habilitar automatizaciones seguras por categoria
- limitar horarios, volumen y entidades
- monitorear outcomes

**Entregables**

- runbooks de incidentes
- alertas de saturacion, duplicado o fallo
- reportes de ejecucion real

**Criterio de salida**

- cada automatizacion en produccion es trazable
- no hay ejecucion silenciosa ni fuera de politica

### Fase 7 - Aprendizaje y expansion

**Objetivo**

Aumentar precision y cobertura sin romper gobierno.

**Trabajo**

- feedback loops
- ranking de propuestas utiles
- afinado por categoria
- memoria resumida
- nuevos canales una vez consolidado web

**Criterio de salida**

- la expansion mejora utilidad sin aumentar caos ni riesgo

---

## 7. Marco formal de evaluacion

Un agente enterprise necesita evaluacion continua.

No alcanza con "se ve bien" o "da respuestas coherentes".

### 7.1 Tipos de evaluacion obligatoria

Debe haber al menos cinco capas de evaluacion.

#### Evaluacion de datos

Preguntas:

- el dataset llego completo
- esta en tiempo
- tiene el scope correcto
- esta coherente con la realidad operacional

#### Evaluacion de interpretacion

Preguntas:

- la lectura del caso fue correcta
- entendio el foco principal
- separo bien riesgo de oportunidad

#### Evaluacion de recomendacion

Preguntas:

- la accion propuesta es razonable
- la prioridad es correcta
- la urgencia esta bien calibrada

#### Evaluacion de politica

Preguntas:

- requeria aprobacion y la pidio
- no excedio el rol permitido
- no actuo fuera de horario o cooldown

#### Evaluacion de outcome

Preguntas:

- la accion ejecuto bien
- genero el resultado esperado
- fue util para negocio

### 7.2 Conjuntos de prueba necesarios

Deben existir datasets de evaluacion por dominio:

- ventas
- caja y cobranzas
- stock y reposicion
- rentabilidad y precios
- reactivacion de clientes

Cada dataset de evaluacion debe incluir:

- caso
- contexto
- respuesta esperada
- accion esperada
- nivel de riesgo
- criterio de fallo

### 7.3 Replay historico

El sistema debe poder re-ejecutar casos historicos y comparar:

- que hizo el agente
- que hizo el humano
- cual fue mejor
- donde hubo errores de timing, prioridad o interpretacion

### 7.4 Metricas minimas por categoria

Para cada categoria hay que medir como minimo:

- precision de la prioridad
- precision de la recomendacion
- tasa de descartes por usuario
- tasa de aprobaciones
- tasa de ejecucion exitosa
- utilidad reportada

### 7.5 Rubrica de calidad de salida

Toda salida importante debe puntuar:

- claridad
- pertinencia
- accionabilidad
- evidencia
- seguridad

Si una salida es clara pero insegura, falla.  
Si es segura pero inutil, tambien falla.

---

## 8. Shadow mode, human review y autonomia acotada

La evolucion del agente no debe saltar de "solo recomendaciones" a "autonomia fuerte".

Debe pasar por estados.

### 8.1 Modo 1 - Observador

El agente:

- analiza
- resume
- propone

Pero no dispara nada.

### 8.2 Modo 2 - Preparador

El agente:

- analiza
- propone
- prepara payloads o borradores

Pero un humano decide todo.

### 8.3 Modo 3 - Ejecutor con aprobacion

El agente:

- prepara acciones
- espera aprobacion
- ejecuta dentro de policy

### 8.4 Modo 4 - Automatizacion controlada

Solo para carriles de bajo riesgo.

Ejemplos posibles:

- recordatorios blandos de reactivacion
- tareas internas de revision de stock

Siempre con:

- limites de volumen
- cooldown por entidad
- monitoreo
- rollback operativo

### 8.5 Regla de ascenso

Ninguna categoria sube de nivel si no cumple:

- precision aceptable
- baja tasa de reclamo
- politica estable
- trazabilidad completa

---

## 9. Observabilidad enterprise

Sin observabilidad no hay agente enterprise.

### 9.1 Logs obligatorios

Cada run debe dejar logs de:

- entrada
- scope
- datasets consultados
- pasos ejecutados
- fallbacks activados
- propuestas emitidas
- acciones emitidas
- errores

### 9.2 Metricas obligatorias

Debe medirse:

- runs por hora y por dia
- latencia por surface
- error rate por endpoint
- degradaciones por proveedor
- datasets fallidos
- propuestas creadas
- propuestas aprobadas
- propuestas descartadas
- automatizaciones emitidas
- automatizaciones fallidas

### 9.3 Trazabilidad obligatoria

Debe poder contestarse para cualquier caso:

- quien pidio la corrida
- con que objetivo
- con que datos
- que salida genero
- que accion quedo habilitada
- quien aprobo
- que paso despues

### 9.4 Alertas operativas

Deben existir alertas para:

- scheduler detenido
- aumento brusco de fallos IA
- gateway de datos caido
- proveedor LLM caido
- automatizaciones duplicadas
- propuestas sin resolver acumuladas
- alto porcentaje de descartes

---

## 10. Seguridad y gobierno

El agente solo es enterprise si su gobierno es estricto.

### 10.1 Principios de gobierno

- minimo privilegio
- aprobacion explicita para riesgo relevante
- auditabilidad completa
- separacion entre analisis y accion
- secretos fuera del alcance del modelo

### 10.2 Reglas obligatorias

- el modelo no accede directamente a credenciales
- el modelo no ejecuta acciones arbitrarias
- toda accion real pasa por contratos tipificados
- toda integracion externa tiene control de permisos y timeout
- las decisiones sensibles quedan asociadas a usuario y timestamp

### 10.3 Riesgos que deben gobernarse

- mensajes a clientes fuera de contexto
- saturacion de contactos
- cambios de precio sin supervision
- insights sobre datos vencidos
- alucinaciones convertidas en acciones
- drift entre politica documentada y politica implementada

### 10.4 Ownership

Debe existir ownership explicito de:

- producto del agente
- policy engine
- datasets IA
- surfaces de frontend
- automatizaciones
- incidentes y soporte

Si el ownership es difuso, el agente se degrada rapido.

---

## 11. Runbooks minimos de incidentes

Antes de ampliar autonomia, deben existir runbooks concretos.

### 11.1 Proveedor LLM caido

El sistema debe:

- degradar al siguiente proveedor o modo fallback
- informar degradacion
- evitar respuestas con falsa precision
- registrar el incidente

### 11.2 Gateway de datos IA caido

El sistema debe:

- frenar acciones basadas en dato incompleto
- conservar surfaces historicas si corresponde
- mostrar que falta insumo actual

### 11.3 Scheduler detenido

El sistema debe:

- alertar
- exponer ultimo refresh exitoso
- permitir refresh manual bajo permisos

### 11.4 Automatizacion duplicada

El sistema debe:

- detectar idempotencia rota
- bloquear repeticion
- marcar entidad afectada
- pedir revision manual

### 11.5 Recomendacion claramente errada

El sistema debe:

- permitir descarte con motivo
- registrar feedback
- enviar el caso a evaluacion
- impedir promotion automatica de esa heuristica sin revision

---

## 12. Release gates

Una capacidad nueva del agente no puede pasar a produccion si no cumple todos estos gates.

### 12.1 Gate de contrato

- tiene input definido
- tiene output definido
- tiene estados definidos

### 12.2 Gate de datos

- usa datasets declarados
- tiene freshness definida
- tiene fallback definido

### 12.3 Gate de politica

- tiene riesgo clasificado
- tiene permisos definidos
- tiene regla de aprobacion definida

### 12.4 Gate de evaluacion

- tiene casos de prueba
- tiene replay minimo
- tiene criterio de precision aceptable

### 12.5 Gate de operacion

- tiene logs
- tiene metricas
- tiene alertas
- tiene runbook

Si falta cualquiera de estos gates, no esta lista.

---

## 13. Roadmap operativo recomendado

La construccion del agente deberia secuenciarse asi:

1. cerrar documentacion y decisiones base
2. unificar la identidad de producto en frontend
3. unificar envelopes, sesiones y surfaces en backend
4. endurecer catalogo de acciones y policy engine
5. montar framework de evaluacion y replay
6. correr shadow mode
7. habilitar aprobaciones reales
8. habilitar automatizaciones acotadas
9. expandir memoria, aprendizaje y canales

---

## 14. Definicion de listo

El agente solo deberia considerarse "listo para produccion real" si cumple simultaneamente:

- identidad unica de producto
- runtime central trazable
- datos gobernados y frescos
- acciones tipificadas y auditables
- aprobaciones claras
- evaluacion continua activa
- observabilidad suficiente
- runbooks operativos disponibles
- ownership definido
- errores degradados con seguridad

Si falta uno de esos puntos, no esta listo.  
Puede estar avanzado, pero no listo.

---

## 15. Criterio final

Construir un verdadero agente de negocio no es agregar pantallas IA ni enchufar un modelo mas capaz.

Es construir un sistema que:

- entiende el negocio con datos reales
- prioriza con criterio
- propone acciones utiles
- ejecuta solo bajo gobierno
- aprende sin perder control

OpenClaw y Pi sirven como referencia porque muestran patrones maduros de runtime, sesiones, surfaces y aprobaciones.  
Pero KaisenRP no tiene que copiar su forma externa. Tiene que absorber la disciplina estructural y aplicarla a su propio contexto enterprise.

La conclusion practica es simple:

si se quiere un agente "casi tan preciso como OpenClaw pero centrado en el negocio", la precision no va a salir de un mejor prompt.  
Va a salir de datos correctos, contratos estrictos, evaluacion sistematica y un producto sin ambiguedad.
