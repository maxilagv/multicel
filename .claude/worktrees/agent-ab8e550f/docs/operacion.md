# Operacion del sistema (Servidor + Clientes)

## 1) Instalacion del servidor (dueno)
- Instalar la app en la PC que actuara como servidor.
- Iniciar en modo "Crear nuevo negocio (dueno)".
- Mantener la app abierta mientras otros equipos se conectan.

## 2) Obtener IP del servidor
- En el login (modo dueno) aparece "Servidor activo" con IP/puerto.
- Copiar una IP del estilo `192.168.x.x:3000`.

## 3) Instalacion de clientes (empleados)
- Instalar la app en cada PC de empleados.
- Elegir "Conectar a negocio existente (empleado)".
- Ingresar la IP del servidor y conectar.

## 4) Firewall (Windows)
- Permitir conexiones entrantes al puerto 3000 para la app.
- Si no conecta, revisar antivirus/firewall.

## 5) Licencias (manual)
- En Configuracion -> Licencia de usuarios, copiar el "ID instalacion".
- En la PC del proveedor:
  - Generar claves (una sola vez):
    - `node backend/server/scripts/generate-license-keys.js`
  - Generar codigo:
    - `node backend/server/scripts/generate-license.js <ID> <MAX_USERS> [YYYY-MM-DD]`
- El cliente pega el codigo en Configuracion -> Licencia.

## 6) Restriccion por red
- Configuracion -> Red permitida:
  - "Sin restriccion": cualquiera con IP/URL puede conectar.
  - "Solo IPs privadas": solo PCs dentro de LAN.
  - "Subred especifica": ej. `192.168.0.0/24`.

## 7) Backups
- Configuracion -> Backups:
  - "Crear backup" genera una copia de la base.
  - "Restaurar" reemplaza la base actual con un backup.

## 8) Nombres de precios y metodos de pago
- Configuracion -> Nombres de precios:
  - Cambia las etiquetas de los tres precios para todo el sistema (PDFs, catalogos, exportaciones).
- Configuracion -> Metodos de pago:
  - Crear, editar, ordenar y activar/inactivar metodos (ej: Efectivo, Transferencia, USD).

## 9) Pagos con multiples metodos
- Clientes -> Detalle -> Pago cuenta corriente:
  - Permite dividir un pago en varias formas de pago.
  - El total se calcula automaticamente a partir de los metodos cargados.

## 10) Informes con resumen (solo admin)
- Informes -> Descargar PDF ganancias:
  - El admin ve una vista previa con resumen, recomendaciones y movimientos.
  - Luego se descarga el PDF final.

## 11) Importar productos desde Excel
- Productos -> Importar productos desde Excel.
- Formatos soportados: .xlsx y .csv (primera hoja).
- Columnas recomendadas: `nombre`, `categoria`, `precio` o `costo_pesos`, `stock`, `codigo` (opcional), `image_url` (opcional).
- Reglas:
  - Si la categoria no existe, se crea automaticamente.
  - Si el producto ya existe (por codigo o nombre+categoria), se omite.
  - Si no hay precio/costo, la fila se marca con error.

## 12) Demo de 3 dias
- Al iniciar el servidor por primera vez, comienza el periodo de demo (3 dias).
- Al vencer, el sistema muestra "Tiempo de demo vencido" y no permite continuar.
- Para extender o habilitar completo, cargar licencia en Configuracion -> Licencia.

Notas:
- El servidor se apaga si se cierra la app.
- La clave privada de licencia nunca debe enviarse a clientes.
