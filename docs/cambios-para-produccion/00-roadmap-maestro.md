# Roadmap Maestro - KaisenRP v2.0

**Fecha de creacion:** 2026-04-15  
**Ultima actualizacion:** 2026-04-20  
**Estado del proyecto:** En ejecucion - agente unificado en curso

---

## ESTADO ACTUAL DE LOS PLANES

| # | Documento | Tema | Estado |
|---|---|---|---|
| 01 | `01-comisiones-vendedores.md` | Comisiones a vendedores | Aplicado |
| 02 | `02-crm-whatsapp-automatizaciones.md` | CRM + WhatsApp | Pendiente |
| 03 | `03-proveedores-cuenta-empresa.md` | Proveedores + Cuenta Empresa | Pendiente |
| 04 | `04-multideposito-sucursales.md` | Multi-deposito / Sucursales | Pendiente |
| 05 | `05-roles-vendedores-accesos.md` | Roles + Dolar Colchon | Pendiente |
| 06 | `06-catalogo-online-completo.md` | Catalogo Online Portal | Pendiente |
| 07 | `07-seguridad-hardening.md` | Seguridad Enterprise | Pendiente |
| 08 | `agent/08-ia-analytics-openclow.md` | IA Analytics + OpenClow | Pendiente |
| 09 | `agent/09-arquitectura-ia-enterprise.md` | Arquitectura IA Enterprise | Parcialmente aplicada, pendiente de cerrar |
| 10 | `agent/terminado/10-motor-agente-operativo.md` | Motor agente operativo | Aplicado |
| 11 | `agent/terminado/11-producto-agente-y-superficies.md` | Producto agente y superficies | Aplicado |
| 12 | `agent/12-entrega-evaluacion-y-gobierno.md` | Entrega, evaluacion y gobierno del agente | Activo |

**Estado del agente**

- Cerrado: `agent/terminado/00-estado-de-fases.md`
- Implementacion ejecutada: `agent/terminado/implementacion de fase 10/`
- Plan pendiente: `agent/pendiente/00-plan-maestro-fases-restantes.md`
- Cobertura total y calidad de respuesta: `agent/cobertura total y calidad de respuesta/00-plan-maestro-cobertura-total.md`

---

## ORDEN DE IMPLEMENTACION RECOMENDADO

### Criterios de priorizacion
1. **Seguridad primero** - Sin vulnerabilidades activas.
2. **Fundacion antes que features** - Los roles, permisos y estructuras base van antes que las pantallas bonitas.
3. **Dependencias entre features** - Los proveedores deben estar antes que "Cuenta Empresa".
4. **Impacto en el negocio** - Las features que el cliente usa hoy tienen prioridad.
5. **IA con base antes que IA visible** - La fase 08 no debe implementarse sin aplicar antes el documento 09.
6. **Frontend entendible para negocio** - Toda experiencia IA debe traducirse a lenguaje simple y accionable.

### Secuencia optima

```text
SPRINT 1 (1 semana) - SEGURIDAD + FUNDACION
  - 07: URL admin oculta + honeypot (1 dia)
  - 07: MFA obligatorio + anti-enumeracion (1 dia)
  - 07: Headers completos + body limits + env validation (0.5 dia)
  - 05: Nuevo rol gerente_sucursal + restricciones vendedor (2 dias)

SPRINT 2 (1 semana) - PROVEEDORES + MULTI-DEPOSITO
  - 03: Extension modelo proveedores + BD (1 dia)
  - 03: Asignacion proveedor -> producto en UI (1 dia)
  - 04: Multi-deposito con aislamiento financiero (3 dias)

SPRINT 3 (1 semana) - CUENTA EMPRESA + DOLAR COLCHON
  - 03: Metodo de pago "Cuenta Empresa" (1 dia)
  - 03: Carga de comprobantes + n8n dispatch (2 dias)
  - 05: Dolar colchon + tipos de cambio configurables (2 dias)

SPRINT 4 (2 semanas) - CATALOGO ONLINE
  - 06: Auth de clientes (registro, login) (2 dias)
  - 06: Catalogo publico mejorado con la plantilla electrohogar (3 dias)
  - 06: Sistema de pedidos + panel Mi Cuenta (3 dias)
  - 06: Admin del catalogo + hero carousel (2 dias)

SPRINT 5 (1 semana) - FUNDACION IA ENTERPRISE
  - 09: Contratos, corridas persistidas y auditoria (2 dias)
  - 09: API interna de datos para IA + permisos + scope (2 dias)
  - 09: Regla de frontend IA en lenguaje de negocio (1 dia)

SPRINT 6 (1 semana) - IA ANALYTICS CORE
  - 08: Forecast mejorado sobre la arquitectura nueva (2 dias)
  - 08: CRM IA + analisis de clientes con evidencia (2 dias)
  - 08: Resumen ejecutivo entendible para dueno y gerencia (1 dia)

SPRINT 7 (1 semana) - CRM + AUTOMATIZACIONES IA
  - 02: CRM + WhatsApp automatizaciones (aplicar plan existente)
  - 08: Dashboard IA completo en lenguaje de negocio (2 dias)
  - 08: Workflows n8n para reposicion, reactivacion y cobranza con aprobacion (2 dias)
```

