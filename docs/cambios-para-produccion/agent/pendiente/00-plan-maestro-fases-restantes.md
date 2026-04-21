# PLAN MAESTRO - FASES RESTANTES DEL AGENTE

**Fecha:** 2026-04-20  
**Estado:** Plan maestro de ejecucion  
**Objetivo:** bajar a una hoja de trabajo concreta, exhaustiva y ordenada todo lo que todavia falta para cerrar el agente de KaisenRP a nivel enterprise real.

---

## 1. Proposito

La carpeta `terminado/` ya separa lo que quedo resuelto:

- congelamiento conceptual
- blueprint del motor
- blueprint de producto
- primera gran bajada a codigo del runtime y de la unificacion visible

Esta carpeta existe para lo que todavia falta.

No para "mejorar la IA" de forma difusa.  
Si no para cerrar las fases oficiales que siguen abiertas en el documento `../12-entrega-evaluacion-y-gobierno.md`.

---

## 2. Fases que quedan abiertas

### Fase 1 - Consolidacion del control plane

Estado actual:

- avanzada
- no cerrada formalmente

Gap principal:

- todavia existen carriles legacy y componentes que conviven con el runtime central sin quedar completamente absorbidos por el control plane.

### Fase 2 - Consolidacion de datos y gateway

Estado actual:

- base presente
- no cerrada

Gap principal:

- falta canonizar datasets, freshness, fallbacks, owners y pruebas duras de permisos.

### Fase 3 - Consolidacion de propuestas y acciones

Estado actual:

- base presente
- no cerrada

Gap principal:

- falta cerrar catalogo de action types, matriz de riesgo, aprobaciones duras y garantias de trazabilidad completa.

### Fase 4 - Consolidacion del producto visible

Estado actual:

- muy avanzada
- no cerrada formalmente

Gap principal:

- falta completar la experiencia unica del agente sin restos legacy, con historial, surface final, estados degradados y criterio de uso obvio para todos los roles.

### Fase 5 - Evaluacion y shadow mode

Estado actual:

- pendiente

Gap principal:

- todavia no existe un sistema formal y continuo de evaluacion del agente en escenarios reales repetibles.

### Fase 6 - Produccion controlada

Estado actual:

- pendiente

Gap principal:

- todavia no existe una salida a produccion con runbooks, limites, alertas y carriles de automatizacion habilitados de forma controlada.

### Fase 7 - Aprendizaje y expansion

Estado actual:

- pendiente

Gap principal:

- falta cerrar feedback loops, memoria resumida, mejora por categoria y reglas de expansion sin perder gobierno.

---

## 3. Principios no negociables

Todo lo pendiente debe ejecutarse respetando estas reglas:

- una sola identidad visible: `Agente`
- un solo runtime rector
- todo insight debe tener procedencia verificable
- toda accion debe tener contrato, policy y auditoria
- el frontend debe seguir siendo extremadamente facil
- la potencia debe crecer por dentro, no como complejidad visible
- no se habilita autonomia antes de evaluacion seria
- no se habilita expansion antes de estabilidad web

---

## 4. Orden de ejecucion recomendado

El trabajo pendiente no debe correrse en orden cosmetico.  
Debe correrse por dependencias reales.

### Ola A - Cerrar el nucleo

Incluye:

- fase 1
- fase 2

Razon:

- sin control plane cerrado y sin datos canonicos, el resto queda montado sobre una base inestable.

### Ola B - Cerrar accion y producto

Incluye:

- fase 3
- fase 4

Razon:

- cuando el runtime y los datos ya estan cerrados, se puede endurecer la salida accionable y terminar la experiencia visible.

### Ola C - Probar de verdad

Incluye:

- fase 5

Razon:

- antes de ampliar autonomia, hay que medir precision, utilidad y riesgo con evidencia.

### Ola D - Subir a produccion con gobierno

Incluye:

- fase 6

Razon:

- el salto a produccion debe ocurrir despues del shadow mode y con incident response listo.

### Ola E - Aprender y expandir

Incluye:

- fase 7

Razon:

- solo tiene sentido mejorar memoria, personalizacion y canales cuando el sistema ya se comporta de forma confiable.

---

## 5. Dependencias entre fases

### Fase 1 depende de

- lo ya terminado en `terminado/`
- runtime actual funcionando
- migracion de sesiones ya existente

### Fase 2 depende de

- fase 1 suficientemente estable
- inventario de servicios y datasets ya existentes

### Fase 3 depende de

- fase 1 cerrada
- fase 2 muy avanzada

### Fase 4 depende de

- fase 1 avanzada
- fase 3 al menos en su primera mitad

### Fase 5 depende de

- fases 1 a 4 suficientemente estables
- surfaces visibles ya coherentes

### Fase 6 depende de

- fase 5 con resultados repetibles
- zero bypass fuera de policy para lo accionable

### Fase 7 depende de

- fase 6 operativa
- feedback persistido y util

---

## 6. Artefactos de esta carpeta

Cada documento de esta carpeta baja una fase a nivel implementacion:

- `01-fase-1-control-plane.md`
- `02-fase-2-datos-y-gateway.md`
- `03-fase-3-propuestas-y-acciones.md`
- `04-fase-4-producto-visible.md`
- `05-fase-5-evaluacion-y-shadow-mode.md`
- `06-fase-6-produccion-controlada.md`
- `07-fase-7-aprendizaje-y-expansion.md`

Ademas existe un programa transversal separado para cerrar la precision visible del agente:

- `../cobertura total y calidad de respuesta/00-plan-maestro-cobertura-total.md`

---

## 7. Streams transversales

Hay temas que atraviesan todas las fases y no deben quedar repartidos sin owner.

### Stream A - Runtime y backend

Responsable de:

- control plane
- sessions
- lanes
- retries
- idempotencia
- contracts

### Stream B - Datos y policy

Responsable de:

- datasets
- freshness
- fallbacks
- scope
- owners
- action risk
- approvals

### Stream C - Producto y surfaces

Responsable de:

- UX del agente
- surfaces
- widget
- historial
- lenguaje de negocio
- mobile

### Stream D - Evaluacion y operaciones

Responsable de:

- replay suite
- scorecards
- alertas
- runbooks
- release gates
- shadow mode

---

## 8. Criterio de avance entre fases

Ninguna fase deberia considerarse "avanzada" solo por tener codigo mergeado.

Para pasar de una fase a la siguiente deben coexistir:

- codigo
- tests
- evidencia operativa
- checklist de salida
- decision explicita de cierre

---

## 9. Riesgos que este plan quiere evitar

- volver a fragmentar el agente en modulos
- sumar mas endpoints directos por fuera del runtime
- permitir acciones sin catalogo ni policy
- mostrar precision falsa cuando falte un dataset
- creer que un rediseño visual equivale a cerrar producto
- subir a produccion sin shadow mode
- agregar memoria o canales nuevos sin gobierno

---

## 10. Definicion de exito

Este plan se considera bien ejecutado solo si al final del recorrido:

- el agente opera desde un control plane unico
- no quedan rutas importantes por fuera del runtime
- cada insight y accion tiene origen verificable
- el producto visible se entiende en menos de un minuto
- la evaluacion demuestra valor real y error controlado
- la produccion corre con limites, alertas y runbooks
- la expansion posterior no compromete simplicidad ni gobierno
