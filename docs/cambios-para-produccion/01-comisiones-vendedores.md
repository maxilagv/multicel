# Comisiones a Vendedores — Rediseño Completo para Producción

**Estado actual:** Funcional pero confuso, el cliente no entiende cómo configurarlo ni cómo leerlo.  
**Objetivo:** Hacerlo tan claro que cualquier dueño de negocio pueda configurarlo y entenderlo sin ayuda.

---

## ÍNDICE

1. [Diagnóstico del Problema Actual](#1-diagnóstico-del-problema-actual)
2. [Concepto Central: Tres Modos de Comisión](#2-concepto-central-tres-modos-de-comisión)
3. [Rediseño del Módulo de Configuración](#3-rediseño-del-módulo-de-configuración)
4. [Rediseño de la Liquidación](#4-rediseño-de-la-liquidación)
5. [Vista Previa de Comisión en Productos](#5-vista-previa-de-comisión-en-productos)
6. [Exportación a Excel](#6-exportación-a-excel)
7. [Panel del Vendedor (Lo que Cobro)](#7-panel-del-vendedor-lo-que-cobro)
8. [Cambios Técnicos Necesarios en el Backend](#8-cambios-técnicos-necesarios-en-el-backend)
9. [Cambios Técnicos Necesarios en el Frontend](#9-cambios-técnicos-necesarios-en-el-frontend)
10. [Migraciones de Base de Datos Necesarias](#10-migraciones-de-base-de-datos-necesarias)
11. [Plan de Implementación por Etapas](#11-plan-de-implementación-por-etapas)

---

## 1. Diagnóstico del Problema Actual

### 1.1 ¿Qué existe hoy y por qué confunde?

El sistema actual tiene comisiones configurables en **cuatro lugares distintos** sin que quede claro cuál tiene prioridad:

| Lugar | Campo | Qué configura |
|---|---|---|
| `productos.comision_pct` | Porcentaje por producto | La comisión de cada producto individualmente |
| `vendedores_config.comision_tipo` | Tipo global del vendedor | Si ese vendedor cobra por producto, por lista o mixto |
| `parametros_sistema` (4 filas) | `comision_lista_local_pct`, etc. | Porcentajes globales por lista de precios |
| `vendedores_comisiones` | Porcentaje por período | Un porcentaje fijo por vendedor y período |

**El cliente no entiende esto porque:**

- No hay una pantalla unificada que explique "para este vendedor, así se calcula su comisión."
- No hay un ejemplo concreto: "Si hoy vende $10.000, le corresponde $X."
- Los tres modos (`por_producto`, `por_total_venta`, `mixto`) nunca se explican en la UI.
- El tab "Comisiones" dentro de Sueldos mezcla configuración global con configuración individual.
- No hay retroalimentación visual: el vendedor configura algo pero nunca ve el resultado.
- El campo `base_tipo` (bruto/neto) está en la UI pero no tiene ningún efecto real en el cálculo.
- El campo `periodo_liquidacion` se guarda en la base de datos pero la UI lo ignora.
- No hay forma fácil de exportar para pagar.

### 1.2 Los problemas concretos que reporta el cliente

**Problema 1 — Por lista de precios:**
> "Quiero que en Lista 1 el vendedor cobre 2%, en Lista 2 un 3%, etc."

Hoy esto se configura en `parametros_sistema` con 4 claves separadas (local, distribuidor, final, oferta), pero:
- Los nombres "local", "distribuidor", "final", "oferta" son los nombres técnicos internos, no necesariamente los nombres de las listas que tiene el cliente.
- No hay feedback visual: el cliente no sabe si lo configuró bien.
- No hay form claro para esto en la pantalla de vendedores — hay que entrar a Precios > Comisiones, que es un módulo completamente diferente.

**Problema 2 — Por producto individual:**
> "Quiero que por el Producto A el vendedor cobre 5%, por el Producto B el 2%, etc."

Hoy esto existe en `productos.comision_pct` pero:
- El cliente tiene que entrar producto a producto y editar ese campo.
- No hay una vista que muestre todos los productos con su comisión de un vistazo.
- No hay validación de que el modo del vendedor esté seteado en "por_producto".

**Problema 3 — Por venta total:**
> "Quiero que el vendedor cobre X% sobre el total de lo que vende en el mes."

Hoy existe como `por_total_venta` en `comision_tipo`, pero:
- El porcentaje que se usa en ese modo viene de `vendedores_comisiones.porcentaje`, que es un registro histórico con vigencias.
- El flujo para cambiarlo es confuso: hay que ir a tab "Comisiones", poner un porcentaje, guardar, y no está claro si eso sobreescribe o agrega un nuevo registro.

---

## 2. Concepto Central: Tres Modos de Comisión

Lo más importante para que el módulo sea entendible es establecer **tres modos claros y mutuamente excluyentes** a nivel de vendedor, con una explicación legible en la UI:

### Modo A — Por Lista de Precios

> "El vendedor gana un porcentaje diferente según la lista de precios que se usó en cada venta."

**Cómo funciona:**
- Se configura una vez a nivel global (o por vendedor si se quiere granularidad).
- Por cada lista activa en el sistema, se define un porcentaje.
- Al calcular comisión de una venta, se agrupa por lista y se aplica el % correspondiente.

**Ejemplo:**
```
Lista Mayorista  →  2%
Lista Minorista  →  4%
Lista Especial   →  1%
```

Si el vendedor vendió:
- $50.000 con Lista Mayorista → $1.000 de comisión
- $20.000 con Lista Minorista → $800 de comisión
- $5.000 con Lista Especial → $50 de comisión
- **Total comisión del período: $1.850**

### Modo B — Por Producto Individual

> "Cada producto tiene su propio porcentaje de comisión. El vendedor gana según los productos específicos que vendió."

**Cómo funciona:**
- Se configura el porcentaje en cada producto desde el ABM de productos.
- Al calcular, se suma el `comision_monto` de cada línea de venta.
- Si un producto tiene 0%, no genera comisión.

**Ejemplo:**
```
iPhone 15 128GB    →  2%   → Vendió 2 unidades a $500.000 c/u → $20.000 comisión
Samsung A55        →  3%   → Vendió 5 unidades a $150.000 c/u → $22.500 comisión
Funda genérica     →  0%   → No genera comisión
```
- **Total comisión del período: $42.500**

### Modo C — Por Venta Total (porcentaje fijo)

> "El vendedor gana un porcentaje fijo sobre el total facturado en el período, sin importar qué producto vendió ni a qué lista."

**Cómo funciona:**
- Se configura un porcentaje simple (ej: 3%).
- Se aplica sobre el total de ventas del período.
- Es el modo más simple.

**Ejemplo:**
```
Porcentaje configurado: 3%
Total ventas del mes: $300.000
Comisión = $300.000 × 3% = $9.000
```

---

## 3. Rediseño del Módulo de Configuración

### 3.1 Estructura propuesta de la pantalla de configuración

La pantalla de configuración de un vendedor debería tener **dos secciones claras**:

#### Sección A — Datos Generales del Vendedor

```
┌─────────────────────────────────────────────────────────────────┐
│  Configuración del vendedor: JUAN PÉREZ                        │
├─────────────────────────────────────────────────────────────────┤
│  Sueldo fijo mensual:     [_______$_______]                    │
│  Período de liquidación:  ( ) Diario  ( ) Semanal  (●) Mensual │
└─────────────────────────────────────────────────────────────────┘
```

#### Sección B — Modo de Comisión

Esta sección debe tener **tres cards visuales** con descripción, no tres opciones de un select oscuro:

```
┌─────────────────────────────────────────────────────────────────┐
│  ¿Cómo se calcula la comisión de este vendedor?                 │
├───────────────┬───────────────────┬────────────────────────────┤
│  [●] LISTA    │  [ ] PRODUCTO     │  [ ] % FIJO                │
│  DE PRECIOS   │  INDIVIDUAL       │  SOBRE TOTAL               │
│               │                   │                            │
│  Porcentaje   │  Cada producto    │  Un porcentaje             │
│  según la     │  tiene su propia  │  simple sobre              │
│  lista usada  │  comisión         │  todo lo vendido           │
│  en la venta  │  configurada      │  en el período             │
└───────────────┴───────────────────┴────────────────────────────┘
```

Dependiendo de la opción elegida, se muestra un sub-formulario diferente:

#### Sub-formulario para Modo A (Lista de Precios):

```
┌─────────────────────────────────────────────────────────────────┐
│  Porcentaje por lista de precios                                │
├────────────────────────────┬────────────────────────────────────┤
│  Lista Mayorista           │  [  2  ] %                        │
│  Lista Minorista           │  [  4  ] %                        │
│  Lista Especial            │  [  1  ] %                        │
│  Lista Oferta              │  [  0  ] %                        │
├────────────────────────────┴────────────────────────────────────┤
│  NOTA: Si una venta usa una lista no configurada, el % es 0.   │
└─────────────────────────────────────────────────────────────────┘
```

**IMPORTANTE:** Las listas que aparecen aquí deben ser los nombres reales del sistema del cliente, no los nombres técnicos internos (`local`, `distribuidor`, `final`, `oferta`). Si el cliente tiene configurada la lista como "Mayorista", debe aparecer "Mayorista".

Para esto hay que resolver el mapeo entre los códigos internos (`local`, `distribuidor`, etc.) y los nombres que el cliente definió en su configuración de listas. Ver sección técnica 8.1.

#### Sub-formulario para Modo B (Por Producto):

```
┌─────────────────────────────────────────────────────────────────┐
│  Las comisiones se toman del porcentaje configurado en cada    │
│  producto.                                                      │
│                                                                 │
│  Podés revisar y editar los porcentajes desde:                 │
│  → Módulo Productos > columna "Comisión %"                     │
│                                                                 │
│  Productos con comisión definida: 24 de 87                     │
│  Productos sin comisión (0%): 63                               │
│                                                                 │
│  [  Ver productos sin comisión asignada  ]                     │
└─────────────────────────────────────────────────────────────────┘
```

#### Sub-formulario para Modo C (% Fijo sobre Total):

```
┌─────────────────────────────────────────────────────────────────┐
│  Porcentaje fijo sobre total vendido en el período             │
│                                                                 │
│  [ 3.00 ] %  sobre el total de ventas del período             │
│                                                                 │
│  Ejemplo: Si vende $100.000, cobra $3.000 de comisión.        │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Configuración Global vs. Configuración por Vendedor

**Problema actual:** No está claro si la comisión por lista se configura una vez para todos los vendedores o por cada vendedor.

**Propuesta:** Resolver esto con una jerarquía explícita:

1. **Configuración Global** (en Ajustes > Comisiones o similar): define los defaults del sistema.
2. **Configuración por Vendedor** (en la ficha del vendedor): puede sobreescribir la global.

En la UI, dejar esto claro:

```
┌─────────────────────────────────────────────────────────────────┐
│  Porcentaje por lista de precios                                │
│                                                                 │
│  (●) Usar configuración global                                 │
│  ( ) Personalizar para este vendedor                           │
│                                                                 │
│  Configuración global actual:                                  │
│    Lista Mayorista: 2% | Lista Minorista: 4% | ...            │
│                                                                 │
│  [ Editar configuración global ]  (link a ajustes)            │
└─────────────────────────────────────────────────────────────────┘
```

Si elige "Personalizar", se muestran los inputs por lista.

### 3.3 Dónde vive esta pantalla

**Propuesta:** Crear una pantalla por vendedor con URL `/vendedores/:id/comisiones` que tenga:

- Tab 1: **Configuración** (lo que se describió arriba)
- Tab 2: **Liquidación** (resumen del período actual, con cálculo detallado)
- Tab 3: **Historial de Pagos** (todos los períodos liquidados)
- Tab 4: **Adelantos** (adelantos del período actual)

Esto unifica todo lo que hoy está disperso en múltiples tabs dentro de una pantalla genérica de "Sueldos".

---

## 4. Rediseño de la Liquidación

### 4.1 ¿Qué debe mostrar la liquidación?

La liquidación debe ser **transparente**: el vendedor y el empleador deben poder ver exactamente de dónde sale cada número.

#### Vista de Liquidación del Período — Propuesta

```
┌─────────────────────────────────────────────────────────────────┐
│  LIQUIDACIÓN — JUAN PÉREZ                                       │
│  Período: Mes de Abril 2026 (01/04 al 09/04)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  VENTAS DEL PERÍODO                                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Fecha      │ Cliente          │ Lista      │ Total        │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ 01/04/2026 │ García Roberto   │ Mayorista  │ $45.000      │  │
│  │ 02/04/2026 │ López María      │ Minorista  │ $12.500      │  │
│  │ 05/04/2026 │ Pérez Juan C.    │ Especial   │ $8.000       │  │
│  │ ...        │ ...              │ ...        │ ...          │  │
│  └──────────────────────────────────────────────────────────┘  │
│  Total ventas: $125.000                                         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CÁLCULO DE COMISIÓN (Modo: Por Lista de Precios)              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Lista        │ Total vendido  │ Comisión % │ Comisión $   │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Mayorista    │ $80.000        │ 2%         │ $1.600       │  │
│  │ Minorista    │ $37.000        │ 4%         │ $1.480       │  │
│  │ Especial     │ $8.000         │ 1%         │ $80          │  │
│  └──────────────────────────────────────────────────────────┘  │
│  Total comisión: $3.160                                         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  RESUMEN DE PAGO                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Concepto            │ Monto                               │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ + Sueldo fijo       │ $150.000                            │  │
│  │ + Comisión          │ $3.160                              │  │
│  │ - Adelantos         │ -$20.000                            │  │
│  │ - Pagos registrados │ -$0                                 │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ SALDO A PAGAR       │ $133.160                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [ Registrar Pago ]  [ Exportar a Excel ]                      │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Vista global de sueldos (todos los vendedores)

La pantalla principal de `/sueldos-vendedores` debe mostrar un resumen rápido de todos:

```
┌─────────────────────────────────────────────────────────────────┐
│  SUELDOS DEL PERÍODO: Abril 2026                               │
│  [ Mes  ▼ ]  [ 01/04/2026 → 09/04/2026 ]  [ Actualizar ]      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Vendedor      │ Ventas    │ Comisión  │ Fijo    │ TOTAL       │
│  ─────────────────────────────────────────────────────────     │
│  Juan Pérez    │ $125.000  │ $3.160    │ $150.000 │ $153.160   │
│  Ana García    │ $250.000  │ $6.250    │ $120.000 │ $126.250   │
│  Carlos López  │ $80.000   │ $0        │ $200.000 │ $200.000   │
│  ─────────────────────────────────────────────────────────     │
│  TOTAL NÓMINA  │           │ $9.410    │ $470.000 │ $479.410   │
│                                                                 │
│  [ Exportar Planilla de Sueldos ]                              │
└─────────────────────────────────────────────────────────────────┘
```

Al hacer clic en un vendedor, lleva a su liquidación detallada.

### 4.3 Liquidación por Modo B (Por Producto)

Cuando el modo es "Por Producto", el detalle de comisión debe mostrar:

```
│  CÁLCULO DE COMISIÓN (Modo: Por Producto Individual)           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Producto        │ Cant. │ Precio    │ Comis. │ Total     │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ iPhone 15 128GB │  2    │ $500.000  │  2%    │ $20.000   │  │
│  │ Samsung A55     │  5    │ $150.000  │  3%    │ $22.500   │  │
│  │ Funda           │  10   │ $5.000    │  0%    │ $0        │  │
│  └──────────────────────────────────────────────────────────┘  │
│  Total comisión: $42.500                                        │
```

### 4.4 Liquidación por Modo C (% Fijo)

```
│  CÁLCULO DE COMISIÓN (Modo: Porcentaje Fijo)                  │
│                                                                 │
│  Total ventas del período:        $300.000                     │
│  Porcentaje configurado:          3%                           │
│  Comisión calculada:              $9.000                       │
```

---

## 5. Vista Previa de Comisión en Productos

### 5.1 Por qué es importante

Cuando el cliente configura comisiones por lista de precios, actualmente no hay ningún lugar donde ver "si vendo este producto en esta lista, ¿cuánto le corresponde al vendedor?"

Esta vista previa es clave para la adopción: el cliente puede verificar que la configuración es correcta antes de que impacte en pagos reales.

### 5.2 Dónde mostrarla

En la pantalla de detalle de producto (la ficha del producto), agregar una sección:

```
┌─────────────────────────────────────────────────────────────────┐
│  COMISIÓN A VENDEDORES — Vista Previa                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Modo de comisión configurado: POR LISTA DE PRECIOS            │
│                                                                 │
│  ┌────────────────────┬─────────────┬───────────┬───────────┐  │
│  │ Lista              │ Precio venta│ Comis. %  │ Comis. $  │  │
│  ├────────────────────┼─────────────┼───────────┼───────────┤  │
│  │ Lista Mayorista    │ $450.000    │ 2%        │ $9.000    │  │
│  │ Lista Minorista    │ $520.000    │ 4%        │ $20.800   │  │
│  │ Lista Especial     │ $490.000    │ 1%        │ $4.900    │  │
│  │ Lista Oferta       │ $400.000    │ 0%        │ $0        │  │
│  └────────────────────┴─────────────┴───────────┴───────────┘  │
│                                                                 │
│  Nota: Los % pueden variar por vendedor si tienen config       │
│  personalizada.                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Cuándo mostrarla

- **Solo** cuando el modo global de comisión sea `lista` (o `mixto`).
- Si el modo es `producto`, en cambio mostrar el campo simple de `Comisión %` para editar directamente.
- Si el modo es `por_total_venta`, no mostrar nada relacionado con productos (porque no aplica por producto).

### 5.4 Lógica de cálculo para la vista previa

Para cada lista activa:
1. Obtener el precio de venta del producto en esa lista (ya existe en el sistema de precios).
2. Obtener el `%` de comisión de esa lista desde `parametros_sistema` (o config por vendedor).
3. Calcular `precio × %`.
4. Mostrar la tabla.

Esta operación es 100% del lado del cliente (frontend): toma datos del producto y de la config de comisiones, hace la multiplicación. No requiere un endpoint nuevo necesariamente, pero puede tener uno de tipo `GET /api/productos/:id/comision-preview` si se quiere mantener la lógica en el backend.

---

## 6. Exportación a Excel

### 6.1 Qué necesita el cliente de un Excel de sueldos

El Excel debe ser útil para dos personas distintas:

**Para el empleador (dueño/administrador):**
- Ver cuánto le debe a cada vendedor.
- Tener una tabla que se lleve a su banco o contador.
- Ver el detalle de comisiones para validarlo.

**Para el vendedor:**
- Ver cuánto cobró de comisión y por qué.
- Poder verificar que las ventas están incluidas.

### 6.2 Estructura del Excel propuesto

El Excel debería tener **dos hojas** (tabs):

#### Hoja 1 — "Resumen Nómina"

| Vendedor | Período | Total Ventas | Comisión | Sueldo Fijo | Adelantos | Saldo a Pagar |
|---|---|---|---|---|---|---|
| Juan Pérez | Abril 2026 | $125.000 | $3.160 | $150.000 | $20.000 | $133.160 |
| Ana García | Abril 2026 | $250.000 | $6.250 | $120.000 | $0 | $126.250 |
| Carlos López | Abril 2026 | $80.000 | $0 | $200.000 | $0 | $200.000 |
| **TOTAL** | | **$455.000** | **$9.410** | **$470.000** | **$20.000** | **$459.410** |

Esta hoja la usa el dueño para pagar.

#### Hoja 2 — "Detalle por Vendedor"

Una hoja por vendedor (o alternativamente secciones dentro de la misma hoja):

**Sección: Juan Pérez**

Sub-tabla de ventas:
| Fecha | N° Venta | Cliente | Lista | Total Venta |
|---|---|---|---|---|
| 01/04/2026 | #1045 | García Roberto | Mayorista | $45.000 |
| 02/04/2026 | #1052 | López María | Minorista | $12.500 |

Sub-tabla de cálculo de comisión:
| Lista | Total Vendido | % Comisión | Comisión $ |
|---|---|---|---|
| Mayorista | $80.000 | 2% | $1.600 |
| Minorista | $37.000 | 4% | $1.480 |

Sub-tabla de resumen:
| Concepto | Monto |
|---|---|
| + Sueldo Fijo | $150.000 |
| + Comisión | $3.160 |
| - Adelantos | -$20.000 |
| **SALDO A PAGAR** | **$133.160** |

### 6.3 Implementación técnica del Excel

**Librería sugerida:** `xlsx` (también conocida como `SheetJS`) — ya es una dependencia muy común en proyectos React/Node.

**Dos opciones de implementación:**

**Opción A — Excel generado en el frontend:**
- El frontend ya tiene todos los datos en memoria cuando muestra la liquidación.
- Al hacer clic en "Exportar a Excel", usa `xlsx` para generar el archivo directamente en el cliente.
- No requiere cambios en el backend.
- Ventaja: simple de implementar.
- Desventaja: si hay muchos datos, puede ser lento en el navegador.

**Opción B — Excel generado en el backend:**
- Nuevo endpoint `GET /api/vendedores/sueldos/exportar?periodo=mes&desde=...&hasta=...&formato=xlsx`.
- El backend genera el archivo y lo envía como descarga.
- Ventaja: más robusto para datos grandes.
- Desventaja: requiere más trabajo de backend.

**Recomendación:** Empezar con Opción A (frontend), es suficiente para el volumen actual.

### 6.4 Nombre del archivo descargado

El archivo debe descargarse con nombre descriptivo:
```
sueldos-abril-2026.xlsx
sueldos-01-04-2026_al_30-04-2026.xlsx
```

---

## 7. Panel del Vendedor (Lo que Cobro)

### 7.1 Problema actual

Los vendedores no tienen acceso a ver sus propias comisiones. Todo se gestiona desde el lado del administrador. Esto genera:
- Disputas sobre los montos.
- El vendedor no puede verificar que todas sus ventas estén incluidas.
- Desconfianza en el sistema.

### 7.2 Propuesta: Panel propio del vendedor

Agregar una vista accesible con el rol `vendedor` (sin privilegios de admin):

**URL propuesta:** `/mi-cuenta/comisiones`

#### Pantalla del Vendedor:

```
┌─────────────────────────────────────────────────────────────────┐
│  MIS COMISIONES — Juan Pérez                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PERÍODO ACTUAL: Abril 2026                              │  │
│  │  ──────────────────────────────────────────────────────  │  │
│  │  Mis ventas este mes:        $125.000                    │  │
│  │  Mi comisión calculada:      $3.160                      │  │
│  │  Mi sueldo fijo:             $150.000                    │  │
│  │  Adelantos cobrados:         -$20.000                    │  │
│  │                              ───────                     │  │
│  │  ME CORRESPONDE COBRAR:      $133.160                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ¿Cómo se calcula mi comisión?                                 │
│  Modo: Por Lista de Precios                                     │
│  Lista Mayorista (2%): $80.000 vendidos → $1.600               │
│  Lista Minorista (4%): $37.000 vendidos → $1.480               │
│  Lista Especial (1%): $8.000 vendidos → $80                    │
│                                                                 │
│  [ Ver mis ventas del período ]                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  HISTORIAL                                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Mes          │ Ventas    │ Comisión  │ Fijo    │ Cobré    │  │
│  │ Marzo 2026   │ $200.000  │ $5.000    │ $150.000│ $155.000 │  │
│  │ Febrero 2026 │ $180.000  │ $4.500    │ $150.000│ $154.500 │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Qué puede ver y qué no puede ver el vendedor

| Dato | Vendedor puede ver |
|---|---|
| Sus propias ventas del período | ✅ Sí |
| Su comisión calculada | ✅ Sí |
| Su sueldo fijo | ✅ Sí (es de él) |
| Sus adelantos | ✅ Sí |
| Su saldo a cobrar | ✅ Sí |
| Ventas de otros vendedores | ❌ No |
| Configuración del sistema | ❌ No |
| Sueldos de otros vendedores | ❌ No |
| Registrar pagos o adelantos | ❌ No (solo el admin) |

### 7.4 Autenticación y seguridad

- El backend debe validar que el `usuario_id` del request JWT coincide con el vendedor al que se pide info.
- El endpoint existente `GET /api/vendedores/:id/ventas` ya debería tener este control; verificar que existe.
- Agregar un endpoint de "mi resumen": `GET /api/vendedores/mi-resumen` que use el usuario autenticado en vez de un `:id`.

---

## 8. Cambios Técnicos Necesarios en el Backend

### 8.1 Resolver el mapeo entre nombres de listas y claves internas

**Problema:** El sistema usa claves fijas `local`, `distribuidor`, `final`, `oferta` para las listas, pero los clientes pueden tener cualquier nombre.

**Solución propuesta:**

En `parametros_sistema`, cambiar el esquema actual:
```
comision_lista_local_pct       → porcentaje para la lista con código 'local'
comision_lista_distribuidor_pct → porcentaje para la lista con código 'distribuidor'
```

A un esquema dinámico donde el % se almacene asociado al `lista_precio_codigo` real:

**Opción 1 — JSON en parametros_sistema:**
```sql
INSERT INTO parametros_sistema (clave, valor) VALUES 
('comision_por_lista', '{"mayorista": 2, "minorista": 4, "especial": 1, "oferta": 0}');
```
Esto permite cualquier nombre de lista sin cambiar el esquema.

**Opción 2 — Nueva tabla `comision_listas_config`:**
```sql
CREATE TABLE comision_listas_config (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lista_codigo VARCHAR(50) NOT NULL,    -- el código real de la lista
  lista_nombre VARCHAR(100) NOT NULL,   -- el nombre legible de la lista
  porcentaje DECIMAL(7,2) DEFAULT 0,
  activo TINYINT(1) DEFAULT 1,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
Esto es más limpio y permite agregar/quitar listas dinámicamente.

**Recomendación:** Opción 2, por claridad. Pero si se quiere mínimo esfuerzo, Opción 1 funciona.

### 8.2 Implementar el `periodo_liquidacion` guardado

**Problema:** El campo `vendedores_config.periodo_liquidacion` existe en la DB pero el frontend lo ignora y usa el selector de la UI en cada pantalla.

**Solución:** Cuando se abre la liquidación de un vendedor, pre-cargar el período seleccionado con el valor que está en `vendedores_config.periodo_liquidacion`. El usuario puede cambiarlo para ver otros períodos, pero el default debe respetarlo.

Cambio en el frontend:
```typescript
// Al cargar el componente de liquidación de un vendedor
const { data: config } = useVendedorConfig(vendedorId);

// Pre-seleccionar el período según la config del vendedor
const [selectedPeriodo, setSelectedPeriodo] = useState<Periodo>('mes');

useEffect(() => {
  if (config?.periodo_liquidacion) {
    setSelectedPeriodo(config.periodo_liquidacion);
  }
}, [config]);
```

### 8.3 Implementar `base_tipo` (bruto vs. neto) correctamente

**Problema:** El campo `base_tipo` en `vendedores_comisiones` está guardado pero no se usa en el cálculo.

**Solución:** En el servicio de cálculo de comisiones, al computar el monto:
- Si `base_tipo = 'bruto'`: usar el `subtotal` de la venta tal cual.
- Si `base_tipo = 'neto'`: usar `base_sin_iva` (ya existe en `ventas_detalle`).

Cambio en `vendorPayrollRepository.js` en la query de `ventasResumenPorVendedor`:
```sql
-- Hoy probablemente usa SUM(vd.comision_monto) directamente
-- Agregar lógica:
SUM(
  CASE 
    WHEN vc.base_tipo = 'neto' THEN (vd.base_sin_iva * vd.comision_pct / 100)
    ELSE (vd.subtotal * vd.comision_pct / 100)
  END
) AS comision_monto_recalculado
```

**Nota:** Si se implementa esto, los datos históricos en `ventas_detalle.comision_monto` quedan desincronizados. Hay dos opciones:
1. Recalcular en el query siempre (más seguro, pero más pesado).
2. Actualizar `ventas_detalle.comision_monto` cuando cambia la configuración (más rápido, pero requiere un proceso de actualización).

### 8.4 Agregar endpoint `GET /api/vendedores/mi-resumen`

Para el panel del vendedor, sin exponer datos de otros:
```javascript
// vendorPayrollController.js
async function miResumen(req, res) {
  const usuarioId = req.user.id; // del JWT
  const { periodo, desde, hasta } = req.query;
  
  // Reutilizar misma lógica que listSueldos() pero filtrada
  const sueldo = await vendorPayrollRepository.sueldoDeVendedor(usuarioId, periodo, desde, hasta);
  res.json(sueldo);
}
```

### 8.5 Agregar endpoint `GET /api/productos/:id/comision-preview`

Para la vista previa en productos:
```javascript
// productosController.js (o uno nuevo)
async function comisionPreview(req, res) {
  const { id } = req.params;
  
  const producto = await productosRepository.findById(id);
  const comisionConfig = await pricingRepository.getCommissionConfig();
  const precios = await productosRepository.getPreciosPorListas(id);
  
  // Para cada lista activa, calcular:
  const preview = precios.map(lista => ({
    lista_nombre: lista.nombre,
    lista_codigo: lista.codigo,
    precio_venta: lista.precio,
    comision_pct: comisionConfig.porcentajes[lista.codigo] ?? 0,
    comision_monto: lista.precio * (comisionConfig.porcentajes[lista.codigo] ?? 0) / 100,
  }));
  
  res.json({ 
    modo: comisionConfig.mode,
    producto_comision_pct: producto.comision_pct,
    preview_por_lista: preview 
  });
}
```

### 8.6 Columna `lista_precio_codigo` en `ventas_detalle` — Completar su uso

**Problema crítico:** El campo `lista_precio_codigo` existe en `ventas_detalle` pero se llena en NULL en la mayoría de los casos. Si el modo de comisión es "por lista", este campo es indispensable.

**Solución:** Al crear una venta (en el endpoint `POST /api/ventas`), asegurarse de poblar `lista_precio_codigo` en cada línea de detalle con el código de la lista que se usó.

Si una venta se hace con Lista Mayorista, cada `ventas_detalle` de esa venta debe tener `lista_precio_codigo = 'mayorista'`.

Esto es un **requisito bloqueante** para que el modo "por lista" funcione correctamente.

Revisar el controlador de ventas y agregar:
```javascript
// Al insertar ventas_detalle
await db.query(`
  INSERT INTO ventas_detalle 
  (venta_id, producto_id, cantidad, precio_unitario, subtotal, lista_precio_codigo, ...)
  VALUES (?, ?, ?, ?, ?, ?, ...)
`, [ventaId, item.producto_id, item.cantidad, item.precio, item.subtotal, listaUsada, ...]);
```

---

## 9. Cambios Técnicos Necesarios en el Frontend

### 9.1 Reformular el Tab "Comisiones" en SueldosVendedores.tsx

El tab actual "Comisiones" mezcla configuración global con configuración individual. Debe separarse en:

**Sub-tab A — Modo de Comisión** (para este vendedor):
- Card de selección de modo (A / B / C como se describió en sección 3).
- Sub-formulario según el modo elegido.
- Botón "Guardar configuración".
- Texto de confirmación: "Los cambios aplican a ventas futuras. Las ventas anteriores mantienen el cálculo original."

**Sub-tab B — Configuración Global** (para todos los vendedores):
- Solo visible para admins.
- Muestra los porcentajes por lista como están hoy.
- Botón para ir a la pantalla global de configuración de listas.

### 9.2 Mejorar el tab "Liquidación"

Agregar la tabla de desglose de comisiones según el modo activo:
- Si modo = lista → tabla por lista (como en sección 4.1).
- Si modo = producto → tabla por producto (como en sección 4.3).
- Si modo = total → resumen simple (como en sección 4.4).

Actualmente la liquidación muestra un número total de comisión sin desglose. Eso es insuficiente.

### 9.3 Agregar botón "Exportar a Excel"

En dos lugares:
1. En la vista global de sueldos (`/sueldos-vendedores`): "Exportar planilla de sueldos completa".
2. En la liquidación individual de cada vendedor: "Exportar liquidación de este vendedor".

Usar la librería `xlsx`:
```bash
npm install xlsx
```

Ejemplo de implementación básica:
```typescript
import * as XLSX from 'xlsx';

function exportarSueldos(items: SueldoItem[], periodo: string) {
  const wb = XLSX.utils.book_new();
  
  // Hoja 1: Resumen
  const resumenData = items.map(i => ({
    'Vendedor': i.nombre,
    'Total Ventas': i.ventas_total,
    'Comisión': i.comision_monto,
    'Sueldo Fijo': i.sueldo_fijo,
    'Adelantos': i.adelantos_total,
    'Saldo a Pagar': i.saldo,
  }));
  const ws1 = XLSX.utils.json_to_sheet(resumenData);
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen Nómina');
  
  // Escribir y descargar
  XLSX.writeFile(wb, `sueldos-${periodo}.xlsx`);
}
```

### 9.4 Vista previa en pantalla de Producto

En la pantalla de detalle/edición de producto, agregar una sección condicional:

```typescript
// Dentro del componente de edición de producto
const { data: comisionConfig } = useComisionConfig(); // hook que llama /api/precios/comisiones

const mostrarPorLista = comisionConfig?.mode === 'lista';
const mostrarPorProducto = comisionConfig?.mode === 'producto';

{mostrarPorProducto && (
  <div>
    <label>Comisión del vendedor (%)</label>
    <input type="number" value={producto.comision_pct} onChange={...} />
    <small>Porcentaje que se acredita al vendedor por cada venta de este producto.</small>
  </div>
)}

{mostrarPorLista && (
  <ComisionPreviewPorLista productoId={producto.id} />
)}
```

El componente `ComisionPreviewPorLista` hace el cálculo local o llama a `/api/productos/:id/comision-preview`.

### 9.5 Etiquetas y textos en la UI

Uno de los cambios más importantes y más baratos: **renombrar las cosas para que sean entendibles**.

Cambios de texto específicos:

| Texto actual | Texto propuesto |
|---|---|
| `por_producto` | "Por Producto Individual" |
| `por_total_venta` | "Porcentaje Fijo sobre Total" |
| `mixto` | "Mixto (Producto + Lista)" |
| `bruto` | "Sobre precio de venta (bruto)" |
| `neto` | "Sobre precio sin IVA (neto)" |
| "Comisión activa" | "Configuración de comisión" |
| "Período" (en comisiones) | "Liquidar por" |
| Tab "Comisiones" | Tab "Cómo Cobro" o "Mi Comisión" |

---

## 10. Migraciones de Base de Datos Necesarias

### 10.1 Nueva tabla `comision_listas_config` (si se elige Opción 2 de sección 8.1)

#### MySQL:
```sql
-- V30__comision_listas_config.sql (o el número que corresponda)
CREATE TABLE comision_listas_config (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lista_codigo VARCHAR(50) NOT NULL,
  lista_nombre VARCHAR(100) NOT NULL,
  porcentaje DECIMAL(7,4) DEFAULT 0.0000,
  activo TINYINT(1) DEFAULT 1,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lista_codigo (lista_codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrar datos existentes de parametros_sistema
INSERT INTO comision_listas_config (lista_codigo, lista_nombre, porcentaje)
SELECT 
  REPLACE(clave, 'comision_lista_', '') REPLACE('_pct', '') AS lista_codigo,
  CASE clave
    WHEN 'comision_lista_local_pct'        THEN 'Lista Local'
    WHEN 'comision_lista_distribuidor_pct' THEN 'Lista Distribuidor'
    WHEN 'comision_lista_final_pct'        THEN 'Lista Final'
    WHEN 'comision_lista_oferta_pct'       THEN 'Lista Oferta'
  END AS lista_nombre,
  CAST(valor AS DECIMAL(7,4)) AS porcentaje
FROM parametros_sistema
WHERE clave IN (
  'comision_lista_local_pct',
  'comision_lista_distribuidor_pct',
  'comision_lista_final_pct',
  'comision_lista_oferta_pct'
);
```

#### SQLite:
```sql
-- V31__comision_listas_config.sql (o el número que corresponda)
CREATE TABLE IF NOT EXISTS comision_listas_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lista_codigo TEXT NOT NULL UNIQUE,
  lista_nombre TEXT NOT NULL,
  porcentaje REAL DEFAULT 0.0,
  activo INTEGER DEFAULT 1,
  creado_en TEXT DEFAULT (datetime('now')),
  actualizado_en TEXT DEFAULT (datetime('now'))
);
```

### 10.2 Agregar índice a `ventas_detalle.lista_precio_codigo`

Este campo se va a consultar frecuentemente para agrupar comisiones por lista:

```sql
-- MySQL
ALTER TABLE ventas_detalle 
ADD INDEX idx_vd_lista_precio (lista_precio_codigo);

-- SQLite
CREATE INDEX IF NOT EXISTS idx_vd_lista_precio 
ON ventas_detalle(lista_precio_codigo);
```

### 10.3 Agregar `comision_tipo_vendedor` en `ventas_detalle` (opcional pero recomendado)

Para auditoría: guardar con qué modo se calculó la comisión de cada línea:

```sql
-- MySQL
ALTER TABLE ventas_detalle 
ADD COLUMN comision_tipo_calculo VARCHAR(20) NULL 
  COMMENT 'producto|lista|total — modo usado al calcular' 
  AFTER comision_monto;

-- SQLite
ALTER TABLE ventas_detalle 
ADD COLUMN comision_tipo_calculo TEXT NULL;
```

Esto permite reconstruir cualquier liquidación histórica con certeza.

---

## 11. Plan de Implementación por Etapas

Ordenado por impacto en usabilidad vs. esfuerzo:

### Etapa 1 — Quick wins (alta visibilidad, bajo esfuerzo)

**Prioridad: ALTA. Hacer primero.**

1. **Cambiar textos y labels en la UI** (sección 9.5): 2 horas. Sin riesgo. Impacto inmediato en comprensión.
2. **Agregar descripción de cada modo** en el selector de tipo de comisión: 2 horas. Explicar con texto qué hace cada modo.
3. **Pre-cargar el período de liquidación** desde `vendedores_config.periodo_liquidacion`: 1 hora. Bug fix real.
4. **Agregar desglose de comisión** en la pantalla de liquidación según el modo activo: 4 horas. Impacto alto.

### Etapa 2 — Funcionalidades clave de usabilidad

**Prioridad: ALTA. Segunda ronda.**

5. **Exportación a Excel** (sección 6): 6-8 horas. Muy pedida, librería simple.
6. **Vista previa de comisión en producto** (sección 5): 4 horas. Muy útil para verificar config.
7. **Configuración de modos por cards visuales** (sección 3.1): 6 horas. Reemplaza el select confuso.
8. **Sub-formulario dinámico según modo** (sección 3.1): 4 horas. Muestra lo relevante, oculta lo irrelevante.

### Etapa 3 — Correcciones técnicas de fondo

**Prioridad: MEDIA. Necesario para que el modo "por lista" funcione de verdad.**

9. **Poblar `lista_precio_codigo` al crear ventas** (sección 8.6): 4 horas. Bloqueante para modo lista.
10. **Crear tabla `comision_listas_config`** + migración (sección 10.1): 3 horas.
11. **Implementar `base_tipo`** en el cálculo real (sección 8.3): 3 horas.
12. **Resolver mapeo nombres de listas** (sección 8.1): 3 horas.

### Etapa 4 — Panel del vendedor

**Prioridad: MEDIA-BAJA. Mejora la confianza del equipo de ventas.**

13. **Endpoint `GET /api/vendedores/mi-resumen`** (sección 8.4): 2 horas.
14. **Pantalla `/mi-cuenta/comisiones`** para el vendedor (sección 7): 6-8 horas.

### Etapa 5 — Hardening y auditoría

**Prioridad: BAJA pero necesaria antes de producción real.**

15. **Agregar `comision_tipo_calculo` en `ventas_detalle`** (sección 10.3): 1 hora.
16. **Test manual end-to-end** de los tres modos con datos reales del cliente.
17. **Documentación interna** del módulo (cómo configurarlo, qué hace cada modo).

---

## Apéndice A — Estado Actual de Campos (para referencia del desarrollador)

### Campos que EXISTEN y FUNCIONAN hoy

| Campo | Tabla | Estado |
|---|---|---|
| `comision_pct` | `productos` | Funciona en modo "por producto" |
| `comision_monto` | `ventas_detalle` | Se calcula al crear la venta |
| `base_sin_iva` | `ventas_detalle` | Se calcula, pero no siempre se usa para comisión |
| `sueldo_fijo` | `vendedores_config` | Funciona |
| `comision_tipo` | `vendedores_config` | Se guarda pero no siempre se respeta en cálculos |
| `porcentaje` | `vendedores_comisiones` | Se usa en modo total_venta |

### Campos que EXISTEN pero NO FUNCIONAN hoy

| Campo | Tabla | Problema |
|---|---|---|
| `lista_precio_codigo` | `ventas_detalle` | Se crea pero se inserta NULL — modo lista imposible de calcular sin esto |
| `base_tipo` | `vendedores_comisiones` | Se guarda pero no cambia el cálculo |
| `periodo_liquidacion` | `vendedores_config` | Se guarda pero el frontend lo ignora |
| `oferta_precio_id` | `ventas_detalle` | Sin uso activo |
| `descuento_oferta` | `ventas_detalle` | Sin uso activo |
| `descuento_oferta_pct` | `ventas_detalle` | Sin uso activo |

### Campos a crear

| Campo | Tabla | Para qué |
|---|---|---|
| `comision_tipo_calculo` | `ventas_detalle` | Auditoría del modo usado al calcular |
| Tabla `comision_listas_config` | nueva | Reemplazar las 4 claves fijas de `parametros_sistema` |

---

## Apéndice B — Checklist de QA antes de Producción

Antes de ir a producción con el módulo reformulado, verificar:

- [ ] Crear un vendedor con modo "Por Lista de Precios", hacer 3 ventas con listas distintas, verificar que la liquidación muestra el desglose correcto.
- [ ] Crear un vendedor con modo "Por Producto", verificar que los productos con `comision_pct > 0` acumulan comisión y los de 0% no.
- [ ] Crear un vendedor con modo "Porcentaje Fijo", verificar que aplica sobre el total.
- [ ] Cambiar el modo de un vendedor y verificar que las ventas anteriores no se recalculan (o sí, según la decisión de diseño).
- [ ] Exportar Excel con al menos 2 vendedores y verificar que los números coinciden con la pantalla.
- [ ] Ingresar con rol vendedor y verificar que solo ve sus datos.
- [ ] Registrar un adelanto y verificar que se descuenta del saldo.
- [ ] Registrar un pago y verificar que reduce el saldo a pagar.
- [ ] Verificar la vista previa en producto cuando el modo es "lista".
- [ ] Cambiar el período de liquidación de un vendedor y verificar que la pantalla pre-selecciona el correcto.
