# FASE 2 - CONSOLIDACION DE DATOS Y GATEWAY

**Fecha:** 2026-04-20  
**Estado:** Pendiente  
**Objetivo:** hacer que el agente trabaje solo con datos canonicos, con scope correcto, frescura visible, fallback definido y evidencia suficiente para no inventar precision.

---

## 1. Por que esta fase sigue abierta

Ya existe base util:

- gateway interno
- data registry del agente
- servicios de workspace y analisis

Pero sigue faltando la capa enterprise completa:

- inventario formal de datasets
- owner por dataset
- freshness por dataset
- fallback por dataset
- degradacion visible por falta de datos
- pruebas duras de permisos y scope

---

## 2. Objetivo exacto de la fase

Al cerrar esta fase tiene que ser verdad lo siguiente:

- cada insight puede rastrearse a datasets concretos
- cada dataset tiene owner, freshness y fallback
- el sistema nunca aparenta exactitud cuando trabaja degradado
- los permisos internos por tenant, deposito, rol y entidad estan probados
- el contrato visible del agente muestra evidencia suficiente

---

## 3. Entregables reales

- inventario oficial de datasets del agente
- matriz `dataset -> owner -> freshness -> fallback`
- contratos canonicos del gateway
- estrategia de degradacion por dataset
- pruebas de permisos y scope
- evidencia visible en envelope y surfaces

---

## 4. Paquetes de trabajo

### 4.1 Catalogo canonico de datasets

Armar una tabla viva con:

- nombre canonico
- descripcion
- servicio origen
- owner tecnico
- owner de negocio
- granularidad
- costo de consulta
- criticidad

Datasets esperables:

- ventas resumen
- ventas por periodo
- forecast por producto
- stock critico
- stockouts proyectados
- clientes reactivables
- deuda o cobranza
- pricing recommendations
- anomalias
- propuestas pendientes
- ejecuciones recientes

### 4.2 Freshness y ventanas validas

Cada dataset debe tener definida una ventana aceptable.

Ejemplos:

- stock critico: casi tiempo real
- forecast: diario o bajo batch controlado
- resumen financiero: puede aceptar una ventana corta definida

El agente debe poder decir:

- dato fresco
- dato util pero no reciente
- dato no disponible

### 4.3 Fallbacks por dataset

Para cada dataset cerrar:

- fallback tecnico
- fallback de producto
- texto de degradacion
- impacto en confidence

Ejemplo:

- si falla forecast, el agente puede seguir mostrando ventas historicas y stock real, pero no debe formular una recomendacion predictiva como si nada.

### 4.4 Scope y permisos

El gateway debe validar consistentemente:

- tenant
- usuario
- rol
- deposito o sucursal
- entidad especifica

No alcanza con auth general.

Cada dataset debe dejar claro:

- quien puede pedirlo
- con que alcance
- que campos sensibles deben salir filtrados

### 4.5 Evidence model

La evidencia visible del agente tiene que quedar estandarizada.

Cada output importante deberia poder exponer:

- fuentes usadas
- periodo cubierto
- frescura
- nivel de confianza
- degradaciones

### 4.6 Dataset registry ejecutable

El registro del agente no tiene que quedar como simple lista estatica.

Debe poder declarar:

- nombre
- servicio resolver
- freshness esperada
- fallback
- campos de evidence
- restricciones de scope

### 4.7 Contratos de gateway

Los endpoints internos no deben devolver estructuras ambiguas.

Para cada dataset canonico cerrar:

- request shape
- response shape
- errores esperables
- meta de degradacion

### 4.8 Observabilidad de datos

Hay que medir:

- latencia por dataset
- tasa de fallo por dataset
- uso por lane
- porcentaje de outputs degradados por falta de datos

---

## 5. Archivos y modulos a revisar

### Backend

- `backend/server/routes/internalroutes.js`
- `backend/server/controllers/internalcontroller.js`
- `backend/server/services/agentDataRegistry.js`
- `backend/server/services/agentContextBuilderService.js`
- `backend/server/services/aiDataGatewayService.js`
- `backend/server/services/aiWorkspaceService.js`
- `backend/server/services/executiveAssistantService.js`
- repositorios de ventas, stock, clientes, pagos y proveedores segun dataset

### Frontend

- `frontend-react/src/pages/AgenteNegocio.tsx`
- `frontend-react/src/types/agent.ts`

---

## 6. Tests obligatorios

### Contrato

- cada dataset responde con shape estable
- meta de frescura y degradacion aparece cuando corresponde

### Permisos

- usuario sin acceso no ve dataset
- rol acotado ve solo su scope
- deposito o sucursal no se mezclan

### Degradacion

- si falta un dataset critico el agente degrada sin inventar certeza
- confidence baja y mensaje visible aparece

### Regresion

- cambios en repositorios no rompen envelopes del agente

---

## 7. Orden de implementacion recomendado

1. inventario de datasets realmente usados hoy
2. matriz de owner, freshness y fallback
3. refactor del registry ejecutable
4. endurecimiento de permisos internos
5. evidence model comun
6. tests de contrato y de scope
7. metricas y alertas de datos

---

## 8. Riesgos de esta fase

- seguir mezclando datasets con semanticas distintas
- dar respuestas correctas pero sin evidencia suficiente
- ocultar degradacion al usuario
- filtrar datos fuera de scope por falta de validacion fina

---

## 9. Criterio de salida

La fase se cierra solo si:

- cada insight importante puede explicarse con datasets concretos
- freshness y fallback estan cerrados por dataset
- los permisos internos estan probados
- la degradacion se vuelve visible y honesta
- el envelope del agente expone evidencia util para negocio y para auditoria
