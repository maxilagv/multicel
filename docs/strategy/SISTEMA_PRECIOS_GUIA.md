# Guía completa del sistema de precios

**Versión:** 2026-03-30
**Para:** administradores y equipo de desarrollo

---

## Introducción

El sistema de precios de Argensystem está diseñado para adaptarse a distintos perfiles de negocio. Este documento explica, paso a paso, cómo configurar cada aspecto del sistema actual y qué hay que hacer cuando se necesite ampliar su capacidad.

---

## Parte 1 — Lo que existe hoy

### 1.1 Las tres listas de precio

El sistema maneja tres listas de precio por defecto:

| Lista | Clave interna | Descripción |
|-------|--------------|-------------|
| Precio Local | `local` | Precio de mostrador / minorista |
| Precio Distribuidor | `distribuidor` | Precio mayorista / por volumen |
| Precio Final | `final` | Precio público general |

Cada lista puede:
- Tener un nombre personalizado (ej: "Precio A", "Mayorista", "Público")
- Activarse o desactivarse
- Calcular su valor automáticamente a partir del costo + margen

---

### 1.2 Modos de cálculo de precios

**Modo automático (`auto`)**

El precio se calcula a partir del costo en dólares y el tipo de cambio:

```
precio_costo = precio_costo_dolares × tipo_cambio
precio_local = precio_costo × (1 + margen_local)
precio_distribuidor = precio_costo × (1 + margen_distribuidor)
```

Cuando se actualiza el dólar blue, todos los productos en modo auto se recalculan automáticamente.

**Modo manual (`manual`)**

El precio se ingresa directamente. Al actualizar el dólar blue, los precios manuales se escalan proporcionalmente para no quedar desactualizados. El usuario puede sobreescribirlos en cualquier momento.

---

## Parte 2 — Cómo configurar el sistema (paso a paso)

### 2.1 Personalizar las etiquetas de precio

**Dónde:** Configuración → sección "Etiquetas de Precios"

**Pasos:**
1. Ir a **Configuración** desde el menú lateral.
2. Encontrar la sección **Etiquetas de Precios**.
3. Cambiar el nombre de cada lista según el negocio (ej: "Local" → "Mostrador").
4. Activar o desactivar cada lista con el toggle a la izquierda del nombre.
5. Hacer clic en **Guardar nombres**.

**Notas importantes:**
- Desactivar una lista la oculta en ventas y en la ficha de producto; no elimina los datos.
- Los cambios de etiqueta son inmediatos y se aplican en todo el sistema.
- "Precio Final" no tiene toggle de habilitación — siempre está disponible.

---

### 2.2 Actualizar el tipo de cambio (dólar blue)

**Dónde:** Configuración → sección "Dólar Blue"

**Pasos:**
1. Ir a **Configuración**.
2. En el campo **Dólar Blue**, ingresar el valor actual (ej: `1285`).
3. Hacer clic en **Guardar**.

**Qué pasa internamente:**
- Todos los productos en modo `auto` con costo en dólares recalculan sus precios al instante.
- Los productos en modo `manual` escalan sus precios proporcionalmente (si el dólar sube 10%, los precios suben 10%).
- Se guarda un registro en el historial de precios para trazabilidad completa.
- El redondeo configurado (ver sección 2.3) se aplica en este momento.

**Regla de oro:** actualizar el dólar blue es la única acción necesaria para mantener toda la lista de precios al día cuando el negocio trabaja con costos en USD.

---

### 2.3 Configurar el redondeo de precios

**Dónde:** Configuración → sección "Redondeo de precios"

Esta sección define a qué múltiplo se redondean todos los precios calculados automáticamente.

**Opciones disponibles:**

| Opción | Ejemplo con $47,30 | Cuándo usarla |
|--------|-------------------|---------------|
| `1` (sin decimales) | `$47` | Siempre — elimina los centavos |
| `5` | `$45` | Precios de centenas bajas |
| `10` | `$50` | Precios desde $100 en adelante |
| `50` | `$50` | Precios desde $500 en adelante |
| `100` | `$0` → `$100` | Productos de alto valor |
| `500` | `$500` | Celulares, accesorios premium |
| `1000` | `$47.000` → `$47.000` | Precios en miles de pesos |

**Pasos:**
1. Ir a **Configuración**.
2. Encontrar la sección **Redondeo de precios**.
3. Hacer clic en el botón del múltiplo deseado.
   - La pantalla muestra un ejemplo en vivo: "Con $47,30 el resultado sería $X".
4. Hacer clic en **Guardar redondeo**.

