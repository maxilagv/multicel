# Reforma del Sistema de Precios — Informe Exhaustivo

**Fecha:** 2026-03-30
**Estado:** Propuesta — pendiente de implementación
**Autor:** Maximo Lavagetto

---

## 0. Ya implementado: Sistema de redondeo configurable

**Estado:** Implementado el 2026-03-30.

El sistema ahora tiene un parámetro global `precio_redondeo_step` en `parametros_sistema` que define a qué múltiplo se redondean todos los precios calculados automáticamente.

**Opciones:** 1, 5, 10, 50, 100, 500, 1000.

**Puntos donde aplica el redondeo:**
- Recálculo al actualizar el dólar blue (`configcontroller.js`)
- Creación/edición de producto con margen (`productRepository.js`)
- Recepción de compras con margen (`purchaseRepository.js`)

**Display:** `formatARS()` ya no muestra decimales (`$45` en vez de `$45,00`).

**UI:** Sección "Redondeo de precios" en Configuración → botones de selección rápida con preview en vivo.

---

## 1. Diagnóstico: el sistema actual

### Lo que existe hoy

El sistema tiene **3 listas de precio fijas y hardcodeadas**:
- `precio_local` — calculado con `margen_local` (default 15%)
- `precio_distribuidor` — calculado con `margen_distribuidor` (default 45%)
- `precio_final` — etiqueta sin lógica de margen propia

Estas listas están quemadas en:
- La tabla `productos` (columnas fijas)
- El contexto `PriceConfigContext.tsx` (`PriceTierKey = 'local' | 'distribuidor' | 'final'`)
- Los filtros de `ofertas_precios` (`lista_precio_objetivo`)
- Las comisiones en `parametros_sistema`
- La lógica de recálculo en `configcontroller.js`

**Lo que se puede configurar hoy:**
- Renombrar las etiquetas (ej: "Local" → "Mayorista")
- Habilitar/deshabilitar listas (local y distribuidor)
- Definir márgenes globales

**Lo que NO se puede hacer hoy:**
- Agregar una cuarta lista de precio
- Eliminar una lista completamente del sistema (solo se oculta)
- Definir reglas de aplicación por cantidad (ej: "de 1 a 5 unidades → precio A, de 6 en adelante → precio B")
- Aplicar precios según método de pago (efectivo / transferencia / tarjeta)
- Tener listas distintas entre clientes sin tocar el código

### El problema real

El sistema fue diseñado para un caso de uso específico (distribuidora de tecnología, 3 listas fijas), y ahora el negocio está creciendo hacia perfiles más variados:

| Perfil de cliente | Necesidad |
|-------------------|-----------|
| Mayorista | 2 listas (mayorista / minorista), no 3 |
| Minorista | 1 sola lista con variaciones por método de pago |
| Distribuidor mixto | 3+ listas con reglas de cantidad |
| Pyme con comisión | Precio diferente según vendedor |

---

## 2. Propuesta de reforma: 4 ejes

### Eje 1 — Listas de precio dinámicas

**Problema:** Las 3 listas están hardcodeadas. No se puede agregar ni eliminar.

**Solución:** Reemplazar las columnas fijas por una tabla `listas_precio` donde cada lista es una fila.

