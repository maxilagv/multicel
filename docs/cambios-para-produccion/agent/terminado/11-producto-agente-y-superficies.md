# PRODUCTO AGENTE Y SUPERFICIES - KAISENRP

**Fecha de creacion:** 2026-04-19  
**Estado:** Blueprint de producto y experiencia  
**Objetivo:** definir como debe presentarse, navegarse y entenderse el agente de KaisenRP desde la experiencia de usuario, sin fragmentacion conceptual y sin lenguaje tecnico innecesario.

---

## 1. Proposito de este documento

El documento `10-motor-agente-operativo.md` define como corre el motor.  
Este documento define como ese motor se convierte en producto real.

Lo que resuelve:

- que ve el usuario
- como entra al agente
- como interpreta lo que recibe
- como se organizan las superficies
- como se unifica la experiencia que hoy esta partida
- que lenguaje esta permitido y cual no
- como se pasa de respuesta a accion sin confundir
- como se construye confianza sin volver tecnico el producto

Este documento no define algoritmos internos.  
Define el producto visible del agente.

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

**Aprendizajes que aplican a producto**

- el valor real no esta en "tener chat", sino en tener un punto de entrada unico con capacidades bien orquestadas
- las superficies visuales deben ser tratadas como contratos y no como texto libre sin estructura
- las aprobaciones no son detalle tecnico: son parte central de la experiencia
- el routing entre canales o vistas tiene que ser invisible para el usuario, no una carga cognitiva adicional
- la sesion importa: el agente debe recordar el objetivo de trabajo sin obligar al usuario a repetir todo

---

## 3. Problema actual de producto

Hoy la IA existe, pero no tiene una identidad de producto unica.

### 3.1 Fragmentacion visible

En frontend hoy conviven varias entradas separadas:

- `Asistente del negocio`
- `Prioridades`
- `Predicciones`
- `ChatWidget` global

Eso genera cuatro modelos mentales diferentes:

- "esto es un chat"
- "esto es un dashboard"
- "esto es un tablero de alertas"
- "esto es una pantalla de modelos o analitica"

Cuando un mismo sistema se presenta de cuatro maneras distintas, el usuario no entiende:

- por donde empezar
- para que sirve cada cosa
- si esta repitiendo trabajo
- cual es la superficie oficial
- cual es el lugar correcto para actuar

### 3.2 Fragmentacion semantica

Tambien hay mezcla de lenguajes:

- lenguaje conversacional
- lenguaje de negocio
- lenguaje analitico
- lenguaje tecnico de IA

Ejemplos del problema:

- una parte habla como "asistente"
- otra muestra conceptos como anomalias, z-score o forecast
- otra funciona como cola de acciones
- otra se apoya en el branding del proveedor del modelo

Eso destruye claridad de producto.

### 3.3 Consecuencia real

El usuario no percibe "un agente de negocio".

Percibe:

- una suma de modulos
- una IA que a veces habla y a veces muestra tablas
- una potencia tecnica que no queda traducida a utilidad operativa

Ese es el problema central de producto.

---

## 4. Decision oficial de producto

KaisenRP debe presentar **un solo producto IA**:

## Agente del Negocio

Todo lo demas son superficies internas de ese producto.  
No son productos separados.

### 4.1 Regla principal

El usuario no entra a "modulos IA".  
El usuario entra al agente.

Y dentro del agente puede:

- entender como viene el negocio
- ver que atender ahora
- profundizar una situacion
- aprobar o ejecutar acciones
- revisar historial y decisiones anteriores

### 4.2 Regla de identidad

El agente no se vende como:

- chatbot
- copiloto generico
- laboratorio de predicciones
- interfaz del proveedor LLM

El agente se vende como:

- centro operativo inteligente del negocio
- capa que entiende datos, prioriza y propone acciones
- mecanismo para pasar de informacion a decision y de decision a ejecucion controlada

---

## 5. Posicionamiento del producto

### 5.1 Lo que el agente es

El agente es:

- un centro de interpretacion del negocio
- una capa de contexto sobre ventas, caja, clientes y stock
- un organizador de prioridades
- un preparador de acciones de alto valor
- una interfaz de decisiones con evidencia

### 5.2 Lo que el agente no es

El agente no es:

- un buscador de datos con forma de chat
- un tablero de BI tradicional disfrazado de IA
- un generador de respuestas libres sin compromiso con el dato
- una automatizacion sin supervision
- un demo tecnico para impresionar por lenguaje

