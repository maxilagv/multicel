BEGIN;

ALTER TABLE arca_config ADD COLUMN precios_incluyen_iva INTEGER NOT NULL DEFAULT 1;

ALTER TABLE facturas ADD COLUMN concepto INTEGER;
ALTER TABLE facturas ADD COLUMN doc_tipo INTEGER;
ALTER TABLE facturas ADD COLUMN doc_nro TEXT;
ALTER TABLE facturas ADD COLUMN imp_neto REAL;
ALTER TABLE facturas ADD COLUMN imp_iva REAL;
ALTER TABLE facturas ADD COLUMN imp_op_ex REAL;
ALTER TABLE facturas ADD COLUMN imp_trib REAL;
ALTER TABLE facturas ADD COLUMN imp_tot_conc REAL;
ALTER TABLE facturas ADD COLUMN mon_id TEXT;
ALTER TABLE facturas ADD COLUMN mon_cotiz REAL;
ALTER TABLE facturas ADD COLUMN fecha_serv_desde TEXT;
ALTER TABLE facturas ADD COLUMN fecha_serv_hasta TEXT;
ALTER TABLE facturas ADD COLUMN fecha_vto_pago TEXT;
ALTER TABLE facturas ADD COLUMN snapshot_json TEXT;

COMMIT;