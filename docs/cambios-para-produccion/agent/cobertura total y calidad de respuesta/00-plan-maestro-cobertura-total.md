# PLAN MAESTRO - COBERTURA TOTAL Y CALIDAD DE RESPUESTA

**Fecha:** 2026-04-20  
**Estado:** Activo - arquitectura y plan detallado  
**Objetivo:** convertir el agente actual en un sistema que cubra de forma amplia y profunda las preguntas reales del negocio, con respuestas claras, no cortadas, no toscas y no contaminadas por pantallas tecnicas.

---

## 1. Pregunta central

La pregunta correcta ya no es:

- "como agregamos mas IA"

La pregunta correcta es:

- "como hacemos para que el agente entienda de verdad la intencion del usuario"
- "como hacemos para que responda con una forma correcta para cada caso"
- "como evitamos respuestas cortadas, genericas o demasiado dashboard"
- "como hacemos para cubrir cada necesidad del negocio sin volver la UI incomprensible"

---

## 2. Respuesta ejecutiva corta

Si, se puede lograr.

Se puede hacer con Node.

Pero no con una sola capa de prompts ni con una sola surface reutilizada para todo.

Lo que hace falta es una arquitectura por capas:

1. clasificacion de intencion
2. seleccion de playbook
3. plan de datos para esa intencion
4. generacion de respuesta
5. control de calidad de salida
6. contrato visual especifico para esa respuesta
7. fallback deterministicamente util cuando el LLM falle

Mientras eso no exista, el sistema va a seguir cayendo en uno de estos defectos:

- responder un dashboard cuando el usuario hizo una pregunta
- mezclar metricas correctas con forma de respuesta incorrecta
- devolver frases cortadas o flojas
- sonar "inteligente" pero no resolver la pregunta real

---

## 3. Problemas observados hoy

Los sintomas actuales ya muestran una verdad importante:

- el runtime mejoro
- la unificacion del producto mejoro
- la IA ya no esta partida en tantos modulos

Pero la capa de respuesta todavia esta verde.

Problemas concretos:

### 3.1 El agente responde demasiado por lane y no suficiente por intencion fina

Ejemplo:

- una pregunta sobre "catalogo web" cae en una respuesta que sigue oliendo a `overview`

Eso indica que:

- la intencion gruesa puede ser correcta
- pero falta sub-intencion de negocio

### 3.2 El agente a veces responde con forma incorrecta aunque los datos sean correctos

Ejemplo:

- la informacion puede ser util
- pero se entrega como cards genericas, o como resumen ejecutivo, o con siguiente paso demasiado obvio

Eso destruye la sensacion de precision.

### 3.3 El LLM a veces devuelve respuestas cortadas o debiles

Ejemplo:

- "Mira, el negocio muestra una baja importante en las ventas de este periodo, con una caida del ..."

Eso no es un detalle menor.

Eso es un defecto estructural.

Porque significa que hoy falta una capa de:

- validacion de completitud
- validacion de utilidad
- fallback seguro

### 3.4 La UI de preguntar todavia puede mezclar demasiado

Aunque ya mejoro, todavia hay riesgo de:

- mostrar bloques que pertenecen a `today`
- dejar que la respuesta parezca un dashboard vestido de chat

### 3.5 Falta cobertura explicita de dominios de negocio

Hoy no existe una cobertura formal y exhaustiva por familias de preguntas.

Eso implica que el sistema no sabe todavia:

- cuales preguntas deben responderse con plan
- cuales con analisis
- cuales con listado
- cuales con comparacion
- cuales con pregunta aclaratoria

---

## 4. Lo que significa "cubrir absolutamente todo"

No significa:

- tener una sola IA que magicamente responda todo con un prompt universal

Si significa:

- cubrir todas las familias de preguntas de negocio que el producto pretende soportar
- definir para cada una una estrategia de datos, formato y fallback
- saber que hacer cuando la pregunta es ambigua
- saber que no responder todavia sin evidencia

La cobertura total no se construye con un modelo mas "potente".

Se construye con:

- taxonomia de intenciones
- playbooks
- contratos de salida
- output QA
- evaluacion
- surfaces correctas

