# Gates de Release (Go / No-Go)

## Gate A - Calidad tecnica
1. Sin secretos hardcodeados.
2. Tests criticos verdes.
3. Sin bugs P0/P1 abiertos del alcance de fase.
4. Migraciones aplicables en entorno limpio.

## Gate B - Confiabilidad operativa
1. Logs estructurados con `request_id`.
2. Monitoreo de errores por endpoint.
3. Monitoreo de cola cloud (pending/error/processing).
4. Politica de rollback definida.

## Gate C - Valor de negocio
1. KPI principal de fase con tendencia positiva.
2. Sin regresion en cobranzas/margen/quiebres respecto al baseline.
3. Feedback de usuarios clave documentado.

## Gate D - Documentacion y handover
1. Contratos API actualizados.
2. Manual operativo actualizado.
3. Changelog de release publicado.

## Politica Go/No-Go
- Go: todos los gates en verde.
- Go condicional: 1 amber permitido con owner y fecha de cierre.
- No-Go: cualquier rojo en A o B.
