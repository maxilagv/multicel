# Roadmap por Fases (Ejecucion)

## Fase 0 (Semana 1) Direccion de producto y reglas de ejecucion
1. Definir North Star: "Dueno con caja controlada y decisiones automaticas diarias".
2. Definir 8 KPIs obligatorios.
3. Crear tablero unico de roadmap y calidad con gates por release.
4. Congelar alcance MVP por fase.

Salida: PRD + roadmap + criterios Go/No-Go por fase.

## Fase 1 (Semanas 2-4) Base tecnica critica
1. Fix auth password sin alteracion de credenciales.
2. Cola cloud resiliente (stale recovery, backoff, max attempts).
3. Idempotency key por evento de sync.
4. Correccion query duplicada en ordenes.
5. Alineacion docs CRM y contrato cloud.
6. Rotacion de token cloud en API admin.
7. Seguridad operacional: gestion de secretos y rotacion de claves.

Salida: plataforma estable sin deuda critica abierta.

## Fase 2 (Semanas 5-8) Calidad y mantenibilidad enterprise
1. Partir archivos gigantes de frontend/backend por dominio.
2. Stack de calidad frontend: lint + test + strict staged.
3. Cobertura minima por modulo critico en backend.
4. Observabilidad integral con logs estructurados y metricas.

Salida: velocidad de entrega alta sin regresiones.

## Fase 3 (Semanas 9-12) Motor de ofertas + ventas automaticas
1. Tipos de ofertas: porcentaje, monto, 2x1, combo, escalonadas, por horario/canal.
2. Segmentacion por perfil de cliente y contexto comercial.
3. Reglas de apilamiento y prioridad.
4. Simulador de impacto antes de publicar.
5. Integracion en ventas/caja/catalogo cloud.
6. Dashboard de performance y antifraude basico.

Salida: motor de ofertas que incrementa ingresos y protege margen.

## Fase 4 (Semanas 13-16) Funciones que todo dueno quiere
1. Motor de cobranzas inteligente con ranking de mora por cliente.
2. Recordatorios automaticos (WhatsApp/email) y promesas de pago con seguimiento.
3. Control de margenes en tiempo real por producto/vendedor/deposito.
4. Repricing automatico por costo USD + reglas comerciales.
5. Centro de mando del dueno con caja proyectada 7/30/90 dias y alertas accionables.

Salida: valor diario para dueno y gerencia.

## Fase 5 (Semanas 17-24) Diferenciacion AR + escalado comercial
1. Capa fiscal avanzada AR (retenciones/percepciones parametrizables).
2. Listas de precios multi-regla (dolar, IPC, proveedor, canal).
3. Integraciones de canales (Mercado Libre, Tienda Nube, WhatsApp catalogo).
4. Programa beta con 10-20 pymes guiado por metricas reales.
5. Release train mensual con changelog de negocio.

Salida: diferenciacion local fuerte y escalado comercial sistematico.

## Regla de ejecucion
No se avanza de fase sin cumplir gates de calidad, negocio y operacion definidos en `docs/strategy/RELEASE_GATES.md`.
