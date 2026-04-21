# Marketplace de Confianza Local (Especificacion)

Objetivo
- Permitir alianzas entre pymes cercanas para vender en conjunto, con referidos trazables, comisiones automaticas y descuentos al cliente final.
- Funciona en modo local. La sincronizacion offline se define, pero no esta implementada en esta fase.

Roles
- admin/gerente: gestiona pymes, alianzas, ofertas y referidos.
- vendedor: puede validar y aplicar referidos en ventas.

Entidades clave
- pymes_aliadas: negocio aliado (nombre, contacto, rubro, activo).
- alianzas: acuerdo con una pyme (comision, beneficio, vigencias, limites de uso).
- alianzas_ofertas: paquetes/combos asociados a una alianza (opcional).
- referidos: codigo unico que aplica una alianza (vigencia y uso limitado).
- uso_referidos: registro de cada uso del codigo en una venta.

Flujo base
1) Alta de pyme aliada.
2) Crear alianza con reglas de comision y beneficio.
3) Emitir referidos (codigos). Opcional: crear ofertas/paquetes.
4) En una venta, se ingresa un codigo. Se valida estado, vigencia y uso.
5) El sistema calcula descuento al cliente y comision para la pyme aliada.
6) Se registra el uso en la venta y se actualizan los contadores.

Reglas de beneficio y comision
- beneficio_tipo: porcentaje o monto fijo.
- beneficio_valor: el valor del descuento. Se aplica sobre el total.
- comision_tipo: porcentaje o monto fijo.
- comision_valor: se calcula sobre el total menos descuento aplicado.

Validaciones clave al aplicar un referido
- Referido activo.
- Alianza activa y no vencida.
- Pyme aliada activa.
- Vigencia del referido y de la alianza (desde/hasta).
- Limites de uso (max_usos en referido y limite_usos en alianza).

Integracion con ventas
- API acepta `referido_codigo` opcional.
- Si es valido, se aplica descuento y se registra comision.

Formato de sincronizacion offline
- Export JSON con: pymes, alianzas, ofertas, referidos activos, metadata (origin_pyme_id, timestamp).
- Import JSON: merge idempotente por external_id + registro en sync_log.

Sync offline (implementado)
- Export: `GET /api/marketplace/sync/export` devuelve JSON con `instance_id` y `data`.
- Import: `POST /api/marketplace/sync/import` consume el JSON exportado.
