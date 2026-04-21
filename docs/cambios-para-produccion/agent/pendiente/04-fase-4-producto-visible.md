# FASE 4 - CONSOLIDACION DEL PRODUCTO VISIBLE

**Fecha:** 2026-04-20  
**Estado:** Avanzada, pendiente de cierre formal  
**Objetivo:** cerrar la experiencia visible del agente para que sea una sola, obvia, muy facil de usar y lo suficientemente potente como para no requerir modulos IA separados.

---

## 1. Por que esta fase sigue abierta

Ya se avanzo mucho:

- ruta unica `Agente`
- navegacion unificada
- redireccion desde rutas legacy
- widget alineado
- vista `AgenteNegocio`

Pero todavia falta cerrar la experiencia final:

- historial visible y util
- estados de degradacion mejor presentados
- criterio por rol
- pulido mobile
- retiro definitivo de restos legacy en copys, flujos o pantallas residuales
- cierre completo de la experiencia `Hoy`, `Preguntar`, `Prioridades`, `Analizar`, `Historial`

---

## 2. Objetivo exacto de la fase

Al cerrar esta fase tiene que ser verdad lo siguiente:

- un usuario entiende el agente en menos de un minuto
- no siente que existan varias IAs distintas
- encuentra rapido que mirar, que preguntar y que aprobar
- el producto funciona igual de claro en desktop y mobile
- los estados normales, vacios y degradados son comprensibles

---

## 3. Superficies que deben quedar cerradas

### Hoy

Debe responder:

- como viene el negocio
- que se movio
- que merece atencion ahora

### Preguntar

Debe responder:

- preguntas libres
- presets de negocio
- continuidad de sesion sin friccion

### Prioridades

Debe responder:

- que atender primero
- por que
- que propuesta existe
- que se puede aprobar o ejecutar

### Analizar

Debe responder:

- detalle predictivo
- drilldowns
- evidencia analitica

### Historial

Debe responder:

- que corridas hubo
- que lane se uso
- que quedo degradado
- que propuestas o ejecuciones se generaron

---

## 4. Paquetes de trabajo

### 4.1 Sweep final de identidad

Buscar y cerrar cualquier resto visible de:

- "IA"
- "Asistente"
- "Predicciones" como modulo aislado
- nomenclatura tecnica expuesta innecesariamente

Solo se aceptan referencias tecnicas en contextos admin o internos.

### 4.2 Arquitectura final de la pantalla principal

La pantalla `AgenteNegocio` debe cerrar:

- hero superior
- resumen principal
- prioridades accionables
- detalle expandible
- acciones y aprobaciones
- historial accesible
- estados vacios
- errores y degradaciones

### 4.3 Criterio por rol

El agente no debe verse igual para todos si el trabajo es distinto.

Minimo:

- `admin`: mas superficie, mas configuracion, mas auditoria
- `gerente`: foco en negocio, prioridades, aprobaciones
- roles limitados: acceso solo si tiene sentido real

### 4.4 Widget global

El widget tiene que quedar como:

- entrada ultra simple
- continuidad de sesion
- capacidad de abrir o aterrizar en el agente grande si hace falta
- lenguaje de negocio

Nunca como un chat aislado que parezca otro producto.

### 4.5 Historial visible

Agregar una vista o panel de historial para:

- ultimas corridas
- lane
- timestamp
- degradacion
- propuestas generadas

### 4.6 Estados de degradacion

Cuando falte un dataset o falle un lane:

- el usuario debe entender que paso
- que parte sigue siendo confiable
- que parte no debe tomarse como recomendacion fuerte

### 4.7 Responsive y mobile

Validar:

- tabs o segment control
- cards y acciones
- paneles de detalle
- largos de texto
- widget

### 4.8 Performance y friccion

Medir y optimizar:

- tiempo a primer insight
- cantidad de clicks para llegar a una accion
- necesidad de escribir texto largo
- cambios de contexto entre widget y pagina principal

---

## 5. Archivos y modulos a revisar

### Frontend principal

- `frontend-react/src/pages/AgenteNegocio.tsx`
- `frontend-react/src/hooks/useAgentRuntime.ts`
- `frontend-react/src/types/agent.ts`
- `frontend-react/src/routes/AppRouter.tsx`
- `frontend-react/src/layout/navigationConfig.ts`
- `frontend-react/src/layout/Navbar.tsx`
- `frontend-react/src/components/ChatWidget.tsx`

### Legacy a revisar o encapsular

- `frontend-react/src/pages/AsistenteNegocio.tsx`
- `frontend-react/src/pages/PrioridadesNegocio.tsx`
- `frontend-react/src/pages/Predicciones.tsx`

### Backend de soporte

- `backend/server/services/agentSurfaceContractService.js`
- `backend/server/controllers/agentcontroller.js`

---

## 6. Tests y validaciones obligatorias

### UX funcional

- el usuario entiende la entrada principal sin entrenamiento
- encuentra prioridades y acciones sin navegar modulos viejos
- el historial es entendible

### Responsive

- desktop
- tablet
- mobile

### Contrato

- todas las surfaces renderizan con el mismo envelope
- degradacion visible no rompe layout

### Regresion

- rutas viejas redirigen bien
- no reaparece una entrada duplicada en navegacion

---

## 7. Orden de implementacion recomendado

1. cerrar naming sweep final
2. congelar arquitectura visible de `AgenteNegocio`
3. agregar historial
4. cerrar estados degradados y vacios
5. pulir widget
6. validar responsive
7. hacer QA de negocio por rol

---

## 8. Riesgos de esta fase

- reintroducir fragmentacion por querer "preservar" paginas viejas
- hacer una UI potente pero dificil
- esconder degradaciones y errores por miedo a ensuciar la interfaz
- sobrecargar la pantalla principal con demasiados controles

---

## 9. Criterio de salida

La fase se cierra solo si:

- el agente ya se vive como un producto unico
- las rutas legacy dejaron de ser necesarias como experiencia principal
- el historial existe y es util
- el uso es extremadamente facil
- la potencia interna no se traduce en friccion visible