---

## 5. Principios no negociables

### 5.1 Una pregunta nunca debe sentirse como un dashboard reciclado

`Preguntar` debe responder.

No debe abrir una pantalla tecnica disfrazada.

### 5.2 La forma de la respuesta importa tanto como el dato

Una respuesta correcta en dato pero tosca en forma sigue siendo mala experiencia.

### 5.3 El LLM no puede tener la ultima palabra sin guardas

Toda respuesta generada debe pasar por:

- control de longitud minima
- control de completitud
- control de estructura
- fallback util si falla

### 5.4 El frontend debe seguir siendo trivial de usar

Toda la complejidad debe quedar:

- en runtime
- en playbooks
- en output guards
- en evaluacion

No en la cabeza del usuario.

### 5.5 Node no es el problema

El problema no es el lenguaje del runtime.

El problema es la falta de capas correctas.

---

## 6. Arquitectura objetivo

El camino correcto es este:

```text
Pregunta del usuario
  -> normalizacion de input
  -> deteccion de intencion principal
  -> deteccion de sub-intencion
  -> seleccion de playbook
  -> data plan por playbook
  -> resolucion de datasets
  -> motor de respuesta
  -> output QA
  -> contrato de salida para frontend
  -> surface especifica
```

### 6.1 Capa 1 - Input understanding

Debe decidir:

- que quiso hacer el usuario
- si la pregunta es nueva o follow-up
- si falta aclaracion
- si la respuesta debe ser overview, plan, comparacion, priorizacion o analisis

### 6.2 Capa 2 - Playbook selection

Debe decidir:

- que familia de negocio aplica
- que datos necesita
- que estructura de respuesta corresponde

### 6.3 Capa 3 - Data plan

Debe decidir:

- que datasets son obligatorios
- que datasets son opcionales
- que degradacion se acepta
- cuando hay que pedir aclaracion

### 6.4 Capa 4 - Answer generation

Debe poder:

- usar LLM cuando suma valor
- usar respuesta deterministicamente armada cuando el LLM no es necesario
- mezclar ambas sin perder claridad

### 6.5 Capa 5 - Output QA

Debe rechazar:

- respuestas cortadas
- respuestas demasiado cortas
- respuestas que no respondan la pregunta
- respuestas genericas sin accion
- respuestas no compatibles con el contrato visual

### 6.6 Capa 6 - Surface contract

Cada tipo de pregunta debe renderizarse distinto.

No todo debe pasar por:

- hero
- focus cards
- action list

Eso sirve para algunas cosas, no para todas.

---

## 7. Programas de trabajo necesarios

Este plan queda dividido en 4 programas.

### Programa A - Runtime y Node correctamente usados

Documento:

- `01-node-runtime-hibrido-y-limites.md`

### Programa B - Cobertura total por intenciones y playbooks

Documento:

- `02-playbooks-intenciones-y-contratos-de-respuesta.md`

### Programa C - Frontend preguntar, surfaces y anti-recortes

Documento:

- `03-frontend-preguntar-y-antirrecortes.md`

### Programa D - Evaluacion de calidad, output QA y gates de salida

Documento:

- `04-evaluacion-calidad-y-gates-de-salida.md`

---

## 8. Resultado esperado al cerrar este programa

Cuando este bloque este bien implementado, deberia ser verdad lo siguiente:

- el usuario pregunta algo de negocio y el agente responde en la forma correcta
- una pregunta de catalogo no cae en overview generico
- una pregunta de caja no cae en cards de stock
- una pregunta ambigua pide aclaracion en vez de improvisar
- una respuesta LLM cortada no llega al frontend
- el frontend no mezcla surfaces tecnicas cuando el usuario solo quiere una respuesta
- la precision percibida sube porque forma y contenido ya no pelean entre si

---

## 9. Criterio de salida

Este bloque solo puede darse por cerrado si:

- hay taxonomia de intenciones versionada
- hay playbooks por familia de negocio
- hay output QA y rechazo de respuestas flojas
- `Preguntar` ya no se siente como dashboard
- no aparecen respuestas cortadas en la experiencia principal
- existe evaluacion por intent family y no solo por lane