**Nueva tabla `listas_precio`:**
```sql
CREATE TABLE listas_precio (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(80) NOT NULL,          -- "Mayorista", "Minorista", etc.
  slug          VARCHAR(40) NOT NULL UNIQUE,    -- "mayorista", "minorista" (para API)
  descripcion   VARCHAR(255),
  margen_pct    DECIMAL(6,2) NOT NULL DEFAULT 0, -- margen base en %
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  orden         INT NOT NULL DEFAULT 0,         -- orden de visualización
  creado_en     DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Nueva tabla `productos_precios`** (reemplaza columnas fijas):
```sql
CREATE TABLE productos_precios (
  producto_id   INT NOT NULL,
  lista_id      INT NOT NULL,
  precio        DECIMAL(12,2) NOT NULL,
  modo          ENUM('auto','manual') DEFAULT 'auto',
  margen_override DECIMAL(6,2) NULL,  -- si NULL, usa el margen de la lista
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (producto_id, lista_id),
  FOREIGN KEY (producto_id) REFERENCES productos(id),
  FOREIGN KEY (lista_id) REFERENCES listas_precio(id)
);
```

**Migración desde el esquema actual:**
- `precio_local` → lista con slug `local`
- `precio_distribuidor` → lista con slug `distribuidor`
- `precio_final` → lista con slug `final`
- Los datos existentes migran a `productos_precios` sin pérdida

**UI en Configuración:**
- Sección "Listas de precio" con tabla editable
- Botón "Agregar lista" → modal con nombre + margen base
- Botón "Eliminar" (solo si no hay ventas asociadas) → soft delete (`activo = false`)
- Drag & drop para reordenar listas
- Cada lista muestra cuántos productos la usan

**Impacto técnico:**
- `PriceTierKey` pasa de ser un tipo fijo a ser un `id` + `slug` dinámico
- `PriceConfigContext` carga listas desde la API en vez de tener defaults hardcodeados
- El recálculo de precios al actualizar el dólar itera `listas_precio` en vez de columnas fijas
- `ofertas_precios.lista_precio_objetivo` pasa a ser FK a `listas_precio.id`

---

### Eje 2 — Reglas de aplicación por cantidad

**Problema:** Hoy no hay forma de decir "de 1 a 5 unidades → precio X, de 6 a 20 → precio Y".

**Solución:** Nueva tabla `reglas_precio_cantidad` que define tramos de cantidad por lista.

**Nueva tabla `reglas_precio_cantidad`:**
```sql
CREATE TABLE reglas_precio_cantidad (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  lista_id        INT NOT NULL,              -- lista a la que aplica
  cantidad_desde  INT NOT NULL DEFAULT 1,    -- desde cuántas unidades
  cantidad_hasta  INT NULL,                  -- hasta cuántas (NULL = sin límite)
  modo            ENUM('lista','lista_alternativa','descuento_pct','precio_fijo') NOT NULL,
  lista_alternativa_id INT NULL,             -- si modo = 'lista_alternativa'
  descuento_pct   DECIMAL(5,2) NULL,         -- si modo = 'descuento_pct'
  precio_fijo     DECIMAL(12,2) NULL,        -- si modo = 'precio_fijo'
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (lista_id) REFERENCES listas_precio(id),
  FOREIGN KEY (lista_alternativa_id) REFERENCES listas_precio(id)
);
```

**Cómo funciona:**

Ejemplo de configuración:
```
Lista "Minorista" tiene estas reglas:
  - 1 a 5 unidades   → aplica precio de lista "Minorista" (sin cambios)
  - 6 a 20 unidades  → aplica precio de lista "Mayorista"
  - 21+              → descuento del 10% sobre precio "Mayorista"
```

En el momento de cargar una venta:
1. El usuario selecciona el cliente y la lista
2. Al agregar un producto, el sistema evalúa la cantidad contra las reglas
3. Si hay una regla que aplica, el precio se ajusta automáticamente (con indicador visual)
4. El vendedor puede ver qué regla está aplicando

**UI en Configuración → Lista de precio:**
- Cada lista tiene una sub-sección "Reglas por cantidad"
- Tabla con columnas: Desde | Hasta | Acción
- Botón "Agregar tramo" → modal simple
- Vista previa: "Con 10 unidades, aplica precio de lista Mayorista"

**Algoritmo de resolución:**
```
function resolverPrecio(listaId, cantidad, productId):
  reglas = obtenerReglas(listaId, ordenadas por cantidad_desde ASC)
  para cada regla en reglas:
    si cantidad >= regla.cantidad_desde Y (regla.cantidad_hasta IS NULL O cantidad <= regla.cantidad_hasta):
      si regla.modo == 'lista_alternativa':
        retornar obtenerPrecio(productId, regla.lista_alternativa_id)
      si regla.modo == 'descuento_pct':
        retornar precioBase * (1 - regla.descuento_pct / 100)
      si regla.modo == 'precio_fijo':
        retornar regla.precio_fijo
  retornar precioBase  -- sin regla aplicable, precio normal
