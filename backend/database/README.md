Database (SQLite)

- Engine: SQLite (via `backend/server/db/pg.js` wrapper).
- Files:
  - `backend/database/migrations_sqlite/V1__init.sql`: full DDL (tables, constraints, indexes, views).
  - `backend/database/seed.sql`: minimal seed (roles, default deposito, deuda threshold).

How to apply

- Optional: set the database path with `SQLITE_PATH=backend/database/app.sqlite`.
- Run migrations: `cd backend/server && npm run migrate`
- Seed (optional): run `backend/database/seed.sql` with your SQLite client.

Whats included

- Normalized tables for usuarios/roles/logs, clientes, proveedores, categorias,
  productos + imagenes, inventario, movimientos de stock (and ajustes), compras
  (+ detalle + recepciones), ventas (+ detalle), pagos, facturas, gastos,
  inversiones and configuracion, plus CRM, postventa, and approvals.
- Indexes on frequent lookups and FKs; case-insensitive unique email for usuarios.
- Views:
  - `vista_deudas`: deuda por cliente = ventas.neto - pagos + ajustes.
  - `vista_stock_bajo`: productos con stock por debajo del minimo.
  - `vista_top_clientes`: ranking de clientes por monto comprado.
  - `vista_ganancias_mensuales`: ventas.neto por mes menos gastos por mes.
- No trigger functions required; timestamps are handled at the application level.

Next steps / notes

- Create an admin user from the API or a manual INSERT with a secure password_hash.
- Consider adding application-level transactions to keep inventario in sync with
  movimientos_stock and sales/purchase flows.
