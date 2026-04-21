# FASE 6 - PRODUCCION CONTROLADA

**Fecha:** 2026-04-20  
**Estado:** Pendiente  
**Objetivo:** llevar el agente a produccion real con limites, aprobaciones, alertas y runbooks, evitando autonomia silenciosa o comportamientos no auditables.

---

## 1. Por que esta fase no puede improvisarse

La salida a produccion es donde mas facil se arruina un agente bueno:

- por exceso de confianza
- por falta de limites
- por automatizaciones sin rollback
- por observabilidad pobre

Esta fase existe para que eso no pase.

---

## 2. Objetivo exacto de la fase

Al cerrar esta fase tiene que ser verdad lo siguiente:

- el agente puede operar en produccion con aprobaciones reales
- los carriles de automatizacion estan acotados por riesgo
- existen alertas, runbooks y rollback
- ninguna ejecucion relevante ocurre sin trazabilidad

---

## 3. Estrategia de rollout recomendada

### Etapa 1 - Produccion visible sin autoaccion

- surfaces visibles activas
- recomendaciones activas
- acciones solo como propuestas o aprobaciones manuales

### Etapa 2 - Automatizacion de bajo riesgo

- solo action types de bajo riesgo
- limites de volumen
- ventanas horarias
- auditoria reforzada

### Etapa 3 - Automatizacion media bajo supervision

- aprobaciones reales
- monitoreo de outcomes
- rollback probado

### Etapa 4 - Expansion acotada

- solo si la etapa anterior fue estable

---

## 4. Paquetes de trabajo

### 4.1 Feature flags por fase y por tenant

El despliegue debe poder activarse por:

- tenant
- rol
- lane
- tipo de accion
- entorno

### 4.2 Limites operativos

Definir:

- volumen maximo por accion
- volumen maximo por ventana
- horarios permitidos
- entidades excluidas
- categorias bloqueadas

### 4.3 Alertas y observabilidad

Alertas minimas:

- duplicados
- tasa de fallo alta
- latencia anomala
- degradacion excesiva
- saturacion de propuestas
- ejecuciones fuera de patron

### 4.4 Runbooks

Runbooks minimos:

- dataset critico caido
- accion duplicada
- ejecucion fallida
- policy mal configurada
- lane devolviendo outputs inconsistentes
- widget o surface principal rota

### 4.5 Auditoria operativa

Tablero interno para ver:

- corridas del agente
- propuestas emitidas
- aprobaciones
- ejecuciones
- fallos
- degradaciones

### 4.6 Rollback y kill switches

Debe existir:

- kill switch global del agente
- kill switch del chat bridge
- kill switch por lane
- kill switch por action type

### 4.7 Control post-release

Toda activacion debe tener:

- responsable
- ventana de observacion
- criterio de rollback
- reporte de comportamiento

---

## 5. Archivos y modulos a revisar

### Backend

- `backend/server/.env.example`
- `backend/server/controllers/chatcontroller.js`
- `backend/server/services/agentRuntimeService.js`
- `backend/server/services/aiAutomationSyncService.js`
- `backend/server/services/n8nService.js`
- servicios de alertas y logs

### Frontend

- superficies de aprobacion
- indicadores visibles de estado y degradacion

### Infra

- redis
- scheduler
- n8n
- logging y metricas del entorno productivo

---

## 6. Tests y validaciones obligatorias

- kill switch funciona
- rollback no deja el sistema roto
- alertas disparan en fallos simulados
- automatizacion bloqueada no se ejecuta
- accion de bajo riesgo si ejecuta deja auditoria completa

---

## 7. Orden de implementacion recomendado

1. congelar flags y kill switches
2. congelar limites operativos
3. implementar alertas y tablero
4. escribir runbooks
5. habilitar produccion visible sin autoaccion
6. habilitar bajo riesgo controlado
7. revisar outcomes

---

## 8. Riesgos de esta fase

- activar demasiados carriles al mismo tiempo
- no observar suficiente despues del release
- creer que una aprobacion humana reemplaza una mala policy
- no tener rollback realmente practicado

---

## 9. Criterio de salida

La fase se cierra solo si:

- produccion ya corre bajo gobierno explicito
- las alertas y runbooks son utilizables
- no hay ejecucion silenciosa
- el rollback esta probado
