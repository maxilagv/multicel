# Multi-Deposito / Sucursales - Redisenio Guiado por Scope

**Fecha de revision:** 2026-04-17  
**Estado:** Documento actualizado y alineado con el codigo actual  
**Objetivo:** convertir `multideposito` en una capa de operacion por sucursal con aislamiento real, gobierno de datos y una experiencia simple para usuarios no tecnicos.

---

## Resumen Ejecutivo

El proyecto ya tiene una base util:
- `depositos`
- `usuarios_depositos`
- `inventario_depositos`
- `movimientos_stock`
- `ventas.deposito_id`
- una pantalla `Multideposito.tsx`
- middleware de acceso por deposito

Pero hoy esa base no alcanza para un sistema multi-sucursal serio.

El problema no es "faltan pantallas". El problema es de **gobierno de contexto**:
- el login no define una sucursal de trabajo
- `deposito_id` en ventas sigue siendo opcional
- el backend no aplica scope automatico de forma transversal
- el rol `gerente` sigue siendo global
- el frontend obliga al usuario a entender demasiada complejidad operativa

Este documento redefine el modulo con una regla central:

> La sucursal no se elige manualmente en cada pantalla para perfiles locales.  
> La sucursal es parte del contexto del usuario y el backend debe aplicarla solo.

---

## 1. Principios de Disenio

### 1.1 Principios de negocio

1. **Una venta siempre pertenece a una sucursal.**
2. **El stock es global en catalogo, local en disponibilidad.**
3. **El frontend simplifica; el backend garantiza.**
4. **Los costos nunca se "ocultan solo en UI"; deben salir filtrados desde el backend.**
5. **El gerente de sucursal no navega el sistema como admin recortado; navega un producto distinto, mas simple y mas guiado.**
6. **La migracion debe ser segura para datos historicos y no romper ventas, compras ni ARCA.**

### 1.2 Principios de UX

La interfaz debe ser entendible por personas ajenas a la tecnologia. Eso implica:
- menos tablas infinitas
- menos filtros tecnicos
- mas estados guiados
- mas lenguaje de negocio
- menos decisiones irrelevantes

Ejemplos:
- No mostrar `deposito_id` crudo.
- No pedir elegir sucursal en cada paso a un `gerente_sucursal`.
- No mezclar en una misma vista "configuracion del deposito", "ajustes de stock", "usuarios", "finanzas", "transferencias" y "clientes" sin jerarquia.
- Priorizar tarjetas de accion: `Hoy`, `Pendientes`, `Stock critico`, `Cobros`, `Ultimas ventas`.

### 1.3 No objetivos de esta fase

Para bajar riesgo y mantener foco, esta fase **no** busca:
- separar la base de datos por sucursal
- duplicar el catalogo de productos por sucursal
- permitir multiples sucursales activas simultaneas para un mismo `gerente_sucursal`
- reescribir todo el modulo de ventas
- reemplazar ARCA o la logica de punto de venta existente

---

## 2. Diagnostico Real del Proyecto

### 2.1 Lo que ya existe de verdad

En el repo actual ya existen:
- tablas `depositos`, `usuarios_depositos`, `inventario_depositos`, `movimientos_stock`
- `ventas.deposito_id`
- servicios de stock por deposito en `backend/server/services/inventoryService.js`
- filtros de acceso por deposito en `backend/server/middlewares/depositoAccessMiddleware.js`
- `GET /api/mis-depositos`
- pantalla `frontend-react/src/pages/Multideposito.tsx`
- mapeo ARCA deposito -> punto de venta

### 2.2 Lo que esta incompleto o es riesgoso

1. `ventas.deposito_id` sigue siendo nullable.
2. El backend usa deposito por defecto cuando no se informa uno.
3. El JWT solo incluye `sub`, `email` y `role`; no incluye `deposito_id`.
4. El permiso por deposito hoy depende de `usuarios_depositos`, pero si un usuario no tiene restricciones cargadas puede operar sobre todos.
5. El rol `gerente` sigue viendo rutas globales como compras, proveedores, finanzas e informes.
6. La UI actual de `Multideposito` es operativa, no estrategica: sirve para mover stock, no para gobernar sucursales.

### 2.3 Problema central

Hoy el sistema tiene "datos por deposito", pero no tiene "producto por sucursal".

Eso genera tres fallas:
- seguridad incompleta
- experiencia confusa
- imposibilidad de crecer hacia dashboards, metricas y gobierno real

---

## 3. Modelo Objetivo

### 3.1 Definicion conceptual

