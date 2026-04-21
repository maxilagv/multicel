# WhatsApp — Guía de configuración y uso

## ¿Para qué sirve la integración con WhatsApp?

- Enviar catálogos y listas de precios a clientes
- Recibir alertas del sistema (stock crítico, ventas grandes, resumen diario)
- Enviar recordatorios de cobranza automáticos
- Comunicarte con clientes directamente desde el sistema

---

## Primer paso: Conectar WhatsApp

1. Ir a **Configuración → WhatsApp**
2. Clic en **Conectar**
3. Aparece un código QR
4. Abrir WhatsApp en tu celular → **Dispositivos vinculados** → **Vincular un dispositivo**
5. Escanear el código QR
6. El sistema mostrará "✅ Conectado"

**Importante:** WhatsApp debe estar activo en tu celular. Si apagás el celular o perdés internet, puede desconectarse. El sistema reconecta automáticamente cuando recupera la conexión.

---

## Enviar catálogo por WhatsApp

1. Ir a **Catálogo** → pestaña **WhatsApp**
2. Seleccionar los productos que querés compartir
3. Elegir el cliente destinatario o ingresar un número
4. Clic en **Enviar catálogo**

El cliente recibe el catálogo como un PDF o listado de productos con precios y fotos.

---

## Alertas automáticas para el dueño

El sistema puede enviarte mensajes automáticos cuando pasa algo importante:

### Configurar las alertas
1. Ir a **Configuración → Alertas WhatsApp**
2. Ingresar tu número en formato internacional: `+5491155551234`
3. Activar los tipos de alerta que querés:

| Alerta | Cuándo se envía |
|---|---|
| **Stock crítico** | Cuando un producto baja del stock mínimo |
| **Venta grande** | Cuando se registra una venta por encima del umbral |
| **Resumen diario** | A la hora que configures, con el resumen del día |
| **Seguridad** | Si hay intentos de acceso sospechosos |

### Probar las alertas
En **Configuración → Alertas WhatsApp** → botón **Enviar alerta de prueba**.

---

## Recordatorios de cobranza automáticos

1. Ir a **Finanzas → Cobranzas**
2. Clic en **Recordatorios automáticos**
3. Elegir cuántos clientes incluir
4. Clic en **Generar**

El sistema envía un mensaje de WhatsApp a los clientes con deuda vencida recordándoles que deben pagar.

**¿A quién le envía?** Solo a clientes que tengan número de WhatsApp registrado y tengan deuda activa.

---

## Campañas de WhatsApp

Para enviar mensajes masivos a tu lista de clientes:

1. Ir a **WhatsApp → Campañas**
2. Crear una nueva campaña
3. Seleccionar destinatarios (todos, por zona, por tipo de cliente)
4. Escribir el mensaje
5. Programar o enviar inmediatamente

**Límites:** Para evitar que WhatsApp bloquee el número, el sistema envía los mensajes en lotes con pausas entre ellos.

---

## Límites y buenas prácticas

| Límite | Valor |
|---|---|
| Mensajes del sistema (alertas) | 20 por hora |
| Campañas | 25 mensajes por lote |
| Intervalo entre lotes | 10 segundos |

**Buenas prácticas:**
- No enviar más de 200 mensajes por día para evitar bloqueos
- Asegurarte de que los clientes aceptaron recibir mensajes
- No usar el número de WhatsApp del negocio para mensajes personales

---

## Preguntas frecuentes

**¿Se desconecta solo?**
WhatsApp Web se desconecta si el celular pierde internet por más de cierto tiempo. El sistema reconecta automáticamente en la mayoría de los casos. Si no reconecta, ir a **Configuración → WhatsApp** y volver a conectar.

**¿Puedo usar un número de WhatsApp Business?**
Sí, el sistema funciona tanto con WhatsApp normal como con WhatsApp Business.

**¿Los mensajes quedan guardados?**
Los mensajes enviados quedan registrados en el historial del módulo de WhatsApp. No se guardan los mensajes recibidos.

**¿Qué pasa si me bloquean el número?**
Si WhatsApp bloquea el número por envío masivo, podés desvincularlo desde **Configuración → WhatsApp → Desconectar** y reconectar con otro número. Se recomienda usar un número exclusivo del negocio.