### 5.3 Promesa correcta

La promesa del producto no debe ser:

"preguntale cualquier cosa a la IA"

La promesa correcta debe ser:

"entende que esta pasando, que importa y que conviene hacer ahora"

---

## 5.1 Restriccion no negociable de experiencia

El frontend del agente debe ser **extremadamente facil de usar**.

No simplemente "claro".  
No simplemente "ordenado".  
Extremadamente facil.

### Regla principal

La potencia del sistema debe sentirse en el resultado, no en la complejidad de la interfaz.

El usuario no tiene que:

- aprender como piensa el agente
- entender modulos internos
- elegir entre demasiadas rutas
- interpretar estados tecnicos
- redactar prompts complejos

El usuario si tiene que poder:

- entrar
- entender
- decidir
- actuar

en muy pocos pasos.

### Formula oficial

**maxima potencia interna, minima friccion externa**

### Traduccion practica

Por dentro puede existir:

- runtime complejo
- lanes
- politicas
- memoria
- surfaces
- tool registry
- session lifecycle

Pero por fuera el usuario solo debe sentir:

- una entrada clara
- una vista principal obvia
- un lenguaje simple
- acciones concretas
- profundidad disponible solo cuando la necesita

### Regla de excelencia

Si una persona de negocio necesita explicacion para empezar a usar el agente, la experiencia todavia no esta suficientemente resuelta.

---

## 6. Usuarios objetivo y trabajos reales

El producto tiene que resolver trabajo concreto, no curiosidad.

### 6.1 Dueno o direccion

Necesita:

- entender si el negocio va bien o mal
- ver focos urgentes sin entrar al detalle tecnico
- decidir prioridades rapido
- aprobar acciones sensibles

No quiere:

- navegar modulos
- interpretar metricas tecnicas
- descubrir por intuicion como se usa la IA

### 6.2 Gerencia

Necesita:

- transformar datos en lista de trabajo accionable
- bajar a detalle cuando hace falta
- ordenar cobranzas, stock, clientes y margen
- dejar trazabilidad de decisiones

### 6.3 Operacion supervisada

Necesita:

- recibir tareas claras
- no poder disparar automatizaciones riesgosas si no corresponde
- entender el siguiente paso sin leer analitica compleja

### 6.4 Admin tecnico

Necesita:

- diagnosticar caidas, datos vencidos o fallos de proveedor
- revisar logs, rutas, estados y sincronizacion

El admin tecnico no define la experiencia visible.  
Su necesidad existe, pero vive en una capa aparte.

---

## 7. Arquitectura de informacion oficial

La arquitectura de informacion del agente debe ser unica y consistente.

### 7.1 Entrada oficial en navegacion

Debe existir una entrada principal:

- `Agente`

Opcionalmente puede tener subrutas internas, pero no como items de primer nivel equivalentes.

### 7.2 Superficies internas del agente

Dentro de `Agente`, la experiencia debe organizarse en cinco superficies:

1. `Hoy`
2. `Preguntar`
3. `Prioridades`
4. `Analizar`
5. `Historial`

Estas superficies no son productos distintos.  
Son vistas del mismo producto.

### 7.3 Definicion de cada superficie

#### Hoy

Es la vista por defecto.  
Debe responder en segundos:

- como viene el negocio
- que esta en riesgo
- que oportunidad conviene mirar
- que decision falta tomar

Su salida central:

- resumen ejecutivo corto
- tarjetas de foco
- acciones recomendadas
- evidencia minima

#### Preguntar

Es la superficie conversacional guiada.

Su funcion no es "chat libre".  
Su funcion es convertir dudas de negocio en respuestas estructuradas.

Debe incluir:

- presets por objetivo
- caja de pregunta libre
- continuidad contextual de la sesion
- respuestas con estructura fija

#### Prioridades

Es la cola de trabajo del agente.

Debe mostrar:

- propuestas abiertas
- estado de aprobacion
- estado de ejecucion
- impacto esperado
- responsables y trazabilidad

#### Analizar

Es la superficie de profundizacion.

Aqui viven:

- series
- comparaciones
- tablas
- explicaciones de detalle
- drilldowns por producto, cliente, categoria o periodo

No debe ser el punto de entrada principal.  
Es una superficie de segundo nivel.

#### Historial

Debe concentrar:

- corridas anteriores
- decisiones tomadas
- automatizaciones emitidas
- feedback sobre utilidad
- causas de descarte o aprobacion

