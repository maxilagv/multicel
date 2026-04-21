# FASE 5 - EVALUACION Y SHADOW MODE

**Fecha:** 2026-04-20  
**Estado:** Pendiente  
**Objetivo:** demostrar con evidencia repetible que el agente es util, preciso y seguro antes de aumentar autonomia o confiarle automatizaciones reales mas amplias.

---

## 1. Por que esta fase es critica

Sin evaluacion dura, cualquier agente parece bueno en demos.

Lo que esta fase tiene que probar es:

- si prioriza bien
- si alucina poco
- si degrada honestamente
- si sus propuestas son utiles
- si sus errores son entendibles y corregibles

---

## 2. Objetivo exacto de la fase

Al cerrar esta fase tiene que ser verdad lo siguiente:

- existe una replay suite estable
- existe shadow mode con casos reales
- existe scorecard por categoria
- se comparan outputs del agente con decisiones humanas
- hay thresholds de salida a produccion controlada

---

## 3. Capas de evaluacion a implementar

### 3.1 Evaluacion de grounding

Mide:

- si el agente usa datasets correctos
- si la evidencia coincide con el output
- si la degradacion aparece cuando falta un dataset

### 3.2 Evaluacion de utilidad

Mide:

- si las prioridades sugeridas fueron utiles
- si la explicacion ayudo
- si el usuario habria actuado distinto

### 3.3 Evaluacion de acciones

Mide:

- si las propuestas eran correctas
- si estaban bien tipificadas
- si el nivel de riesgo fue razonable

### 3.4 Evaluacion de producto

Mide:

- tiempo hasta entender que hacer
- tiempo hasta aprobar o descartar
- friccion para formular preguntas

### 3.5 Evaluacion de operaciones

Mide:

- latencia
- fallos
- tasa de degradacion
- porcentaje de corridas no auditables

---

## 4. Paquetes de trabajo

### 4.1 Dataset de casos canonicos

Armar una coleccion de casos reales y sinteticos de alta calidad:

- panorama diario
- caja sensible
- stock critico
- forecast dudoso
- cliente reactivable
- propuesta de cobranza
- alerta de anomalia
- caso degradado por dataset faltante

### 4.2 Replay suite automatizada

Construir runners para re-ejecutar casos sobre el agente y medir:

- lane elegido
- evidence
- confidence
- propuesta emitida
- policy result

### 4.3 Shadow mode

Ejecutar el agente:

- sin impactar operacion real
- registrando recomendaciones
- comparando contra la decision humana final

### 4.4 Scorecards por categoria

Cada categoria debe tener metricas propias.

Ejemplos:

- prioridades diarias
- pricing
- reposicion
- cobranza
- reactivacion
- anomalias

### 4.5 Captura de feedback humano

Persistir feedback explicito:

- util
- no util
- correcta
- incorrecta
- incompleta
- riesgosa

Y feedback implicito:

- aprobada
- rechazada
- ignorada
- ejecutada con buen resultado

### 4.6 Analisis de errores

Cada error relevante debe clasificarse:

- error de datos
- error de routing
- error de policy
- error de UX
- error de accion

### 4.7 Thresholds de salida

Definir umbrales minimos para pasar a fase 6.

Ejemplo de referencia:

- grounding correcto en categorias criticas >= 90%
- falsos positivos criticos <= 5%
- degradacion visible cuando falta un dataset = 100%
- acciones sin trazabilidad = 0

---

## 5. Archivos y modulos a revisar

### AI y evaluacion

- `ai-python/evaluations/`
- runners o scripts de replay que se definan

### Backend

- tablas de feedback ya existentes
- servicios y repositorios de feedback
- logs de corridas y propuestas

### Frontend o admin interno

- tableros internos de score
- surfaces de feedback rapido

---

## 6. Tests y validaciones obligatorias

- replay suite reproducible
- scorecards generables de forma automatica
- shadow mode sin side effects
- feedback persistido y consultable

---

## 7. Orden de implementacion recomendado

1. congelar categorias de evaluacion
2. armar dataset inicial de casos
3. construir replay suite
4. agregar captura de feedback
5. correr shadow mode
6. revisar errores y ajustar
7. congelar thresholds de salida

---

## 8. Riesgos de esta fase

- evaluar solo respuestas "lindas" y no decisiones reales
- no incluir suficientes casos degradados
- comparar contra decisiones humanas pobres sin contexto
- medir utilidad sin separar por categoria

---

## 9. Criterio de salida

La fase se cierra solo si:

- hay evidencia repetible de valor real
- los errores estan clasificados y entendidos
- existe score por categoria
- el shadow mode demuestra que el agente puede pasar a produccion controlada
