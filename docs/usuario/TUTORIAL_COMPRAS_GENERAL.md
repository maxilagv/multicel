# Tutorial: Registro de Compras

Guía completa para registrar compras en el sistema — tanto manual como por importación masiva.

---

## Opción A — Carga manual (uno por uno)

Ideal para compras pequeñas (1 a 20 productos).

1. Andá a **Compras** en el menú.
2. Completá el formulario:
   - **Proveedor**: elegí de la lista.
   - **Moneda**: ARS o USD. Si elegís USD, el sistema te sugiere el tipo de cambio del día.
   - **Depósito**: dónde va a ingresar la mercadería.
   - **Recepción inmediata**: activá si ya recibiste la mercadería. El stock sube al instante.
3. En la sección **Items**, buscá cada producto por nombre o código y completá cantidad y costo.
4. Hacé clic en **Registrar compra**.

---

## Opción B — Agregar por categoría

Ideal cuando comprás muchos productos de una misma línea (ej: todas las fundas de Samsung).

1. En el formulario de Compras, completá proveedor, moneda y depósito.
2. Hacé clic en el botón violeta **"Agregar por categoría"**.
3. En el selector, elegí una subcategoría (ej: `Samsung`) y hacé clic en **"+ Agregar"**.
4. Podés seguir agregando más subcategorías (ej: `Motorola`, `iPhone`).
5. Marcá o desmarcá **"Incluir subcategorías anidadas"** según necesites.
6. Hacé clic en **"Buscar productos"**: aparece la lista completa.
7. Si todos los productos tienen el mismo precio, escribilo en **"Costo único para todos"** — se aplica a todos los que seleccionés.
8. Usá los checkboxes para elegir cuáles agregar.
9. Hacé clic en **"Agregar N productos al pedido"**.
10. Solo te falta poner la cantidad de cada uno en el formulario y registrar la compra.

---

## Opción C — Importación masiva desde Excel/CSV

Ideal para compras de decenas o cientos de productos (típico en fundas).

### Formato de la planilla

La planilla debe tener estas columnas exactas en la primera fila:

```
compra_ref, proveedor, producto_codigo, fecha, moneda, cantidad, costo_unitario, tipo_cambio, oc_numero, adjunto_url
```

| Columna | Obligatorio | Descripción |
|---|---|---|
| `compra_ref` | Sí | Agrupa filas en una compra. Mismo valor = misma compra. |
| `proveedor` | Sí | Nombre exacto del proveedor. |
| `producto_codigo` | Sí | SKU del producto (lo ves en la página Productos). |
| `fecha` | Sí | Formato `AAAA-MM-DD` (ej: `2026-01-15`). |
| `moneda` | Sí | `ARS`, `USD` o `CNY`. |
| `cantidad` | Sí | Unidades compradas. |
| `costo_unitario` | Sí | Precio por unidad en la moneda indicada. |
| `tipo_cambio` | No | Solo si moneda es USD/CNY. Ej: `1300`. |
| `oc_numero` | No | Número de orden de compra. |
| `adjunto_url` | No | Link a factura/remito en Google Drive. |

### Ejemplo de planilla correcta

```csv
compra_ref,proveedor,producto_codigo,fecha,moneda,cantidad,costo_unitario,tipo_cambio,oc_numero,adjunto_url
ENERO-01,asterix,SKU-TTXUBJ,2026-01-15,USD,50,1.20,1300,,
ENERO-01,asterix,SKU-7EGUBS,2026-01-15,USD,30,1.20,1300,,
ENERO-02,asterix,SKU-XR2WJL,2026-01-20,ARS,10,8500,,,OC-2026-02
```

### ¿Cómo subir el archivo?

1. Andá a **Compras**.
2. Hacé clic en **"Importar compras desde Excel"** (panel arriba del formulario).
3. Arrastrá el archivo CSV/Excel o seleccionalo.
4. El sistema muestra una vista previa. Verificá los datos.
5. Confirmá la importación. El stock se actualiza automáticamente si está marcada la recepción inmediata.

### Guardar los códigos de tus productos

Para llenar la columna `producto_codigo` fácilmente:

- Andá a **Productos** y buscá el producto por nombre.
- El código SKU aparece en la columna "Código" de la tabla.
- También podés exportar la lista de productos desde esa misma página.

---

## Recepción de mercadería

Si registraste una compra **sin** recepción inmediata (ej: pedido a futuro), el stock no se mueve todavía.

Cuando llegue la mercadería:

1. Andá a **Compras → Historial de compras**.
2. Hacé clic en **"Ver detalle"** en la compra correspondiente.
3. En el detalle, completá las cantidades recibidas.
4. Hacé clic en **"Confirmar recepción"**. El stock sube en ese momento.

---

## Historial de compras

La tabla de historial muestra todas las compras registradas con:
- **#** — Número de compra.
- **Fecha** — Fecha del registro.
- **Proveedor** — Nombre del proveedor.
- **OC** — Número de orden de compra (si se ingresó).
- **Total** — Monto total y moneda.
- **Estado** — `recibido` (stock actualizado), `parcial` (recepción incompleta), `pendiente` (sin recibir).

Hacé clic en **"Ver detalle"** para ver los productos de cada compra.

---

## Permisos

Solo los usuarios con rol **admin** o **gerente** pueden registrar y recibir compras. Los vendedores pueden consultar el historial pero no modificarlo.