Su objetivo es memoria operativa y confianza.

---

## 8. Mapeo directo desde el sistema actual

### 8.1 AsistenteNegocio

La pagina actual `AsistenteNegocio` debe convertirse en la superficie `Preguntar`, pero integrada dentro del agente.

Lo que se mantiene conceptualmente:

- presets utiles
- lenguaje simple
- respuesta con foco

Lo que debe cambiar:

- dejar de verse como experiencia aislada
- dejar de competir con un widget global
- integrarse con las prioridades y la evidencia del mismo agente

### 8.2 PrioridadesNegocio

La pagina `PrioridadesNegocio` debe convertirse en la superficie `Prioridades`.

Lo que se mantiene:

- propuestas por categoria
- estados
- aprobaciones
- ejecuciones

Lo que debe cambiar:

- dejar de parecer un modulo aparte
- mostrar contexto del por que fue priorizado
- conectar mejor con `Hoy` y `Preguntar`

### 8.3 Predicciones

La pagina `Predicciones` no debe seguir representando "la IA" para el usuario.

Debe pasar a ser `Analizar`.

Lo que se mantiene:

- forecast
- stockouts
- precios sugeridos
- anomalias

Lo que debe cambiar:

- bajar tecnicismo
- traducir conceptos estadisticos a impacto de negocio
- entrar desde una prioridad, una pregunta o una tarjeta, no como isla principal

### 8.4 ChatWidget global

El `ChatWidget` global no debe seguir siendo otra identidad del sistema IA.

Hay tres opciones validas:

1. eliminarlo
2. convertirlo en acceso rapido al mismo agente
3. dejarlo solo para ayuda contextual de bajo alcance

La opcion recomendada es la 2, con una condicion:

- no puede tener backend, prompts, estados y branding propios
- debe ser solo un punto de entrada alternativo a la misma sesion del agente

### 8.5 Navegacion

La navegacion final no deberia exponer:

- `Asistente`
- `Prioridades`
- `Predicciones`

como tres items IA del mismo nivel.

Debe exponer:

- `Agente`

y dentro del agente resolver el resto.

---

## 9. Flujo ideal de experiencia

### 9.1 Inicio diario

El usuario abre `Agente`.

Ve:

- un resumen ejecutivo de una o dos pantallas
- tres a cinco focos prioritarios
- una lista corta de acciones sugeridas
- un indicador de confianza y frescura

Desde ahi puede:

- aprobar
- descartar
- profundizar
- preguntar

El inicio ideal debe permitir que alguien entienda que hacer en menos de 30 segundos.

### 9.2 Pregunta dirigida

El usuario formula una pregunta del tipo:

- "decime si me tengo que preocupar por la caja esta semana"
- "que clientes conviene recuperar"
- "que mercaderia me puede dejar sin ventas"

El agente responde con una estructura fija:

- que esta pasando
- por que importa
- que hacer ahora
- con que evidencia lo sostiene

### 9.3 Profundizacion

Desde una respuesta o una prioridad, el usuario entra al detalle.

No cae a una pagina tecnica confusa.  
Cae a una vista de analisis contextualizada con:

- grafico relevante
- tabla resumida
- explicacion corta
- acciones posibles

### 9.4 Accion

Si hay una accion disponible:

- el agente la presenta como propuesta
- muestra riesgo, impacto y condiciones
- pide aprobacion si corresponde
- ejecuta o programa por el canal definido

### 9.5 Cierre

La sesion debe dejar:

- rastro de que se vio
- que se aprobo
- que se descarto
- que se ejecuto
- que resultado hubo

---

## 10. Sistema de lenguaje oficial

La experiencia debe ser extremadamente clara para negocio.

### 10.1 Regla principal de lenguaje

Todo lo que el usuario lee primero debe poder entenderse sin saber nada de IA, estadistica o arquitectura.

La facilidad extrema tambien depende del lenguaje:

- frases cortas
- una idea por bloque
- verbos de accion visibles
- cero jerga como primer contacto

### 10.2 Estructura obligatoria de cada respuesta

Toda salida importante del agente debe incluir cuatro bloques:

1. `Que esta pasando`
2. `Por que importa`
3. `Que conviene hacer`
4. `Con que evidencia`

### 10.3 Vocabulario recomendado

Usar:

- foco
- prioridad
- riesgo
- oportunidad
- proximo paso
- impacto esperado
- dato de respaldo
- actualizado hace

