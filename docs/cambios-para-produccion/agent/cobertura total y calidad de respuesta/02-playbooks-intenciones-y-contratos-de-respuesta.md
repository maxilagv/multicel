# PLAYBOOKS, INTENCIONES Y CONTRATOS DE RESPUESTA

**Fecha:** 2026-04-20  
**Estado:** Blueprint funcional  
**Objetivo:** definir como cubrir de forma amplia y precisa las preguntas reales del negocio sin depender de respuestas genericas.

---

## 1. Problema de fondo

Hoy el sistema tiene lanes.

Eso es necesario.

Pero no alcanza.

Porque una lane no equivale a una pregunta bien entendida.

Ejemplo:

- `executive_overview` puede servir para
  - "como viene el negocio"
  - "como viene la caja"
  - "que productos promocionar en la web"

Pero esas tres preguntas no deben responderse igual.

La solucion correcta es:

- lane para orquestacion gruesa
- intent family para semantica de negocio
- playbook para forma exacta de resolver y responder

---

## 2. Modelo recomendado

```text
Lane
  -> Intent family
     -> Sub-intent
        -> Playbook
           -> Data plan
           -> Response contract
           -> Fallback rules
```

---

## 3. Familias de intenciones obligatorias

Esta tabla define el minimo serio para "cobertura total" del agente en negocio.

| Familia | Que pregunta resuelve | Forma de respuesta |
|---|---|---|
| `overview` | como viene el negocio | resumen corto + metricas + 3 focos |
| `today` | que tengo que atender hoy | lista priorizada + por que + siguiente paso |
| `cash` | como esta la caja / cobranzas | estado de caja + drenajes + clientes a mirar |
| `clients` | que clientes conviene mover | grupos o clientes + accion comercial |
| `stock` | que mercaderia revisar / reponer | productos + riesgo + reposicion |
| `pricing` | que precios revisar | productos + por que + riesgo |
| `catalog` | catalogo web / ecommerce / publicar productos | plan de implementacion + productos a promocionar |
| `promotion` | que promocionar / que empujar | shortlist de productos + criterio |
| `anomaly` | que raro paso / que cambio fuerte | senal + impacto + validacion |
| `approval` | que necesita decision mia | pendientes + riesgo + accion |
| `history` | que veniamos viendo | corridas y continuidad |
| `clarification` | no se entiende suficiente | pregunta aclaratoria minima |

---

## 4. Regla central

Una intent family no debe definirse por keywords solamente.

Debe definirse por:

- objetivo del usuario
- tipo de decision esperada
- datos minimos necesarios
- forma correcta de respuesta

---

## 5. Sub-intenciones necesarias

Cada familia debe abrirse en sub-intenciones.

### 5.1 Overview

Sub-intenciones:

- salud general
- resumen de metricas
- estado comparado contra periodo anterior
- riesgos abiertos

### 5.2 Cash

Sub-intenciones:

- caja actual
- por donde se va la caja
- cobranzas urgentes
- equilibrio entradas/salidas

### 5.3 Stock

Sub-intenciones:

- riesgo de quiebre
- sobrestock
- productos a reponer
- productos a no promocionar

### 5.4 Catalog

Sub-intenciones:

- que implementar primero
- que productos publicar primero
- que productos promocionar primero
- que productos no promocionar todavia
- que bloque minimo lanzar

### 5.5 Promotion

Sub-intenciones:

- productos estrella
- promociones por rotacion
- promociones por margen
- promociones a evitar por stock

---

## 6. Estructura de playbook

Cada playbook debe declarar como minimo:

```text
id
intent_family
sub_intents
trigger_rules
required_datasets
optional_datasets
degradation_policy
answer_shape
fallback_builder
follow_up_rules
ui_contract
evaluation_suite
```

---

## 7. Tipos de respuesta permitidos

No todas las preguntas deben renderizarse igual.

Tipos recomendados:

### 7.1 `direct_answer`

Para:

- preguntas claras
- una sola necesidad principal

Render:

- respuesta corta
- 3 highlights
- 4 metricas maximo
- siguiente paso

### 7.2 `decision_brief`

Para:

- caja
- pricing
- promocion
- catalogo

Render:

- situacion
- implicancia
- recomendacion
- riesgos

### 7.3 `prioritized_list`

Para:

- que hacer hoy
- que aprobar
- que revisar ya

### 7.4 `comparison_answer`

Para:

- comparar periodos
- comparar opciones
- comparar productos o focos

### 7.5 `clarification_request`

Para:

- preguntas demasiado abiertas
- contexto ambiguo
- falta de scope critico

---

## 8. Playbook obligatorio para "catalogo web"

Este caso ya mostro que no alcanza con overview.

### 8.1 Trigger

Se activa cuando aparezcan patrones como:

- catalogo
- catalogo web
- ecommerce
- tienda online
- publicar productos
- promocionar productos
- que productos subir

### 8.2 Objetivo

Resolver dos preguntas:

- que implementar ya
- que productos promocionar primero

### 8.3 Datasets minimos

- top productos
- stock bajo
- prioridades comerciales abiertas
- pricing review si existe

### 8.4 Respuesta esperada

Debe incluir:

- bloque de implementacion minima
- bloque de preparacion de datos
- shortlist de productos a promocionar
- shortlist de productos a no empujar
- siguiente paso concreto

### 8.5 Respuesta prohibida

No debe devolver:

- overview generico del negocio
- solo ventas y caja
- cards que no respondan la pregunta

---

## 9. Clarifying questions

El agente no debe adivinar siempre.

Debe preguntar cuando la respuesta sin aclaracion seria floja.

Ejemplos:

- "queres un catalogo informativo o con pedidos?"
- "queres promocionar volumen, margen o liquidar stock?"
- "queres recomendaciones para la web o tambien para WhatsApp?"

Regla:

- maximo una aclaracion util antes de responder
- nunca una cadena larga de preguntas

---

## 10. Fallbacks por playbook

Cada playbook debe tener fallback especifico.

Ejemplo:

### Catalog

Si falla el LLM:

- responder con template deterministicamente armado
- nunca volver a overview

### Cash

Si falta ratio de cobranza:

- igual responder caja y deudas
- marcar la limitacion

### Stock

Si falla forecast:

- responder stock bajo y quiebre visible
- marcar degradacion

---

## 11. Modulos recomendados

Para llevar esto a codigo hacen falta como minimo:

- `agentIntentResolverService`
- `agentIntentRegistry`
- `agentPlaybookRegistryService`
- `agentPlaybookCatalogService`
- `agentResponseContractRegistry`
- `agentClarificationService`
- `agentFallbackAnswerService`

---

## 12. Evaluacion por intent family

No alcanza con testear lanes.

Hay que testear por family:

- overview
- cash
- stock
- catalog
- promotion
- clients

Para cada una debe medirse:

- clasificacion correcta
- uso correcto de datasets
- forma correcta de respuesta
- utilidad percibida
- tasa de fallback

---

## 13. Criterio de salida

Este documento se considera correctamente aplicado cuando:

- las preguntas frecuentes del negocio tienen playbooks dedicados
- el agente no recicla `overview` para todo
- cada family tiene contrato visual y fallback propio
- existe evaluacion por family y no solo por lane