```

---

### Eje 3 — Precios por método de pago

**Problema:** Minoristas tienen precios distintos según efectivo / transferencia / tarjeta.

**Solución:** Tabla `metodos_pago_recargo` + lógica de recargo/descuento al momento de venta.

Este eje tiene **dos sub-enfoques** según lo que prefiera el negocio:

#### Sub-enfoque A: Recargo/descuento sobre el precio de lista (recomendado)

```sql
CREATE TABLE metodos_pago_recargo (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  metodo_pago_id  INT NOT NULL,         -- FK a metodos_pago existente
  lista_id        INT NULL,             -- NULL = aplica a todas las listas
  tipo            ENUM('recargo','descuento') NOT NULL,
  valor_pct       DECIMAL(5,2) NOT NULL, -- porcentaje
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago(id)
);
```

Ejemplos de configuración:
```
Efectivo        → descuento 5% (sobre cualquier lista)
Transferencia   → sin recargo
Tarjeta débito  → recargo 2%
Tarjeta crédito → recargo 15%
Tarjeta crédito 3 cuotas → recargo 22%
```

En ventas:
- El usuario selecciona el método de pago
- El sistema muestra el precio ajustado en tiempo real
- El comprobante detalla: "Precio lista: $1000 | Recargo tarjeta 15%: $150 | Total: $1150"
- Se guarda tanto el precio base como el recargo en `ventas_detalle`

#### Sub-enfoque B: Lista de precio independiente por método de pago

Crear listas separadas: "Minorista efectivo", "Minorista tarjeta", etc. y asociar cada método de pago a una lista.

```sql
ALTER TABLE metodos_pago ADD COLUMN lista_precio_id INT NULL;
-- Si NULL, usa la lista seleccionada por el vendedor al momento de venta
```

**Recomendación:** El Sub-enfoque A es más flexible y más fácil de mantener. Si el recargo de tarjeta cambia, se actualiza en un lugar. El Sub-enfoque B es mejor si los precios de cada método de pago son completamente independientes (no derivados).

**Nuevo campo en `ventas_detalle`:**
```sql
ALTER TABLE ventas_detalle ADD COLUMN recargo_pago_pct DECIMAL(5,2) DEFAULT 0;
ALTER TABLE ventas_detalle ADD COLUMN precio_sin_recargo DECIMAL(12,2) NULL;
```

---

### Eje 4 — UX en Configuración

El sistema de precios debe tener su propia sección en Configuración, separada del resto.

**Nueva sección: "Precios y listas"**

```
Configuración
└── Precios y listas
    ├── Listas de precio          ← gestionar listas (Eje 1)
    │   └── [Lista: Mayorista]
    │       ├── Margen base: 45%
    │       └── Reglas por cantidad (Eje 2)
    ├── Métodos de pago y recargos ← Eje 3
    └── Configuración general
        ├── Modo de cálculo (auto USD / manual)
        ├── Dólar blue
        └── IVA por defecto
```

**Mejoras de UX específicas:**
- En el punto de venta, mostrar todas las listas disponibles con selector claro
- Tooltip que explica qué regla está aplicando cuando el precio cambia
- En el producto, mostrar una tabla con "precio por lista" en vez de campos separados
- Historial de cambios de precio por lista (ya existe `productos_historial`, extender)

---

## 3. Análisis de impacto técnico

### Archivos que cambian

| Área | Archivo | Tipo de cambio |
|------|---------|---------------|
| BD | `schema.sql` | Nuevas tablas, migración de columnas |
| BD | Nueva migración `_add_listas_precio.sql` | Migración incremental |
| Backend | `pricingRepository.js` | Reescritura parcial |
| Backend | `pricingcontroller.js` | Nuevos endpoints |
| Backend | `pricingroutes.js` | Nuevas rutas |
| Backend | `configcontroller.js` | Cambiar lógica de recálculo |
| Frontend | `PriceConfigContext.tsx` | Cargar listas dinámicas |
| Frontend | `priceLabels.ts` | Basarse en listas dinámicas |
| Frontend | `ConfiguracionAdmin.tsx` | Nueva sección completa |
| Frontend | `Ventas.tsx` | Selector de lista + método de pago + reglas |
| Frontend | `Productos.tsx` | Tabla de precios por lista |
| Frontend | `api.ts` | Nuevos endpoints |
| Frontend | `types/entities.ts` | Nuevos tipos |

### Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|------------|
| Romper lógica de recálculo USD | Alta | Tests antes de migrar, rollback de migración |
| Perder precios existentes en migración | Media | Script de migración que copia datos primero, verificación fila por fila |
| Confusión de UI con muchas listas | Media | Límite sugerido de 6 listas, ayuda contextual |
| Reglas de cantidad contradictorias | Baja | Validación en backend (solapamiento de rangos) |
| Performance con muchas listas × productos | Baja | Índice compuesto en `productos_precios`, caché en contexto |

---

## 4. Orden de implementación sugerido

La reforma se divide en 4 sprints independientes, cada uno deployable sin romper el siguiente.

### Sprint 1 — Listas dinámicas (Eje 1)
Duración estimada: 3-4 días

1. Crear tabla `listas_precio` con datos migrados de las 3 listas actuales
2. Crear tabla `productos_precios` y migrar valores existentes
3. Endpoints CRUD para listas (`GET/POST/PUT/DELETE /api/precios/listas`)
4. Actualizar lógica de recálculo USD para iterar listas dinámicas
5. Frontend: sección "Listas de precio" en Configuración
6. Frontend: `PriceConfigContext` carga listas desde API
7. Frontend: tabla de precios por lista en ficha de producto

**Entregable:** Las 3 listas actuales se comportan exactamente igual, pero ahora se pueden agregar más.

### Sprint 2 — Reglas por cantidad (Eje 2)
Duración estimada: 2-3 días

1. Crear tabla `reglas_precio_cantidad`
2. Endpoints CRUD para reglas
3. Lógica de resolución en backend (función pura, testeable)
4. Frontend: UI de reglas dentro de cada lista
5. Frontend: en ventas, aplicar regla automáticamente al cambiar cantidad

**Entregable:** Se pueden configurar tramos de cantidad con precios distintos.

### Sprint 3 — Precios por método de pago (Eje 3)
Duración estimada: 2-3 días

1. Crear tabla `metodos_pago_recargo`
2. Endpoint para configurar recargos por método
3. Lógica de aplicación en ventas
4. Campos adicionales en `ventas_detalle`
5. Frontend: sección "Recargos" en Configuración
6. Frontend: en ventas, mostrar precio ajustado al seleccionar método de pago
7. Frontend: detalle en comprobante

**Entregable:** Los minoristas pueden configurar recargos por tarjeta/efectivo.

### Sprint 4 — Pulido y modo claro (independiente)
Duración estimada: 2 días

- Modo claro (light mode) con paleta de colores
- Refinamiento de UX en la sección de precios
- Documentación de usuario actualizada

---

## 5. API nueva: resumen de endpoints

```
# Listas de precio
GET    /api/precios/listas                    → array de listas activas
POST   /api/precios/listas                    → crear lista
PUT    /api/precios/listas/:id                → modificar lista
DELETE /api/precios/listas/:id                → desactivar lista