**Notas importantes:**
- El redondeo aplica a: creación de productos, recepción de compras, y actualización de dólar blue.
- Los precios **ya guardados** en la base de datos no cambian hasta el próximo recálculo (próxima actualización de dólar blue o edición del producto).
- Para aplicar el nuevo redondeo a todos los productos inmediatamente, actualizar el dólar blue con el mismo valor actual.
- Los precios ingresados manualmente no se redondean automáticamente — solo los calculados.

---

### 2.4 Configurar márgenes por producto

**Dónde:** Productos → editar un producto → pestaña Precios

**Pasos:**
1. Abrir la ficha del producto.
2. En la sección de precios, ingresar el **margen local** (ej: `0.15` = 15%) y el **margen distribuidor** (ej: `0.45` = 45%).
3. Si el producto tiene costo en dólares, el precio se calcula automáticamente.
4. Para ingresar un precio fijo: cambiar el **modo** a `manual` e ingresar el valor directamente.
5. Guardar.

---

### 2.5 Configurar descuentos y ofertas por cantidad

**Dónde:** Menú → Ofertas de Precios

**Pasos:**
1. Ir a **Ofertas de Precios**.
2. Hacer clic en **Nueva oferta**.
3. Completar los campos:
   - **Nombre:** nombre interno de la oferta (ej: "Descuento por docena").
   - **Tipo:** elegir entre `Por cantidad` o `Por fecha`.
   - **Lista objetivo:** a qué lista aplica el descuento (Local / Distribuidor / Final / Todas).
   - **Descuento %:** porcentaje de descuento.
   - **Cantidad mínima:** cuántas unidades activan la oferta (para tipo "Por cantidad").
   - **Período:** fechas de vigencia (para tipo "Por fecha").
4. Seleccionar los productos a los que aplica la oferta.
5. Guardar.

---

### 2.6 Configurar comisiones de vendedores

**Dónde:** Configuración → sección Comisiones (dentro del módulo Sueldos Vendedores)

**Dos modos:**

**Modo por lista:** se define un porcentaje de comisión para cada lista de precio.
- Comisión Local: X%
- Comisión Distribuidor: X%
- Comisión Final: X%
- Comisión Oferta: X%

**Modo por producto:** cada producto tiene su propio porcentaje de comisión configurado en su ficha.

El modo se cambia en Configuración. Al cambiar de modo, las comisiones previas se respetan en las ventas ya cerradas.

---

## Parte 3 — Cómo funciona en el punto de venta

Al crear una venta:

1. El vendedor selecciona al cliente.
2. Agrega productos a la venta.
3. Para cada producto, el sistema muestra el precio según la lista configurada para ese cliente (o la lista elegida por el vendedor).
4. Si aplica una oferta por cantidad, el precio se ajusta automáticamente al superar el mínimo.
5. El sistema calcula la comisión del vendedor según el modo configurado.
6. Al cerrar la venta, todos los precios quedan guardados e inmutables en el comprobante.

---

## Parte 4 — Hoja de ruta: lo que viene

El sistema de precios tiene una reforma planificada. Los detalles técnicos completos están en [`PRICING_SYSTEM_REFORM.md`](PRICING_SYSTEM_REFORM.md). El resumen ejecutivo:

### Sprint 1 — Listas dinámicas (próximo)
Poder agregar, eliminar y renombrar listas de precio libremente desde Configuración. Un negocio con 2 listas puede eliminar la tercera. Un negocio con 4 listas puede crearla.

### Sprint 2 — Reglas por cantidad (siguiente)
Definir tramos: "de 1 a 5 unidades → precio local, de 6 en adelante → precio distribuidor". Configurable por lista, sin tocar el código.

### Sprint 3 — Precios por método de pago
Definir recargos automáticos: "efectivo → sin recargo, tarjeta débito → +2%, tarjeta crédito → +15%". El vendedor selecciona el método de pago y el sistema aplica el recargo en tiempo real.

---

## Referencia rápida — Dónde está cada cosa

| Quiero... | Voy a... |
|-----------|----------|
| Cambiar el nombre de una lista | Configuración → Etiquetas de Precios |
| Desactivar una lista | Configuración → Etiquetas de Precios → toggle |
| Actualizar el tipo de cambio | Configuración → Dólar Blue |
| Cambiar el redondeo | Configuración → Redondeo de precios |
| Crear un descuento por volumen | Ofertas de Precios → Nueva oferta |
| Cambiar el margen de un producto | Productos → editar → Precios |
| Ver el historial de precios | Productos → editar → Historial |
| Configurar comisiones | Configuración → Comisiones |
