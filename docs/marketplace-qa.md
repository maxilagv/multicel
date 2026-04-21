# Marketplace QA

Checklist rapido
- Migraciones: ejecutar `npm run migrate` y confirmar tablas nuevas.
- UI Marketplace: abrir `/app/marketplace`, listar pymes/alianzas/referidos.
- Crear pyme: alta exitosa, toggle activo/inactivo.
- Crear alianza: valida pyme, comision/beneficio, estado.
- Crear referido: valida alianza, codigo opcional, max_usos.
- Ventas: validar referido, crear venta con `referido_codigo`, verificar descuento y comision en DB.
- Ofertas: crear, activar/desactivar, listado por alianza.
- Reportes: cargar reportes y revisar totales.
- Sync export/import: exportar JSON, importar el mismo, validar conteo y warnings.
- Productos: crear con codigo, buscar por codigo, bloquear duplicados.

Casos borde
- Referido vencido (vigencia_hasta pasada).
- Referido agotado (max_usos alcanzado).
- Alianza pausada o pyme inactiva.
- Codigo de referido duplicado en import.
- Import sin external_id (debe advertir y omitir).