En esta fase, una **sucursal** se modela sobre `depositos`, pero con un significado mas amplio:
- inventario local
- ventas locales
- clientes vinculados
- caja y operacion local
- gerente titular
- identidad visual y datos propios

No es solo un lugar fisico de stock. Es una unidad operativa.

### 3.2 Tipos de usuario

| Rol | Alcance | Puede ver costos | Puede ver otras sucursales | Puede crear usuarios |
|---|---|---|---|---|
| `admin` | Global total | Si | Si | Si |
| `gerente` | Global operativo | Si | Si | Si, segun politica |
| `gerente_sucursal` | Una sola sucursal | No | No | Si, solo su sucursal |
| `vendedor` | Una o varias sucursales asignadas | No | No | No |
| `fletero` | Ventas/remitos permitidos | No | No | No |

### 3.3 Regla madre

Para perfiles locales, la sucursal debe resolverse asi:

1. `gerente_sucursal`: por `deposito_id` en JWT.
2. `vendedor`: por depositos permitidos en `usuarios_depositos`.
3. `admin` y `gerente`: sin scope forzado; pueden filtrar.

---

## 4. Invariantes de Dominio

Estas reglas son obligatorias. Si alguna no se cumple, el sistema vuelve a ser ambiguo.

### 4.1 Ventas

- Toda venta nueva debe tener `deposito_id`.
- Toda reserva debe tener `deposito_id`.
- Toda entrega debe descontar stock del mismo `deposito_id` de la venta.
- El backend no debe usar deposito por defecto en ventas interactivas una vez terminada la migracion.

### 4.2 Compras y recepciones

- Toda recepcion de mercaderia debe registrar `deposito_id`.
- El proveedor es global; el stock recibido es local al deposito.

### 4.3 Stock

- El catalogo de productos es global.
- La disponibilidad es por `inventario_depositos`.
- La vista agregada `inventario` sirve para vistas globales, no para pantallas scoped de sucursal.

### 4.4 Clientes

- Un cliente puede comprar en varias sucursales.
- El sistema debe guardar relacion cliente <-> sucursal sin convertirla en "propiedad exclusiva" salvo que negocio lo defina mas adelante.

### 4.5 Costos y metricas sensibles

- `gerente_sucursal`, `vendedor` y `fletero` no deben recibir costos unitarios ni margen real.
- Si se muestra performance local, debe ser con metricas comerciales no sensibles:
  - facturacion
  - tickets
  - ventas
  - cobranzas
  - clientes activos
  - stock critico

**Mejora respecto del informe anterior:** el margen real queda para `admin` y `gerente` global. No tiene sentido ocultar costos y a la vez mostrar margen exacto.

### 4.6 Caja tipo y sucursal no son lo mismo

`caja_tipo` y `deposito_id` hoy coexisten en el proyecto. Deben tratarse como dimensiones distintas:
- `caja_tipo`: naturaleza de caja
- `deposito_id`: sucursal operativa

Nunca reemplazar una por la otra.

---

## 5. Modelo de Datos Propuesto

### 5.1 Extension de `depositos`

Agregar:
- `manager_usuario_id`
- `telefono`
- `email`
- `logo_url`
- `configuracion`

`configuracion` puede incluir:

```json
{
  "ocultar_costos": true,
  "moneda_default": "ARS",
  "color_primario": "#1f2937",
  "stock_alert_threshold": 5
}
```

### 5.2 Tabla `depositos_metricas_diarias`

Se mantiene la idea, pero con esta aclaracion:
- debe servir para dashboard global admin
- no debe ser la unica fuente de verdad
- debe recalcularse de forma idempotente

Campos recomendados:
- `deposito_id`
- `fecha`
- `ventas_count`
- `facturacion_total`
- `clientes_unicos`
- `clientes_nuevos`
- `productos_vendidos`
- `productos_stock_critico`
- `cobranzas_total`
- `calculado_en`

**Nota:** `margen_total` solo si existe una formula consistente y segura. No conviene prometerlo antes de cerrar bien costos y descuentos.

### 5.3 Tabla `depositos_clientes`

Se aprueba como relacion derivada:

```sql
CREATE TABLE depositos_clientes (
  deposito_id   BIGINT UNSIGNED NOT NULL,
  cliente_id    BIGINT UNSIGNED NOT NULL,
  es_principal  TINYINT(1) NOT NULL DEFAULT 0,
  primera_compra_en DATETIME NULL,
  ultima_compra_en  DATETIME NULL,
  creado_en     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (deposito_id, cliente_id)
);
```

Esto es mejor que solo guardar `es_principal`, porque permite auditar relacion historica y usar la tabla para dashboards.

### 5.4 `ventas.deposito_id` obligatorio

