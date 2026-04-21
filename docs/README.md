# Documentación — Argensystem Cloud

Índice central de toda la documentación del proyecto. Si buscás algo, empezá acá.

---

## Navegación rápida

| Necesito...                                | Ir a                                      |
|--------------------------------------------|-------------------------------------------|
| Entender la arquitectura del sistema       | [Arquitectura](#arquitectura-y-diseño)    |
| Deployar o mantener el servidor            | [Operaciones](#operaciones)               |
| Ver el roadmap y estado del producto       | [Estrategia y producto](#estrategia-y-producto) |
| Enseñarle el sistema a un usuario          | [Guías de usuario](#guías-de-usuario)     |
| Revisar el marketplace                     | [Marketplace](#marketplace)               |
| Hacer QA antes de un release               | [QA](#qa-y-calidad)                       |

---

## Arquitectura y diseño

Documentos técnicos que describen cómo está construido el sistema.

| Documento | Descripción |
|-----------|-------------|
| [cloud/ARCHITECTURE.md](cloud/ARCHITECTURE.md) | Arquitectura cloud-only: backend, frontend, base de datos, flujo de datos |
| [cloud/SCHEMA.md](cloud/SCHEMA.md) | Esquema completo de la base de datos MySQL (tablas, columnas, relaciones) |
| [cloud/CONTRACT.md](cloud/CONTRACT.md) | Contrato de API: endpoints, payloads, respuestas esperadas |
| [cloud/IDENTITY.md](cloud/IDENTITY.md) | Sistema de identidad, roles, permisos y autenticación JWT |

---

## Operaciones

Todo lo relacionado con deploy, configuración de servidores y mantenimiento.

| Documento | Descripción |
|-----------|-------------|
| [ops/RUNBOOK.md](ops/RUNBOOK.md) | Runbook principal: diagnóstico, comandos frecuentes, troubleshooting |
| [ops/HOSTINGER_QUICK_DEPLOY.md](ops/HOSTINGER_QUICK_DEPLOY.md) | Guía rápida de deploy del backend en Hostinger |
| [ops/HOSTINGER_MULTI_INSTANCE.md](ops/HOSTINGER_MULTI_INSTANCE.md) | Cómo correr múltiples instancias (multi-tenant) en Hostinger |
| [ops/VERCEL_DNS_API_BASE.md](ops/VERCEL_DNS_API_BASE.md) | Configuración de DNS y API base en Vercel |
| [ops/VERCEL_CLIENTE2_PROJECT.md](ops/VERCEL_CLIENTE2_PROJECT.md) | Configuración específica del proyecto Vercel para Cliente 2 |
| [ops/DEPLOY_2026-03-26.md](ops/DEPLOY_2026-03-26.md) | Log de deploy del 26 de marzo 2026 |
| [ops/INSTANCE_CLIENTE2_2026-03-26.md](ops/INSTANCE_CLIENTE2_2026-03-26.md) | Setup de la instancia de Cliente 2 (26 marzo 2026) |
| [ops/ARCA_SETUP.md](ops/ARCA_SETUP.md) | Configuración del módulo ARCA (AFIP/facturación) |
| [operacion.md](operacion.md) | Notas operativas generales del sistema |

---

## Estrategia y producto

Dirección de producto, roadmap, KPIs y planificación por fases.

| Documento | Descripción |
|-----------|-------------|
| [strategy/PRD.md](strategy/PRD.md) | Product Requirements Document: visión, propuesta de valor, usuarios objetivo |
| [strategy/ROADMAP_PHASES.md](strategy/ROADMAP_PHASES.md) | Plan de desarrollo por fases (0 a 5+) |
| [strategy/KPIS.md](strategy/KPIS.md) | North star metric y 8 KPIs obligatorios de negocio |
| [strategy/RELEASE_GATES.md](strategy/RELEASE_GATES.md) | Criterios Go/No-Go para cada release |
| [strategy/EXECUTION_BOARD.md](strategy/EXECUTION_BOARD.md) | Tablero operativo: estado actual, blockers, checklist |
| [strategy/CLOUD_CUTOVER_MAP.md](strategy/CLOUD_CUTOVER_MAP.md) | Mapa de migración a cloud-only (completado) |
| [strategy/PHASES_0_3_SENIOR_PLAYBOOK.md](strategy/PHASES_0_3_SENIOR_PLAYBOOK.md) | Playbook técnico para fases 0 a 3 |
| [strategy/PHASE_4_5_IMPLEMENTATION.md](strategy/PHASE_4_5_IMPLEMENTATION.md) | Implementación técnica de fases 4 y 5 |
| [strategy/PHASE_8_10_IMPLEMENTATION.md](strategy/PHASE_8_10_IMPLEMENTATION.md) | Cierre técnico: seguridad, trazabilidad, QA (fases 8-10) |
| [strategy/MOBILE_PHASE_1_5_IMPLEMENTATION.md](strategy/MOBILE_PHASE_1_5_IMPLEMENTATION.md) | Mobile-first: layout, navegación, flujos críticos (fases 1-5) |
| [strategy/MOBILE_PHASE_6_10_IMPLEMENTATION.md](strategy/MOBILE_PHASE_6_10_IMPLEMENTATION.md) | Mobile: pantallas densas, performance, contrato API (fases 6-10) |
| [strategy/OWNER_OS_SCORECARD_TEMPLATE.md](strategy/OWNER_OS_SCORECARD_TEMPLATE.md) | Scorecard template para owner/operador del sistema |
| [strategy/PRICING_SYSTEM_REFORM.md](strategy/PRICING_SYSTEM_REFORM.md) | **Informe exhaustivo: reforma del sistema de precios** |
| [strategy/SISTEMA_PRECIOS_GUIA.md](strategy/SISTEMA_PRECIOS_GUIA.md) | **Guía completa paso a paso: cómo configurar y usar el sistema de precios** |
| [strategy/MODO_CLARO_IMPLEMENTACION.md](strategy/MODO_CLARO_IMPLEMENTACION.md) | **Guía técnica paso a paso: implementación del modo claro (light mode)** |

---

## Guías de usuario

Tutoriales y documentación para los usuarios finales del sistema.

| Documento | Descripción |
|-----------|-------------|
| [usuario/PRIMEROS_PASOS.md](usuario/PRIMEROS_PASOS.md) | Onboarding: primeros pasos para usuarios nuevos |
| [usuario/VENTAS.md](usuario/VENTAS.md) | Cómo registrar y gestionar ventas |
| [usuario/CLIENTES.md](usuario/CLIENTES.md) | Gestión de clientes y cuentas corrientes |
| [usuario/FINANZAS.md](usuario/FINANZAS.md) | Módulo de finanzas: cajas, movimientos, reportes |
| [usuario/WHATSAPP.md](usuario/WHATSAPP.md) | Integración con WhatsApp |
| [usuario/TUTORIAL_COMPRAS_GENERAL.md](usuario/TUTORIAL_COMPRAS_GENERAL.md) | Tutorial: cómo registrar compras generales |
| [usuario/TUTORIAL_COMPRAS_FUNDAS.md](usuario/TUTORIAL_COMPRAS_FUNDAS.md) | Tutorial: cómo registrar compras de fundas |

**Plantillas descargables:**
- [usuario/plantilla-compras-general.csv](usuario/plantilla-compras-general.csv)
- [usuario/plantilla-compras-fundas.csv](usuario/plantilla-compras-fundas.csv)
- [usuario/plantilla-pedido-fundas.xlsx](usuario/plantilla-pedido-fundas.xlsx)

---

## Marketplace

| Documento | Descripción |
|-----------|-------------|
| [marketplace.md](marketplace.md) | Especificación del módulo marketplace |
| [marketplace-qa.md](marketplace-qa.md) | QA y casos de prueba del marketplace |

---

## QA y calidad

| Documento | Descripción |
|-----------|-------------|
| [qa-checklist.md](qa-checklist.md) | Checklist de QA para validar releases y nuevas funcionalidades |

---

## Convenciones

- Los documentos en `cloud/` son la fuente de verdad técnica del sistema.
- Los documentos en `ops/` tienen fecha cuando son logs de eventos específicos.
- Los documentos en `strategy/` pueden quedar desactualizados — siempre verificar contra el código real.
- Los documentos en `usuario/` deben mantenerse al día con cada cambio de UI.
