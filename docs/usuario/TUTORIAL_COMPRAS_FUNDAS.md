# Tutorial: Carga de Compras de Fundas

Guía paso a paso para registrar una compra de fundas usando la planilla Excel/CSV.

---

## ¿Para qué sirve la planilla?

Cuando comprás muchas fundas al proveedor (decenas o cientos de modelos), es más rápido llenar una planilla en Excel y subirla al sistema que cargar cada producto a mano. El sistema reconoce el código de cada funda y la agrega automáticamente.

---

## Paso 1 — Descargar la planilla

Descargá el archivo `plantilla-compras-fundas.csv` que te entregaron. Abrilo con **Excel** o **Google Sheets**.

> Si usás Google Sheets: `Archivo → Importar → Subir`.

---

## Paso 2 — Entender las columnas

| Columna | Descripción | Ejemplo |
|---|---|---|
| `compra_ref` | Identificador de la compra. Todas las filas de UNA misma compra deben tener el **mismo valor**. | `COMPRA-001` |
| `proveedor` | Nombre del proveedor **tal cual está registrado** en el sistema. | `asterix` |
| `producto_codigo` | Código del producto (SKU). Lo ves en la página de Productos. | `SKU-TTXUBJ` |
| `fecha` | Fecha de la compra en formato `AAAA-MM-DD`. | `2026-01-15` |
| `moneda` | `ARS` (pesos) o `USD` (dólares). Las fundas se compran generalmente en `USD`. | `USD` |
| `cantidad` | Cuántas unidades comprás de ese producto. | `50` |
| `costo_unitario` | Precio que pagás por unidad, en la moneda indicada. | `1.20` |
| `tipo_cambio` | Tipo de cambio que usaste si la moneda es USD. Ej: 1300. Dejar vacío si es ARS. | `1300` |
| `oc_numero` | Número de orden de compra (opcional). Podés dejarlo vacío. | `OC-2026-01` |
| `adjunto_url` | Link a un remito o factura en Drive (opcional). | *(vacío)* |

---

## Paso 3 — Completar la planilla

1. **No borres la primera fila** (encabezados).
2. Una fila = un producto de la compra.
3. Si comprás fundas de Samsung y Motorola en la misma compra, todas van con el mismo `compra_ref`, misma `fecha` y mismo `proveedor`.
4. Completá `cantidad` y `costo_unitario` para cada producto.
5. Si todos los artículos tienen el mismo costo (ej: todas las fundas a USD 1.20), podés copiar y pegar la columna.

### Consejo para cargas grandes

Si comprás 200 modelos distintos:
- Filtrá por categoría en la página de Productos para ver los códigos.
- O usá el buscador de Productos, escribí el nombre y copiá el SKU.
- También podés usar la función **"Agregar por categoría"** directamente en el formulario de Compras, que busca todos los productos de una categoría y los agrega al pedido de una sola vez.

---

## Paso 4 — Subir la planilla al sistema

1. Andá a **Compras** en el menú lateral.
2. Hacé clic en el botón **"Importar compras desde Excel"** (panel azul/gris arriba del formulario).
3. Arrastrá o seleccioná tu archivo CSV.
4. El sistema mostrará una vista previa con los datos que va a importar.
5. Si todo está bien, confirmá la importación.
6. El stock se actualiza automáticamente.

---

## Paso 5 — Verificar la carga

Después de importar, bajá al **Historial de compras** en la misma página para verificar que la compra aparece con el estado correcto.

Si querés ver el detalle, hacé clic en **"Ver detalle"** en la fila correspondiente.

---

## Errores comunes

| Error | Solución |
|---|---|
| "Producto no encontrado" | El código SKU está mal escrito. Verificá en la página de Productos. |
| "Proveedor no encontrado" | El nombre del proveedor no coincide exactamente. Revisá en la sección Proveedores. |
| "Fecha inválida" | Usá el formato `AAAA-MM-DD` (ej: `2026-01-15`). |
| "Moneda inválida" | Solo se aceptan `ARS`, `USD` o `CNY`. |
| La cantidad no actualizó el stock | Verificá que el estado de la compra sea "recibido". Si está "pendiente", el stock no se mueve hasta confirmar la recepción. |

---

## Carga rápida por categoría (alternativa a la planilla)

Si no querés usar la planilla, podés cargar fundas directamente desde el formulario:

1. En la página de Compras, completá proveedor y moneda.
2. Hacé clic en **"Agregar por categoría"**.
3. Elegí la subcategoría (ej: `Samsung`), hacé clic en **"+ Agregar"**.
4. Podés agregar varias subcategorías (ej: `Samsung` + `Motorola` + `iPhone`).
5. Hacé clic en **"Buscar productos"**.
6. Si todas las fundas tienen el mismo precio, completá el campo **"Costo único para todos"**.
7. Seleccioná las que querés y hacé clic en **"Agregar N productos al pedido"**.
8. Solo te queda poner la cantidad de cada una y enviar.
