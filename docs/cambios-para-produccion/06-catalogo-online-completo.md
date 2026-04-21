# Catálogo Online Completo — Portal de Clientes

**Estado actual:** Existe una página `/catalogo` (CatalogoPublico.tsx) básica que muestra productos sin posibilidad de comprar, registrarse ni seguir pedidos. La plantilla de diseño está en `electrohogar.zip`.  
**Objetivo:** Construir un portal de clientes completo sobre el dominio principal, con gestión de pedidos, registro, cuenta corriente, remitos, seguimiento de envíos, y panel de admin para el catálogo.

---

## ÍNDICE

1. [Diagnóstico del Estado Actual](#1-diagnóstico-del-estado-actual)
2. [Arquitectura del Portal de Clientes](#2-arquitectura-del-portal-de-clientes)
3. [Registro y Autenticación de Clientes](#3-registro-y-autenticación-de-clientes)
4. [Catálogo — Experiencia Pública](#4-catálogo-experiencia-pública)
5. [Sistema de Pedidos](#5-sistema-de-pedidos)
6. [Panel del Cliente — Mi Cuenta](#6-panel-del-cliente-mi-cuenta)
7. [Seguimiento de Envíos](#7-seguimiento-de-envíos)
8. [Panel de Admin del Catálogo](#8-panel-de-admin-del-catálogo)
9. [Integración con el ERP](#9-integración-con-el-erp)
10. [Modelo de Datos Propuesto](#10-modelo-de-datos-propuesto)
11. [Seguridad del Portal](#11-seguridad-del-portal)
12. [Plan de Implementación](#12-plan-de-implementación)

---

## 1. Diagnóstico del Estado Actual

### 1.1 Lo que existe

**Backend:**
- `clientportalcontroller.js` — existe pero solo tiene funciones básicas de autenticación de clientes.
- `clientportalroutes.js` — registrado en `index.js`.
- `clientauthcontroller.js` — autenticación separada para clientes con `role = 'cliente'`.
- El middleware `authmiddleware.js` ya bloquea tokens con `role = 'cliente'` para el panel admin.

**Frontend:**
- `CatalogoPublico.tsx` — muestra categorías y productos. Sin login, sin carrito.
- `CatalogoAdmin.tsx` — configuración básica del catálogo (logo, nombre, producto destacado).
- La ruta `/catalogo` es pública y no requiere autenticación.

### 1.2 Lo que falta

| Feature | Estado |
|---|---|
| Registro de clientes desde el catálogo | ✗ No existe |
| Login de clientes en el catálogo | ✗ No existe |
| Carrito de compras / Pedidos | ✗ No existe |
| Panel "Mi Cuenta" para el cliente | ✗ No existe |
| Ver historial de pedidos | ✗ No existe |
| Ver remitos propios | ✗ No existe |
| Ver cuenta corriente propia | ✗ No existe |
| Seguimiento de envío | ✗ No existe |
| Diferenciación por sucursal | ✗ No existe |
| Hero carousel editable por admin | ✗ No existe |
| Ofertas publicables | ✗ Existe la tabla `ofertas` pero no se expone en el catálogo público |

### 1.3 La plantilla electrohogar.zip

El zip contiene la plantilla HTML/CSS de diseño del catálogo. Debe ser integrada como el look & feel de las siguientes páginas:
- Home del catálogo con hero carousel.
- Grilla de productos.
- Detalle de producto.
- Carrito y checkout.
- Páginas de cuenta del cliente.

---

## 2. Arquitectura del Portal de Clientes

### 2.1 Separación de dominios

```
Dominio principal:   tudominio.com
  /                  → Home del catálogo (CatalogoHome.tsx)
  /productos         → Grilla de productos con filtros
  /productos/:slug   → Detalle de producto
  /categorias/:slug  → Productos de una categoría
  /ofertas           → Ofertas activas
  /sucursales        → Selector de sucursal
  /login             → Login de cliente (≠ login admin)
  /registro          → Registro de cliente
  /mi-cuenta         → Panel del cliente (requiere auth de cliente)
  /mi-cuenta/pedidos → Historial de pedidos
  /mi-cuenta/remitos → Remitos de compra
  /mi-cuenta/cuenta  → Cuenta corriente
  /pedido/:id/seguimiento → Seguimiento público de envío

Panel admin (URL oculta, ver doc 08):
  /[hash-secreto]/admin/login  → Login del admin
  /app/...                     → Todo el panel admin actual
```

### 2.2 Autenticación dual

El sistema tiene dos tipos de autenticación completamente separados:

| | Admin/Empleados | Clientes del catálogo |
|---|---|---|
| URL login | `/[hash-secreto]/admin/login` | `/login` (en el catálogo) |
| JWT issuer | `kaisenrp-admin` | `kaisenrp-catalog` |
| Refresh token | En `auth_refresh_tokens` | En `catalog_refresh_tokens` (nueva tabla) |
| Roles | admin, gerente, vendedor, etc. | `cliente` |
| Duración AT | 15 minutos | 60 minutos |
| Bloqueado en panel admin | Sí (middleware actual bloquea role=cliente) | N/A |

---

## 3. Registro y Autenticación de Clientes

### 3.1 Flujo de registro

1. Cliente va a `/registro` en el catálogo.
2. Completa: nombre, apellido, email, contraseña, teléfono, sucursal preferida (selector de depósitos activos).
3. El backend verifica que el email no esté en uso en `clientes`.
4. Si el email ya existe en `clientes` pero sin `portal_password_hash` → vincula la cuenta existente.
5. Si no existe → crea registro en `clientes` + setea `portal_password_hash`.
6. Envía email de confirmación (ya existe `sendVerificationEmail` en `utils/mailer.js`).
7. El cliente confirma el email y puede loguearse.

### 3.2 Extensión de tabla `clientes`

```sql
-- V31__portal_clientes.sql
ALTER TABLE clientes
  ADD COLUMN portal_password_hash  TEXT NULL,
  ADD COLUMN portal_email_verified TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN portal_verification_token VARCHAR(128) NULL,
  ADD COLUMN portal_verification_expires DATETIME NULL,
  ADD COLUMN portal_activo          TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN deposito_preferido_id  BIGINT UNSIGNED NULL,
  ADD CONSTRAINT fk_clientes_deposito_pref
    FOREIGN KEY (deposito_preferido_id) REFERENCES depositos(id) ON DELETE SET NULL;
```

### 3.3 Endpoint de registro de cliente

```
POST /api/portal/auth/registro
{
  nombre: String (requerido, min 2, max 100),
  apellido: String (opcional),
  email: String (requerido, formato email),
  password: String (requerido, min 8, con validación de complejidad),
  telefono: String (opcional),
  deposito_id: Integer (opcional, sucursal preferida)
}
```

**Validación de contraseña del cliente:**
```js
const clientPasswordSchema = z.string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
  .regex(/[0-9]/, 'Debe contener al menos un número');
```

### 3.4 Token JWT para clientes del catálogo

```js
// En clientauthcontroller.js — issueClientTokens():
const payload = {
  sub: cliente.id,
  email: cliente.email,
  role: 'cliente',
  deposito_id: cliente.deposito_preferido_id,
};
const accessToken = jwt.sign(payload, CLIENT_SECRET, {
  ...buildSignOpts('60m'),
  issuer: 'kaisenrp-catalog',
  jwtid: newJti(),
});
```

**Separación de secretos:**
```env
# Secreto SEPARADO del JWT del admin — nunca compartir
CLIENT_JWT_SECRET=<256-bit-random>
CLIENT_REFRESH_SECRET=<256-bit-random>
CLIENT_JWT_ISSUER=kaisenrp-catalog
```

---

## 4. Catálogo — Experiencia Pública

### 4.1 Home con Hero Carousel

La página home del catálogo incluye un carousel de imágenes hero editables. Los slides se guardan en la DB:

```sql
CREATE TABLE IF NOT EXISTS catalogo_hero_slides (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  titulo      VARCHAR(200) NULL,
  subtitulo   TEXT NULL,
  imagen_url  TEXT NOT NULL,
  link_url    TEXT NULL,        -- URL destino al hacer click
  link_label  VARCHAR(100) NULL,
  deposito_id BIGINT UNSIGNED NULL,  -- NULL = global (todos los depósitos)
  orden       INT NOT NULL DEFAULT 0,
  activo      TINYINT(1) NOT NULL DEFAULT 1,
  valido_desde DATETIME NULL,
  valido_hasta DATETIME NULL,
  creado_en   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_hero_activo_orden (activo, orden),
  KEY ix_hero_deposito (deposito_id),
  CONSTRAINT fk_hero_deposito FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Endpoint:** `GET /api/portal/catalogo/heroes?deposito_id=X`

Devuelve los slides activos ordenados, filtrando por depósito_id o globales (deposito_id = NULL).

### 4.2 Grilla de productos

```
GET /api/portal/catalogo/productos
Query params:
  - categoria_id: Integer
  - q: String (búsqueda)
  - deposito_id: Integer (para stock por sucursal)
  - orden: 'precio_asc' | 'precio_desc' | 'nombre' | 'nuevo'
  - page: Integer
  - limit: Integer (default 24, max 96)

Response:
{
  "productos": [
    {
      "id": 1,
      "nombre": "Samsung A55",
      "slug": "samsung-a55",
      "imagen_url": "...",
      "precio": 150000.00,
      "precio_antes": 180000.00,  // si tiene oferta activa
      "en_oferta": true,
      "stock_disponible": 5,      // si deposito_id fue especificado
      "categoria": "Celulares",
      "marca": "Samsung"
      // NUNCA incluir: precio_costo, proveedor_id, margen
    }
  ],
  "total": 150,
  "page": 1,
  "total_pages": 7
}
```

### 4.3 Diferenciación por sucursal

El cliente al entrar al catálogo puede seleccionar su sucursal (o la detectamos por depósito_preferido_id del JWT). Según la sucursal:
- Se muestra el stock de **esa** sucursal.
- Se muestra el **precio de lista** correspondiente a esa sucursal (si hay precios diferenciados).
- Las ofertas pueden ser globales o específicas de sucursal.

### 4.4 Ofertas en el catálogo

La tabla `ofertas` (V7/V9) ya existe. Agregar al endpoint de productos la unión con ofertas:

```sql
SELECT
  p.id, p.nombre, p.descripcion, p.imagen_url,
  COALESCE(o.precio_oferta, p.precio_final) AS precio,
  p.precio_final AS precio_antes,
  (o.id IS NOT NULL) AS en_oferta
FROM productos p
LEFT JOIN ofertas o ON o.producto_id = p.id
  AND o.activo = 1
  AND (o.valido_desde IS NULL OR o.valido_desde <= NOW())
  AND (o.valido_hasta IS NULL OR o.valido_hasta >= NOW())
WHERE p.activo = 1
```

---

## 5. Sistema de Pedidos

### 5.1 Flujo de pedido

```
1. Cliente navega el catálogo → agrega productos al carrito (localStorage)
2. Va al checkout → selecciona sucursal de retiro o solicita envío
3. Confirma pedido → se crea registro en `pedidos_catalogo`
4. Sistema notifica al admin/sucursal del nuevo pedido
5. Admin procesa el pedido → puede aprobarlo, prepararlo, despacharlo
6. Cliente recibe notificaciones en cada cambio de estado
7. Cliente puede ver el seguimiento desde "Mi Cuenta"
```

### 5.2 Tabla `pedidos_catalogo`

```sql
CREATE TABLE IF NOT EXISTS pedidos_catalogo (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  numero          VARCHAR(20) NOT NULL,  -- ej: 'PED-00001'
  cliente_id      BIGINT UNSIGNED NOT NULL,
  deposito_id     BIGINT UNSIGNED NULL,  -- sucursal elegida
  estado          ENUM(
                    'pendiente',
                    'confirmado',
                    'en_preparacion',
                    'listo_retiro',
                    'en_camino',
                    'entregado',
                    'cancelado'
                  ) NOT NULL DEFAULT 'pendiente',
  tipo_entrega    ENUM('retiro_sucursal', 'envio_domicilio') NOT NULL DEFAULT 'retiro_sucursal',
  direccion_envio TEXT NULL,
  subtotal        DECIMAL(18,2) NOT NULL DEFAULT 0,
  descuento       DECIMAL(18,2) NOT NULL DEFAULT 0,
  total           DECIMAL(18,2) NOT NULL DEFAULT 0,
  notas_cliente   TEXT NULL,
  notas_internas  TEXT NULL,       -- solo admin
  metodo_pago_preferido VARCHAR(60) NULL,
  venta_id        BIGINT UNSIGNED NULL,  -- vinculado cuando se procesa como venta en ERP
  procesado_por   BIGINT UNSIGNED NULL,  -- usuario admin que procesó
  procesado_en    DATETIME NULL,
  codigo_seguimiento VARCHAR(50) NULL,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pedido_numero (numero),
  KEY ix_ped_cliente    (cliente_id),
  KEY ix_ped_estado     (estado),
  KEY ix_ped_deposito   (deposito_id),
  KEY ix_ped_venta      (venta_id),
  CONSTRAINT fk_ped_cliente  FOREIGN KEY (cliente_id)   REFERENCES clientes(id)   ON DELETE RESTRICT,
  CONSTRAINT fk_ped_deposito FOREIGN KEY (deposito_id)  REFERENCES depositos(id)  ON DELETE SET NULL,
  CONSTRAINT fk_ped_venta    FOREIGN KEY (venta_id)     REFERENCES ventas(id)     ON DELETE SET NULL,
  CONSTRAINT fk_ped_procesado FOREIGN KEY (procesado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 5.3 Tabla `pedidos_catalogo_detalle`

```sql
CREATE TABLE IF NOT EXISTS pedidos_catalogo_detalle (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pedido_id       BIGINT UNSIGNED NOT NULL,
  producto_id     BIGINT UNSIGNED NOT NULL,
  nombre_snapshot VARCHAR(150) NOT NULL,  -- snapshot del nombre al momento del pedido
  precio_unitario DECIMAL(18,2) NOT NULL,
  cantidad        INT UNSIGNED NOT NULL,
  subtotal        DECIMAL(18,2) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_ped_det_pedido   (pedido_id),
  KEY ix_ped_det_producto (producto_id),
  CONSTRAINT fk_ped_det_pedido   FOREIGN KEY (pedido_id)   REFERENCES pedidos_catalogo(id) ON DELETE CASCADE,
  CONSTRAINT fk_ped_det_producto FOREIGN KEY (producto_id) REFERENCES productos(id)        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 5.4 Tabla `pedidos_catalogo_tracking`

Para el historial de estados y el seguimiento:

```sql
CREATE TABLE IF NOT EXISTS pedidos_catalogo_tracking (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pedido_id   BIGINT UNSIGNED NOT NULL,
  estado      VARCHAR(50) NOT NULL,
  descripcion TEXT NULL,
  usuario_id  BIGINT UNSIGNED NULL,  -- quien hizo el cambio de estado (admin)
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_pct_pedido (pedido_id, created_at),
  CONSTRAINT fk_pct_pedido  FOREIGN KEY (pedido_id)  REFERENCES pedidos_catalogo(id) ON DELETE CASCADE,
  CONSTRAINT fk_pct_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 5.5 Endpoints del sistema de pedidos

**Endpoints públicos / con auth de cliente:**
```
POST   /api/portal/pedidos                      → Crear pedido (requiere auth cliente)
GET    /api/portal/mis-pedidos                  → Mis pedidos (requiere auth cliente)
GET    /api/portal/mis-pedidos/:id              → Detalle de mi pedido
GET    /api/portal/pedidos/:numero/seguimiento  → Seguimiento público (sin auth)
```

**Endpoints de admin:**
```
GET    /api/portal-admin/pedidos                → Lista de pedidos (admin/gerente)
GET    /api/portal-admin/pedidos/:id            → Detalle
PATCH  /api/portal-admin/pedidos/:id/estado     → Cambiar estado
POST   /api/portal-admin/pedidos/:id/procesar   → Convertir pedido en venta del ERP
```

### 5.6 Conversión de pedido a venta en el ERP

El endpoint `POST /api/portal-admin/pedidos/:id/procesar`:

1. Toma el `pedido_catalogo` y sus ítems.
2. Verifica stock disponible en el `deposito_id` del pedido.
3. Crea una `venta` en el ERP usando `salesService.create()`.
4. Actualiza `pedidos_catalogo.venta_id` y `estado = 'confirmado'`.
5. Si el cliente tiene cuenta corriente configurada, puede aplicarse el crédito automáticamente.

---

## 6. Panel del Cliente — Mi Cuenta

### 6.1 Secciones

**Ruta:** `/mi-cuenta` (requiere auth de cliente)

```
┌─────────────────────────────────────────────────────────────┐
│  Mi Cuenta — [NOMBRE DEL CLIENTE]          [Cerrar sesión]  │
├──────────┬──────────────────────────────────────────────────┤
│ Mis      │ Mis Pedidos                                       │
│ Pedidos  │                                                   │
│ Remitos  │ Mostrando: Todos [▼]  Período: Este mes [▼]      │
│ Cuenta   │                                                   │
│ Corriente│ ┌────────────────────────────────────────────┐   │
│ Perfil   │ │ #PED-00042  15/04  $115.000  ✅ Entregado  │   │
│          │ │ #PED-00038  10/04  $45.000   📦 En camino  │   │
│          │ │ #PED-00031  01/04  $220.000  ✅ Entregado  │   │
│          │ └────────────────────────────────────────────┘   │
└──────────┴──────────────────────────────────────────────────┘
```

### 6.2 Endpoints del panel del cliente

```
GET /api/portal/mis-pedidos
  → Lista paginada de pedidos del cliente, con estado y total
  → Query: ?estado=pendiente|confirmado|... &mes=2026-04 &page=1

GET /api/portal/mis-pedidos/:id
  → Detalle completo: productos, cantidades, precios, tracking de estados

GET /api/portal/mis-remitos
  → Lista de remitos generados para el cliente
  → Response: [{ id, numero_remito, fecha, total, pdf_url }]

GET /api/portal/mis-remitos/:id/pdf
  → Redirect al PDF del remito (ya existe el sistema de reportes de remitos)

GET /api/portal/mi-cuenta-corriente
  → Saldo actual y movimientos
  → Response: { saldo: -15000, movimientos: [...] }
  → Si el cliente no tiene cuenta corriente: { saldo: 0, activa: false }

GET /api/portal/mis-estadisticas
  → Resumen mensual de compras
  → Response: { este_mes: { total: 115000, compras: 3 }, total_historial: 890000 }
```

### 6.3 Seguridad de datos del cliente

- El cliente solo puede ver SUS propios datos.
- Todos los endpoints de `/api/portal/mis-*` verifican `req.clientUser.id === cliente_id`.
- Los precios que ve el cliente NO incluyen información de costo.
- Los remitos generados son los mismos del ERP (tabla `ventas`) pero filtrados por `cliente_id`.

---

## 7. Seguimiento de Envíos

### 7.1 Seguimiento público

El cliente puede compartir el link de seguimiento sin necesidad de estar logueado:

```
GET /api/portal/pedidos/:numero/seguimiento
```

Devuelve:
```json
{
  "numero": "PED-00042",
  "estado": "en_camino",
  "tipo_entrega": "envio_domicilio",
  "timeline": [
    { "estado": "pendiente",      "fecha": "2026-04-13 10:30", "descripcion": "Pedido recibido" },
    { "estado": "confirmado",     "fecha": "2026-04-13 11:00", "descripcion": "Pedido confirmado" },
    { "estado": "en_preparacion", "fecha": "2026-04-14 09:00", "descripcion": "Preparando tu pedido" },
    { "estado": "en_camino",      "fecha": "2026-04-15 10:00", "descripcion": "En camino con el fletero" }
  ],
  "sucursal": "Sucursal Central",
  "fecha_estimada": null
}
```

**Importante:** Este endpoint NO devuelve información personal del cliente, solo el estado del pedido. Es público por diseño.

### 7.2 Rate limiting del seguimiento público

```js
// Limitar el tracking público para evitar scraping:
const trackingLimiter = createLimiter({
  key: 'portal:tracking',
  windowMs: 60 * 1000,
  max: 30,  // 30 consultas por minuto por IP
});
```

---

## 8. Panel de Admin del Catálogo

### 8.1 Mejoras a `CatalogoAdmin.tsx`

Agregar secciones:
1. **Hero Carousel** — CRUD de slides con upload de imágenes.
2. **Pedidos** — Bandeja de pedidos pendientes con acción de procesar.
3. **Ofertas** — Conectar con el sistema de ofertas existente para publicar en el catálogo.
4. **Configuración** — Logo, nombre, colores, sucursales visibles.

### 8.2 Gestión del hero carousel

**Backend:**
```
GET    /api/catalogo-admin/heroes                → Lista de slides
POST   /api/catalogo-admin/heroes                → Crear slide (con upload de imagen)
PUT    /api/catalogo-admin/heroes/:id            → Editar slide
DELETE /api/catalogo-admin/heroes/:id            → Eliminar slide
PATCH  /api/catalogo-admin/heroes/orden          → Reordenar slides (body: [{id: 1, orden: 0}, ...])
```

**Frontend** — Drag & drop para reordenar slides. Preview en tiempo real del carousel.

### 8.3 Bandeja de pedidos

En `CatalogoAdmin.tsx`, nueva tab "Pedidos":

```
┌──────────────────────────────────────────────────────────────┐
│ Pedidos del Catálogo          [Pendientes: 5] [Hoy: 12]      │
├──────┬──────────┬───────────────┬────────┬────────┬──────────┤
│ #    │ Cliente  │ Total         │ Estado │ Suc.   │ Acciones │
├──────┼──────────┼───────────────┼────────┼────────┼──────────┤
│ 0042 │ Ana G.   │ $115.000      │ Pend.  │ Cen.   │ [Ver] [Procesar] │
└──────┴──────────┴───────────────┴────────┴────────┴──────────┘
```

---

## 9. Integración con el ERP

### 9.1 Cuando un pedido se procesa como venta

El admin hace click en "Procesar" en un pedido:
1. Se abre un drawer con los ítems del pedido.
2. El admin puede ajustar cantidades, precios, aplicar descuentos.
3. Selecciona la caja y el método de pago.
4. Confirma → se llama a `salesService.create()` y se crea la venta en el ERP.
5. El stock se descuenta del depósito.
6. El pedido queda vinculado a la venta (`venta_id`).

### 9.2 Cuenta corriente del cliente desde el catálogo

Si el cliente tiene cuenta corriente activa en el ERP, desde "Mi Cuenta" puede ver:
- Saldo (positivo = tiene crédito a favor; negativo = debe).
- Movimientos: ventas cargadas, pagos realizados.
- Desde cuándo tiene la cuenta corriente.

**El cliente NO puede ver** la facturación de otros clientes ni ningún dato del negocio.

### 9.3 Remitos para clientes del catálogo

Los remitos ya se generan como PDFs (existe en `reportcontroller.js`). Solo hay que:
1. Filtrar los remitos del cliente logueado: `GET /api/portal/mis-remitos` → consulta `ventas WHERE cliente_id = req.clientUser.id`.
2. Proveer acceso al PDF: reusar el endpoint existente `GET /api/reportes/remito/:id.pdf` pero verificando que `venta.cliente_id === req.clientUser.id`.

---

## 10. Modelo de Datos Propuesto

**Archivo:** `V31__portal_clientes.sql`

Contiene (en orden):
1. `ALTER TABLE clientes` — campos portal (§3.2).
2. `CREATE TABLE catalogo_hero_slides` (§4.1).
3. `CREATE TABLE pedidos_catalogo` (§5.2).
4. `CREATE TABLE pedidos_catalogo_detalle` (§5.3).
5. `CREATE TABLE pedidos_catalogo_tracking` (§5.4).
6. `CREATE TABLE catalog_refresh_tokens` — similar a `auth_refresh_tokens` pero para clientes.

**Tabla `catalog_refresh_tokens`:**
```sql
CREATE TABLE IF NOT EXISTS catalog_refresh_tokens (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cliente_id BIGINT UNSIGNED NOT NULL,
  token      TEXT NOT NULL,
  jti        VARCHAR(128) NOT NULL,
  user_agent TEXT NULL,
  ip         VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crt_jti (jti),
  KEY ix_crt_cliente (cliente_id),
  KEY ix_crt_expires (expires_at),
  CONSTRAINT fk_crt_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 11. Seguridad del Portal

### 11.1 Rate limiting específico

```js
// Registro de clientes: 3 intentos por hora por IP
const registroLimiter = createLimiter({ key: 'portal:registro', windowMs: 3600000, max: 3 });

// Login de clientes: 10 intentos por 15 min
const clientLoginLimiter = createLimiter({ key: 'portal:login', windowMs: 900000, max: 10 });

// Cargar comprobantes: 20 por hora
const uploadLimiter = createLimiter({ key: 'portal:upload', windowMs: 3600000, max: 20 });
```

### 11.2 Separación de JWT secrets

Los clientes del catálogo usan `CLIENT_JWT_SECRET` y los admins usan `JWT_SECRET`. Son dos valores completamente diferentes en `.env`. Un JWT de cliente NO puede usarse para acceder al panel admin (ya está implementado en el middleware actual que bloquea `role = 'cliente'`).

### 11.3 Protección de datos del catálogo

- Los endpoints de `/api/portal/*` nunca devuelven costos, márgenes ni datos de proveedores.
- CORS del portal: permitir el dominio principal; los endpoints del admin (`/api/*`) pueden tener CORS más restrictivo.
- El seguimiento público (`/pedidos/:numero/seguimiento`) usa un número opaco (no el ID numérico de la DB).

---

## 12. Plan de Implementación

### Etapa 1 — Infraestructura de autenticación del portal (2 días)
- [ ] `V31__portal_clientes.sql` — todas las tablas
- [ ] Endpoints en `clientauthcontroller.js`: registro, login, refresh, logout
- [ ] Variables `CLIENT_JWT_SECRET`, `CLIENT_REFRESH_SECRET`
- [ ] Test: un JWT de cliente intenta acceder a `/api/productos` (panel admin) → 403

### Etapa 2 — Catálogo público mejorado (2 días)
- [ ] Endpoint `GET /api/portal/catalogo/heroes`
- [ ] Endpoint `GET /api/portal/catalogo/productos` con paginación, filtros, ofertas
- [ ] Endpoint `GET /api/portal/catalogo/categorias`
- [ ] Integrar plantilla electrohogar.zip como componentes React
- [ ] `CatalogoHome.tsx` con hero carousel animado
- [ ] `CatalogoProductos.tsx` con grilla y filtros
- [ ] `CatalogoProductoDetalle.tsx`

### Etapa 3 — Sistema de pedidos (3 días)
- [ ] Endpoints de pedidos (crear, mis-pedidos, detalle, seguimiento)
- [ ] `CatalogoCarrito.tsx` — carrito con localStorage + sync con API
- [ ] `CatalogoCheckout.tsx` — formulario de checkout
- [ ] `CatalogoSeguimiento.tsx` — página pública de seguimiento
- [ ] Rate limiting específico del portal

### Etapa 4 — Panel Mi Cuenta (2 días)
- [ ] `CatalogoMiCuenta.tsx` — layout con menú lateral
- [ ] Sección Mis Pedidos
- [ ] Sección Mis Remitos
- [ ] Sección Cuenta Corriente
- [ ] Sección Estadísticas
- [ ] Sección Perfil (editar datos)

### Etapa 5 — Admin del catálogo (2 días)
- [ ] Mejoras a `CatalogoAdmin.tsx` — nuevas tabs
- [ ] Gestión de hero slides (CRUD + drag & drop)
- [ ] Bandeja de pedidos con procesamiento
- [ ] Endpoint `POST /api/portal-admin/pedidos/:id/procesar`

### Testing crítico
- Registrar cliente → verificar email enviado → confirmar → login.
- Cliente A intenta ver pedidos del cliente B → 403.
- Admin intenta usar JWT de cliente en `/api/ventas` → 403.
- Cargar 200 productos → verificar que la paginación funciona.
- Crear pedido → procesar como venta → verificar stock descontado.