Decision:
- obligatorio para toda venta nueva
- historico migrado antes de imponer `NOT NULL`

Plan seguro:
1. detectar ventas con `deposito_id IS NULL`
2. asignar deposito historico segun evidencia
3. si no hay evidencia, usar deposito principal y marcar la venta como `deposito_inferido = 1` en migracion o tabla auxiliar
4. recien despues imponer `NOT NULL`

**Mejora:** no hacer un `UPDATE ventas SET deposito_id = 1` ciego sin trazabilidad.

### 5.5 Compatibilidad MySQL y SQLite

Este repo tiene ambos motores en migraciones.

La feature no esta lista hasta tener:
- `backend/database/migrations_mysql/...`
- `backend/database/migrations_sqlite/...`
- seeds actualizados

---

## 6. Scope de Autenticacion y Autorizacion

### 6.1 JWT

Para `gerente_sucursal`, el access token debe incluir:

```json
{
  "sub": 42,
  "email": "gerente@norte.com",
  "role": "gerente_sucursal",
  "deposito_id": 3
}
```

Para `admin` y `gerente` global no hace falta forzar `deposito_id`.

### 6.2 Regla de emision

`authcontroller.js` debe:
- cargar usuario
- detectar si su rol es `gerente_sucursal`
- resolver su deposito titular
- emitir JWT con `deposito_id`

### 6.3 Middleware nuevo: `depositoScopeMiddleware.js`

Debe crear un objeto consistente:

```js
req.depositoScope = {
  forced: true,
  depositoId: 3,
  source: 'jwt',
  role: 'gerente_sucursal'
};
```

O bien:

```js
req.depositoScope = {
  forced: false,
  allowedIds: [1, 2, 5],
  source: 'usuarios_depositos',
  role: 'vendedor'
};
```

### 6.4 Precedencia

1. Si `gerente_sucursal`, siempre manda el JWT.
2. Si `vendedor`, solo puede operar en depositos asignados.
3. Si `admin` o `gerente`, el filtro es opcional y explicito.

### 6.5 Regla clave de seguridad

Los controladores no deben repetir logica de roles ad hoc.  
Deben pedir:
- `req.depositoScope`
- `req.authUser`

y usar helpers comunes.

---

## 7. Backend Propuesto

### 7.1 Archivos a crear

| Archivo | Descripcion |
|---|---|
| `backend/server/middlewares/depositoScopeMiddleware.js` | Resuelve scope local/global |
| `backend/server/services/depositoMetricasService.js` | Recalculo y persistencia de metricas |
| `backend/server/services/financialVisibilityService.js` | Politica central para campos sensibles |

### 7.2 Archivos a modificar

| Archivo | Cambio |
|---|---|
| `controllers/authcontroller.js` | emitir `deposito_id` en JWT para `gerente_sucursal` |
| `middlewares/authmiddleware.js` | aceptar nuevo claim sin romper sesiones actuales |
| `middlewares/roleMiddleware.js` | soportar `gerente_sucursal` |
| `controllers/depositocontroller.js` | resumen global, detalle sucursal, clientes, finanzas |
| `repositories/depositoRepository.js` | consultas agregadas y de detalle |
| `repositories/salesRepository.js` | scope automatico por sucursal |
| `repositories/clientRepository.js` | filtro por sucursal |
| `repositories/productRepository.js` | ocultar costos por politica |
| `controllers/reportcontroller.js` | aplicar scope comun |
| `controllers/usercontroller.js` | crear/listar usuarios segun alcance |
| `controllers/inventorycontroller.js` | respetar scope automatico |
| `controllers/purchasecontroller.js` | respetar scope local/global |

### 7.3 Regla por modulo

#### Ventas
- `admin` y `gerente`: pueden consultar global o filtrado.
- `gerente_sucursal`: solo su sucursal, sin depender de query params.
- `vendedor`: solo depositos permitidos.

#### Clientes
- listar clientes vinculados a la sucursal cuando hay scope forzado
- permitir vista global solo a perfiles globales

#### Productos
- catalogo global
- stock scoped
- costos filtrados segun rol

#### Informes
- todo informe financiero debe recibir el mismo helper de scope
- no debe haber endpoints "olvidados" con filtro manual opcional

### 7.4 Costos y campos sensibles

Implementar un helper tipo:

```js
function productFieldsForRole(role) {
  if (role === 'admin' || role === 'gerente') {
    return ['precio_costo', 'precio_costo_pesos', 'margen_estimado'];
  }
  return [];
}
```

La idea no es solo esconder columnas en React. La idea es que la consulta SQL ya no las entregue.