---

## MIGRACIONES SQL PENDIENTES

| Version | Archivo | Depende de | Features |
|---|---|---|---|
| V28 | `V28__proveedores_y_cuenta_empresa.sql` | - | Proveedores, Cuenta Empresa |
| V29 | `V29__multideposito_sucursales.sql` | V28 | Multi-deposito, Roles |
| V30 | `V30__dolar_colchon_y_roles.sql` | V29 | Dolar Colchon, gerente_sucursal |
| V31 | `V31__portal_clientes.sql` | V29 | Catalogo online, Pedidos |

**Nota:** la plataforma IA enterprise agregara migraciones propias para corridas IA, propuestas, auditoria, aprobaciones y ejecucion.

---

## VARIABLES DE ENTORNO NUEVAS

```env
# Seguridad
ADMIN_PATH_TOKEN=<32-bytes-hex>
CSRF_SECRET=<32-bytes-random>
BCRYPT_ROUNDS=12

# Portal de clientes
CLIENT_JWT_SECRET=<32-bytes-hex>
CLIENT_REFRESH_SECRET=<32-bytes-hex>
CLIENT_JWT_ISSUER=kaisenrp-catalog

# n8n integracion
N8N_WEBHOOK_BASE_URL=https://n8n.tudominio.com
N8N_WEBHOOK_SECRET=<token>
N8N_COMPROBANTE_WEBHOOK_PATH=/webhook/comprobante-proveedor
N8N_REPOSICION_WEBHOOK_PATH=/webhook/reposicion-requerida

# IA
ANTHROPIC_API_KEY=<api-key>
AI_SERVICE_URL=http://ai-python:8000
INTERNAL_API_TOKEN=<token-interno>
REDIS_URL=redis://redis:6379
```

---

## IMPACTO EN INFRAESTRUCTURA

| Componente | Cambio |
|---|---|
| MySQL | Migraciones de negocio + tablas nuevas para corridas IA, propuestas, aprobaciones y auditoria |
| Node.js | Consolidacion de API IA por dominios + data gateway interno + control de acciones |
| React | Pantallas IA en lenguaje de negocio, bandeja de acciones y resumen ejecutivo entendible |
| FastAPI (Python) | Refactor de runtime IA con orquestador, engines y agentes especializados |
| Redis | Nuevo componente para cache de analisis IA |
| n8n | Workflows de ejecucion seguros; no decide, ejecuta contratos aprobados |

---

## PUNTOS DE ATENCION CRITICOS

1. **`ADMIN_PATH_TOKEN` generado antes de todo lo demas** - Sin esto el sistema esta expuesto.
2. **Migrar `deposito_id` a NOT NULL** - Requiere poblar primero todas las ventas existentes con un deposito.
3. **Los JWTs de `gerente_sucursal` incluyen `deposito_id`** - Los tokens existentes no tendran ese claim hasta nuevo login.
4. **El microservicio IA necesita Redis** - Si no hay Redis disponible, el cache debe fallar silenciosamente.
5. **La plantilla electrohogar.zip** - Debe extraerse y convertirse a React respetando el diseno.
6. **Backup antes de cada migracion** - Las migraciones V29 y V31 modifican tablas core.
7. **La fase 08 depende de la aplicacion del documento 09** - No implementar IA visible antes de cerrar contratos, datos, auditoria y policy engine.
8. **El frontend IA debe ser apto para usuarios no tecnicos** - Nada de jerga como scores, embeddings, clusters o inferencias en la experiencia principal.
