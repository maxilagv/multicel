# ARCA / Facturación Electrónica AFIP — Guía de Configuración

## Modos de operación

| Modo | Cuándo usarlo | Requisitos |
|---|---|---|
| **SANDBOX** | Desarrollo, testing, demos | Solo `ARCA_SANDBOX=true` en .env |
| **Homologación** | Probar con AFIP real sin datos reales | Clave Fiscal Nivel 2 + certificado |
| **Producción** | Facturación real | CUIT activo + punto de venta AFIP + certificado |

---

## MODO SANDBOX (para empezar ahora mismo)

No requiere ningún certificado ni acceso a AFIP.

```bash
# En .env del servidor:
ARCA_SANDBOX=true
```

El sistema:
- Ejecuta toda la lógica de negocio (valida venta, calcula IVA, etc.)
- Genera un CAE ficticio (no tiene validez fiscal)
- Guarda la factura en la base de datos con `estado='sandbox'`
- Permite testear el flujo completo de la UI

> ⚠️ Las facturas sandbox no son válidas ante AFIP. Son solo para testing.

---

## MODO HOMOLOGACIÓN (probar con AFIP real)

### Qué se necesita
- CUIL/CUIT propio (puede ser el tuyo como persona)
- Clave Fiscal **Nivel 2** mínimo (ver cómo obtenerla abajo)
- OpenSSL instalado

### Paso 1 — Obtener Clave Fiscal Nivel 2

Si no tenés Clave Fiscal o tenés Nivel 1:

**Opción A (recomendada): DNI con chip**
1. Instalar la app "Mi AFIP" en el celular
2. Ingresar con DNI + selfie
3. Esto otorga Nivel 2 automáticamente

**Opción B: Presencial en AFIP**
1. Ir a cualquier agencia AFIP con DNI
2. Pedir "alta de clave fiscal nivel 2"
3. Es gratuito, demora 15 minutos

**Opción C: Con e-Token (si tenés uno)**
1. El e-Token físico da Nivel 3 directamente

### Paso 2 — Generar el certificado de prueba

```bash
# Genera clave privada + certificado autofirmado
node backend/server/scripts/generate-arca-test-cert.js \
  --cuit 20111111112 \
  --razon "MI EMPRESA TEST" \
  --out ./certs-test

# Outputs:
# certs-test/private.key      ← clave privada
# certs-test/certificado.crt  ← certificado público (para subir a AFIP)
# certs-test/certificado.p12  ← archivo a subir al sistema
```

> **CUIT de prueba para homologación:** AFIP tiene CUITs ficticios para testing.
> El más común es `20111111112`. Podés buscar más en la documentación de AFIP homologación.

### Paso 3 — Subir el certificado a AFIP

1. Ingresar a https://auth.afip.gob.ar con tu CUIL/CUIT y clave fiscal nivel 2
2. Ir a: **Servicios** → **Administración de Certificados Digitales**
3. Clic en **Nuevo Certificado**
4. En "Alias del certificado": poner cualquier nombre (ej: `kaisen-test`)
5. En "Subir certificado": adjuntar `certificado.crt` (el generado arriba)
6. Clic en **Confirmar**
7. AFIP aprueba el certificado en segundos

### Paso 4 — Habilitar WSFEv1 en homologación

1. En el portal AFIP: **Servicios** → **Administración de Relaciones de Clave Fiscal**
2. **Agregar relación** → servicio: **WSFE** (Web Service Facturación Electrónica)
3. Confirmá el acceso

### Paso 5 — Configurar el sistema

1. Ir a **Configuración → ARCA** en el sistema
2. Ingresar:
   - CUIT: `20111111112` (el de prueba)
   - Razón social: cualquiera
   - Ambiente: **Homologación**
   - Condición IVA: la que corresponda al emisor
3. Subir el archivo `certificado.p12` (sin passphrase)
4. Clic en **Probar conexión** — debe responder "appServer: OK, dbServer: OK"