# Precios por producto
GET    /api/productos/:id/precios             → precios de un producto por lista
PUT    /api/productos/:id/precios             → actualizar precios (bulk)

# Reglas por cantidad
GET    /api/precios/listas/:id/reglas         → reglas de una lista
POST   /api/precios/listas/:id/reglas         → crear regla
PUT    /api/precios/reglas/:id                → modificar regla
DELETE /api/precios/reglas/:id                → eliminar regla

# Resolución de precio (usado en ventas)
POST   /api/precios/resolver                  → { producto_id, lista_id, cantidad } → { precio, regla_aplicada }

# Recargos por método de pago
GET    /api/precios/recargos-pago             → configuración de recargos
POST   /api/precios/recargos-pago             → crear recargo
PUT    /api/precios/recargos-pago/:id         → modificar recargo
DELETE /api/precios/recargos-pago/:id         → eliminar recargo
```

---

## 6. Preguntas abiertas que necesitan decisión

Antes de arrancar la implementación, estas cosas hay que definirlas:

1. **¿Cuántas listas máximo?** — ¿Hay un límite razonable? Sugerencia: 6. Sin límite puede complejizar demasiado la UI.

2. **¿Las reglas de cantidad son globales o por producto?** — La propuesta es que sean por lista (globales), pero podría haber productos que necesiten excepciones. ¿Vale la pena ese nivel de granularidad?

3. **Método de pago: Sub-enfoque A (recargo %) o B (lista independiente)?** — Depende de cómo el minorista define sus precios. Si dice "tarjeta = precio X fijo", es enfoque B. Si dice "tarjeta = precio efectivo + 15%", es enfoque A.

4. **¿Las ofertas/descuentos actuales coexisten con las nuevas reglas?** — Hoy hay una tabla `ofertas_precios` que aplica descuentos. Las nuevas reglas de cantidad también aplican descuentos. Hay que definir orden de precedencia: ¿qué gana?

5. **¿El historial de precios (`productos_historial`) se extiende a las nuevas listas?** — Sería ideal para auditoría, pero agrega complejidad. Decisión: ¿sí o no?

6. **¿Modo claro es opt-in o sigue el sistema operativo?** — Recomendación: seguir preferencia del sistema (`prefers-color-scheme`) con opción de override manual guardada en localStorage.

---

## 7. Lo que NO hay que romper

Lista de funcionalidades críticas que deben seguir funcionando exactamente igual después de la reforma:

- Recálculo automático de precios al actualizar el dólar blue
- Historial de precios en `productos_historial`
- Comisiones de vendedores (dependen de la lista de precio)
- `ofertas_precios` existentes (descuentos y promociones)
- Exportación de precios a Excel
- Catálogo/marketplace (usa precios)
- Remitos y comprobantes (precios deben ser inmutables una vez guardados)
- Permisos: solo admin/gerente puede modificar listas y reglas

---

## Conclusión

El sistema de precios actual es funcional pero rígido. La reforma propuesta no es un reemplazo, sino una **extensión** que mantiene todo lo que funciona y agrega la flexibilidad que distintos tipos de clientes necesitan.

La clave del éxito es la **migración limpia del Sprint 1**: si las 3 listas existentes quedan en `listas_precio` con los mismos datos, todo lo demás se construye sin riesgo encima.