### 7.5 Metricas diarias

La version anterior proponia `node-cron` embebido. Eso es comodo, pero no siempre es lo mas seguro si hay varias instancias del server.

Camino recomendado:
1. crear servicio idempotente `recalcularMetricasDeposito(fecha, depositoId?)`
2. exponer script o comando interno
3. ejecutarlo por scheduler externo o tarea de infraestructura

Solo si la infraestructura es una sola instancia y controlada, puede evaluarse `node-cron`.

### 7.6 Endpoints objetivo

#### Admin / global
- `GET /api/depositos/resumen-global`
- `GET /api/depositos/:id/dashboard`
- `GET /api/depositos/:id/clientes`
- `GET /api/depositos/:id/ventas`
- `GET /api/depositos/:id/finanzas`

#### Gerente de sucursal
- `GET /api/mi-sucursal/dashboard`
- `GET /api/mi-sucursal/clientes`
- `GET /api/mi-sucursal/ventas`
- `GET /api/mi-sucursal/inventario`
- `GET /api/mi-sucursal/usuarios`

**Mejora:** crear endpoints semanticos de `mi-sucursal` simplifica el frontend y evita que el usuario tenga que pasar ids.

---

## 8. Frontend y Experiencia de Usuario

### 8.1 Problema de la UI actual

`Multideposito.tsx` hoy mezcla:
- lista de depositos
- inventario
- ajustes
- reservas
- transferencias
- usuarios
- configuracion

Todo en una pantalla operativa larga.

Eso sirve para administracion tecnica. No sirve como producto claro.

### 8.2 Nuevo modelo de experiencia

#### Vista `admin`

`/app/multideposito`

Debe ser un centro de control global con:
- tarjetas por sucursal
- KPIs principales
- alertas de stock
- clientes activos
- ventas del periodo
- estado operativo

Al entrar a una sucursal:
- abrir panel lateral o vista detalle
- tabs claras:
  - Resumen
  - Ventas
  - Clientes
  - Inventario
  - Usuarios
  - Configuracion

#### Vista `gerente_sucursal`

No debe entrar a `Multideposito`.

Debe entrar a:
- `/app/mi-sucursal`

con una pantalla propia y mucho mas simple:
- `Hoy`
- `Pendientes`
- `Stock critico`
- `Ultimas ventas`
- `Clientes a seguir`
- accesos rapidos

### 8.3 Regla de simplicidad

Para `gerente_sucursal`, el frontend debe esconder complejidad:
- no selector de deposito
- no conceptos globales
- no costos
- no proveedores
- no configuracion global
- no informes corporativos

### 8.4 Inventario

La tabla actual no debe cargar todo de golpe.

Aplicar una combinacion de:
- paginacion por cursor o pagina
- virtualizacion con `VirtualizedTable`
- chips de filtro simples
- acciones contextuales

El operador no necesita una grilla infinita. Necesita:
- buscar producto
- ver disponible
- ver reservado
- ver alerta
- ajustar o transferir

### 8.5 Lenguaje de interfaz

Copys sugeridos:
- `Stock critico`
- `Por recibir`
- `Ultimas ventas`
- `Clientes sin seguimiento`
- `Transferir mercaderia`
- `Equipo de la sucursal`

Evitar:
- `scope`
- `claim`
- `payload`
- `manager`
- `entity`
- `source`

### 8.6 Navegacion por rol

#### `admin`
Mantiene acceso global.

#### `gerente`
Puede seguir teniendo acceso global operativo.

#### `gerente_sucursal`
Mostrar:
- Dashboard
- Caja
- Ventas
- Clientes
- Productos
- Stock
- Mi Sucursal
- Usuarios de su sucursal

Ocultar:
- Compras globales
- Proveedores
- Finanzas globales
- Informes globales
- Multideposito global
- Configuracion global

### 8.7 Vista de productos

Para perfiles locales:
- ver precio de venta
- ver stock de su sucursal
- no ver costo
- si tiene un solo deposito, auto-resolver stock local

---

## 9. SQL y Migraciones

### 9.1 Archivo principal

**Archivo recomendado:** `V29__multideposito_sucursales.sql`

Debe incluir:
1. columnas nuevas en `depositos`
2. alta del rol `gerente_sucursal`
3. tabla `depositos_metricas_diarias`
4. tabla `depositos_clientes`
5. indices de soporte

### 9.2 Seeds

Actualizar seeds base:

```sql
INSERT INTO roles (nombre)
VALUES ('admin'), ('vendedor'), ('gerente'), ('gerente_sucursal'), ('fletero');
```

### 9.3 Migracion segura de ventas