### 10.4 Vocabulario restringido

No debe aparecer como lenguaje principal:

- z-score
- sigma
- embeddings
- tokens
- function calling
- context window
- provider
- fallback chain
- agent handoff

Si alguno aparece, debe ser en una capa secundaria de detalle tecnico, no en la experiencia base.

### 10.5 Regla sobre proveedores

El usuario no deberia leer "Gemini", "OpenAI" o el proveedor activo como parte central del producto.

La IA de KaisenRP es KaisenRP.

El proveedor puede aparecer solo:

- en diagnostico tecnico
- en panel admin
- en incidentes
- en logs o trazas internas

---

## 11. Sistema de superficies dirigidas por contrato

OpenClaw muestra una idea importante con Canvas / A2UI: la experiencia del agente mejora mucho cuando el backend no devuelve solo texto, sino tambien estructuras renderizables.

KaisenRP debe adoptar ese principio.

### 11.1 Regla base

El agente no debe responder solo con blobs de texto.

Debe poder devolver contratos de UI para:

- tarjetas
- listas de prioridades
- bloques de evidencia
- tablas
- series
- comparativas
- banners de riesgo
- drawers de aprobacion

### 11.2 Beneficio

Esto permite:

- coherencia entre vistas
- menos ambiguedad
- menos parsing informal en frontend
- continuidad entre respuesta y accion
- menos dependencia de que el modelo "redacte bien"

### 11.3 Contratos visuales minimos

Cada surface del agente debe poder renderizar, como minimo:

- `hero_summary`
- `focus_cards`
- `action_list`
- `evidence_block`
- `detail_panel`
- `approval_panel`
- `execution_status`

### 11.4 Regla de composicion

Una respuesta del agente puede mezclar:

- texto corto
- bloques estructurados
- llamadas a drilldown
- acciones posibles

Pero nunca debe dejar al frontend adivinando la intencion.

---

## 12. Interaccion conversacional correcta

La conversacion debe existir, pero guiada.

### 12.1 Que significa "guiada"

No es limitar la pregunta.  
Es evitar que la experiencia se convierta en un chat vacio sin salida operativa.

Por eso la vista `Preguntar` debe ofrecer:

- presets por objetivo
- ejemplos de preguntas utiles
- seguimiento por contexto actual
- sugerencias de proxima pregunta

La conversacion debe sentirse facil incluso para alguien que escribe poco y pregunta mal.

Por eso el sistema debe resolver bien:

- preguntas cortas
- preguntas ambiguas pero de negocio
- preguntas incompletas apoyandose en contexto reciente
- caminos guiados sin obligar a escribir demasiado

### 12.2 Patrones de follow-up validos

Despues de una respuesta, el agente debe poder sugerir:

- `mostrarme el detalle`
- `convertir esto en prioridad`
- `que hago hoy con esto`
- `preparar mensaje`
- `compararlo con la semana pasada`

### 12.3 Patrones invalidos

No conviene empujar la experiencia a:

- conversaciones eternas
- preguntas completamente generales sin ancla al negocio
- creatividad libre sin dato
- respuestas narrativas muy largas sin decisiones

---

## 13. Aprobaciones como parte del producto

Las aprobaciones no son un paso administrativo escondido.

Son una parte central del producto del agente.

### 13.1 Cuando una aprobacion debe ser visible

Siempre que una accion pueda:

- contactar clientes
- disparar automatizaciones
- modificar precios
- afectar caja
- afectar reputacion o relacion comercial

### 13.2 Informacion minima del panel de aprobacion

Toda aprobacion debe mostrar:

- accion propuesta
- por que se propone
- riesgo
- impacto esperado
- evidencia base
- canal de ejecucion
- quien aprueba
- que pasa si se rechaza

### 13.3 Estados visibles

El usuario debe entender claramente si algo esta:

- pendiente
- en revision
- esperando aprobacion
- aprobado
- enviado
- ejecutado
- fallido
- vencido

No debe haber estados ambiguos.

---

## 14. Construccion de confianza

Un agente de negocio se adopta por confianza, no por novedad.

### 14.1 Componentes de confianza obligatorios

Cada surface relevante debe indicar:

- frescura del dato
- rango temporal usado
- alcance de negocio visible
- nivel de accion o riesgo
- evidencia sintetica

### 14.2 Regla de explicabilidad

Toda recomendacion importante debe poder contestar:

- que dato la respalda
- cual fue la senal principal
- por que ahora
- que cambia si no se hace

### 14.3 Regla de humildad

El agente puede tener incertidumbre.

Si falta contexto o la evidencia es debil, debe decirlo de forma operativa:

- "no alcanza el dato para recomendar accion automatica"
- "conviene revisar manualmente"
- "esta senal requiere confirmacion"

No debe inventar seguridad.

---

## 15. Responsive y accesibilidad

El agente no puede depender de escritorio amplio para entenderse.

### 15.1 En mobile debe priorizar

- resumen ejecutivo
- una lista corta de focos
- aprobaciones
- acciones principales

En mobile la facilidad debe ser aun mas extrema:

- una sola accion principal por bloque
- scroll entendible
- sin saturacion de tarjetas
- sin tablas como entrada principal

### 15.2 En desktop puede expandir

- paneles comparativos
- tablas
- series
- historial lateral
- drawers de detalle y aprobacion

### 15.3 Reglas de legibilidad

- titulos cortos
- cuerpo de texto realmente corto
- color usado para jerarquia, no como unica senal
- estados visibles por texto, no solo por badge

---

## 16. Canales futuros y routing

OpenClaw muestra un patron fuerte: el agente puede vivir en varios canales, pero la experiencia no debe partirse conceptualmente.

KaisenRP debe pensar los canales asi:

### 16.1 Canal primario hoy

- web app

### 16.2 Canales futuros plausibles

- WhatsApp para notificaciones o aprobaciones acotadas
- email ejecutivo diario
- panel de resumen para TV o wallboard

### 16.3 Regla de expansion

Ningun canal nuevo debe crear "otro agente".

Debe ser:

- la misma identidad
- la misma politica
- la misma trazabilidad
- con superficie adaptada al canal

---

## 17. No objetivos de producto

Para no desviar el proyecto, estos no son objetivos del agente en esta fase:

- ser un asistente generalista de todo el sistema
- reemplazar navegacion normal del ERP
- hablar de cualquier tema fuera del negocio
- ejecutar acciones libres no tipificadas
- exponer herramientas internas al usuario final
- dejar que cada pantalla IA tenga lenguaje y patrones propios

---

## 18. Checklist de consolidacion de producto

La experiencia del agente solo debe considerarse correcta si cumple todo esto:

- existe una sola entrada principal llamada `Agente`
- el widget global no compite con la identidad oficial
- `Asistente`, `Prioridades` y `Predicciones` dejan de ser islas conceptuales
- toda respuesta importante tiene estructura de negocio consistente
- las acciones se presentan como propuestas, no como magia del modelo
- las aprobaciones son claras y trazables
- la analitica profunda vive en una capa secundaria
- el lenguaje tecnico queda encapsulado
- el usuario entiende en menos de un minuto como usarlo
- el usuario puede resolver la mayoria de sus tareas sin escribir prompts largos
- la potencia del sistema no agrega friccion visible

---

## 19. Implicancias directas para el codigo actual

Este documento no cambia codigo, pero deja decisiones obligatorias para la fase de implementacion.

### 19.1 Frontend

Habra que consolidar:

- `navigationConfig.ts`
- `Layout.tsx`
- `ChatWidget.tsx`
- `AsistenteNegocio.tsx`
- `PrioridadesNegocio.tsx`
- `Predicciones.tsx`

### 19.2 Backend

Habra que consolidar contratos para que el frontend no consuma piezas sueltas como si fueran productos distintos.

Eso implica al menos:

- estandarizar envelopes de respuesta
- exponer un modelo de session del agente
- separar mejor surfaces de detalle vs acciones
- dejar el chat legacy fuera del centro del producto

### 19.3 Documentacion futura necesaria

Despues de este documento todavia faltara, en fases posteriores:

- contrato exacto de surfaces JSON
- flujo detallado de aprobaciones UI
- guia de copys oficiales del agente
- mapa de migracion de rutas frontend/backend

---

## 20. Criterio final

Si el usuario entra al sistema y sigue preguntandose:

- "esto se usa como chat o como dashboard"
- "para que sirve cada modulo"
- "donde tengo que entrar para decidir"

entonces el producto sigue mal definido.

El objetivo correcto es mas simple:

el usuario entra al `Agente`, entiende el estado del negocio, decide y actua.

Si eso no ocurre, no hay producto IA consolidado aunque exista muy buena arquitectura por debajo.
