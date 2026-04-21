# Proveedores Mejorados + Método de Pago "Cuenta Empresa"

**Estado actual:** El modelo `proveedores` existe en DB y tiene CRUD básico. `proveedor_id` ya está en `productos` como FK. La UI de Proveedores es solo lectura de compras. No existe el método "cuenta empresa" ni la carga de comprobantes.  
**Objetivo:** Convertir proveedores en el hub central de toda la operación financiera con ellos — asignación a productos, cuenta corriente, comprobantes, n8n/AI dispatch.

---

## ÍNDICE

1. [Diagnóstico del Estado Actual](#1-diagnóstico-del-estado-actual)
2. [Modelo de Datos Propuesto](#2-modelo-de-datos-propuesto)
3. [Asignación Proveedor → Producto](#3-asignación-proveedor-producto)
4. [Método de Pago "Cuenta Empresa"](#4-método-de-pago-cuenta-empresa)
5. [Carga de Comprobantes por Vendedor](#5-carga-de-comprobantes-por-vendedor)
6. [Cuenta Corriente con Proveedores](#6-cuenta-corriente-con-proveedores)
7. [Integración n8n + Agentes IA](#7-integración-n8n--agentes-ia)
8. [Cambios de Backend](#8-cambios-de-backend)
9. [Cambios de Frontend](#9-cambios-de-frontend)
10. [Migración SQL](#10-migración-sql)
11. [Plan de Implementación](#11-plan-de-implementación)

---

## 1. Diagnóstico del Estado Actual

### 1.1 Lo que existe en la DB hoy

```sql
-- V1__core_cloud.sql — tabla proveedores
CREATE TABLE proveedores (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  email       VARCHAR(255) NULL,
  telefono    VARCHAR(50) NULL,
  direccion   TEXT NULL,
  cuit_cuil   VARCHAR(20) NULL,
  fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- productos.proveedor_id YA EXISTE como FK
ALTER TABLE productos ADD COLUMN proveedor_id BIGINT UNSIGNED NULL;
ALTER TABLE productos ADD CONSTRAINT fk_productos_proveedor
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL;
```

### 1.2 Lo que falta

| Campo faltante en `proveedores` | Propósito |
|---|---|
| `whatsapp` VARCHAR(30) | Número destino para n8n/auto-mensajería |
| `alias_cuenta` VARCHAR(120) | Alias CBU/CVU — lo único visible al vendedor |
| `cbu` VARCHAR(30) | CBU completo — solo visible para admin |
| `banco` VARCHAR(80) | Banco del proveedor |
| `activo` TINYINT | Habilitar/deshabilitar |
| `notas_internas` TEXT | Solo visibles al admin |
| `tiempo_reposicion_dias` INT | Para alertas automáticas de stock bajo |

### 1.3 Problemas de la UI actual

- `Proveedores.tsx` solo muestra lista + compras históricas pasadas por `purchaseroutes`.
- El formulario de creación NO tiene campo WhatsApp ni CBU.
- En `Productos.tsx`, el `FormState` no tiene `proveedor_id` — el campo existe en la DB pero la UI nunca lo setea.
- No hay "cuenta empresa" en `metodos_pago` — la tabla existe pero ese tipo no está contemplado.

---

## 2. Modelo de Datos Propuesto

### 2.1 Extensión de tabla `proveedores`

```sql
-- V28__proveedores_y_cuenta_empresa.sql

ALTER TABLE proveedores
  ADD COLUMN whatsapp             VARCHAR(30)  NULL AFTER telefono,
  ADD COLUMN alias_cuenta         VARCHAR(120) NULL AFTER whatsapp,
  ADD COLUMN cbu                  VARCHAR(30)  NULL AFTER alias_cuenta,
  ADD COLUMN banco                VARCHAR(80)  NULL AFTER cbu,
  ADD COLUMN tiempo_reposicion_dias INT UNSIGNED NOT NULL DEFAULT 7 AFTER banco,
  ADD COLUMN notas_internas       TEXT         NULL AFTER tiempo_reposicion_dias,
  ADD COLUMN activo               TINYINT(1)   NOT NULL DEFAULT 1 AFTER notas_internas,
  ADD COLUMN actualizado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP AFTER activo;

ALTER TABLE proveedores
  ADD KEY ix_proveedores_activo (activo),
  ADD KEY ix_proveedores_whatsapp (whatsapp);
```

### 2.2 Nueva tabla: `cuenta_empresa_transacciones`

Esta tabla registra cada vez que un cliente paga a una cuenta de proveedor y el vendedor carga el comprobante.

```sql
CREATE TABLE IF NOT EXISTS cuenta_empresa_transacciones (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  proveedor_id        BIGINT UNSIGNED NOT NULL,
  venta_id            BIGINT UNSIGNED NULL,           -- venta asociada (si aplica)
  vendedor_id         BIGINT UNSIGNED NOT NULL,       -- usuario que cargó
  cliente_id          BIGINT UNSIGNED NULL,
  monto               DECIMAL(18,2) NOT NULL,
  moneda              VARCHAR(10)  NOT NULL DEFAULT 'ARS',
  comprobante_url     TEXT NULL,                      -- URL del archivo subido (S3/Cloudinary)
  comprobante_hash    VARCHAR(64)  NULL,              -- SHA-256 del archivo (anti-duplicados)
  estado              ENUM('pendiente','confirmado','rechazado','acreditado')
                        NOT NULL DEFAULT 'pendiente',
  notas_vendedor      TEXT NULL,
  notas_admin         TEXT NULL,                      -- solo admin puede escribir
  confirmado_por      BIGINT UNSIGNED NULL,           -- usuario admin que confirmó
  confirmado_en       DATETIME NULL,
  acreditado_en       DATETIME NULL,                  -- cuando se descuenta de cuenta corriente
  n8n_dispatched_at   DATETIME NULL,                  -- cuando se envió via n8n al proveedor
  n8n_message_id      VARCHAR(128) NULL,
  creado_en           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_cet_proveedor    (proveedor_id),
  KEY ix_cet_venta        (venta_id),
  KEY ix_cet_vendedor     (vendedor_id),
  KEY ix_cet_estado       (estado),
  KEY ix_cet_creado       (creado_en),
  CONSTRAINT fk_cet_proveedor  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)  ON DELETE RESTRICT,
  CONSTRAINT fk_cet_venta      FOREIGN KEY (venta_id)     REFERENCES ventas(id)        ON DELETE SET NULL,
  CONSTRAINT fk_cet_vendedor   FOREIGN KEY (vendedor_id)  REFERENCES usuarios(id)      ON DELETE RESTRICT,
  CONSTRAINT fk_cet_cliente    FOREIGN KEY (cliente_id)   REFERENCES clientes(id)      ON DELETE SET NULL,
  CONSTRAINT fk_cet_confirmado FOREIGN KEY (confirmado_por) REFERENCES usuarios(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.3 Nueva tabla: `proveedores_cuenta_corriente`

Saldo corriente acumulado con cada proveedor (deudas, pagos, créditos).

```sql
CREATE TABLE IF NOT EXISTS proveedores_cuenta_corriente (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  proveedor_id    BIGINT UNSIGNED NOT NULL,
  tipo            ENUM('debito','credito') NOT NULL,
                  -- debito = le debemos algo (compramos pero no pagamos)
                  -- credito = nos sobra saldo a favor
  concepto        VARCHAR(200) NOT NULL,
  referencia_tipo VARCHAR(40)  NULL,   -- 'compra', 'cuenta_empresa', 'ajuste'
  referencia_id   BIGINT UNSIGNED NULL,
  monto           DECIMAL(18,2) NOT NULL,
  moneda          VARCHAR(10)   NOT NULL DEFAULT 'ARS',
  saldo_acumulado DECIMAL(18,2) NOT NULL DEFAULT 0,  -- calculado al insertar
  usuario_id      BIGINT UNSIGNED NULL,
  fecha           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_pcc_proveedor (proveedor_id, fecha),
  KEY ix_pcc_referencia (referencia_tipo, referencia_id),
  CONSTRAINT fk_pcc_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pcc_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.4 Insertar el método de pago "Cuenta Empresa"

```sql
INSERT IGNORE INTO metodos_pago (nombre, activo, descripcion)
VALUES ('Cuenta Empresa', 1, 'Transferencia a cuenta de proveedor asignado');

-- Guardar el ID generado para referencias futuras
-- El ID se obtiene post-insert: SELECT id FROM metodos_pago WHERE nombre = 'Cuenta Empresa'
```

---

## 3. Asignación Proveedor → Producto

### 3.1 Lógica de negocio

- Cada producto puede tener **un proveedor principal** (FK `proveedor_id` ya existe).
- El admin al crear/editar un producto ve un selector de proveedor cargado desde `/api/proveedores`.
- El proveedor asignado se guarda silenciosamente — el vendedor NUNCA ve qué proveedor tiene el producto.
- Cuando el stock del producto cae por debajo de `stock_minimo`, el sistema puede disparar automáticamente una alerta al WhatsApp del proveedor via n8n (ver §7).

### 3.2 Cambio en `productcontroller.js`

El `FormState` en `Productos.tsx` ya tiene el campo `proveedor_id` como parte del tipo `Producto`, pero no está en el form de creación/edición. El backend `productRepository.js` debe incluirlo en el `INSERT`/`UPDATE`.

**Agregar a `productRepository.js`:**
```js
// En la función create() y update(), incluir proveedor_id:
proveedor_id: body.proveedor_id ? Number(body.proveedor_id) : null,
```

**Agregar al schema de validación en `productcontroller.js`:**
```js
body('proveedor_id').optional({ nullable: true }).isInt({ gt: 0 }),
```

### 3.3 Endpoint adicional necesario

```
GET /api/productos/:id/proveedor
```
Devuelve el proveedor del producto. **Solo accesible para `admin` y `gerente`**. El vendedor nunca puede consultar este endpoint.

---

## 4. Método de Pago "Cuenta Empresa"

### 4.1 Concepto

Cuando el cliente paga transfiriendo a la cuenta de un proveedor:

```
Cliente → Transfiere a cuenta del Proveedor X
         → Le manda el comprobante al Vendedor
           → Vendedor lo carga en el sistema
             → Sistema registra la transacción
               → Admin confirma / descuenta de cuenta corriente
                 → n8n notifica al proveedor el comprobante
```

### 4.2 Flujo en la venta (CajaRapida / Ventas)

Al seleccionar "Cuenta Empresa" como método de pago:

1. El frontend hace `GET /api/proveedores/con-cuenta-activa` (nuevo endpoint que filtra proveedores con `alias_cuenta != NULL AND activo = 1`).
2. Se muestra un selector con **solo el alias** (`alias_cuenta`) — nunca el CBU completo.
3. El vendedor selecciona el proveedor-cuenta.
4. La venta se guarda con `metodo_pago_id = <id_cuenta_empresa>` y el nuevo campo `proveedor_cuenta_id`.
5. Al confirmar la venta, se crea automáticamente un registro en `cuenta_empresa_transacciones` con `estado = 'pendiente'`.
6. El sistema muestra un mensaje: **"Venta registrada. El cliente debe transferir a: [ALIAS_AQUI]. Recordale que mande el comprobante."**

### 4.3 Nuevo campo en `ventas`

```sql
-- En V28:
SET @ddl = (SELECT IF(
  EXISTS(SELECT 1 FROM information_schema.columns
         WHERE table_schema=DATABASE() AND table_name='ventas' AND column_name='proveedor_cuenta_id'),
  'SELECT 1',
  'ALTER TABLE ventas ADD COLUMN proveedor_cuenta_id BIGINT UNSIGNED NULL AFTER metodo_pago_id'
));
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

ALTER TABLE ventas ADD CONSTRAINT fk_ventas_proveedor_cuenta
  FOREIGN KEY (proveedor_cuenta_id) REFERENCES proveedores(id) ON DELETE SET NULL;
```

---

## 5. Carga de Comprobantes por Vendedor

### 5.1 Nueva sección en el frontend: `/app/comprobantes`

**Acceso:** `vendedor`, `gerente`, `admin`.

El vendedor entra a esta pantalla (puede ser una pestaña dentro de Ventas o una sección propia). Ve:

```
┌─────────────────────────────────────────────────────┐
│  Cargar Comprobante de Transferencia                │
│                                                     │
│  Proveedor: [ALIAS_PROVEEDOR_X ▼]  ← selector      │
│  Monto: [_____________]                             │
│  Comprobante: [Subir imagen/PDF]                    │
│  Nota (opcional): [_____________]                   │
│                                                     │
│  [Cargar Comprobante]                               │
└─────────────────────────────────────────────────────┘
```

**Regla crítica de visibilidad:** El selector de proveedor muestra **únicamente el `alias_cuenta`**. Nunca el CBU, nunca el CUIT, nunca el email, nunca el teléfono. El vendedor solo sabe "estoy cargando un pago para ALIAS_X".

### 5.2 Backend: `POST /api/cuenta-empresa/comprobante`

```js
// Validación del payload:
{
  proveedor_id: Int (requerido),
  monto: Decimal > 0 (requerido),
  comprobante: multipart/form-data (requerido, max 10MB, tipos: image/*, application/pdf),
  venta_id: Int (opcional),
  notas_vendedor: String (max 500, opcional)
}
```

**Lógica en el servicio:**
1. Verificar que el proveedor tiene `activo = 1` y `alias_cuenta != NULL`.
2. Calcular SHA-256 del archivo para detectar duplicados (misma imagen cargada dos veces).
3. Subir el archivo a Cloudinary (ya existe `uploadImageToCloudinary` en el frontend) o al storage configurado.
4. Insertar en `cuenta_empresa_transacciones` con `estado = 'pendiente'`.
5. Disparar webhook n8n (async, no bloquea la respuesta) — ver §7.

**Protección anti-IDOR:** El endpoint solo acepta `proveedor_id` de proveedores donde `activo = 1 AND alias_cuenta IS NOT NULL`. No se puede cargar un comprobante a un proveedor sin cuenta configurada.

### 5.3 Panel de administración: `/app/comprobantes/admin`

**Acceso:** Solo `admin` y `gerente`.

Muestra tabla con:
| # | Proveedor | Monto | Vendedor | Estado | Fecha | Comprobante |
|---|---|---|---|---|---|---|
| 1 | Alias X | $15.000 | Juan | Pendiente | 15/04 | [Ver] |

Acciones:
- **Confirmar** → cambia `estado = 'confirmado'` y genera movimiento en `proveedores_cuenta_corriente`.
- **Rechazar** → cambia `estado = 'rechazado'`, admin puede agregar nota.
- **Acreditar** → cambia `estado = 'acreditado'`, reduce deuda en cuenta corriente.

---

## 6. Cuenta Corriente con Proveedores

### 6.1 Concepto

El saldo de la cuenta corriente con cada proveedor se construye sumando movimientos:

```
Saldo = Σ(compras a ese proveedor) - Σ(pagos confirmados) + Σ(créditos por cuenta empresa acreditados)
```

### 6.2 Endpoint: `GET /api/proveedores/:id/cuenta-corriente`

**Acceso:** Solo `admin`.

Devuelve:
```json
{
  "proveedor_id": 1,
  "proveedor_nombre": "Samsung Argentina",
  "saldo_actual": -150000.00,
  "moneda": "ARS",
  "movimientos": [
    { "fecha": "2026-04-01", "concepto": "Compra OC #123", "debito": 200000, "credito": null, "saldo": -200000 },
    { "fecha": "2026-04-10", "concepto": "Transferencia cliente vía cuenta empresa", "debito": null, "credito": 50000, "saldo": -150000 }
  ]
}
```

### 6.3 Trigger automático desde compras

Cuando se registra una compra en `compras` (ya existe el módulo), automáticamente se inserta en `proveedores_cuenta_corriente`:

```js
// En purchaseService.js, después de crear la compra:
await db.query(`
  INSERT INTO proveedores_cuenta_corriente
    (proveedor_id, tipo, concepto, referencia_tipo, referencia_id, monto, usuario_id)
  VALUES (?, 'debito', ?, 'compra', ?, ?, ?)
`, [proveedor_id, `Compra OC #${oc_numero}`, compra_id, total_costo, usuario_id]);
```

---

## 7. Integración n8n + Agentes IA

### 7.1 Webhook de despacho de comprobante

Cuando un vendedor carga un comprobante, el backend dispara:

```
POST https://<n8n-url>/webhook/comprobante-proveedor
Content-Type: application/json
Authorization: Bearer <N8N_WEBHOOK_SECRET>

{
  "evento": "comprobante_cargado",
  "proveedor": {
    "id": 1,
    "nombre": "Samsung Argentina",
    "whatsapp": "5491122334455",
    "alias_cuenta": "samsung.arg"
  },
  "transaccion": {
    "id": 42,
    "monto": 15000.00,
    "moneda": "ARS",
    "comprobante_url": "https://cdn.cloudinary.com/.../comp.jpg",
    "vendedor_nombre": "Juan",
    "fecha": "2026-04-15T14:30:00Z"
  }
}
```

**El workflow de n8n** puede:
1. Descargar el comprobante.
2. Enviarlo por WhatsApp al proveedor usando la API de mensajería configurada (Baileys / Twilio / Wati).
3. Confirmar el envío con `PATCH /api/cuenta-empresa/transacciones/:id` → `{ n8n_dispatched_at: now }`.

### 7.2 Alerta de reposición automática (stock mínimo)

Cuando el stock de un producto cae a `stock_minimo`:

```
POST https://<n8n-url>/webhook/reposicion-requerida
{
  "evento": "stock_minimo_alcanzado",
  "producto": {
    "id": 5,
    "nombre": "Samsung A55",
    "codigo": "SAM-A55",
    "stock_actual": 2,
    "stock_minimo": 5
  },
  "proveedor": {
    "id": 1,
    "nombre": "Samsung Argentina",
    "whatsapp": "5491122334455",
    "tiempo_reposicion_dias": 3
  }
}
```

El agente de IA puede calcular la cantidad óptima a pedir basándose en el forecast (ya existe `/api/ai/forecast`) y generar automáticamente un mensaje al proveedor.

### 7.3 Variables de entorno requeridas

```env
N8N_WEBHOOK_BASE_URL=https://n8n.miempresa.com
N8N_WEBHOOK_SECRET=<token-seguro-256bits>
N8N_COMPROBANTE_WEBHOOK_PATH=/webhook/comprobante-proveedor
N8N_REPOSICION_WEBHOOK_PATH=/webhook/reposicion-requerida
```

### 7.4 Servicio en Node.js

```js
// backend/server/services/n8nDispatchService.js
const axios = require('axios');

async function dispatchComprobanteProveedor(payload) {
  if (!process.env.N8N_WEBHOOK_BASE_URL) return;
  const url = `${process.env.N8N_WEBHOOK_BASE_URL}${process.env.N8N_COMPROBANTE_WEBHOOK_PATH}`;
  try {
    await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${process.env.N8N_WEBHOOK_SECRET}` },
      timeout: 8000,
    });
  } catch (err) {
    // Fallar silenciosamente — nunca bloquear la operación del vendedor
    logger.warn('[n8n] dispatch comprobante failed:', err.message);
  }
}

async function dispatchReposicionRequerida(payload) {
  if (!process.env.N8N_WEBHOOK_BASE_URL) return;
  const url = `${process.env.N8N_WEBHOOK_BASE_URL}${process.env.N8N_REPOSICION_WEBHOOK_PATH}`;
  try {
    await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${process.env.N8N_WEBHOOK_SECRET}` },
      timeout: 8000,
    });
  } catch (err) {
    logger.warn('[n8n] dispatch reposicion failed:', err.message);
  }
}

module.exports = { dispatchComprobanteProveedor, dispatchReposicionRequerida };
```

---

## 8. Cambios de Backend

### 8.1 Archivos a modificar

| Archivo | Cambio |
|---|---|
| `backend/server/controllers/suppliercontroller.js` | Agregar campos whatsapp, alias_cuenta, cbu, banco, activo; nuevo endpoint `con-cuenta-activa` |
| `backend/server/db/repositories/supplierRepository.js` | Actualizar SELECT/INSERT/UPDATE con nuevos campos; ocultar CBU en respuestas para no-admin |
| `backend/server/controllers/productcontroller.js` | Agregar `proveedor_id` al create/update; agregar endpoint `GET /:id/proveedor` con middleware admin-only |
| `backend/server/db/repositories/productRepository.js` | Incluir `proveedor_id` en INSERT/UPDATE |
| `backend/server/routes/supplierroutes.js` | Agregar ruta `GET /con-cuenta-activa` (auth, sin restricción de rol) y `GET /:id/cuenta-corriente` (auth, admin only) |

### 8.2 Nuevos archivos

| Archivo | Descripción |
|---|---|
| `backend/server/controllers/cuentaEmpresaController.js` | CRUD de transacciones de cuenta empresa + confirm/reject |
| `backend/server/db/repositories/cuentaEmpresaRepository.js` | Queries para `cuenta_empresa_transacciones` y `proveedores_cuenta_corriente` |
| `backend/server/routes/cuentaempresaroutes.js` | Rutas de la feature |
| `backend/server/services/n8nDispatchService.js` | Dispatch a n8n (ver §7.4) |
| `backend/server/services/cuentaEmpresaService.js` | Lógica de negocio: saldo, trigger desde compras, hash de comprobante |

### 8.3 Reglas de autorización por endpoint

| Endpoint | Roles permitidos | Nota |
|---|---|---|
| `GET /api/proveedores` | admin, gerente | Lista completa con todos los campos |
| `GET /api/proveedores/con-cuenta-activa` | admin, gerente, vendedor | Solo devuelve `{id, alias_cuenta}` — nunca CBU |
| `GET /api/proveedores/:id` | admin, gerente | Con CBU completo |
| `POST /api/proveedores` | admin | Solo admin crea |
| `PUT /api/proveedores/:id` | admin | Solo admin edita |
| `GET /api/proveedores/:id/cuenta-corriente` | admin | Solo admin ve cuentas corrientes |
| `POST /api/cuenta-empresa/comprobante` | admin, gerente, vendedor | Vendedor puede cargar comprobante |
| `GET /api/cuenta-empresa/transacciones` | admin, gerente | Ver todas las transacciones |
| `GET /api/cuenta-empresa/mis-transacciones` | vendedor | Solo las propias |
| `PATCH /api/cuenta-empresa/transacciones/:id/confirmar` | admin, gerente | Confirmar comprobante |
| `GET /api/productos/:id/proveedor` | admin, gerente | NUNCA vendedor |

---

## 9. Cambios de Frontend

### 9.1 `Proveedores.tsx` — mejoras al formulario

Agregar campos al `ProveedorForm`:
```typescript
type ProveedorForm = {
  id: number | null;
  nombre: string;
  email: string;
  telefono: string;
  whatsapp: string;         // NUEVO
  alias_cuenta: string;     // NUEVO
  cbu: string;              // NUEVO — solo visible para admin
  banco: string;            // NUEVO
  direccion: string;
  cuit_cuil: string;
  tiempo_reposicion_dias: number; // NUEVO
  notas_internas: string;   // NUEVO — solo visible para admin
  activo: boolean;          // NUEVO
};
```

### 9.2 `Productos.tsx` — selector de proveedor

Agregar al `FormState`:
```typescript
proveedor_id: string; // empty string = sin proveedor
```

En el formulario de edición/creación (que ya existe), agregar un `<select>` con los proveedores cargados. Este campo solo aparece si `role === 'admin' || role === 'gerente'`.

### 9.3 Nueva página: `CuentaEmpresa.tsx`

**Vista vendedor:**
- Selector de proveedor (alias_cuenta).
- Campo monto.
- Uploader de comprobante.
- Lista de sus últimas N transacciones con estado.

**Vista admin (tab adicional):**
- Tabla de todas las transacciones.
- Filtros por proveedor, estado, fecha.
- Botones Confirmar / Rechazar.

### 9.4 Navegación

Agregar en `navigationConfig.ts`:
```typescript
{
  key: 'cuenta-empresa',
  label: 'Cuenta Empresa',
  icon: 'CreditCard',
  roles: ['admin', 'gerente', 'vendedor'],
  path: '/app/cuenta-empresa',
}
```

---

## 10. Migración SQL

**Archivo:** `V28__proveedores_y_cuenta_empresa.sql`

Contiene (en orden):
1. `ALTER TABLE proveedores` — agregar campos nuevos (§2.1).
2. `CREATE TABLE cuenta_empresa_transacciones` (§2.2).
3. `CREATE TABLE proveedores_cuenta_corriente` (§2.3).
4. `INSERT INTO metodos_pago` — método "Cuenta Empresa" (§2.4).
5. `ALTER TABLE ventas ADD COLUMN proveedor_cuenta_id` (§4.3).

**Verificación idempotente:** Todos los `ALTER TABLE` y `CREATE TABLE` deben usar `IF NOT EXISTS` o el patrón `SET @ddl = (SELECT IF(EXISTS(...), 'SELECT 1', '...'))` ya establecido en migraciones previas.

---

## 11. Plan de Implementación

### Etapa 1 — DB + Backend base (estimación: 1 día)
- [ ] Escribir y ejecutar `V28__proveedores_y_cuenta_empresa.sql`
- [ ] Actualizar `supplierRepository.js` + `suppliercontroller.js`
- [ ] Actualizar `productRepository.js` + `productcontroller.js` (agregar proveedor_id)
- [ ] Crear `cuentaEmpresaRepository.js` + `cuentaEmpresaController.js`
- [ ] Crear `cuentaempresaroutes.js` y registrar en `index.js`

### Etapa 2 — Frontend base (estimación: 2 días)
- [ ] Actualizar formulario en `Proveedores.tsx`
- [ ] Actualizar formulario en `Productos.tsx` (selector proveedor)
- [ ] Crear `CuentaEmpresa.tsx` — vista vendedor
- [ ] Crear tab admin en `CuentaEmpresa.tsx`
- [ ] Agregar ruta en `AppRouter.tsx` y item en `navigationConfig.ts`

### Etapa 3 — Integraciones (estimación: 1 día)
- [ ] Crear `n8nDispatchService.js`
- [ ] Hookear dispatch en `cuentaEmpresaService.js` post-creación de transacción
- [ ] Hookear alerta de reposición en el scheduler de stock mínimo existente
- [ ] Agregar variables de entorno en `.env` y documentar en RUNBOOK.md

### Etapa 4 — Cuenta corriente (estimación: 1 día)
- [ ] Trigger automático desde `purchaseService.js`
- [ ] Endpoint `GET /api/proveedores/:id/cuenta-corriente`
- [ ] Vista de cuenta corriente en `Proveedores.tsx`

### Testing crítico
- Subir comprobante desde rol `vendedor` → verificar que NO puede ver CBU ni datos sensibles del proveedor.
- Intentar `GET /api/proveedores/:id` con JWT de vendedor → debe dar 403.
- Cargar el mismo comprobante dos veces → el SHA-256 debe detectar duplicado y retornar `409 Conflict`.
- Dispatch a n8n falla (URL inválida) → la carga del comprobante debe igualmente responder `201`.
