# Roles y Accesos — Vendedores Limitados + Dólar Colchón

**Estado actual:** Los vendedores ven demasiado: tienen acceso a productos, clientes y ventas sin restricción de datos sensibles. No existe el concepto de "dólar colchón". El rol `vendedor` necesita restricciones finas.  
**Objetivo:** Implementar accesos granulares para vendedores, separar completamente los datos sensibles (costos, márgenes, proveedores) y agregar la funcionalidad de dólar colchón para ventas en dólares.

---

## ÍNDICE

1. [Diagnóstico del Estado Actual](#1-diagnóstico-del-estado-actual)
2. [Mapa de Accesos por Rol](#2-mapa-de-accesos-por-rol)
3. [Restricciones para el Rol Vendedor](#3-restricciones-para-el-rol-vendedor)
4. [Dólar Colchón — Concepto y Diseño](#4-dólar-colchón-concepto-y-diseño)
5. [Implementación del Dólar Colchón](#5-implementación-del-dólar-colchón)
6. [Cambios de Backend](#6-cambios-de-backend)
7. [Cambios de Frontend](#7-cambios-de-frontend)
8. [Migración SQL](#8-migración-sql)
9. [Plan de Implementación](#9-plan-de-implementación)

---

## 1. Diagnóstico del Estado Actual

### 1.1 Lo que ve un vendedor hoy

En `AppRouter.tsx`, el `RoleGate` para `vendedor` permite acceso a:

```typescript
// Rutas accesibles para vendedor HOY:
dashboard        // ✓ correcto
caja             // ✓ correcto
clientes         // ✓ pero ve TODO del cliente, incluso cuenta corriente de todos
productos        // ✗ PROBLEMA: ve precio_costo en el formulario
ventas           // ✓ pero ve TODAS las ventas, no solo las suyas
rankings         // ✓ correcto
stock            // ✓ correcto
crm              // ✓ correcto
medicina-laboral // ✗ cuestionable para un vendedor
postventa        // ✓ correcto
ordenes-servicio // ✓ correcto
mi-cuenta/comisiones // ✓ correcto
```

### 1.2 Datos sensibles expuestos al vendedor

| Dato | Dónde aparece | Problema |
|---|---|---|
| `precio_costo` | `Productos.tsx` FormState, API response | El vendedor ve cuánto costó el producto |
| `precio_costo_pesos` / `precio_costo_dolares` | Misma respuesta de `/api/productos` | Idem |
| `margen_local`, `margen_distribuidor` | Misma respuesta | Sabe el margen |
| `proveedor_id` | Misma respuesta | Ve qué proveedor tiene cada producto |
| Ventas de otros vendedores | `GET /api/ventas` sin filtro | Ve todo |
| Cuenta corriente de cualquier cliente | `GET /api/clientes/:id` | No debería ver todo |
| Informes globales | `/api/reportes` | Ve rentabilidad total |

### 1.3 Problema del dólar colchón

El campo `tipo_cambio` existe en `productos` pero es estático (valor al momento de importar el costo en dólares). No existe un "tipo de cambio de venta" configurable por el admin que permita:

> "Para ventas en dólares, usar el dólar a $1200 aunque el oficial esté a $1000"

Tampoco existe un "modo dólar" en la venta donde el precio se calcule con un TC personalizado.

---

## 2. Mapa de Accesos por Rol

### 2.1 Tabla maestra de permisos (estado objetivo)

| Recurso / Dato | admin | gerente | gerente_sucursal | vendedor | fletero |
|---|:---:|:---:|:---:|:---:|:---:|
| Dashboard global | ✓ | ✓ | ✗ | ✗ | ✗ |
| Dashboard propio | ✓ | ✓ | ✓ (sucursal) | ✓ (personal) | ✗ |
| Productos — precio venta | ✓ | ✓ | ✓ | ✓ | ✗ |
| Productos — precio costo | ✓ | ✓ | ✗ | ✗ | ✗ |
| Productos — proveedor | ✓ | ✓ | ✗ | ✗ | ✗ |
| Clientes — todos | ✓ | ✓ | ✓ (sucursal) | ✓ (propios) | ✗ |
| Clientes — cuenta corriente | ✓ | ✓ | ✓ (sucursal) | ✓ (propios) | ✗ |
| Ventas — todas | ✓ | ✓ | ✓ (sucursal) | ✓ (propias) | ✓ (solo ver) |
| Ventas — crear | ✓ | ✓ | ✓ | ✓ | ✗ |
| Ventas — cancelar | ✓ | ✓ | ✓ | ✗ | ✗ |
| Informes — rentabilidad | ✓ | ✓ | ✗ | ✗ | ✗ |
| Informes — propios | ✓ | ✓ | ✓ (sucursal) | ✓ (personal) | ✗ |
| Compras / Proveedores | ✓ | ✓ | ✗ | ✗ | ✗ |
| Finanzas | ✓ | ✓ | ✓ (sucursal, sin margen) | ✗ | ✗ |
| Usuarios — gestión | ✓ | ✗ | ✓ (solo vendedores de su suc.) | ✗ | ✗ |
| Configuración global | ✓ | ✗ | ✗ | ✗ | ✗ |
| Precios / Márgenes | ✓ | ✓ | ✗ | ✗ | ✗ |
| Catálogo admin | ✓ | ✓ | ✗ | ✗ | ✗ |
| Rankings | ✓ | ✓ | ✓ (sucursal) | ✓ (propio) | ✗ |
| Comisiones propias | ✓ | ✓ | ✗ | ✓ | ✗ |
| Sueldos vendedores | ✓ | ✗ | ✗ | ✗ | ✗ |
| Dólar colchón configuración | ✓ | ✗ | ✗ | ✗ | ✗ |

---

## 3. Restricciones para el Rol Vendedor

### 3.1 Ventas: solo ver las propias

El vendedor solo debe ver sus propias ventas. El `vendedor_perfil_id` ya existe en `ventas` (V17). El problema es que `GET /api/ventas` no filtra por usuario.

**Cambio en `salesRepository.js`:**
```js
async function list({ page, limit, cliente_id, fecha_desde, fecha_hasta,
                       deposito_id, usuario_id_filter = null }) {
  let where = ['v.estado != "cancelada"'];
  const params = [];

  if (usuario_id_filter) {
    // vendedor: filtrar por su usuario_id o su vendedor_perfil asociado
    where.push('(v.vendedor_id = ? OR vp.usuario_id = ?)');
    params.push(usuario_id_filter, usuario_id_filter);
  }
  // ...
}
```

**En `salescontroller.js`:**
```js
async function list(req, res) {
  const usuarioIdFilter = req.user.role === 'vendedor'
    ? req.user.sub
    : null; // admin y gerente ven todo

  const ventas = await repo.list({
    ...req.query,
    usuario_id_filter: usuarioIdFilter,
  });
  // ...
}
```

### 3.2 Clientes: solo los propios

Un vendedor solo debe ver los clientes con los que ha tenido ventas.

**Cambio en `clientcontroller.js`:**
```js
async function list(req, res) {
  const vendedorFilter = req.user.role === 'vendedor' ? req.user.sub : null;

  const clients = await repo.list({
    ...req.query,
    vendedor_id_filter: vendedorFilter,
  });
  // ...
}
```

**Cambio en `clientRepository.js`:**
```js
// Si vendedor_id_filter != null:
// Mostrar solo los clientes que tienen al menos una venta con ese vendedor
WHERE c.id IN (
  SELECT DISTINCT cliente_id FROM ventas
  WHERE (vendedor_id = ? OR vendedor_perfil_id IN (
    SELECT id FROM vendedor_perfiles WHERE usuario_id = ?
  ))
)
```

### 3.3 Productos: eliminar campos sensibles para vendedor

**Cambio en `productRepository.js` — función `productFields(role)`:**

```js
const SENSITIVE_FIELDS = [
  'precio_costo', 'precio_costo_pesos', 'precio_costo_dolares',
  'tipo_cambio', 'margen_local', 'margen_distribuidor', 'proveedor_id',
  'comision_pct' // el vendedor no sabe su propia comisión por producto
];

function productSelectFields(role) {
  const all = [
    'p.id', 'p.codigo', 'p.nombre', 'p.descripcion',
    'p.precio_venta', 'p.precio_local', 'p.precio_distribuidor', 'p.precio_final',
    'p.stock_quantity', 'p.stock_minimo', 'p.imagen_url',
    'p.categoria_id', 'c.nombre AS categoria_nombre',
    'p.marca', 'p.modelo', 'p.activo',
    // Campos sensibles solo para admin/gerente:
    ...(role === 'admin' || role === 'gerente' ? [
      'p.precio_costo', 'p.precio_costo_pesos', 'p.precio_costo_dolares',
      'p.tipo_cambio', 'p.margen_local', 'p.margen_distribuidor',
      'p.proveedor_id', 'prov.nombre AS proveedor_nombre', 'p.comision_pct'
    ] : [])
  ];
  return all.join(', ');
}
```

### 3.4 Cancelar ventas: solo admin y gerente

Actualmente el cancel endpoint no verifica roles específicamente.

**Cambio en `salescontroller.js`:**
```js
async function cancel(req, res) {
  if (!['admin', 'gerente', 'gerente_sucursal'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Sin permiso para cancelar ventas' });
  }
  // ...
}
```

### 3.5 Rutas a remover del frontend para vendedor

En `AppRouter.tsx`, modificar `RoleGate` para las siguientes rutas:
- `/app/compras` → quitar `vendedor`.
- `/app/proveedores` → quitar `vendedor`.
- `/app/finanzas` → quitar `vendedor`.
- `/app/informes` → quitar `vendedor` (agregar endpoint separado `GET /api/reportes/vendedor-personal`).
- `/app/medicina-laboral` → quitar `vendedor` (a menos que el negocio lo requiera).
- `/app/catalogo` → quitar `vendedor`.
- `/app/alertas` → quitar `vendedor`.

### 3.6 Dashboard personal del vendedor

En lugar de ver el dashboard global, el vendedor ve su propio panel:

```
┌─────────────────────────────────────────────────────────────┐
│  Hola, Juan! — Tu Rendimiento               [Este mes ▼]    │
├────────────────┬────────────────┬────────────┬──────────────┤
│ Mis ventas hoy │ Mi total mes   │ Mis clientes│ Mi comisión │
│ 5 ventas       │ $320.000       │ 42          │ $6.400       │
└────────────────┴────────────────┴────────────┴──────────────┘
```

**Nota:** El vendedor ve `Mi comisión` porque tiene acceso a `/app/mi-cuenta/comisiones`. NO ve el margen ni el costo.

### 3.7 Navegación del vendedor

En `navigationConfig.ts`, filtrar por rol:

```typescript
// Items que el vendedor PUEDE ver:
const VENDEDOR_ALLOWED = [
  'dashboard',
  'caja',
  'ventas',
  'clientes',
  'productos',    // sin costos
  'stock',        // sin costos
  'rankings',     // solo su posición
  'mi-cuenta/comisiones',
  'cuenta-empresa', // para cargar comprobantes
  'crm',          // sus propias interacciones
  'postventa',    // sus propios tickets
  'ordenes-servicio',
];
```

---

## 4. Dólar Colchón — Concepto y Diseño

### 4.1 El problema

Los clientes del negocio a veces pagan en dólares o el precio se calcula en base a dólares. El negocio usa un **"dólar colchón"**: toman el dólar a un valor que puede ser mayor o menor al oficial para protegerse de la volatilidad cambiaria.

**Ejemplo:**
- Dólar oficial: $1.000 ARS
- Dólar colchón del negocio: $1.150 ARS
- Producto que cuesta USD 100 → precio de venta en pesos = $115.000 (no $100.000)

### 4.2 Casos de uso

1. **Precio en pesos con dólar colchón:** El cliente paga en pesos pero el precio se calculó sobre el dólar colchón.
2. **Pago en dólares con dólar colchón:** El cliente paga en dólares pero se registra la equivalencia en pesos según el dólar colchón.
3. **Lista de precios en dólares:** Una lista de precios donde todos los precios son en dólares, convertidos al momento de la venta con el dólar colchón vigente.

### 4.3 Diferencia con el tipo_cambio existente

| Campo | Propósito | ¿Quién lo configura? |
|---|---|---|
| `productos.tipo_cambio` | TC al importar el producto (para calcular precio_costo_pesos desde costo_dolares) | Sistema automático al cargar productos |
| `productos.precio_costo_dolares` | Costo en dólares fijo | Admin al cargar el producto |
| **Dólar colchón** | TC de venta personalizado para cobrar | Admin desde Configuración |
| TC oficial del día | Referencia externa | API externa (ej: dolarito.ar, BNA) |

---

## 5. Implementación del Dólar Colchón

### 5.1 Tabla de tipos de cambio configurables

```sql
-- V30__dolar_colchon.sql
CREATE TABLE IF NOT EXISTS tipos_cambio_config (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo          VARCHAR(20) NOT NULL,   -- 'dolar_colchon', 'dolar_oficial', 'dolar_blue', etc.
  nombre          VARCHAR(80) NOT NULL,   -- "Dólar Colchón", "Dólar BNA"
  valor           DECIMAL(18,4) NOT NULL,
  moneda_base     VARCHAR(10) NOT NULL DEFAULT 'USD',
  moneda_destino  VARCHAR(10) NOT NULL DEFAULT 'ARS',
  es_default      TINYINT(1) NOT NULL DEFAULT 0,  -- solo uno puede ser default
  activo          TINYINT(1) NOT NULL DEFAULT 1,
  origen          ENUM('manual','api_externa') NOT NULL DEFAULT 'manual',
  api_url         VARCHAR(255) NULL,      -- URL para actualización automática
  notas           TEXT NULL,
  actualizado_por BIGINT UNSIGNED NULL,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tc_codigo (codigo),
  KEY ix_tc_activo (activo),
  CONSTRAINT fk_tc_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historial de cambios de tipo de cambio
CREATE TABLE IF NOT EXISTS tipos_cambio_historial (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tc_id       BIGINT UNSIGNED NOT NULL,
  codigo      VARCHAR(20) NOT NULL,
  valor_anterior DECIMAL(18,4) NOT NULL,
  valor_nuevo    DECIMAL(18,4) NOT NULL,
  usuario_id  BIGINT UNSIGNED NULL,
  fecha       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_tch_tc (tc_id, fecha),
  CONSTRAINT fk_tch_tc      FOREIGN KEY (tc_id)     REFERENCES tipos_cambio_config(id) ON DELETE CASCADE,
  CONSTRAINT fk_tch_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)           ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed inicial
INSERT INTO tipos_cambio_config (codigo, nombre, valor, es_default, activo, origen)
VALUES
  ('dolar_colchon', 'Dólar Colchón', 1000.0000, 1, 1, 'manual'),
  ('dolar_oficial', 'Dólar Oficial BNA', 1000.0000, 0, 1, 'manual'),
  ('dolar_blue', 'Dólar Blue', 1000.0000, 0, 1, 'manual');
```

### 5.2 Columnas adicionales en `ventas`

```sql
-- En V30:
ALTER TABLE ventas
  ADD COLUMN tc_codigo        VARCHAR(20) NULL AFTER recargo_pago_pct,
  ADD COLUMN tc_valor_venta   DECIMAL(18,4) NULL AFTER tc_codigo,
  ADD COLUMN monto_dolares    DECIMAL(18,4) NULL AFTER tc_valor_venta;
-- tc_codigo = qué tipo de cambio se usó para esta venta
-- tc_valor_venta = el valor del TC al momento de la venta (snapshot histórico)
-- monto_dolares = si el pago se registró en dólares (para convertir al mostrar)
```

### 5.3 Lógica en el proceso de venta

Al crear una venta desde `CajaRapida.tsx` o `Ventas.tsx`:

```typescript
// Si el precio de un producto tiene `precio_modo = 'dolar'` o la lista
// seleccionada usa dólar colchón:

const tc = await Api.getTipoCambio('dolar_colchon'); // GET /api/tipos-cambio/dolar_colchon
const precioEnPesos = product.precio_dolar * tc.valor;
```

El vendedor NO ve cuál dólar se usó. Solo ve el precio en pesos. El admin puede ver en cada venta el TC que se aplicó.

### 5.4 API endpoints de tipos de cambio

```
GET    /api/tipos-cambio                     → Lista todos (admin/gerente)
GET    /api/tipos-cambio/:codigo             → Valor actual (todos — para cálculos de venta)
PUT    /api/tipos-cambio/:codigo             → Actualizar valor (solo admin)
GET    /api/tipos-cambio/:codigo/historial   → Historial de cambios (admin)
```

### 5.5 Actualización automática desde API externa

El admin puede configurar `origen = 'api_externa'` y `api_url` para que el sistema actualice automáticamente el valor. Por ejemplo, para el dólar oficial BNA:

```js
// backend/server/services/tipoCambioService.js
const cron = require('node-cron');
const axios = require('axios');

// Cron a las 10:00 AM de días hábiles
cron.schedule('0 10 * * 1-5', async () => {
  const apis = await db.query(
    'SELECT * FROM tipos_cambio_config WHERE origen = "api_externa" AND activo = 1'
  );
  for (const api of apis) {
    try {
      const res = await axios.get(api.api_url, { timeout: 5000 });
      const nuevoValor = parseFloat(res.data.venta || res.data.blue || res.data.value);
      if (nuevoValor > 0) {
        await db.query(
          'UPDATE tipos_cambio_config SET valor = ? WHERE id = ?',
          [nuevoValor, api.id]
        );
        // Registrar en historial
      }
    } catch (err) {
      logger.warn(`[TC] No se pudo actualizar ${api.codigo}:`, err.message);
    }
  }
});
```

### 5.6 UI en Configuración para el dólar colchón

En `ConfiguracionAdmin.tsx` (nueva sección o tab):

```
┌──────────────────────────────────────────────────────────────┐
│  Tipos de Cambio                          Solo admin         │
├──────────────────┬──────────────┬────────────────────────────┤
│ Tipo             │ Valor actual │ Acciones                   │
├──────────────────┼──────────────┼────────────────────────────┤
│ ★ Dólar Colchón  │ $1.150       │ [Editar] [Historial]       │
│  Dólar Oficial   │ $1.000       │ [Editar] [Historial]       │
│  Dólar Blue      │ $1.080       │ [Editar] [Historial]       │
└──────────────────┴──────────────┴────────────────────────────┘
```

El `★` indica el que se usa por defecto en las ventas.

---

## 6. Cambios de Backend

### 6.1 Archivos a modificar para restricciones de vendedor

| Archivo | Cambio |
|---|---|
| `salescontroller.js` + `salesRepository.js` | Filtrar ventas por `usuario_id_filter` |
| `clientcontroller.js` + `clientRepository.js` | Filtrar clientes por `vendedor_id_filter` |
| `productRepository.js` | Función `productSelectFields(role)` |
| `reportcontroller.js` | Bloquear `/api/reportes` para vendedor; agregar `/api/reportes/vendedor-personal` |
| `salescontroller.js` → `cancel()` | Verificar que solo admin/gerente puede cancelar |

### 6.2 Nuevos archivos para dólar colchón

| Archivo | Descripción |
|---|---|
| `backend/server/controllers/tipoCambioController.js` | CRUD de tipos de cambio |
| `backend/server/db/repositories/tipoCambioRepository.js` | Queries para tipos_cambio_config e historial |
| `backend/server/routes/tipocambioroutes.js` | Registrar en index.js |
| `backend/server/services/tipoCambioService.js` | Cron de actualización automática |

### 6.3 Reglas de acceso para tipos de cambio

```js
// En tipoCambioController.js:
async function getByCode(req, res) {
  // Cualquier usuario autenticado puede consultar el valor actual
  // (necesario para calcular precios en el punto de venta)
  const tc = await repo.getByCode(req.params.codigo);
  if (!tc) return res.status(404).json({ error: 'Tipo de cambio no encontrado' });
  // Solo devolver {codigo, nombre, valor, moneda_base, moneda_destino}
  // No devolver api_url ni configuración interna
  res.json({ codigo: tc.codigo, nombre: tc.nombre, valor: tc.valor });
}

async function update(req, res) {
  // Solo admin puede cambiar tipos de cambio
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Solo el administrador puede cambiar tipos de cambio' });
  }
  // Registrar en historial antes de actualizar
  // ...
}
```

---

## 7. Cambios de Frontend

### 7.1 `Productos.tsx` — ocultar campos sensibles

```typescript
// Basarse en el rol del usuario logueado:
const isAdmin = role === 'admin' || role === 'gerente';

// Solo mostrar campos de costo si isAdmin:
{isAdmin && (
  <div className="grid grid-cols-2 gap-4">
    <InputField label="Costo en pesos" name="costo_pesos" ... />
    <InputField label="Costo en dólares" name="costo_dolares" ... />
    <InputField label="Tipo de cambio" name="tipo_cambio" ... />
    <InputField label="Comisión %" name="comision_pct" ... />
    <ProveedorSelector name="proveedor_id" ... />
  </div>
)}
```

### 7.2 `Ventas.tsx` / `CajaRapida.tsx` — integración dólar colchón

Al seleccionar un método de pago en dólares o un producto con precio en dólares, mostrar:

```
Precio USD: $100
TC Dólar Colchón: $1.150
Precio en pesos: $115.000
```

El vendedor ve el precio en pesos resultante pero NO ve el nombre "dólar colchón" ni el valor del TC. Solo ve el precio final.

### 7.3 `ConfiguracionAdmin.tsx` — nueva sección de tipos de cambio

Agregar sección "Tipos de Cambio" visible solo para `admin`:
- Lista de tipos de cambio configurados.
- Formulario inline para editar el valor.
- Modal de historial de cambios.
- Toggle para marcar uno como default.

### 7.4 Dashboard personal del vendedor — `DashboardVendedor.tsx`

Nueva vista que se muestra cuando `role === 'vendedor'` entra al dashboard:

```typescript
// En Dashboard.tsx, branch por rol:
if (role === 'vendedor') {
  return <DashboardVendedor />;
}
// admin/gerente ven el dashboard actual
```

`DashboardVendedor.tsx` llama a `GET /api/reportes/vendedor-personal` que devuelve:
- Ventas del día/semana/mes.
- Clientes atendidos.
- Comisión calculada del mes.
- Top 5 productos más vendidos por él.

---

## 8. Migración SQL

**Archivo:** `V30__dolar_colchon_y_roles.sql`

```sql
-- 1. Tabla tipos_cambio_config (§5.1)
CREATE TABLE IF NOT EXISTS tipos_cambio_config ( ... );

-- 2. Tabla tipos_cambio_historial (§5.1)
CREATE TABLE IF NOT EXISTS tipos_cambio_historial ( ... );

-- 3. Seeds de tipos de cambio iniciales (§5.1)
INSERT INTO tipos_cambio_config ...;

-- 4. Columnas en ventas para TC (§5.2)
ALTER TABLE ventas
  ADD COLUMN tc_codigo VARCHAR(20) NULL,
  ADD COLUMN tc_valor_venta DECIMAL(18,4) NULL,
  ADD COLUMN monto_dolares DECIMAL(18,4) NULL;

-- 5. Nuevo rol
INSERT IGNORE INTO roles (nombre) VALUES ('gerente_sucursal');

-- 6. Tabla de permisos granulares (para extensibilidad futura)
-- (opcional en esta versión — se puede implementar con roles hardcodeados primero)
```

---

## 9. Plan de Implementación

### Etapa 1 — Restricciones de vendedor en backend (1 día)
- [ ] `salesRepository.js` + `salescontroller.js`: filtro por usuario para vendedor
- [ ] `clientRepository.js` + `clientcontroller.js`: filtro por vendedor
- [ ] `productRepository.js`: función `productSelectFields(role)`
- [ ] `salescontroller.js` → `cancel()`: restricción de rol
- [ ] Endpoint `GET /api/reportes/vendedor-personal`

### Etapa 2 — Frontend restricciones vendedor (1 día)
- [ ] `Productos.tsx`: ocultar campos sensibles según rol
- [ ] `AppRouter.tsx`: ajustar `RoleGate` para remover rutas no permitidas
- [ ] `navigationConfig.ts`: filtrar items por rol
- [ ] `Dashboard.tsx`: branch `DashboardVendedor` para rol vendedor
- [ ] Crear `DashboardVendedor.tsx`

### Etapa 3 — Dólar colchón backend (1 día)
- [ ] Ejecutar `V30__dolar_colchon_y_roles.sql`
- [ ] Crear `tipoCambioController.js`, `tipoCambioRepository.js`, `tipocambioroutes.js`
- [ ] Crear `tipoCambioService.js` con cron de actualización
- [ ] Registrar routes en `index.js`

### Etapa 4 — Dólar colchón frontend (1 día)
- [ ] Sección "Tipos de Cambio" en `ConfiguracionAdmin.tsx`
- [ ] Integrar TC en `CajaRapida.tsx` y `Ventas.tsx`
- [ ] Mostrar equivalencia en pesos cuando se vende con dólar

### Testing crítico
- Login como `vendedor` → `GET /api/productos/1` → verificar que la respuesta NO incluye `precio_costo`.
- Login como `vendedor` → `GET /api/ventas` → verificar que solo retorna sus ventas.
- Login como `vendedor` → intentar cancelar venta → debe retornar `403`.
- Login como `admin` → `PUT /api/tipos-cambio/dolar_colchon` con valor 1200 → verificar que se registra en historial.
- Login como `vendedor` → `GET /api/tipos-cambio/dolar_colchon` → devuelve el valor pero NO la `api_url`.
