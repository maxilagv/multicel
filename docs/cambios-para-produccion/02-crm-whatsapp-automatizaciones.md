# CRM, WhatsApp Oficial y Automatizaciones con n8n — Rediseño Completo para Producción

**Estado actual:** CRM básico (3.5/10), WhatsApp via Baileys (no oficial, violación de ToS de Meta, riesgo de ban permanente del número).  
**Objetivo:** CRM de verdad con automatizaciones de negocio, WhatsApp Business API oficial, n8n como motor de automatización, fidelización real de clientes.

---

## ÍNDICE

1. [Diagnóstico del Estado Actual](#1-diagnóstico-del-estado-actual)
2. [Migración a WhatsApp Business API Oficial](#2-migración-a-whatsapp-business-api-oficial)
3. [n8n como Motor de Automatización](#3-n8n-como-motor-de-automatización)
4. [Rediseño del CRM](#4-rediseño-del-crm)
5. [Automatizaciones de Fidelización de Clientes](#5-automatizaciones-de-fidelización-de-clientes)
6. [Automatizaciones de Ventas y Post-Venta](#6-automatizaciones-de-ventas-y-post-venta)
7. [Automatizaciones Internas del Negocio](#7-automatizaciones-internas-del-negocio)
8. [Segmentación Inteligente de Clientes](#8-segmentación-inteligente-de-clientes)
9. [Chatbot de WhatsApp](#9-chatbot-de-whatsapp)
10. [Campañas de Marketing por WhatsApp](#10-campañas-de-marketing-por-whatsapp)
11. [Reportes y Métricas de CRM](#11-reportes-y-métricas-de-crm)
12. [Cambios Técnicos en el Backend](#12-cambios-técnicos-en-el-backend)
13. [Cambios Técnicos en el Frontend](#13-cambios-técnicos-en-el-frontend)
14. [Migraciones de Base de Datos](#14-migraciones-de-base-de-datos)
15. [Plan de Implementación por Etapas](#15-plan-de-implementación-por-etapas)
16. [Costos y Stack Tecnológico](#16-costos-y-stack-tecnológico)

---

## 1. Diagnóstico del Estado Actual

### 1.1 El problema con Baileys (WhatsApp Web no oficial)

El sistema actual usa `@whiskeysockets/baileys`, una librería que simula un cliente de WhatsApp Web. Esto significa que el sistema:

- **Escanea un QR** como si fuera un teléfono conectando WhatsApp Web.
- **No está autorizado por Meta** para enviar mensajes masivos o automatizados.
- **Puede ser baneado permanentemente** en cualquier momento, sin previo aviso, sin recurso.
- **No puede usar plantillas verificadas** (los mensajes salen como texto plano, sin botones, sin verificación de marca).
- **No puede recibir mensajes** de forma confiable en volumen.
- **Requiere que el número esté en un teléfono físico** con WhatsApp activo.
- **No escala**: si se quiere enviar a 500 personas, Meta detecta el patrón y banea el número.
- **No tiene webhooks**: no hay forma de saber si el cliente respondió, si el mensaje fue leído, etc.

Esto no es un sistema de mensajería de negocio. Es un parche que en cualquier momento deja de funcionar y no tiene retorno.

**Riesgo real:** Un cliente que depende de WhatsApp para comunicarse con sus clientes y le banean el número pierde toda su cartera de contactos de WhatsApp. No hay recuperación posible.

### 1.2 El problema con el CRM actual

El CRM tiene la estructura básica (oportunidades, actividades, cuentas, contactos, proyectos) pero le falta todo lo que hace a un CRM útil en el día a día:

| Funcionalidad | Estado actual |
|---|---|
| Pipeline Kanban visual | ❌ No existe |
| Lead scoring automático | ❌ No existe |
| Segmentación dinámica de clientes | ❌ Solo tags de texto libre |
| Automatización de seguimiento | ❌ No existe |
| Recordatorios automáticos al vendedor | ❌ No existe |
| Historial de comunicaciones en la ficha del cliente | ❌ Parcial |
| Integración WhatsApp ↔ CRM | ❌ Los mensajes enviados no se registran en la ficha |
| Forecast de ventas | ❌ No existe |
| Alertas de clientes inactivos | ❌ No existe |
| Encuestas de satisfacción post-venta | ❌ No existe |
| Programas de fidelización | ❌ No existe |

### 1.3 Qué sí existe y se puede aprovechar

Lo que ya existe y es una buena base:

- **Tabla de clientes rica**: tiene `telefono_e164`, `whatsapp_opt_in`, `whatsapp_status`, `tipo_cliente`, `segmento`, `tags`, `zona_id`. Es una base sólida.
- **Tabla de ventas completa**: con estados de pago y entrega, fecha, cliente, vendedor. Perfecta para disparar automatizaciones post-venta.
- **Sistema de campañas**: `whatsapp_campaigns` y `whatsapp_campaign_recipients` con reintentos y eventos de entrega. La arquitectura está bien pensada, solo hay que cambiar el proveedor.
- **Email con SendGrid**: ya integrado, con plantillas y logging.
- **CRM con historial**: el historial automático de cambios de fase es una funcionalidad valiosa.
- **Roles y permisos**: el sistema ya diferencia admin, gerente, vendedor.

---

## 2. Migración a WhatsApp Business API Oficial

### 2.1 Opciones disponibles

Hay dos caminos para tener WhatsApp Business API oficial:

#### Opción A — Meta Cloud API (directo con Meta)

Meta ofrece acceso directo a su API sin intermediarios. Costo: pago por conversación (no por mensaje).

**Estructura de costos Meta (2025):**
- Conversaciones de marketing: ~USD 0,072 por conversación (24hs)
- Conversaciones de utilidad: ~USD 0,042 por conversación
- Conversaciones de autenticación: ~USD 0,032 por conversación
- Conversaciones de servicio (iniciadas por el cliente): GRATIS las primeras 1000/mes
- Las primeras 1000 conversaciones de negocio por mes son gratis

**Pros:**
- Costo más bajo a escala
- Control directo
- Sin intermediarios

**Contras:**
- Requiere cuenta de Meta Business verificada
- Setup más complejo (Facebook Developer App, webhooks, etc.)
- Soporte técnico solo a través de documentación

#### Opción B — BSP (Business Solution Provider) — Recomendado para empezar

Un BSP es un proveedor certificado por Meta que ofrece la API como servicio. Los más populares para Argentina/Latam:

| BSP | Precio aprox. | Notas |
|---|---|---|
| **Twilio** | USD 0.005/mensaje + fee Meta | Muy robusto, SDK excelente, amplia documentación |
| **360dialog** | Desde EUR 5/mes + fee Meta | Popular en Latam, panel de gestión incluido |
| **Infobip** | Cotización custom | Enterprise, costoso |
| **Vonage (Nexmo)** | USD 0.0085/mensaje + fee Meta | Buena API, fácil de usar |
| **MessageBird** | Cotización custom | Ahora Bird.com |
| **Gupshup** | Desde USD 0.002/mensaje | Popular en India y Latam |

**Recomendación concreta: Twilio WhatsApp Business API**

Razones:
- SDK de Node.js excelente y bien documentado.
- Webhooks confiables para recibir mensajes entrantes.
- Dashboard de gestión de plantillas integrado.
- Rate limiting y reintentos manejados por Twilio.
- Precio predecible.
- El backend ya tiene instalado `@sendgrid/mail` (Twilio company), familiaridad de stack.
- Soporte 24/7.

### 2.2 Proceso de activación de WhatsApp Business API con Twilio

Pasos necesarios (este proceso hay que hacerlo una sola vez):

**Paso 1 — Crear cuenta en Twilio:**
- Ir a twilio.com, crear cuenta.
- Verificar negocio (requiere CUIT/nombre de empresa).

**Paso 2 — Activar WhatsApp Sender:**
- En el dashboard de Twilio: Messaging → Senders → WhatsApp Senders.
- Dos opciones:
  - **Sandbox** (para desarrollo): número de Twilio compartido, sin verificación de Meta, gratis.
  - **Production** (para producción): número propio verificado por Meta.

**Paso 3 — Para producción: verificación de Meta Business:**
- Crear/acceder a Meta Business Manager (business.facebook.com).
- Verificar la empresa (subir documentación).
- Crear una Facebook App con producto "WhatsApp".
- Vincular el número de teléfono (puede ser un número nuevo o portar un número existente).
- **IMPORTANTE**: si el número ya tiene WhatsApp instalado en un teléfono, hay que eliminarlo de ese teléfono antes de registrarlo en la API. No pueden coexistir.

**Paso 4 — Configurar webhooks en Twilio:**
- URL del webhook de incoming messages: `https://[tu-dominio]/api/webhooks/twilio/whatsapp`
- URL del webhook de status callbacks: `https://[tu-dominio]/api/webhooks/twilio/status`
- Twilio envía un POST a estas URLs cada vez que llega un mensaje o cambia el estado de entrega.

**Paso 5 — Crear plantillas de mensaje:**
- Las plantillas (templates) requieren aprobación de Meta antes de poder usarse.
- Tiempo de aprobación: 24-72 horas.
- Las plantillas son necesarias para iniciar conversaciones con clientes (outbound). Para responder dentro de una ventana de 24hs, se puede usar texto libre.

**Paso 6 — Configurar variables de entorno:**
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # Sandbox
# o
TWILIO_WHATSAPP_FROM=whatsapp:+549XXXXXXXXX  # Producción con número propio
```

### 2.3 Plantillas necesarias para el negocio

Las plantillas deben crearse en el Business Manager de Meta y aprobarse antes de usar. Estas son las plantillas recomendadas para un negocio de celulares/electrónica:

#### Plantilla 1: Confirmación de pedido
```
Nombre: order_confirmation
Categoría: UTILITY
Idioma: es_AR

Hola {{1}}, tu pedido #{{2}} fue confirmado.
Total: ${{3}}
Estado de entrega: {{4}}

Ante cualquier consulta respondé este mensaje. 🙌
```

#### Plantilla 2: Pedido listo para retirar
```
Nombre: order_ready_pickup
Categoría: UTILITY
Idioma: es_AR

¡Hola {{1}}! Tu pedido #{{2}} está listo para retirar.
Podés pasar por {{3}} en el horario {{4}}.

¿Tenés alguna duda? Respondé este mensaje.
```

#### Plantilla 3: Actualización de entrega
```
Nombre: delivery_update
Categoría: UTILITY
Idioma: es_AR

Hola {{1}}, tu pedido #{{2}} está en camino.
Fecha estimada de entrega: {{3}}.

Seguimiento: {{4}}
```

#### Plantilla 4: Recordatorio de pago pendiente
```
Nombre: payment_reminder
Categoría: UTILITY
Idioma: es_AR

Hola {{1}}, te recordamos que tenés un saldo pendiente de ${{2}} correspondiente a tu compra del {{3}}.

Para regularizarlo podés contactarnos respondiendo este mensaje o llamando al {{4}}.
```

#### Plantilla 5: Catálogo de productos / Promo
```
Nombre: promo_catalog
Categoría: MARKETING
Idioma: es_AR

¡Hola {{1}}! 📱

Tenemos novedades para vos. Mirá nuestro catálogo actualizado con los mejores precios:
{{2}}

¿Querés asesoramiento personalizado? Respondé este mensaje y un vendedor te contacta.
```

#### Plantilla 6: Encuesta de satisfacción
```
Nombre: satisfaction_survey
Categoría: MARKETING
Idioma: es_AR

Hola {{1}}, ¿cómo fue tu experiencia con tu compra del {{2}}?

Respondé con un número del 1 al 5:
1️⃣ Muy mala
2️⃣ Mala
3️⃣ Regular
4️⃣ Buena
5️⃣ Excelente

Tu opinión nos ayuda a mejorar. 🙏
```

#### Plantilla 7: Reactivación de cliente inactivo
```
Nombre: win_back
Categoría: MARKETING
Idioma: es_AR

Hola {{1}}, hace un tiempo que no nos visitás. 👋

Tenemos productos nuevos y ofertas especiales que quizás te interesen.

Respondé "CATÁLOGO" para ver las últimas novedades o "NO GRACIAS" si preferís no recibir más mensajes.
```

#### Plantilla 8: Recordatorio de garantía
```
Nombre: warranty_reminder
Categoría: UTILITY
Idioma: es_AR

Hola {{1}}, tu {{2}} (compra del {{3}}) tiene garantía hasta el {{4}}.

Si tuvieras algún inconveniente con el equipo, no dudes en contactarnos antes de que venza la garantía.
```

### 2.4 Cambios en el backend para migrar a Twilio

El sistema actual tiene una buena abstracción en `messaging/providers/`. El cambio requiere:

**Crear un nuevo provider:**
```
backend/server/services/messaging/providers/twilioWhatsappProvider.js
```

Este provider implementa la misma interfaz que `whatsappWebProvider.js` pero usando el SDK de Twilio:

```javascript
// twilioWhatsappProvider.js
const twilio = require('twilio');

class TwilioWhatsappProvider {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.from = process.env.TWILIO_WHATSAPP_FROM;
  }

  // Enviar mensaje de texto libre (solo dentro de ventana de 24hs)
  async sendTextMessage(to, body) {
    const message = await this.client.messages.create({
      from: this.from,
      to: `whatsapp:${to}`,
      body,
    });
    return { sid: message.sid, status: message.status };
  }

  // Enviar plantilla aprobada por Meta
  async sendTemplate(to, templateName, variables) {
    // Con Twilio Content API o usando contentSid
    const message = await this.client.messages.create({
      from: this.from,
      to: `whatsapp:${to}`,
      contentSid: templateName,  // SID de la plantilla en Twilio
      contentVariables: JSON.stringify(variables),
    });
    return { sid: message.sid, status: message.status };
  }

  // Enviar PDF/documento
  async sendDocumentMessage(to, pdfUrl, caption) {
    const message = await this.client.messages.create({
      from: this.from,
      to: `whatsapp:${to}`,
      mediaUrl: [pdfUrl],
      body: caption,
    });
    return { sid: message.sid, status: message.status };
  }

  // Estado del proveedor (no requiere QR)
  async getStatus() {
    return { 
      state: 'connected', 
      provider: 'twilio',
      phone: this.from 
    };
  }

  // Con Twilio no hay QR ni sesión que manejar
  async connect() { return { state: 'connected' }; }
  async disconnect() { return { state: 'disconnected' }; }
}
```

**Instalar dependencia:**
```bash
npm install twilio
```

**Remover:**
```bash
npm uninstall @whiskeysockets/baileys
```

**Webhook de Twilio para mensajes entrantes:**
```javascript
// routes/webhookRoutes.js
router.post('/webhooks/twilio/whatsapp', express.urlencoded({ extended: false }), async (req, res) => {
  const { From, Body, MessageSid, NumMedia, MediaUrl0 } = req.body;
  
  // Normalizar número (quitar "whatsapp:")
  const telefono = From.replace('whatsapp:', '');
  
  // Buscar cliente por número
  const cliente = await clientesRepository.findByTelefonoE164(telefono);
  
  // Registrar mensaje entrante en CRM
  await crmRepository.createMensajeEntrante({
    telefono,
    cliente_id: cliente?.id,
    mensaje: Body,
    media_url: MediaUrl0,
    provider_message_id: MessageSid,
  });
  
  // Disparar workflow en n8n si corresponde
  await n8nWebhookService.trigger('whatsapp_incoming', { telefono, body: Body, cliente });
  
  // Responder a Twilio (200 OK vacío = no auto-reply)
  res.status(200).send('<Response></Response>');
});

// Webhook de estado de entrega
router.post('/webhooks/twilio/status', express.urlencoded({ extended: false }), async (req, res) => {
  const { MessageSid, MessageStatus, ErrorCode } = req.body;
  
  await whatsappCampaignRepository.updateDeliveryStatus(MessageSid, MessageStatus, ErrorCode);
  
  res.status(200).send('OK');
});
```

### 2.5 Ventana de conversación y tipos de mensaje

La API oficial de WhatsApp tiene una regla importante:

**Si el cliente te escribe primero:**
- Tenés 24 horas para responder con texto libre (sin plantilla).
- Podés enviar documentos, imágenes, botones interactivos, listas.
- Costo: conversación "de servicio" (barata o gratis las primeras 1000/mes).

**Si vos iniciás la conversación:**
- Solo podés usar plantillas aprobadas por Meta.
- Costo: conversación "de utilidad" o "de marketing" (según categoría).
- Si el cliente responde, se abre una ventana de 24hs de texto libre.

Esto hay que tenerlo claro para diseñar las automatizaciones.

---

## 3. n8n como Motor de Automatización

### 3.1 ¿Qué es n8n y por qué es la herramienta correcta?

**n8n** es una plataforma de automatización de flujos de trabajo (workflow automation) de código abierto. Permite conectar servicios, APIs y bases de datos mediante nodos visuales, sin necesidad de escribir código para cada integración.

**Por qué n8n y no otras opciones:**

| Herramienta | Modelo | Costo | Self-hosted | Para este negocio |
|---|---|---|---|---|
| **n8n** | Open source + cloud | Gratis self-hosted | ✅ Sí | ✅ Ideal |
| Zapier | SaaS | USD 20-50/mes | ❌ No | Funciona pero costoso |
| Make (Integromat) | SaaS | USD 9-20/mes | ❌ No | Funciona pero limitado |
| Power Automate | SaaS | USD 15/usuario/mes | ❌ No | Para ecosistema Microsoft |
| Activepieces | Open source | Gratis self-hosted | ✅ Sí | Alternativa a n8n |

n8n en modalidad self-hosted es **gratis para uso ilimitado**, y puede correr en el mismo servidor que el backend o en uno aparte.

### 3.2 Instalación de n8n

**Opción A — Docker (recomendado):**

```yaml
# docker-compose.n8n.yml
version: '3'
services:
  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=n8n.tudominio.com
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - NODE_ENV=production
      - WEBHOOK_URL=https://n8n.tudominio.com/
      - GENERIC_TIMEZONE=America/Argentina/Buenos_Aires
      # Base de datos para n8n (sus propios workflows)
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n_user
      - DB_POSTGRESDB_PASSWORD=password_seguro
      # Autenticación del panel
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=password_muy_seguro
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:
```

```bash
docker-compose -f docker-compose.n8n.yml up -d
```

**Opción B — npm global:**
```bash
npm install -g n8n
n8n start
```

**Opción C — n8n Cloud (si no se quiere mantener infraestructura):**
- n8n ofrece su servicio cloud desde USD 20/mes para uso básico.
- Elimina la necesidad de mantener el servidor de n8n.
- Para empezar es una buena opción.

### 3.3 Cómo se integra n8n con el sistema

La integración funciona en dos direcciones:

**Dirección 1 — El sistema dispara n8n (Webhook trigger):**
El backend envía un POST a n8n cuando ocurre algo relevante.

```javascript
// backend/server/services/n8nService.js
const axios = require('axios');

class N8nService {
  constructor() {
    this.baseUrl = process.env.N8N_BASE_URL;        // https://n8n.tudominio.com
    this.authToken = process.env.N8N_WEBHOOK_TOKEN; // Token de seguridad
  }

  async trigger(eventName, payload) {
    const url = `${this.baseUrl}/webhook/${eventName}`;
    try {
      await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Token': this.authToken,
        },
        timeout: 5000,
      });
    } catch (err) {
      // No bloquear el flujo principal si n8n falla
      console.warn(`n8n trigger failed for event ${eventName}:`, err.message);
    }
  }
}

module.exports = new N8nService();
```

**Dirección 2 — n8n llama al sistema (API calls):**
n8n usa nodos HTTP Request para consumir los endpoints del backend: crear actividades en CRM, actualizar estados, buscar clientes, etc.

```
n8n → GET  /api/clientes?segmento=mayorista
n8n → POST /api/crm/actividades   (crear recordatorio)
n8n → PUT  /api/ventas/:id        (actualizar estado)
n8n → POST /api/whatsapp/enviar   (enviar mensaje)
```

### 3.4 Variables de entorno a agregar

```bash
# n8n
N8N_BASE_URL=https://n8n.tudominio.com
N8N_WEBHOOK_TOKEN=token_secreto_muy_largo

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+549XXXXXXXXX

# SendGrid (ya existe)
SENDGRID_API_KEY=xxxxxxxxxx
SENDGRID_FROM_EMAIL=notificaciones@tuempresa.com
```

### 3.5 Credentials de n8n para el sistema

Dentro de n8n, configurar:

1. **Header Auth** para el backend:
   - Name: `Authorization`
   - Value: `Bearer [JWT token de un usuario API interno]`

2. **Twilio credentials:**
   - Account SID y Auth Token

3. **SendGrid credentials:**
   - API Key

4. **MySQL/PostgreSQL credentials** (si n8n necesita consultar la DB directamente):
   - Host, puerto, usuario, contraseña, base de datos

---

## 4. Rediseño del CRM

### 4.1 Pipeline Kanban Visual

El módulo CRM actual lista oportunidades pero no tiene un tablero visual tipo Kanban. Este es el cambio de UI más impactante.

**Propuesta de columnas del pipeline:**

```
┌──────────┬──────────┬──────────┬──────────────┬──────────┬──────────┐
│   LEAD   │CONTACTADO│ PROPUESTA│  NEGOCIACIÓN │  GANADO  │ PERDIDO  │
│          │          │          │              │          │          │
│ [card]   │ [card]   │ [card]   │    [card]    │  [card]  │          │
│ [card]   │ [card]   │          │              │          │          │
│ [card]   │          │          │              │          │          │
│          │          │          │              │          │          │
│ $120k    │ $350k    │ $80k     │    $200k     │ $450k    │          │
└──────────┴──────────┴──────────┴──────────────┴──────────┴──────────┘
```

Cada card del pipeline debe mostrar:
- Nombre del cliente / cuenta
- Valor estimado
- Días en esta fase
- Próxima actividad programada (con fecha)
- Vendedor asignado (avatar/iniciales)
- Indicador de alerta si lleva más de X días sin actividad

**Interacciones del Kanban:**
- Drag & drop entre columnas
- Al mover a "Ganado" → abre modal para confirmar y generar venta
- Al mover a "Perdido" → pide motivo de pérdida (campo requerido)
- Click en card → abre el panel lateral de detalle

### 4.2 Ficha Completa del Cliente (360°)

La ficha del cliente debe ser el centro de toda la información. Propuesta de estructura:

```
┌─────────────────────────────────────────────────────────────────────┐
│  ROBERTO GARCÍA                              [Editar] [Contactar ▼] │
│  Cliente Mayorista · Zona Norte · Activo                            │
│  📱 +54 9 11 1234-5678  ✉️ roberto@gmail.com                        │
├──────────────┬──────────────────────────────────────────────────────┤
│  RESUMEN     │  TIMELINE DE ACTIVIDAD                               │
│              │                                                      │
│  💰 Total    │  📩 HOY — Mensaje de WhatsApp enviado                │
│  comprado:   │     "Hola Roberto, te mandamos el catálogo..."       │
│  $1.250.000  │                                                      │
│              │  📞 15/04 — Llamada registrada por Juan Pérez        │
│  🛒 Ventas:  │     "Interesado en iPhone 16 Pro"                    │
│  23 compras  │                                                      │
│              │  💵 12/04 — Venta #1089 por $85.000                  │
│  📅 Última   │     iPhone 15 128GB × 1                              │
│  compra:     │     Estado: Entregado ✅                             │
│  hace 3 días │                                                      │
│              │  📩 01/04 — Campaña "Promo Semana Santa" enviada     │
│  ⚠️ Deuda:   │     Estado: Leído ✅                                 │
│  $12.000     │                                                      │
│              │  🎯 25/03 — Oportunidad "iPhone 16 Pro" creada       │
│  📊 Segmento:│     Valor: $200.000 | Fase: Negociación              │
│  Frecuente   │                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
│  TABS: Ventas | Oportunidades | Actividades | Mensajes | Documentos │
└─────────────────────────────────────────────────────────────────────┘
```

**Tab de Mensajes** (nuevo, no existe hoy):
Historial de todos los mensajes de WhatsApp enviados y recibidos de ese cliente, integrado en la ficha. Cada mensaje debe mostrar:
- Fecha y hora
- Dirección (enviado / recibido)
- Estado (enviado, entregado, leído, fallido)
- Si fue manual o automatizado (y por qué automatización)

### 4.3 Lead Scoring Automático

Un sistema de puntuación que clasifica automáticamente la prioridad de cada lead/cliente:

**Fórmula de scoring:**

| Factor | Puntos |
|---|---|
| Tiene teléfono E.164 validado | +10 |
| Tiene email | +5 |
| Compró al menos 1 vez | +20 |
| Compró en los últimos 30 días | +30 |
| Compró en los últimos 90 días | +15 |
| Valor acumulado > $100.000 | +25 |
| Valor acumulado > $500.000 | +50 |
| Más de 5 compras | +20 |
| Respondió mensaje de WhatsApp | +15 |
| Tiene opt-in de WhatsApp activo | +10 |
| Oportunidad activa en pipeline | +20 |
| No compró en los últimos 180 días | -20 |
| Tiene deuda pendiente | -10 |
| WhatsApp bloqueado | -20 |

**Clasificación:**

| Puntaje | Segmento | Color | Acción sugerida |
|---|---|---|---|
| 90-100 | VIP | 🟡 Oro | Trato personalizado, ofertas exclusivas |
| 70-89 | Frecuente | 🟢 Verde | Mantener contacto regular, prioridad media |
| 40-69 | Activo | 🔵 Azul | Seguimiento estándar |
| 20-39 | Dormido | 🟠 Naranja | Campaña de reactivación |
| 0-19 | Inactivo | 🔴 Rojo | Campaña win-back o depurar |

El score se recalcula automáticamente (via n8n o cron) cada 24 horas.

**Nueva columna en la tabla clientes:**
```sql
ALTER TABLE clientes ADD COLUMN lead_score INT DEFAULT 0;
ALTER TABLE clientes ADD COLUMN lead_segmento VARCHAR(20) DEFAULT 'inactivo';
ALTER TABLE clientes ADD COLUMN lead_score_updated_at DATETIME;
```

### 4.4 Pipeline de Oportunidades con Probabilidad Dinámica

Agregar probabilidad de cierre automática según la fase:

| Fase | Probabilidad default | Configurable |
|---|---|---|
| Lead | 10% | ✅ |
| Contactado | 25% | ✅ |
| Propuesta | 50% | ✅ |
| Negociación | 75% | ✅ |
| Ganado | 100% | ❌ |
| Perdido | 0% | ❌ |

**Forecast de ventas:**
```
FORECAST DEL MES = SUM(valor_estimado × probabilidad) para todas las 
                    oportunidades no cerradas del mes actual
```

Esto se muestra en el dashboard del CRM como:
```
Forecast Abril: $245.000
  Cerradas ganadas: $180.000  ███████████████
  En pipeline:      $65.000   ██████
  
Pipeline por fase:
  Negociación:  $200.000 (75%) = $150.000 ponderado
  Propuesta:    $80.000  (50%) = $40.000 ponderado
  Contactado:   $60.000  (25%) = $15.000 ponderado
```

### 4.5 Notificaciones Internas del CRM

Crear un sistema de notificaciones en-app para el equipo de ventas:

**Tipos de notificaciones:**
- "Tenés 3 actividades vencidas"
- "La oportunidad 'iPhone 16 Pro - García' lleva 7 días sin movimiento"
- "Roberto García respondió tu mensaje de WhatsApp"
- "Nueva venta de $85.000 asignada a tu oportunidad"
- "Recordatorio: llamar a López Juan hoy a las 15:00"

**Implementación:**
Nueva tabla `notificaciones_crm` + polling desde el frontend cada 30 segundos o WebSocket.

---

## 5. Automatizaciones de Fidelización de Clientes

Estas son las automatizaciones más valiosas para el negocio. Todas se implementan en n8n.

### 5.1 Flujo: Bienvenida al nuevo cliente

**Trigger:** Se crea un nuevo cliente en el sistema con teléfono válido.

**Workflow en n8n:**

```
[Webhook: cliente_creado]
        ↓
[Esperar 30 minutos]  ← No enviar inmediatamente, parece más natural
        ↓
[¿Tiene whatsapp_opt_in = 1?]
   SÍ ↓                NO ↓
[Enviar plantilla      [¿Tiene email?]
 "bienvenida_cliente"]    SÍ ↓      NO ↓
        ↓             [Enviar    [Fin]
[Registrar actividad   email
 en CRM: "Mensaje      bienvenida]
 bienvenida enviado"]       ↓
                      [Registrar
                       en CRM]
```

**Contenido del mensaje de bienvenida (WhatsApp):**
```
¡Hola {{nombre}}! 👋

Bienvenido/a a [Nombre del negocio]. Gracias por elegirnos.

Desde acá podés:
📱 Consultar productos: respondé "CATÁLOGO"
💰 Ver precios: respondé "PRECIOS"  
📞 Hablar con un asesor: respondé "ASESOR"

¡Estamos para ayudarte!
```

**Qué registrar en CRM:**
- Crear actividad tipo "mensaje" en la ficha del cliente
- Tipo: "whatsapp_automatico"
- Asunto: "Mensaje de bienvenida enviado"
- Estado: completado

### 5.2 Flujo: Felicitación de cumpleaños

**Pre-requisito:** Agregar campo `fecha_nacimiento` a la tabla clientes.

**Trigger en n8n:** Cron job todos los días a las 10:00 AM.

**Workflow:**
```
[Cron: todos los días 10:00 AM]
        ↓
[HTTP Request → GET /api/clientes/cumpleanos-hoy]
        ↓
[¿Hay clientes?]
  SÍ ↓          NO ↓
[Loop para cada cliente]  [Fin]
        ↓
[¿Tiene opt-in WhatsApp?]
  SÍ ↓                  NO ↓
[Enviar mensaje          [¿Tiene email?]
 cumpleaños]                  SÍ ↓
        ↓              [Enviar email cumpleaños]
[¿Es cliente VIP o             ↓
 Frecuente?]           [Fin del loop]
  SÍ ↓        NO ↓
[Agregar cupón  [Fin loop]
 de descuento
 automático]
        ↓
[Registrar en CRM]
```

**Mensaje de cumpleaños:**
```
🎂 ¡Feliz cumpleaños {{nombre}}!

De parte de todo el equipo de [Negocio], te deseamos un día genial.

Como regalo, tenés un {{descuento}}% de descuento en tu próxima compra usando el código: CUMPLE{{año}}

Válido por 7 días. 🎁
```

**Nuevo endpoint necesario:**
```
GET /api/clientes/cumpleanos-hoy
```
Retorna clientes cuya `fecha_nacimiento` coincide con el día y mes de hoy.

### 5.3 Flujo: Seguimiento post-venta (3 fases)

Este es uno de los flujos más importantes. Se activa cuando una venta pasa a estado "entregado".

**Fase 1 — Confirmación de entrega (inmediato):**

**Trigger:** `PUT /api/ventas/:id` con `estado_entrega = 'entregado'` → dispara webhook a n8n.

```
[Webhook: venta_entregada]
        ↓
[Esperar 2 horas]  ← Dar tiempo a que el cliente llegue a casa
        ↓
[Enviar plantilla "delivery_confirmation"]
        ↓
[Registrar en CRM]
```

**Mensaje:**
```
¡Hola {{nombre}}! ✅

Tu pedido #{{numero_venta}} fue entregado correctamente.

Si tuvieras algún inconveniente o pregunta sobre tu {{producto_principal}}, 
respondé este mensaje y te ayudamos.

¡Gracias por tu compra! 🙌
```

**Fase 2 — Encuesta de satisfacción (48-72 horas después):**

```
[Esperar 48 horas desde entrega]
        ↓
[¿El cliente ya respondió algo?]
  SÍ → No enviar encuesta (ya está en contacto)
  NO ↓
[Enviar plantilla "satisfaction_survey"]
        ↓
[Esperar respuesta (24hs)]
        ↓
[¿Respondió?]
  SÍ ↓
[Guardar puntaje en ventas.nps_score]
[Si puntaje ≤ 2 → Crear actividad urgente para vendedor]
[Si puntaje ≥ 4 → Solicitar reseña en Google]
```

**Si el cliente respondió 1 o 2 (insatisfecho):**
```
Gracias por tu respuesta, {{nombre}}. Lamentamos que tu experiencia 
no haya sido la mejor. 

Un responsable del equipo te va a contactar hoy para resolver 
lo que necesitás. ¡Disculpanos las molestias!
```

**Si el cliente respondió 4 o 5 (satisfecho):**
```
¡Nos alegra mucho, {{nombre}}! 😊

Si querés ayudarnos a crecer, podés dejarnos una reseña en Google:
[Link de Google My Business]

¡Muchas gracias!
```

**Fase 3 — Recordatorio de garantía (según tipo de producto):**

```
[Calcular fecha_fin_garantia según tipo de producto]
[30 días antes de que venza → enviar recordatorio]
```

**Mensaje de recordatorio de garantía:**
```
Hola {{nombre}}, te recordamos que la garantía de tu {{producto}} 
(comprado el {{fecha_compra}}) vence el {{fecha_vencimiento}}.

Si tu equipo presenta algún inconveniente, contactanos antes de 
esa fecha para gestionar la cobertura.

Ante cualquier duda respondé este mensaje. 📱
```

### 5.4 Flujo: Reactivación de clientes inactivos

**Trigger:** Cron job todos los lunes a las 9:00 AM.

**Lógica:**
```
[Cron: lunes 9:00 AM]
        ↓
[GET /api/clientes/inactivos?dias=90]
← Clientes que no compraron en 90 días
        ↓
[Filtrar: excluir clientes con WhatsApp bloqueado]
[Filtrar: excluir clientes ya contactados esta semana]
        ↓
[Loop para cada cliente]
        ↓
[¿Cuántos días inactivo?]
   90-120 días → Mensaje suave "Te extrañamos"
   121-180 días → Mensaje con oferta específica
   +180 días → Mensaje win-back con descuento
        ↓
[Enviar mensaje según segmento]
        ↓
[Actualizar clientes.ultimo_contacto_reactivacion = hoy]
[Registrar en CRM]
```

**Mensaje 90-120 días (suave):**
```
¡Hola {{nombre}}! 👋

Hace un tiempo que no te vemos por acá. ¿Cómo estás?

Tenemos productos nuevos que quizás te interesen. ¿Querés que 
te mandemos el catálogo actualizado?

Respondé "SÍ" y te lo enviamos ahora. 📱
```

**Mensaje 121-180 días (con oferta):**
```
Hola {{nombre}}, ¡te extrañamos!

Tenemos una oferta especial para vos: {{oferta_personalizada}}

¿Te interesa? Respondé este mensaje o visitanos en {{direccion}}.
```

**Mensaje +180 días (win-back agresivo):**
```
Hola {{nombre}}, hace mucho que no sabemos de vos.

Queremos darte una razón para volver: **{{descuento}}% de descuento** 
en tu próxima compra. Sin mínimo de compra.

Código: VOLVISTE{{codigo_cliente}}
Válido por 15 días.

¿Aceptás? Respondé "ACEPTO" y te guardamos el descuento. 🎁
```

**Endpoint necesario:**
```
GET /api/clientes/inactivos?dias=90&limite=100
```

### 5.5 Flujo: Programa de referidos

**Concepto:** Cuando un cliente hace una compra, se le ofrece un código de referido. Si alguien compra usando ese código, ambos obtienen un beneficio.

**Workflow:**
```
[Venta completada y entregada]
        ↓
[Esperar 7 días post-entrega]
        ↓
[¿El cliente tiene código de referido generado?]
  NO → Generar código único: REF + id_cliente
        ↓
[Enviar mensaje de referidos]
        ↓
[Registrar]
```

**Mensaje de referidos:**
```
Hola {{nombre}}! 🙌

¿Conocés a alguien que esté buscando un celular o electrónica?

Compartiles tu código personal: **{{codigo_referido}}**

Cuando compren usando tu código:
✅ Ellos obtienen {{beneficio_referido}} de descuento
✅ Vos acumulás crédito para tu próxima compra

¡Es tan fácil como enviar este mensaje!
```

**Tablas necesarias:**
```sql
CREATE TABLE clientes_referidos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id BIGINT UNSIGNED NOT NULL,       -- quien refirió
  referido_cliente_id BIGINT UNSIGNED,        -- quien fue referido
  codigo VARCHAR(20) UNIQUE NOT NULL,
  usos INT DEFAULT 0,
  credito_generado DECIMAL(12,2) DEFAULT 0,
  activo TINYINT(1) DEFAULT 1,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 5.6 Flujo: Club de clientes VIP

**Trigger:** Cuando el lead_score supera 90 puntos por primera vez.

**Workflow:**
```
[Cron diario de recálculo de lead_score]
        ↓
[¿Algún cliente acaba de pasar de score < 90 a score >= 90?]
  SÍ ↓
[Marcar como nuevo VIP]
        ↓
[Enviar mensaje de bienvenida VIP]
        ↓
[Notificar al dueño del negocio]
[Crear actividad en CRM: "Cliente ascendido a VIP"]
```

**Mensaje de bienvenida VIP:**
```
🌟 ¡{{nombre}}, sos parte de nuestros clientes VIP!

Por tu fidelidad, a partir de ahora tenés:
⭐ Acceso anticipado a nuevos productos
⭐ Precios especiales en toda la tienda
⭐ Atención prioritaria

Esto es un reconocimiento a tu confianza en nosotros. 
¡Muchas gracias!

Tu número de cliente VIP: VIP-{{id_cliente}}
```

---

## 6. Automatizaciones de Ventas y Post-Venta

### 6.1 Flujo: Recordatorio de pago pendiente

**Trigger:** Cron job dos veces por día (10:00 y 16:00).

**Lógica:**
```
[Cron: 10:00 y 16:00]
        ↓
[GET /api/ventas?estado_pago=pendiente&dias_vencido=1]
        ↓
[Loop por cada venta pendiente]
        ↓
[¿Cuántos días de mora?]
   1-3 días → Recordatorio amable
   4-7 días → Recordatorio más firme
   8-14 días → Alerta al vendedor + mensaje al cliente
   +15 días → Escalar a cobranza (notificar admin)
        ↓
[¿Ya se envió mensaje hoy?]
  SÍ → Skip
  NO → Enviar mensaje + registrar en CRM
```

**Mensaje día 1-3 (amable):**
```
Hola {{nombre}}, te recordamos que tenés un pago pendiente 
de ${{monto}} de tu compra del {{fecha_compra}}.

Si ya lo realizaste, ignorá este mensaje. Si necesitás 
coordinar el pago, respondé y te ayudamos.
```

**Mensaje día 4-7 (firme):**
```
{{nombre}}, el pago de ${{monto}} de tu compra #{{numero_venta}} 
sigue pendiente.

Por favor regularizá la situación comunicándote a {{telefono_negocio}} 
o respondiendo este mensaje.
```

**Notificación interna al vendedor (día 8+):**
```
⚠️ DEUDA SIN RESOLVER
Cliente: {{nombre}}
Monto: ${{monto}}
Días vencido: {{dias}}
Venta: #{{numero_venta}}
Teléfono: {{telefono}}
```

### 6.2 Flujo: Confirmación automática de orden

**Trigger:** Se crea una nueva venta en el sistema.

**Workflow:**
```
[Webhook: venta_creada]
        ↓
[Esperar 5 minutos]  ← Dar margen por si hay correcciones
        ↓
[Obtener detalle completo de la venta]
        ↓
[¿Tiene productos específicos que requieren confirmación?]
  SÍ → Primero verificar stock
        ↓
[¿Tiene opt-in WhatsApp?]
  SÍ → Enviar confirmación por WhatsApp
  NO → Enviar confirmación por email
        ↓
[Registrar en CRM]
```

**Mensaje de confirmación:**
```
✅ ¡Pedido confirmado, {{nombre}}!

N° de pedido: #{{numero_venta}}
Fecha: {{fecha}}
Total: ${{total}}

{{listado_productos}}

Estado: {{estado_entrega}}
{{#si_tiene_fecha_entrega}}Fecha estimada de entrega: {{fecha_entrega}}{{/si}}

Para consultas respondé este mensaje o llamá al {{telefono_negocio}}.

¡Gracias por tu compra! 🙌
```

### 6.3 Flujo: Alerta de bajo stock a equipo de compras

**Trigger:** Cron job diario a las 8:00 AM.

**Workflow:**
```
[Cron: 8:00 AM]
        ↓
[GET /api/productos?stock_bajo=true]
← Productos con stock < stock_minimo
        ↓
[¿Hay productos?]
  SÍ ↓
[Generar resumen de bajo stock]
        ↓
[Enviar WhatsApp al grupo de compras]
 ← (número del encargado de compras)
        ↓
[Enviar email al admin]
```

**Mensaje de bajo stock:**
```
⚠️ ALERTA DE STOCK — {{fecha}}

Los siguientes productos requieren reposición:

{{#cada_producto}}
📦 {{nombre}} — Stock actual: {{stock}} | Mínimo: {{stock_minimo}}
{{/cada_producto}}

Total de productos con stock bajo: {{total}}

Ver en el sistema: {{link_productos}}
```

### 6.4 Flujo: Cotización de cliente interesado

**Trigger:** Mensaje entrante de WhatsApp con keyword "PRECIO" o "COTIZACIÓN".

**Workflow:**
```
[Webhook: whatsapp_incoming]
        ↓
[¿Mensaje contiene "precio" o "cotizacion" o "cuanto sale"?]
  SÍ ↓
[Respuesta automática inmediata]
        ↓
[Buscar si el número es un cliente existente]
  SÍ → Asignar al vendedor que lo atendió antes
  NO → Crear lead nuevo en CRM
        ↓
[Notificar al vendedor disponible]
        ↓
[Registrar en CRM como oportunidad nueva]
```

**Respuesta automática:**
```
¡Hola! 👋 Gracias por contactarnos.

Para ayudarte mejor con precios y disponibilidad, 
un asesor se va a comunicar con vos en breve.

¿Podés decirnos qué producto te interesa?
```

**Notificación al vendedor:**
```
🔔 NUEVO CONSULTA DE PRECIO
Número: {{telefono}}
Cliente: {{nombre_si_existe}}
Mensaje: "{{mensaje_original}}"

Respondé desde el sistema: {{link_crm_lead}}
```

---

## 7. Automatizaciones Internas del Negocio

### 7.1 Reporte diario automático para el dueño

**Trigger:** Cron job todos los días a las 8:30 AM.

**Workflow:**
```
[Cron: 8:30 AM lunes a sábados]
        ↓
[Recopilar datos del día anterior:]
  - Ventas totales
  - Número de ventas
  - Productos más vendidos
  - Vendedor con más ventas
  - Nuevos clientes
  - Oportunidades cerradas
  - Deudas nuevas
        ↓
[Generar resumen formateado]
        ↓
[Enviar WhatsApp al dueño]
[Enviar email al dueño]
```

**Mensaje al dueño:**
```
📊 RESUMEN DE AYER — {{fecha}}

💰 Ventas: ${{total_ventas}} ({{cantidad}} operaciones)
👥 Nuevos clientes: {{nuevos_clientes}}
🏆 Mejor vendedor: {{vendedor}} (${{monto_vendedor}})

📦 Top productos:
1. {{producto_1}} — {{cantidad_1}} unidades
2. {{producto_2}} — {{cantidad_2}} unidades
3. {{producto_3}} — {{cantidad_3}} unidades

⚠️ Deudas nuevas: ${{nuevas_deudas}}
🎯 Oportunidades cerradas: {{oportunidades_ganadas}} ganadas / {{oportunidades_perdidas}} perdidas

Ver reporte completo: {{link_dashboard}}
```

### 7.2 Reporte semanal completo (lunes)

**Trigger:** Cron job todos los lunes a las 9:00 AM.

**Contenido:**
- Comparativo semana anterior vs. semana actual
- Total de clientes contactados
- Tasa de respuesta de WhatsApp
- Pipeline del CRM actualizado
- Vendedores: comisiones acumuladas del mes
- Productos con stock bajo
- Clientes con deuda mayor a X días

Se envía como **PDF adjunto por email** + resumen por WhatsApp.

### 7.3 Alerta de venta grande

**Trigger:** Se crea una venta con total superior a un umbral configurable (ej: $200.000).

**Workflow:**
```
[Webhook: venta_creada]
        ↓
[¿Total > parametro.venta_grande_umbral?]
  SÍ ↓
[Notificar al dueño inmediatamente]
```

**Mensaje al dueño:**
```
🔔 VENTA GRANDE REGISTRADA

Cliente: {{cliente_nombre}}
Vendedor: {{vendedor_nombre}}
Total: ${{total}}
Productos: {{listado_resumido}}

Ver venta: {{link_venta}}
```

### 7.4 Alerta de devolución o cancelación

**Trigger:** Estado de venta cambia a "cancelado" o se registra una devolución.

**Workflow:**
```
[Webhook: venta_cancelada]
        ↓
[Notificar al dueño + gerente]
[Crear actividad en CRM: "Devolución/Cancelación"]
[Si el cliente tiene oportunidades activas → Actualizar estado]
```

### 7.5 Sincronización de contactos para el equipo

**Trigger:** Se crea o actualiza un cliente con teléfono E164.

**Workflow (futuro):**
```
[Webhook: cliente_actualizado]
        ↓
[¿Tiene teléfono E164 válido?]
  SÍ ↓
[Sincronizar con Google Contacts del negocio]
  ← Via Google Contacts API
        ↓
[Actualizar clientes.google_contact_id]
```

Esto permite que el equipo tenga todos los clientes sincronizados en sus teléfonos automáticamente.

---

## 8. Segmentación Inteligente de Clientes

### 8.1 Segmentos predefinidos (dinámicos)

Los segmentos deben calcularse automáticamente, no asignarse a mano. Propuesta:

| Segmento | Criterio | Acción automática |
|---|---|---|
| **Nuevos** | Registrado hace ≤ 30 días | Enviar bienvenida + asignar a vendedor |
| **Activos** | Compró en los últimos 60 días | Mantener contacto regular |
| **Frecuentes** | ≥ 5 compras en los últimos 6 meses | Ofrecer precio especial |
| **VIP** | Score ≥ 90 puntos | Atención prioritaria, ofertas exclusivas |
| **Dormidos** | Sin comprar entre 61 y 180 días | Campaña de reactivación suave |
| **Perdidos** | Sin comprar hace más de 180 días | Campaña win-back agresiva |
| **Deudores** | Tiene saldo pendiente > 0 | Recordatorio de pago |
| **Mayoristas** | tipo_cliente = 'mayorista' | Acceso a lista de precios mayorista |
| **Con garantía activa** | Tiene producto en garantía vigente | Recordatorio pre-vencimiento |

### 8.2 Cómo se calcula el segmento

Cron job diario en n8n que llama a un endpoint del backend:

**Nuevo endpoint:**
```
POST /api/clientes/recalcular-segmentos
```

Lógica interna:
```javascript
async function recalcularSegmentos() {
  const clientes = await clientesRepository.findAll({ activo: true });
  
  for (const cliente of clientes) {
    const stats = await clientesRepository.getEstadisticas(cliente.id);
    
    // Calcular score
    let score = 0;
    if (cliente.telefono_e164) score += 10;
    if (cliente.email) score += 5;
    if (stats.total_compras > 0) score += 20;
    if (stats.dias_desde_ultima_compra <= 30) score += 30;
    else if (stats.dias_desde_ultima_compra <= 90) score += 15;
    if (stats.monto_total > 500000) score += 50;
    else if (stats.monto_total > 100000) score += 25;
    if (stats.total_compras >= 5) score += 20;
    if (cliente.whatsapp_opt_in) score += 10;
    if (stats.respondio_whatsapp_ultimo_mes) score += 15;
    if (stats.tiene_oportunidad_activa) score += 20;
    if (stats.dias_desde_ultima_compra > 180) score -= 20;
    if (stats.deuda_pendiente > 0) score -= 10;
    if (cliente.whatsapp_status === 'blocked') score -= 20;
    
    // Determinar segmento
    let segmento;
    if (score >= 90) segmento = 'vip';
    else if (score >= 70) segmento = 'frecuente';
    else if (score >= 40) segmento = 'activo';
    else if (score >= 20) segmento = 'dormido';
    else segmento = 'inactivo';
    
    await clientesRepository.updateSegmento(cliente.id, segmento, score);
  }
}
```

### 8.3 Vista de segmentos en el frontend

En la pantalla de clientes, agregar un panel de segmentos como filtro rápido:

```
┌─────────────────────────────────────────────────────────┐
│  SEGMENTOS                         TOTAL CLIENTES: 542  │
├─────────────────────────────────────────────────────────┤
│  🟡 VIP           18 clientes    [Ver] [Campaña]        │
│  🟢 Frecuentes    87 clientes    [Ver] [Campaña]        │
│  🔵 Activos      156 clientes    [Ver] [Campaña]        │
│  🟠 Dormidos      89 clientes    [Ver] [Campaña]        │
│  🔴 Inactivos    192 clientes    [Ver] [Campaña]        │
│  ⚠️  Deudores      34 clientes   [Ver] [Recordatorio]   │
└─────────────────────────────────────────────────────────┘
```

Al hacer clic en "Campaña" al lado de un segmento, se abre el modal de creación de campaña con ese segmento pre-seleccionado como destinatarios.

---

## 9. Chatbot de WhatsApp

### 9.1 Concepto

Un chatbot básico que responde automáticamente a keywords específicas, reduciendo la carga del equipo de ventas y mejorando el tiempo de respuesta.

**Importante:** El chatbot no reemplaza al vendedor — lo asiste. Si el cliente pregunta algo que el bot no puede responder, escala a un humano.

### 9.2 Árbol de respuestas básico

```
MENSAJE ENTRANTE
       ↓
¿Es un número conocido (cliente existente)?
  SÍ → Saludo personalizado con su nombre
  NO → Saludo genérico + preguntar nombre
       ↓
¿Qué escribió?

"CATALOGO" / "CATÁLOGO" / "PRODUCTOS"
  → Enviar PDF del catálogo actual
  → Registrar interés en CRM

"PRECIO" / "PRECIOS" / "CUANTO SALE" / "CUÁNTO"
  → "¿Qué producto te interesa? Escribí el nombre y te digo el precio."
  → Siguiente mensaje → buscar producto → responder precio
  → Si hay múltiples resultados → mostrar lista

"GARANTIA" / "GARANTÍA" / "SERVICIO TECNICO"
  → "Para garantías y servicio técnico necesitamos tu número de factura. ¿Lo tenés a mano?"
  → Siguiente mensaje → buscar venta → responder info de garantía

"HORARIO" / "HORARIOS" / "CUANDO ABREN"
  → Responder horarios del negocio (desde parametros_sistema)

"DIRECCION" / "DIRECCIÓN" / "COMO LLEGAR"
  → Responder dirección + link de Google Maps

"ASESOR" / "VENDEDOR" / "HABLAR CON ALGUIEN"
  → "Perfecto, en breve un asesor te contacta."
  → Notificar al vendedor disponible
  → Registrar en CRM

"NO GRACIAS" / "BAJA" / "STOP" / "NO MOLESTAR"
  → "Listo, no te vamos a mandar más mensajes. Si en algún momento querés 
     volver a recibir novedades, escribinos "ALTA"."
  → Actualizar whatsapp_opt_in = 0

"ALTA" / "SUSCRIBIR" / "SI QUIERO"
  → "¡Perfecto! A partir de ahora vas a recibir nuestras novedades y ofertas."
  → Actualizar whatsapp_opt_in = 1

Mensaje no reconocido:
  → "Hola, gracias por escribirnos. Un asesor te va a contactar pronto."
  → Notificar al vendedor (si horario laboral)
  → Si fuera de horario: "Estamos fuera del horario de atención. 
     Te contactamos el próximo día hábil."
```

### 9.3 Implementación del chatbot en n8n

El chatbot se implementa como un workflow en n8n que recibe el webhook de mensajes entrantes:

```
[Webhook: /webhook/whatsapp-incoming]
        ↓
[Extraer: telefono, mensaje, timestamp]
        ↓
[Normalizar mensaje: toLower(), trim(), quitar acentos]
        ↓
[Switch node con las keywords]
        ↓
[Rama "catalogo"]
  → [HTTP Request: GET /api/catalog/latest-pdf]
  → [HTTP Request: POST /api/whatsapp/enviar-documento]
  → [HTTP Request: POST /api/crm/actividades (registrar)]

[Rama "precio"]
  → [HTTP Request: GET /api/productos/buscar?q={{mensaje}}]
  → [IF: ¿Hay resultados?]
       SÍ → Formatear respuesta con precios
       NO → "No encontramos ese producto. ¿Podés darnos más detalles?"
  → [HTTP Request: POST /api/whatsapp/responder]

[Rama "asesor"]
  → [HTTP Request: GET /api/usuarios/vendedor-disponible]
  → [HTTP Request: POST /api/crm/oportunidades (crear lead)]
  → [Enviar notificación al vendedor]
  → [Responder al cliente: "Un asesor te contacta en breve"]

[Rama "default"]
  → [¿Es horario laboral?]
       SÍ → Notificar vendedor + responder "en breve te contactan"
       NO → Responder "fuera de horario"
```

### 9.4 Gestión del estado de conversación

Para el chatbot multi-paso (ej: el cliente pregunta precio, el bot le pide especificar el producto), hay que mantener el estado de la conversación:

**Nueva tabla:**
```sql
CREATE TABLE whatsapp_conversaciones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  telefono_e164 VARCHAR(20) NOT NULL,
  cliente_id BIGINT UNSIGNED,
  estado VARCHAR(50) DEFAULT 'inicial',
  contexto_json JSON,
  ultimo_mensaje_at DATETIME,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_telefono (telefono_e164)
);
```

Estados posibles: `inicial`, `esperando_producto`, `esperando_factura`, `con_asesor`, `cerrado`.

El workflow de n8n lee y actualiza este estado en cada mensaje para mantener el contexto de la conversación.

---

## 10. Campañas de Marketing por WhatsApp

### 10.1 Rediseño del módulo de campañas

El módulo de campañas actual existe pero es básico. Propuesta de mejora:

**Flujo completo para crear una campaña:**

```
Paso 1: Definir la campaña
  - Nombre interno de la campaña
  - Objetivo (marketing, recordatorio de pago, encuesta, etc.)
  - Plantilla a usar (con preview del mensaje)
  - Variables dinámicas ({{nombre}}, {{monto}}, etc.)

Paso 2: Seleccionar destinatarios
  - Opción A: Segmento completo (VIP, Dormidos, Mayoristas, etc.)
  - Opción B: Filtros manuales (zona, tipo de cliente, última compra, etc.)
  - Opción C: Lista manual (subir CSV o seleccionar individualmente)
  - Preview: "Esta campaña llegará a X clientes"

Paso 3: Programar envío
  - Enviar ahora
  - Programar para fecha/hora específica
  - Rate: X mensajes por minuto (para evitar detección de spam)

Paso 4: Confirmar y lanzar
  - Resumen: X destinatarios, plantilla usada, fecha de envío
  - Costo estimado: $X (en base a tarifas de Twilio/Meta)
  - Botón de confirmar
```

### 10.2 Rate limiting inteligente

**Problema:** Enviar 500 mensajes en 1 minuto puede disparar alertas de Meta y limitar la cuenta.

**Solución:** Configurar un rate limit en el dispatcher:

```javascript
// Configuración recomendada por categoría:
const RATE_LIMITS = {
  marketing: 30,   // 30 mensajes por minuto (más conservador)
  utility: 60,     // 60 mensajes por minuto
  service: 100,    // 100 mensajes por minuto (respuestas a clientes)
};
```

Esto significa que una campaña de 500 personas en categoría "marketing" tardará ~17 minutos en enviarse. Es aceptable.

### 10.3 Métricas de campaña

Después del envío, mostrar métricas en tiempo real:

```
┌─────────────────────────────────────────────────────────────┐
│  CAMPAÑA: "Promo Semana Santa"                             │
│  Enviada: 05/04/2026 10:00 AM                              │
├─────────────────────────────────────────────────────────────┤
│  Total destinatarios: 350                                   │
│                                                             │
│  ✅ Enviados:    340  (97%)   ██████████████████████████   │
│  ❌ Fallidos:     10   (3%)   █                             │
│                                                             │
│  📨 Entregados:  320  (94%)   ████████████████████████     │
│  👁️  Leídos:      185  (58%)   ████████████████             │
│  💬 Respondieron: 42  (13%)   ████                         │
│                                                             │
│  💰 Ventas generadas: 8  ($95.000 total)                   │
│  ROI estimado: {{costo_campaña}} / $95.000                 │
└─────────────────────────────────────────────────────────────┘
```

**Para calcular "Ventas generadas":**
Cruzar clientes que respondieron la campaña con ventas creadas en las 72hs siguientes.

### 10.4 A/B Testing de mensajes

Funcionalidad avanzada: enviar dos versiones del mensaje a grupos distintos y medir cuál convierte mejor.

**Implementación:**
- Al crear campaña, opción de "Crear variante B"
- 50% de los destinatarios reciben versión A, 50% versión B
- Comparar métricas: apertura, respuesta, conversión a venta

---

## 11. Reportes y Métricas de CRM

### 11.1 Dashboard de CRM

Pantalla principal del CRM con KPIs en tiempo real:

```
┌─────────────────────────────────────────────────────────────────┐
│  CRM — Dashboard                    Período: Mes actual ▼      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  PIPELINE   │  │  GANADOS    │  │  PERDIDOS   │             │
│  │   $450k     │  │    $180k    │  │    $65k     │             │
│  │  12 opport. │  │  8 opport.  │  │  3 opport.  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  CONVERSIÓN POR FASE                                    │   │
│  │  Lead → Contacto:  68%  ████████████████                │   │
│  │  Contacto → Prop.: 45%  ███████████                     │   │
│  │  Prop. → Negoc.:   62%  ███████████████                 │   │
│  │  Negoc. → Ganado:  71%  █████████████████               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────┐  ┌───────────────────────────────────┐    │
│  │  ACTIVIDADES    │  │  VENDEDORES                        │    │
│  │  Hoy: 12        │  │  Juan P.   $85k  ██████████        │    │
│  │  Esta semana:34 │  │  Ana G.    $62k  ███████           │    │
│  │  Vencidas: 5 ⚠️ │  │  Carlos L. $33k  ████              │    │
│  └─────────────────┘  └───────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 11.2 Reporte de WhatsApp

```
┌─────────────────────────────────────────────────────────────────┐
│  WHATSAPP — Métricas del mes                                    │
├─────────────────────────────────────────────────────────────────┤
│  Mensajes enviados:        1.240                                │
│  Mensajes entregados:      1.198   (96.6%)                      │
│  Mensajes leídos:            834   (69.6%)                      │
│  Respuestas recibidas:       156   (18.7%)                      │
│  Opt-outs (bajas):            12                                │
│                                                                  │
│  Automatizaciones más efectivas:                                │
│  1. Post-venta (72hs)          → 34% tasa respuesta            │
│  2. Cumpleaños                 → 28% tasa respuesta            │
│  3. Reactivación 90 días       → 15% tasa respuesta            │
│  4. Recordatorio de pago       → 22% tasa respuesta            │
│                                                                  │
│  Costo total del mes: ${{costo_twilio}}                        │
│  Ventas atribuidas a WhatsApp: ${{ventas_atribuidas}}          │
└─────────────────────────────────────────────────────────────────┘
```

### 11.3 Reporte de fidelización

```
┌─────────────────────────────────────────────────────────────────┐
│  FIDELIZACIÓN DE CLIENTES                                       │
├─────────────────────────────────────────────────────────────────┤
│  Distribución de segmentos:                                     │
│  VIP:        18  ( 3%)  🟡                                      │
│  Frecuentes: 87  (16%)  🟢                                      │
│  Activos:   156  (29%)  🔵                                      │
│  Dormidos:   89  (16%)  🟠                                      │
│  Inactivos: 192  (35%)  🔴                                      │
│                                                                  │
│  Movimientos del mes:                                           │
│  ↑ Subieron de segmento: 23 clientes                           │
│  ↓ Bajaron de segmento:  15 clientes                           │
│  🆕 Nuevos VIP: 3 clientes                                     │
│                                                                  │
│  Retención: 78% de clientes activos el mes anterior siguen     │
│             activos este mes.                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. Cambios Técnicos en el Backend

### 12.1 Nuevo servicio: `n8nService.js`

```javascript
// backend/server/services/n8nService.js
const axios = require('axios');
const logger = require('../utils/logger');

const N8N_BASE_URL = process.env.N8N_BASE_URL;
const N8N_TOKEN = process.env.N8N_WEBHOOK_TOKEN;

const trigger = async (eventName, payload, options = {}) => {
  if (!N8N_BASE_URL) {
    logger.warn('N8N_BASE_URL no configurado, saltando trigger:', eventName);
    return;
  }

  const url = `${N8N_BASE_URL}/webhook/${eventName}`;

  try {
    const response = await axios.post(url, {
      event: eventName,
      timestamp: new Date().toISOString(),
      data: payload,
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Token': N8N_TOKEN,
      },
      timeout: options.timeout || 5000,
    });
    return response.data;
  } catch (err) {
    // Nunca bloquear el flujo principal
    logger.warn(`n8n trigger "${eventName}" failed: ${err.message}`);
    return null;
  }
};

module.exports = { trigger };
```

### 12.2 Hooks en controladores existentes

Agregar triggers de n8n en los momentos clave del negocio:

**En `ventasController.js` — al crear venta:**
```javascript
// Después de crear la venta exitosamente
await n8nService.trigger('venta_creada', {
  venta_id: nuevaVenta.id,
  cliente_id: nuevaVenta.cliente_id,
  total: nuevaVenta.total,
  usuario_id: req.user.id,
  productos: items,
});
```

**En `ventasController.js` — al actualizar estado:**
```javascript
if (body.estado_entrega === 'entregado' && ventaAnterior.estado_entrega !== 'entregado') {
  await n8nService.trigger('venta_entregada', {
    venta_id: id,
    cliente_id: venta.cliente_id,
    fecha_entrega: new Date(),
  });
}

if (body.estado_pago === 'cancelado' && ventaAnterior.estado_pago !== 'cancelado') {
  await n8nService.trigger('venta_cancelada', {
    venta_id: id,
    cliente_id: venta.cliente_id,
    motivo: body.motivo_cancelacion,
  });
}
```

**En `clientesController.js` — al crear cliente:**
```javascript
await n8nService.trigger('cliente_creado', {
  cliente_id: nuevoCliente.id,
  nombre: nuevoCliente.nombre,
  telefono_e164: nuevoCliente.telefono_e164,
  email: nuevoCliente.email,
  tipo_cliente: nuevoCliente.tipo_cliente,
});
```

**En `crmController.js` — al cambiar fase de oportunidad:**
```javascript
if (body.fase && body.fase !== oportunidadAnterior.fase) {
  await n8nService.trigger('oportunidad_fase_cambio', {
    oportunidad_id: id,
    cliente_id: oportunidad.cliente_id,
    fase_anterior: oportunidadAnterior.fase,
    fase_nueva: body.fase,
    valor_estimado: oportunidad.valor_estimado,
    usuario_id: req.user.id,
  });
}
```

### 12.3 Nuevos endpoints necesarios

#### Clientes

```
GET  /api/clientes/cumpleanos-hoy
GET  /api/clientes/inactivos?dias=90&limite=100
GET  /api/clientes/:id/estadisticas
POST /api/clientes/recalcular-segmentos
```

#### WhatsApp

```
POST /api/whatsapp/enviar-mensaje        (reemplaza endpoint actual con Twilio)
POST /api/whatsapp/enviar-plantilla      (nuevo: envío de templates aprobados)
POST /api/whatsapp/responder             (responder dentro de ventana de 24hs)
GET  /api/whatsapp/conversaciones        (historial de conversaciones)
GET  /api/whatsapp/conversacion/:telefono (historial por número)
POST /api/webhooks/twilio/whatsapp       (webhook entrante de Twilio)
POST /api/webhooks/twilio/status         (webhook de estado de Twilio)
```

#### CRM (nuevos)

```
GET  /api/crm/dashboard                  (KPIs del dashboard)
GET  /api/crm/forecast?mes=2026-04       (forecast de ventas)
POST /api/crm/mensajes                   (registrar mensaje en historial)
GET  /api/crm/mensajes?cliente_id=X      (historial de mensajes de un cliente)
GET  /api/crm/notificaciones             (notificaciones pendientes del usuario)
PUT  /api/crm/notificaciones/:id/leer    (marcar como leída)
```

### 12.4 Nuevo provider de WhatsApp: `twilioWhatsappProvider.js`

Ver sección 2.4 para el código completo. El archivo va en:
```
backend/server/services/messaging/providers/twilioWhatsappProvider.js
```

Cambiar en `campaignDeliveryService.js` para que use el provider de Twilio según variable de entorno:

```javascript
// campaignDeliveryService.js
const provider = process.env.WHATSAPP_PROVIDER === 'twilio'
  ? require('./providers/twilioWhatsappProvider')
  : require('./providers/whatsappWebProvider');
```

Esto permite la migración gradual: poner `WHATSAPP_PROVIDER=twilio` en producción y mantener el fallback.

### 12.5 Tabla de mensajes WhatsApp recibidos

```sql
CREATE TABLE whatsapp_mensajes_entrantes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  telefono_e164 VARCHAR(20) NOT NULL,
  cliente_id BIGINT UNSIGNED,
  mensaje TEXT,
  media_url TEXT,
  provider_message_id VARCHAR(120),
  procesado TINYINT(1) DEFAULT 0,
  respondido TINYINT(1) DEFAULT 0,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_telefono (telefono_e164),
  INDEX idx_cliente (cliente_id),
  INDEX idx_procesado (procesado)
);
```

### 12.6 Autenticación para n8n

n8n necesita un token para llamar a los endpoints del backend. Crear un usuario especial de tipo "api":

```sql
INSERT INTO usuarios (nombre, email, password_hash, rol_id, activo) 
VALUES ('n8n-bot', 'n8n@sistema.interno', '[hash_seguro]', [id_rol_api], 1);
```

O mejor: implementar API keys en el backend (más seguro que usuario/password):

```sql
CREATE TABLE api_keys (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  permisos JSON,
  ultimo_uso DATETIME,
  activo TINYINT(1) DEFAULT 1,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 13. Cambios Técnicos en el Frontend

### 13.1 Nuevo componente: Pipeline Kanban

```
frontend-react/src/components/crm/PipelineKanban.tsx
```

Usar una librería de Drag & Drop. Opciones:

| Librería | Tamaño | Mantenimiento | Recomendación |
|---|---|---|---|
| `@dnd-kit/core` | Pequeño | Activo | ✅ Recomendado |
| `react-beautiful-dnd` | Medio | Abandonado | ❌ No usar |
| `react-dnd` | Medio | Activo | ✅ Alternativa |

```bash
npm install @dnd-kit/core @dnd-kit/sortable
```

### 13.2 Nuevo componente: FichaCliente360

```
frontend-react/src/components/clientes/FichaCliente360.tsx
```

Incluye:
- Header con datos del cliente y acciones rápidas
- Panel de resumen (métricas)
- Timeline de actividad (ventas + mensajes + actividades CRM ordenados por fecha)
- Tabs: Ventas, Oportunidades, Mensajes, Documentos

### 13.3 Nuevo componente: SegmentosPanel

```
frontend-react/src/components/clientes/SegmentosPanel.tsx
```

Panel lateral o sección en la pantalla de Clientes con la distribución de segmentos y acceso rápido a campañas.

### 13.4 Actualización del módulo de campañas

Reemplazar el modal simple de creación de campaña por un wizard de 4 pasos (sección 10.1).

### 13.5 Indicador de lead score en la lista de clientes

En la tabla de clientes, agregar una columna (o indicador visual) con el segmento del cliente:

```
| Cliente       | Última compra | Total     | Segmento    |
|---------------|---------------|-----------|-------------|
| García R.     | hace 3 días   | $450k     | 🟡 VIP      |
| López M.      | hace 45 días  | $120k     | 🟢 Frecuente|
| Pérez J.      | hace 200 días | $15k      | 🔴 Inactivo |
```

### 13.6 Notificaciones en-app

Badge en la navegación y dropdown de notificaciones:

```
🔔 3  ← badge con número de notificaciones no leídas

Al hacer click:
┌─────────────────────────────────────────┐
│  🔔 Notificaciones                      │
├─────────────────────────────────────────┤
│  ⚠️ 3 actividades vencidas  [Ver]       │
│  💬 García R. respondió tu mensaje [Ver]│
│  🎯 Oportunidad sin movimiento 7d [Ver] │
│  [Ver todas las notificaciones]         │
└─────────────────────────────────────────┘
```

---

## 14. Migraciones de Base de Datos

### 14.1 Agregar campos a clientes

```sql
-- MySQL
ALTER TABLE clientes 
  ADD COLUMN lead_score INT DEFAULT 0 AFTER tags,
  ADD COLUMN lead_segmento VARCHAR(20) DEFAULT 'inactivo' AFTER lead_score,
  ADD COLUMN lead_score_updated_at DATETIME AFTER lead_segmento,
  ADD COLUMN fecha_nacimiento DATE AFTER lead_score_updated_at,
  ADD COLUMN ultimo_contacto_automatico DATETIME AFTER fecha_nacimiento,
  ADD COLUMN google_contact_id VARCHAR(100) AFTER ultimo_contacto_automatico,
  ADD COLUMN codigo_referido VARCHAR(20) AFTER google_contact_id,
  ADD COLUMN referido_por_cliente_id BIGINT UNSIGNED AFTER codigo_referido;

-- Índice para score
ALTER TABLE clientes ADD INDEX idx_lead_segmento (lead_segmento);
ALTER TABLE clientes ADD INDEX idx_lead_score (lead_score DESC);
ALTER TABLE clientes ADD INDEX idx_fecha_nacimiento (fecha_nacimiento);
```

### 14.2 Nueva tabla: historial de mensajes WhatsApp

```sql
-- MySQL
CREATE TABLE whatsapp_mensajes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id BIGINT UNSIGNED,
  telefono_e164 VARCHAR(20) NOT NULL,
  direccion ENUM('enviado', 'recibido') NOT NULL,
  tipo ENUM('texto', 'plantilla', 'documento', 'imagen') DEFAULT 'texto',
  contenido TEXT,
  plantilla_codigo VARCHAR(100),
  plantilla_variables JSON,
  media_url TEXT,
  provider VARCHAR(20) DEFAULT 'twilio',
  provider_message_sid VARCHAR(120),
  provider_status VARCHAR(30),
  campaign_id BIGINT UNSIGNED,
  automatizado TINYINT(1) DEFAULT 0,
  automatizacion_nombre VARCHAR(100),
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_cliente (cliente_id),
  INDEX idx_telefono (telefono_e164),
  INDEX idx_campaign (campaign_id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 14.3 Nueva tabla: conversaciones chatbot

```sql
-- MySQL
CREATE TABLE whatsapp_conversaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  telefono_e164 VARCHAR(20) NOT NULL,
  cliente_id BIGINT UNSIGNED,
  estado VARCHAR(50) DEFAULT 'inicial',
  contexto_json JSON,
  ultimo_mensaje_at DATETIME,
  cerrado_at DATETIME,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_telefono_activa (telefono_e164, cerrado_at),
  INDEX idx_telefono (telefono_e164)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 14.4 Nueva tabla: notificaciones CRM

```sql
-- MySQL
CREATE TABLE crm_notificaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT UNSIGNED NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  cuerpo TEXT,
  entidad_tipo VARCHAR(50),
  entidad_id BIGINT UNSIGNED,
  link VARCHAR(255),
  leida TINYINT(1) DEFAULT 0,
  leida_at DATETIME,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_usuario_no_leida (usuario_id, leida),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 14.5 Nueva tabla: referidos

```sql
-- MySQL
CREATE TABLE clientes_referidos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id BIGINT UNSIGNED NOT NULL,
  referido_cliente_id BIGINT UNSIGNED,
  codigo VARCHAR(20) NOT NULL,
  usos INT DEFAULT 0,
  credito_generado DECIMAL(12,2) DEFAULT 0.00,
  activo TINYINT(1) DEFAULT 1,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_codigo (codigo),
  INDEX idx_cliente (cliente_id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 14.6 Agregar NPS a ventas

```sql
-- MySQL
ALTER TABLE ventas 
  ADD COLUMN nps_score TINYINT UNSIGNED,  -- 1-5
  ADD COLUMN nps_comentario TEXT,
  ADD COLUMN nps_fecha DATETIME;
```

### 14.7 Agregar `motivo_perdida` a oportunidades

```sql
-- MySQL
ALTER TABLE crm_oportunidades 
  ADD COLUMN motivo_perdida VARCHAR(255),
  ADD COLUMN competidor VARCHAR(100);
```

---

## 15. Plan de Implementación por Etapas

### Etapa 1 — Migración a WhatsApp Oficial (URGENTE)

**Prioridad: CRÍTICA. Sin esto el número puede ser baneado en cualquier momento.**

1. Crear cuenta en Twilio (1 día)
2. Activar sandbox de WhatsApp para desarrollo (30 minutos)
3. Crear `twilioWhatsappProvider.js` (1 día)
4. Crear webhooks de entrada y estado (1 día)
5. Crear tabla `whatsapp_mensajes` (2 horas)
6. Cambiar variable `WHATSAPP_PROVIDER=twilio` en staging y probar (1 día)
7. Iniciar proceso de verificación de Meta Business (1-2 semanas de espera)
8. Crear y enviar a aprobación las 8 plantillas descritas en sección 2.3 (1 día)
9. Esperar aprobación de Meta (24-72 horas)
10. Migrar producción (1 día)
11. **Eliminar Baileys del sistema**

**Costo estimado:** USD 0 si los mensajes son pocos (primeras 1000 conversaciones gratis), luego escala con el volumen.

### Etapa 2 — Infraestructura de n8n

**Prioridad: ALTA. Es el motor de todo lo demás.**

1. Instalar n8n via Docker en el servidor (2 horas)
2. Crear `n8nService.js` en el backend (2 horas)
3. Agregar triggers de n8n en los 5 eventos clave del sistema (4 horas):
   - `venta_creada`
   - `venta_entregada`
   - `venta_cancelada`
   - `cliente_creado`
   - `oportunidad_fase_cambio`
4. Crear credenciales de n8n para el backend (1 hora)
5. Probar la comunicación bidireccional (2 horas)

### Etapa 3 — Automatizaciones básicas

**Prioridad: ALTA. Las más impactantes para el negocio.**

6. Flujo de bienvenida a nuevo cliente (4 horas)
7. Flujo de confirmación de venta (4 horas)
8. Flujo de confirmación de entrega + encuesta NPS (6 horas)
9. Flujo de recordatorio de pago pendiente (4 horas)
10. Reporte diario al dueño (4 horas)

### Etapa 4 — Segmentación y scoring

**Prioridad: ALTA para campañas efectivas.**

11. Migraciones de campos en clientes (lead_score, segmento, fecha_nacimiento) (2 horas)
12. Endpoint `/api/clientes/recalcular-segmentos` (4 horas)
13. Cron job de recálculo de segmentos en n8n (2 horas)
14. Vista de segmentos en el frontend (4 horas)

### Etapa 5 — CRM mejorado

**Prioridad: MEDIA-ALTA.**

15. Pipeline Kanban visual (12 horas)
16. Ficha 360 del cliente con timeline (10 horas)
17. Lead scoring visible en lista de clientes (3 horas)
18. Notificaciones internas CRM (8 horas)
19. Dashboard de CRM con KPIs (6 horas)

### Etapa 6 — Automatizaciones de fidelización avanzadas

**Prioridad: MEDIA.**

20. Flujo de cumpleaños (4 horas)
21. Flujo de reactivación de inactivos (6 horas)
22. Flujo de garantías (4 horas)
23. Flujo de referidos + tabla `clientes_referidos` (8 horas)
24. Club VIP automático (4 horas)

### Etapa 7 — Chatbot básico

**Prioridad: MEDIA.**

25. Tabla `whatsapp_conversaciones` (1 hora)
26. Webhook de mensajes entrantes con parsing de keywords (4 horas)
27. Workflow del chatbot en n8n (8 horas)
28. Gestión de conversaciones en n8n (4 horas)

### Etapa 8 — Campañas mejoradas y métricas

**Prioridad: MEDIA-BAJA.**

29. Wizard de 4 pasos para crear campañas (8 horas)
30. Métricas de campañas en tiempo real (6 horas)
31. Dashboard de WhatsApp (4 horas)
32. Reporte de fidelización (4 horas)

---

## 16. Costos y Stack Tecnológico

### 16.1 Stack completo propuesto

| Componente | Tecnología | Costo mensual (aprox.) |
|---|---|---|
| WhatsApp Business API | Twilio | USD 0 + USD 0.005/mensaje (ver más abajo) |
| Motor de automatización | n8n self-hosted | USD 0 (corre en el mismo servidor) |
| Email transaccional | SendGrid | USD 0 (hasta 100/día gratis) |
| PDF de catálogos | Ya existe (pdfkit) | USD 0 |
| Base de datos | MySQL/SQLite existente | USD 0 |

### 16.2 Costos de WhatsApp Business API (Twilio)

Los costos tienen dos componentes:

**Componente 1 — Twilio (el intermediario):**
- ~USD 0.005 por mensaje enviado (puede variar, verificar pricing actual en twilio.com)

**Componente 2 — Meta (por conversación, no por mensaje):**
Una "conversación" en WhatsApp Business API = cualquier intercambio de mensajes con un cliente en una ventana de 24 horas. Se cobra por conversación, no por mensaje individual.

Precios aproximados 2025 para Argentina (zona LATAM):
- Marketing: USD 0.0490 por conversación
- Utility (pedidos, entregas): USD 0.0265 por conversación
- Authentication: USD 0.0200 por conversación
- Service (cliente inicia): USD 0.0139 por conversación
- **Primeras 1,000 conversaciones de servicio por mes: GRATIS**

**Estimación para un negocio con 500 clientes activos:**

| Tipo de mensajes | Cantidad/mes | Costo Meta | Costo Twilio | Total |
|---|---|---|---|---|
| Confirmaciones de venta (utility) | 200 | USD 5.30 | USD 1.00 | USD 6.30 |
| Recordatorios de pago (utility) | 80 | USD 2.12 | USD 0.40 | USD 2.52 |
| Post-venta + encuestas (utility) | 150 | USD 3.98 | USD 0.75 | USD 4.73 |
| Campañas de marketing | 300 | USD 14.70 | USD 1.50 | USD 16.20 |
| Reactivación inactivos | 100 | USD 4.90 | USD 0.50 | USD 5.40 |
| Mensajes entrantes/chatbot (service) | 200 | USD 0 (bajo 1000) | USD 1.00 | USD 1.00 |
| **TOTAL** | **1.030** | **~USD 31** | **~USD 5.15** | **~USD 36** |

**Para un negocio mediano con 500 clientes activos: ~USD 36/mes.**

Comparado con lo que genera en ventas recurrentes, es una inversión muy eficiente.

### 16.3 Comparación con alternativas

| Solución | Costo/mes | Límite mensajes | Self-hosted | Automatización |
|---|---|---|---|---|
| **Propuesta (Twilio + n8n)** | ~USD 36 | Ilimitado (se paga) | ✅ | ✅ n8n |
| Baileys (actual) | USD 0 | Ilimitado | ✅ | ❌ Básico |
| HubSpot Marketing | USD 50-800 | Variable | ❌ | ✅ Bueno |
| ActiveCampaign | USD 29-259 | Variable | ❌ | ✅ Muy bueno |
| Brevo (ex Sendinblue) | USD 25+ | Variable | ❌ | ✅ Bueno |
| Kommo (ex amoCRM) con WA | USD 45+ | Variable | ❌ | ✅ Básico |

La propuesta de Twilio + n8n ofrece **máxima flexibilidad y control** al menor costo, con la ventaja de que todo el código es propio y no hay dependencia de SaaS externos que pueden aumentar precios o cerrar.

### 16.4 Requisitos de servidor

Para correr n8n self-hosted junto con el backend:

**Mínimo recomendado:**
- 2 vCPU
- 4 GB RAM
- 20 GB SSD

Si n8n tiene muchos workflows activos con frecuencia, considerar un servidor dedicado o instancia Docker separada con 2 GB RAM mínimo.

---

## Apéndice A — Workflows de n8n a Crear (Checklist)

Lista de todos los workflows a crear en n8n, en orden de prioridad:

- [ ] `01-bienvenida-nuevo-cliente` — Trigger: cliente_creado
- [ ] `02-confirmacion-venta` — Trigger: venta_creada
- [ ] `03-confirmacion-entrega` — Trigger: venta_entregada
- [ ] `04-encuesta-nps` — Trigger: 48hs post venta_entregada
- [ ] `05-recordatorio-garantia` — Cron: diario, 30 días antes del vencimiento
- [ ] `06-recordatorio-pago` — Cron: 2 veces/día para ventas pendientes
- [ ] `07-reporte-diario-dueno` — Cron: 8:30 AM lunes a sábados
- [ ] `08-cumpleanos` — Cron: 10:00 AM diario
- [ ] `09-recalculo-segmentos` — Cron: 2:00 AM diario
- [ ] `10-reactivacion-inactivos` — Cron: 9:00 AM lunes
- [ ] `11-chatbot-entrante` — Trigger: whatsapp_incoming webhook
- [ ] `12-alerta-stock-bajo` — Cron: 8:00 AM diario
- [ ] `13-reporte-semanal` — Cron: 9:00 AM lunes
- [ ] `14-alerta-venta-grande` — Trigger: venta_creada con monto alto
- [ ] `15-bienvenida-vip` — Trigger: cliente sube a segmento VIP
- [ ] `16-programa-referidos` — Trigger: 7 días post venta_entregada
- [ ] `17-alerta-cancelacion` — Trigger: venta_cancelada

---

## Apéndice B — Plantillas de Mensaje a Crear y Aprobar en Meta

Lista de plantillas necesarias (ver sección 2.3 para el contenido de cada una):

- [ ] `bienvenida_cliente` — Categoría: MARKETING
- [ ] `order_confirmation` — Categoría: UTILITY
- [ ] `order_ready_pickup` — Categoría: UTILITY
- [ ] `delivery_update` — Categoría: UTILITY
- [ ] `payment_reminder` — Categoría: UTILITY
- [ ] `promo_catalog` — Categoría: MARKETING
- [ ] `satisfaction_survey` — Categoría: MARKETING
- [ ] `win_back` — Categoría: MARKETING
- [ ] `warranty_reminder` — Categoría: UTILITY
- [ ] `birthday_greeting` — Categoría: MARKETING
- [ ] `birthday_greeting_vip` — Categoría: MARKETING (con cupón)
- [ ] `referral_invite` — Categoría: MARKETING
- [ ] `vip_welcome` — Categoría: MARKETING
- [ ] `reactivacion_suave` — Categoría: MARKETING
- [ ] `reactivacion_oferta` — Categoría: MARKETING
- [ ] `win_back_descuento` — Categoría: MARKETING

**Tiempo para aprobación:** 24-72 horas por plantilla. Enviar todo en paralelo.

---

## Apéndice C — Campos a Poblar para que el Sistema Funcione

Para que las automatizaciones funcionen con datos reales, el negocio debe completar:

1. **`clientes.telefono_e164`**: Si hay clientes con teléfono en formato local (011-XXXX-XXXX), migrar a formato E164 (+5411XXXXXXXX).
2. **`clientes.whatsapp_opt_in`**: Obtener consentimiento de los clientes para recibir mensajes. Idealmente con un mensaje inicial masivo pidiendo opt-in.
3. **`clientes.fecha_nacimiento`**: Pedir a los clientes al momento de registro o en campaña de actualización de datos.
4. **`productos.stock_minimo`**: Configurar stock mínimo por producto para las alertas de bajo stock.
5. **`parametros_sistema.venta_grande_umbral`**: Definir el monto a partir del cual una venta se considera "grande".
6. **`parametros_sistema.horario_inicio`** y **`horario_fin`**: Para el chatbot sepa cuándo está en horario laboral.

---

## Apéndice D — Checklist de QA antes de Producción

### WhatsApp Business API

- [ ] El número de producción fue desconectado del app de WhatsApp del teléfono físico
- [ ] Las 16 plantillas fueron aprobadas por Meta
- [ ] El webhook de Twilio apunta al dominio de producción (https)
- [ ] El webhook responde correctamente a las validaciones de Twilio (verificación inicial)
- [ ] Se probó el envío de un mensaje de texto libre en sandbox
- [ ] Se probó el envío de una plantilla en sandbox
- [ ] Se probó la recepción de un mensaje entrante
- [ ] Se probó el envío de un PDF
- [ ] Se verificó que el delivery status callback actualiza la base de datos

### n8n

- [ ] n8n está corriendo y accesible en su URL
- [ ] Las credenciales de n8n (backend API, Twilio, SendGrid) están configuradas
- [ ] El workflow de bienvenida fue probado end-to-end con un cliente de prueba
- [ ] Los cron jobs tienen la timezone correcta (`America/Argentina/Buenos_Aires`)
- [ ] Si n8n falla, el backend no se ve afectado (el trigger falla silenciosamente)

### CRM

- [ ] Se puede crear una oportunidad y moverla por todas las fases del pipeline
- [ ] Al mover a "Perdido" se pide motivo
- [ ] Al mover a "Ganado" se genera la venta automáticamente
- [ ] El lead score se recalcula correctamente
- [ ] La ficha 360 del cliente muestra datos de ventas + CRM + mensajes integrados
- [ ] Las notificaciones internas llegan al vendedor correcto
