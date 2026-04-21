# Módulo de Clientes

## ¿Qué puedo hacer en este módulo?

- Registrar y editar clientes
- Ver el historial de ventas y pagos de cada cliente
- Gestionar cuentas corrientes (deudas y cobros)
- Configurar el acceso del cliente al portal web
- Gestionar riesgo de mora y promesas de pago
- Importar clientes desde Excel

---

## Cómo registrar un cliente

1. Ir a **Clientes** → botón **Nuevo cliente**
2. Completar los datos:
   - **Nombre** (obligatorio)
   - Email, teléfono, dirección (opcionales)
   - Tipo de cliente: Minorista / Mayorista / Distribuidor
   - Zona geográfica
3. Si el cliente tiene una deuda anterior (antes de empezar a usar el sistema), activar **"Tiene deuda anterior"** e ingresar el monto
4. Clic en **Registrar cliente**

---

## Ver el detalle de un cliente

Clic en cualquier cliente de la lista para ver:

- **Resumen**: total comprado, ticket promedio, última compra, deuda actual
- **Ventas**: historial de todas sus ventas
- **Cuenta corriente**: deudas y pagos
- **CRM**: oportunidades y actividades
- **Cobranza**: análisis de riesgo, promesas de pago, recordatorios
- **Acceso**: configurar usuario/contraseña del portal del cliente

---

## Cobrar una deuda

1. Clic en el cliente
2. Ir a la pestaña **Cuenta corriente**
3. Clic en **Registrar pago**
4. Elegir método de pago e ingresar monto
5. **Guardar**

El saldo se actualiza automáticamente.

---

## Gestión de cobranzas inteligente

En la pestaña **Cobranza** de cada cliente:

### Análisis de riesgo
El sistema calcula automáticamente un score de riesgo:
- 🟢 **Bajo** — Al día o con pequeños atrasos
- 🟡 **Medio** — Algunos días de atraso
- 🟠 **Alto** — Atraso significativo o promesas incumplidas
- 🔴 **Crítico** — Deuda mayor a 90 días o historial muy malo

### Promesas de pago
Registrá cuándo el cliente prometió pagar:
1. Clic en **Nueva promesa**
2. Ingresar monto y fecha comprometida
3. Elegir canal de contacto (WhatsApp, email, etc.)
4. Cuando el cliente pague, marcá la promesa como **Cumplida**

### Recordatorios automáticos
Desde **Finanzas → Cobranzas → Recordatorios automáticos**, el sistema puede enviar mensajes de WhatsApp a clientes con deuda vencida.

---

## Importar clientes desde Excel

1. Clic en **Importar desde Excel**
2. Descargar la plantilla
3. Completar: nombre, apellido, email, teléfono, dirección, tipo_cliente
4. Subir el archivo completado

---

## Eliminar un cliente

> Para eliminar un cliente, primero debe estar en estado **Inactivo**.

1. Hacer clic en el cliente
2. Clic en **Desactivar**
3. Luego en **Eliminar** (lo mueve a la papelera)
4. El cliente puede restaurarse desde la pestaña **Papelera**

---

## Preguntas frecuentes

**¿El cliente puede ver sus propias compras y facturas?**
Sí, si le configurás acceso en **Acceso → Configurar contraseña**. El cliente entra al portal en `/catalogo` con su email y contraseña.

**¿Puedo asignar clientes a zonas de reparto?**
Sí. Primero creá las zonas en **Configuración → Zonas**, luego asignás al cliente en su ficha.

**¿Cómo veo todos los clientes con deuda?**
En **Finanzas → Cobranzas** ves el ranking de riesgo completo de todos los clientes.