No imponer `NOT NULL` hasta:
- completar backfill
- revisar outliers
- correr reporte de consistencia

### 9.4 Reportes de control previos a bloqueo

Antes de cambiar `ventas.deposito_id` a obligatorio, ejecutar:
- ventas con `deposito_id IS NULL`
- ventas por fecha con sucursal dudosa
- ventas de usuarios sin deposito asignado

---

## 10. Estrategia de Implementacion

### Etapa 0 - Fundacion de reglas

- cerrar este documento
- alinear con doc 05 de roles y accesos
- definir si `gerente` global queda vigente
- definir politica exacta para vendedores multi-sucursal

### Etapa 1 - Scope y seguridad

- agregar `gerente_sucursal`
- emitir JWT con `deposito_id`
- crear `depositoScopeMiddleware`
- aplicar scope comun en ventas, clientes, productos, inventario e informes

### Etapa 2 - Datos y migracion

- migrar columnas nuevas de `depositos`
- crear `depositos_clientes`
- backfill historico
- sanear `ventas.deposito_id`
- luego imponer obligatoriedad

### Etapa 3 - Frontend orientado a roles

- redisenar `Multideposito.tsx` como dashboard admin
- crear `MiSucursal.tsx`
- ajustar `AppRouter.tsx`
- ajustar `navigationConfig.ts`

### Etapa 4 - Operacion y metricas

- construir metricas diarias
- detalle por sucursal
- alertas de stock y actividad

### Etapa 5 - Endurecimiento

- tests de autorizacion
- tests de ocultamiento de costos
- pruebas de rutas olvidadas
- validacion con usuarios reales no tecnicos

---

## 11. Casos de Uso Esperados

### 11.1 Admin

- entra a `Multideposito`
- ve resumen de todas las sucursales
- detecta cual esta floja en ventas o stock
- entra al detalle de una sucursal
- revisa equipo, clientes y alertas

### 11.2 Gerente de sucursal

- hace login
- entra directo a `Mi Sucursal`
- ve su sucursal sin elegir nada
- revisa ventas del dia, stock critico y pendientes
- crea o gestiona vendedores de su equipo

### 11.3 Vendedor

- entra a ventas
- si tiene un solo deposito, queda resuelto automaticamente
- si tiene varios permitidos, el sistema propone uno por defecto y solo muestra los que puede usar

---

## 12. Criterios de Aceptacion

1. Login como `gerente_sucursal` genera JWT con `deposito_id`.
2. `GET /api/ventas` como `gerente_sucursal` devuelve solo ventas de su sucursal aunque no mande filtro.
3. `GET /api/clientes` como `gerente_sucursal` devuelve solo clientes vinculados a su sucursal.
4. `GET /api/productos` como `gerente_sucursal` no devuelve costos.
5. `GET /api/depositos/resumen-global` como `gerente_sucursal` devuelve `403`.
6. `POST /api/ventas` sin `deposito_id` falla para flujos donde ya se haya activado la obligatoriedad.
7. `Multideposito` deja de ser una pantalla lineal y pasa a ser un panel global admin.
8. Existe `MiSucursal` como producto diferenciado para `gerente_sucursal`.
9. Un usuario no tecnico puede completar tareas frecuentes sin entender ids, scopes ni filtros internos.

---

## 13. Riesgos y Mitigaciones

### Riesgo 1: romper historicos

**Mitigacion:** backfill con trazabilidad antes de `NOT NULL`.

### Riesgo 2: esconder datos solo en frontend

**Mitigacion:** politica de campos sensibles en repositorios y controladores.

### Riesgo 3: duplicar logica de scope

**Mitigacion:** middleware y helpers comunes.

### Riesgo 4: UX excesivamente tecnica

**Mitigacion:** vistas separadas por rol, endpoints semanticos `mi-sucursal`, lenguaje de negocio.

### Riesgo 5: cron embebido inseguro en despliegues multiples

**Mitigacion:** servicio idempotente + scheduler externo.

---

## 14. Decision Final

Se aprueba avanzar con este enfoque con las siguientes definiciones:

- `depositos` pasa a representar sucursal operativa
- `gerente_sucursal` es un rol nuevo y obligatorio para aislamiento real
- el scope de sucursal se resuelve en backend, no en la cabeza del usuario
- el frontend de perfiles locales se simplifica radicalmente
- `Multideposito` deja de ser un formulario tecnico y pasa a ser un centro de control
- `MiSucursal` nace como pantalla nueva y propia

Este camino es mas exigente que agregar tabs y filtros, pero es el correcto si el objetivo es construir un ecosistema de datos robusto, comprensible y escalable.