### Paso 6 — Crear punto de venta en AFIP

1. En AFIP: **Servicios** → **Administración de Puntos de Venta**
2. **Agregar punto de venta**:
   - Número: `1` (o cualquier número 1-9998)
   - Tipo: **ONLINE** (para facturación electrónica)
3. En el sistema: **Configuración → ARCA → Puntos de Venta** → agregar el mismo número

### Paso 7 — Emitir primera factura de prueba

1. Crear una venta en el sistema
2. Ir al detalle de la venta → **Emitir factura**
3. Seleccionar tipo (A/B/C)
4. Confirmar
5. Si todo está bien: recibirás un CAE válido de AFIP homologación

---

## PRODUCCIÓN REAL

### Checklist completo

```
AFIP:
[ ] CUIT activo con actividades económicas cargadas
[ ] Clave Fiscal Nivel 2 o 3
[ ] Certificado digital creado (con el script o manualmente)
[ ] Certificado subido a AFIP y aprobado
[ ] Servicio WSFEv1 habilitado en la relación de clave fiscal
[ ] Punto de venta creado en AFIP (tipo ONLINE)

Sistema:
[ ] ARCA_SANDBOX=false en .env del servidor
[ ] CUIT real del negocio configurado
[ ] Certificado .p12 subido en Configuración → ARCA
[ ] Punto de venta configurado con el número correcto
[ ] Condición IVA del emisor correctamente configurada
[ ] Alícuotas de IVA verificadas (0%, 10.5%, 21%, 27%)
[ ] Prueba de conexión exitosa
[ ] Factura de prueba emitida y verificada en el comprobante online de AFIP
```

---

## Tipos de comprobante — regla fiscal

| Emisor | Receptor | Tipo |
|---|---|---|
| Responsable Inscripto | Responsable Inscripto | **A** |
| Responsable Inscripto | Consumidor Final | **B** |
| Responsable Inscripto | Monotributista | **B** |
| Monotributista | Cualquiera | **C** |
| Exento | Cualquiera | **C** |

---

## Solución de problemas

### "Certificado expirado o inválido"
- Los certificados de AFIP tienen validez de 1 año
- Generar y subir uno nuevo a AFIP antes del vencimiento
- El sistema avisa 30 días antes si `SENTRY_DSN` está configurado

### "Error de autenticación WSAA"
1. Verificar que el certificado subido a AFIP corresponde a la clave privada cargada en el sistema
2. Verificar que el CUIT del certificado coincide con el CUIT configurado
3. Verificar que el servicio WSFE está habilitado en relaciones de clave fiscal

### "Punto de venta no encontrado"
1. Verificar que el número de punto de venta en el sistema coincide con AFIP
2. El punto de venta en AFIP debe ser tipo **ONLINE** (no física)
3. Verificar que el punto de venta esté activo en AFIP

### "Diferencia de totales"
El total calculado internamente difiere del neto de la venta. Causas posibles:
- La venta tiene impuestos adicionales (`impuestos > 0`)
- El modo "precios incluyen IVA" no coincide con cómo se registraron los precios
- Configurar en **Configuración → ARCA → Precios incluyen IVA**: true/false

### "Factura A requiere CUIT del receptor"
El cliente no tiene CUIT cargado o está mal formateado.
Ir al perfil del cliente y completar CUIT en formato XX-XXXXXXXX-X.

---

## Variables de entorno relacionadas

```bash
ARCA_SANDBOX=false     # true en desarrollo/testing, false en producción
ARCA_MASTER_KEY=       # Auto-generada si no se especifica. Si se pierde, los certificados encriptados quedan inutilizables.
```

> ⚠️ **IMPORTANTE**: Respaldar `ARCA_MASTER_KEY` en un lugar seguro.
> Si se pierde, deberás re-subir el certificado desde cero.
