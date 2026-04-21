# Módulo de Ventas

## ¿Qué puedo hacer en este módulo?

- Registrar ventas al contado y en cuenta corriente
- Marcar ventas como entregadas
- Cobrar saldos pendientes
- Cancelar ventas (devuelve el stock automáticamente)
- Ver el historial completo de cada venta
- Exportar el listado a Excel

---

## Cómo registrar una venta

### Opción A — Caja Rápida (mostrador)
Presioná **F1** desde cualquier pantalla. Ideal para ventas rápidas sin datos del cliente.

### Opción B — Venta completa
1. Ir a **Ventas** → botón **Nueva venta**
2. Buscar o seleccionar el cliente (opcional)
3. Agregar los productos:
   - Buscar por nombre o código
   - Ajustar cantidad
   - Cambiar precio si es necesario
4. Elegir el método de pago
5. Aplicar descuento si corresponde
6. Clic en **Confirmar venta**

---

## Estados de una venta

| Estado | Significado |
|---|---|
| **Pendiente** | Aceptada pero sin pago completo |
| **Parcial** | Tiene pago parcial registrado |
| **Pagado** | Cobrada en su totalidad |
| **Cancelado** | Anulada (stock repuesto) |

---

## Cobrar una venta pendiente

1. Buscar la venta en el listado
2. Clic en la venta para ver el detalle
3. Clic en **Registrar pago**
4. Ingresar el monto y método
5. **Guardar**

---

## Cancelar una venta

> Solo se puede cancelar una venta que no esté entregada.

1. Buscar la venta
2. Clic en la venta → botón **Cancelar venta**
3. Confirmar en el diálogo
El stock se repone automáticamente.

---

## Listas de precios

Al hacer una venta podés elegir la lista de precios:
- **Local** — precio minorista estándar
- **Distribuidor** — precio mayorista
- **Final** — precio especial (si está configurado)

El precio por defecto puede configurarse en **Configuración → Listas de precios**.

---

## Exportar ventas

1. Ir a **Ventas**
2. Filtrar por fecha, estado o cliente
3. Clic en **Exportar Excel**

---

## Preguntas frecuentes

**¿Se puede modificar una venta ya registrada?**
No directamente. Si necesitás cambiar algo, cancelá la venta y registrá una nueva.

**¿Qué pasa si me quedé sin stock al registrar una venta?**
El sistema bloquea la venta si no hay stock suficiente. Podés registrar el stock faltante en el módulo de **Inventario**.

**¿Cómo veo qué vendió cada vendedor?**
En **Informes → Ranking de vendedores** o en **Finanzas → Márgenes → Por vendedor**.
