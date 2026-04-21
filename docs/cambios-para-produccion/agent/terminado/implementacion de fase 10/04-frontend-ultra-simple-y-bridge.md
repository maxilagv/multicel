# FRONTEND ULTRA SIMPLE Y BRIDGE DE MIGRACION - FASE 10

**Fecha de creacion:** 2026-04-20  
**Estado:** Especificacion frontend  
**Objetivo:** definir como conectar el nuevo runtime del agente al frontend actual garantizando una experiencia extremadamente facil de usar, aunque el motor interno sea mucho mas potente.

---

## 1. Proposito

Este documento traduce la fase 10 a experiencia.

No busca hacer el frontend "bonito".  
Busca hacerlo:

- obvio
- liviano
- rapido de entender
- potente sin friccion

La regla central es:

**el usuario no debe aprender IA para usar el agente**

---

## 2. Estado actual que debe migrarse

Hoy la IA visible esta partida entre:

- `frontend-react/src/pages/AsistenteNegocio.tsx`
- `frontend-react/src/pages/PrioridadesNegocio.tsx`
- `frontend-react/src/pages/Predicciones.tsx`
- `frontend-react/src/components/ChatWidget.tsx`
- `frontend-react/src/layout/navigationConfig.ts`
- `frontend-react/src/layout/Layout.tsx`
- `frontend-react/src/hooks/useChatAI.ts`
- `frontend-react/src/lib/api.ts`

### Problema actual

Desde UX se perciben como piezas separadas.

Eso obliga al usuario a preguntarse:

- donde entrar
- que usar primero
- si una pantalla pisa a la otra
- si el chat es el mismo sistema o no

La fase 10 debe empezar a resolver eso desde el bridge de runtime.

---

## 3. Regla UX no negociable

El frontend debe volverse mas simple a medida que el backend se vuelve mas potente.

### Esto implica

- menos decisiones de navegacion
- menos escritura obligatoria
- menos tecnicismo
- menos modos mentales

### No implica

- menos capacidad
- menos profundidad
- menos evidencia

Significa que la profundidad debe estar mejor organizada.

---

## 4. Entrada principal recomendada

### 4.1 Navegacion

En `navigationConfig.ts` el objetivo final de esta fase debe quedar orientado a:

- `Agente`

Aunque la unificacion completa visual pueda cerrarse despues, la fase 10 debe dejar listo el bridge para eso.

### 4.2 Ruta recomendada

- `/app/agente`

### 4.3 Subsuperficies internas

Dentro de esa ruta:

- `Hoy`
- `Preguntar`
- `Prioridades`
- `Analizar`
- `Historial`

Estas no deben sentirse como modulos distintos.  
Deben sentirse como pestañas o vistas del mismo agente.

---

## 5. Arquitectura de frontend recomendada

### 5.1 Pagina contenedora nueva

Crear:

- `frontend-react/src/pages/AgenteNegocio.tsx`

### 5.2 Componentes recomendados

- `frontend-react/src/components/agent/AgentShell.tsx`
- `frontend-react/src/components/agent/AgentHeroSummary.tsx`
- `frontend-react/src/components/agent/AgentFocusCards.tsx`
- `frontend-react/src/components/agent/AgentActionList.tsx`
- `frontend-react/src/components/agent/AgentEvidenceBlock.tsx`
- `frontend-react/src/components/agent/AgentDetailPanel.tsx`
- `frontend-react/src/components/agent/AgentApprovalPanel.tsx`
- `frontend-react/src/components/agent/AgentExecutionStatus.tsx`
- `frontend-react/src/components/agent/AgentFollowUps.tsx`

### 5.3 Hook recomendado

- `frontend-react/src/hooks/useAgentRuntime.ts`

### 5.4 Tipo recomendado

- `frontend-react/src/types/agent.ts`

---

## 6. Vista inicial correcta

La vista inicial del agente debe responder, sin esfuerzo:

- como viene el negocio
- que tengo que mirar
- que puedo hacer ahora

### 6.1 Orden visual recomendado

1. `hero_summary`
2. `focus_cards`
3. `action_list`
4. `evidence_block`
5. `follow_ups`

### 6.2 Regla

La vista inicial no debe arrancar con:

- tabla
- chat vacio
- demasiados filtros
- terminologia tecnica

---

## 7. Interaccion extremadamente facil

### 7.1 El usuario no debe depender de prompts largos

Por eso la UI debe ofrecer:

- presets visibles
- follow-ups sugeridos
- botones de profundizacion
- acciones claras

### 7.2 Caja de pregunta

Debe existir, pero no como unico mecanismo.

### 7.3 Si el usuario pregunta mal

El sistema debe ayudar igual:

- usar contexto de sesion
- apoyarse en presets
- devolver aclaracion corta si hace falta

No debe castigar al usuario por no saber pedir bien.

---

## 8. Mapping de pantallas actuales al bridge nuevo

### 8.1 `AsistenteNegocio.tsx`

Debe migrar a:

- surface `Preguntar` dentro de `AgenteNegocio`

Mientras tanto puede vivir como wrapper del runtime nuevo.

### 8.2 `PrioridadesNegocio.tsx`

Debe migrar a:

- surface `Prioridades`

Sus cards, estados y acciones deben renderizarse a partir de contracts del runtime.

### 8.3 `Predicciones.tsx`

Debe migrar a:

- surface `Analizar`

El detalle no debe ser la entrada principal del agente.

### 8.4 `ChatWidget.tsx`

Debe migrar a:

- acceso rapido al mismo runtime

No debe tener backend o identidad IA paralela.

---

## 9. Hook `useAgentRuntime`

Debe centralizar:

- estado de sesion
- run actual
- surfaces recibidas
- actions disponibles
- follow-ups
- loading
- error

### Debe exponer al menos

- `runAgent(input)`
- `continueSession(input)`
- `refreshCurrentSurface()`
- `openDetail(target)`
- `triggerAction(intent, payload)`

### Regla

El resto del frontend no debe hablar con endpoints IA sueltos cuando ya exista este hook.

---

## 10. Reglas visuales de facilidad extrema

### 10.1 Una accion primaria por bloque

Cada bloque visible debe dejar claro cual es el siguiente paso.

### 10.2 Titulos cortos

No mas de una idea principal por tarjeta.

### 10.3 Texto corto

Primero resumen corto, despues detalle opcional.

### 10.4 Colores con significado

- estable
- atencion
- urgente

Pero nunca depender solo del color.

### 10.5 Tablas solo en segundo nivel

Las tablas quedan para `detail_panel`, no para la apertura.

---

## 11. Mobile first real

El agente debe ser usable en mobile sin perder claridad.

### 11.1 En mobile priorizar

- resumen
- tres a cinco focos
- una lista corta de acciones
- aprobaciones

### 11.2 En mobile evitar

- comparativas densas de entrada
- tablas grandes como punto de inicio
- muchos filtros arriba
- dos columnas complejas

### 11.3 En desktop ampliar

- detail drawers
- paneles laterales
- comparativas
- historial visible

---

## 12. Historial y continuidad

El frontend debe usar la sesion del runtime para:

- no perder contexto
- mostrar ultimo objetivo
- sugerir continuidad
- no pedir que el usuario repita todo

### Elementos visibles recomendados

- `Retomar lo ultimo`
- `Seguir con esta prioridad`
- `Volver al detalle`

---

## 13. API bridge requerido en frontend

`frontend-react/src/lib/api.ts` debe sumar helpers como:

- `agentRun`
- `agentGetSession`
- `agentContinueSession`
- `agentGetRun`

### Regla de migracion

Los helpers viejos pueden seguir existiendo un tiempo, pero:

- `AgenteNegocio.tsx` ya debe hablar solo con el runtime nuevo

---

## 14. Compatibilidad transitoria

La fase 10 no exige borrar todas las pantallas viejas inmediatamente.

Pero si exige:

- que la nueva experiencia del agente ya exista
- que el runtime nuevo ya sea consumible
- que el widget global no crezca por fuera del nuevo modelo

### Estrategia

1. crear `AgenteNegocio.tsx`
2. conectar `Hoy` y `Preguntar`
3. conectar `Prioridades`
4. conectar `Analizar`
5. mover o degradar `ChatWidget`

---

## 15. Definition of done frontend

Frontend de fase 10 queda listo cuando:

- existe una ruta principal del agente
- la vista inicial responde rapido que pasa y que hacer
- el usuario puede actuar sin escribir prompts largos
- el runtime nuevo ya alimenta al menos overview y prioridades
- el detalle analitico queda conectado como segundo nivel
- el widget ya no vive como IA independiente
- mobile y desktop conservan claridad

Si falta uno de esos puntos, la fase todavia no dejo un bridge frontend suficiente.
