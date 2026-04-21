# FASE 7 - APRENDIZAJE Y EXPANSION

**Fecha:** 2026-04-20  
**Estado:** Pendiente  
**Objetivo:** mejorar precision, utilidad y cobertura del agente sin sacrificar gobierno, simplicidad de uso ni trazabilidad.

---

## 1. Sentido de esta fase

Esta fase no es para "hacerlo mas inteligente" en abstracto.

Es para mejorar sobre una base ya estable:

- con feedback real
- con outcomes reales
- con memoria resumida util
- con expansion gradual a nuevas capacidades

---

## 2. Objetivo exacto de la fase

Al cerrar esta fase tiene que ser verdad lo siguiente:

- el agente aprende de feedback explicito e implicito
- la memoria resumida mejora continuidad sin volverlo opaco
- las categorias utiles suben su precision
- las expansiones nuevas se habilitan con gates claros

---

## 3. Paquetes de trabajo

### 3.1 Feedback loops

Capturar y explotar:

- aprobada vs rechazada
- util vs no util
- ejecutada con buen outcome vs mal outcome
- ignorada de forma repetida

### 3.2 Ranking de propuestas utiles

Construir score por:

- categoria
- rol
- tenant
- tipo de entidad

Sin convertir eso en magia negra.

El criterio siempre debe poder explicarse.

### 3.3 Memoria resumida

La memoria no debe crecer como historial infinito.

Debe resumirse de forma controlada:

- decisiones recientes
- preferencias validas
- entidades frecuentemente relevantes
- patrones de rechazo o aprobacion

La memoria resumida solo sirve si:

- puede auditarse
- puede expirar
- puede regenerarse

### 3.4 Mejora por categoria

No mejorar el agente "en bloque".

Mejorar por vertical:

- prioridades diarias
- pricing
- reposicion
- cobranza
- reactivacion
- anomalias

### 3.5 Expansion de canales

Nuevos canales solo despues de web estable:

- notificaciones push internas
- mensajeria controlada
- dashboards especializados
- integraciones externas

Cada canal debe respetar:

- misma policy
- mismo contrato de accion
- misma auditoria

### 3.6 Expansion de autonomia

La autonomia solo puede subir si:

- la categoria fue evaluada
- el riesgo es bajo o medio bien gobernado
- el rollback existe
- los outcomes fueron estables

---

## 4. Archivos y modulos a revisar

### Backend

- `backend/server/services/agentSessionService.js`
- `backend/server/services/agentRuntimeService.js`
- tablas de feedback, proposals y executions
- servicios de resumen o compaction que se definan

### AI

- `ai-python/evaluations/`
- capas futuras de memoria y ranking

### Frontend

- surface de feedback
- historial y memoria visible cuando corresponda

---

## 5. Tests y validaciones obligatorias

- memoria resumida no mezcla usuarios
- memoria expira o se regenera correctamente
- feedback cambia score sin romper explicabilidad
- nueva capacidad o canal respeta policy y auditoria

---

## 6. Orden de implementacion recomendado

1. capturar feedback completo
2. construir score de utilidad por categoria
3. agregar memoria resumida y auditable
4. afinar categorias una por una
5. expandir canales de forma acotada

---

## 7. Riesgos de esta fase

- convertir feedback en una capa opaca imposible de auditar
- guardar demasiada memoria y volver impredecible al agente
- expandir canales antes de estabilizar web
- subir autonomia por entusiasmo y no por evidencia

---

## 8. Criterio de salida

La fase se cierra solo si:

- el aprendizaje mejora precision y utilidad medibles
- la memoria sigue siendo auditable
- la expansion no reintroduce caos ni fragmentacion
- el agente sigue siendo facil de usar aunque internamente sea mas potente
