import { Link } from 'react-router-dom';
import type { VendorLiquidacion } from '../../lib/vendorCommissions';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  humanizeBaseType,
  humanizeMode,
} from '../../lib/vendorCommissions';

function Card({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

export function LiquidacionSummaryCards({ liquidacion }: { liquidacion: VendorLiquidacion }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <Card
        title="Ventas"
        value={formatMoney(liquidacion.resumen.ventas_total)}
        hint={`${liquidacion.resumen.ventas_count} ventas en el período`}
      />
      <Card
        title="Comisión"
        value={formatMoney(liquidacion.resumen.comision_monto)}
        hint={humanizeMode(liquidacion.resumen.modo_activo)}
      />
      <Card title="Sueldo fijo" value={formatMoney(liquidacion.resumen.sueldo_fijo)} />
      <Card
        title="Adelantos"
        value={formatMoney(liquidacion.resumen.adelantos_total)}
        hint="Se descuentan del saldo"
      />
      <Card
        title="Saldo a pagar"
        value={formatMoney(liquidacion.resumen.saldo)}
        hint="Devengado - pagos - adelantos"
      />
    </div>
  );
}

export function LiquidacionBreakdown({ liquidacion }: { liquidacion: VendorLiquidacion }) {
  const mode = liquidacion.breakdown.active_mode;

  return (
    <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Cálculo de comisión</div>
          <h3 className="text-lg font-semibold text-slate-100">{humanizeMode(mode)}</h3>
        </div>
        <div className="text-sm text-slate-400">
          {liquidacion.breakdown.mixed_modes
            ? 'Hay ventas históricas con más de un modo de cálculo.'
            : 'La liquidación usa un único modo de cálculo.'}
        </div>
      </div>

      {mode === 'por_lista' && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-700 text-left text-slate-400">
              <tr>
                <th className="py-2 pr-3">Lista</th>
                <th className="py-2 pr-3 text-right">Total vendido</th>
                <th className="py-2 pr-3 text-right">% Comisión</th>
                <th className="py-2 text-right">Comisión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {liquidacion.breakdown.por_lista.items.map((item) => (
                <tr key={item.lista_codigo}>
                  <td className="py-2 pr-3 text-slate-200">{item.lista_nombre}</td>
                  <td className="py-2 pr-3 text-right text-slate-300">{formatMoney(item.total_vendido)}</td>
                  <td className="py-2 pr-3 text-right text-slate-300">
                    {item.comision_pct != null ? `${item.comision_pct}%` : '-'}
                  </td>
                  <td className="py-2 text-right font-semibold text-emerald-300">
                    {formatMoney(item.comision_monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 text-right text-sm text-slate-300">
            Total comisión: <span className="font-semibold text-slate-100">{formatMoney(liquidacion.breakdown.por_lista.total_comision)}</span>
          </div>
        </div>
      )}

      {mode === 'por_producto' && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-700 text-left text-slate-400">
              <tr>
                <th className="py-2 pr-3">Producto</th>
                <th className="py-2 pr-3 text-right">Cant.</th>
                <th className="py-2 pr-3 text-right">Total vendido</th>
                <th className="py-2 pr-3 text-right">% Comisión</th>
                <th className="py-2 text-right">Comisión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {liquidacion.breakdown.por_producto.items.map((item) => (
                <tr key={item.producto_id}>
                  <td className="py-2 pr-3 text-slate-200">{item.producto_nombre}</td>
                  <td className="py-2 pr-3 text-right text-slate-300">{item.cantidad}</td>
                  <td className="py-2 pr-3 text-right text-slate-300">{formatMoney(item.total_vendido)}</td>
                  <td className="py-2 pr-3 text-right text-slate-300">
                    {item.comision_pct != null ? `${item.comision_pct}%` : '-'}
                  </td>
                  <td className="py-2 text-right font-semibold text-emerald-300">
                    {formatMoney(item.comision_monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 text-right text-sm text-slate-300">
            Total comisión: <span className="font-semibold text-slate-100">{formatMoney(liquidacion.breakdown.por_producto.total_comision)}</span>
          </div>
        </div>
      )}

      {mode === 'por_total_venta' && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Card title="Base de cálculo" value={formatMoney(liquidacion.breakdown.por_total_venta.total_base)} />
          <Card title="Porcentaje" value={`${liquidacion.breakdown.por_total_venta.porcentaje}%`} hint={humanizeBaseType(liquidacion.breakdown.por_total_venta.base_tipo)} />
          <Card title="Comisión" value={formatMoney(liquidacion.breakdown.por_total_venta.total_comision)} />
        </div>
      )}
    </div>
  );
}

export function LiquidacionSalesTable({
  liquidacion,
  productsLink,
}: {
  liquidacion: VendorLiquidacion;
  productsLink?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Ventas del período</div>
          <h3 className="text-lg font-semibold text-slate-100">Detalle de ventas incluidas</h3>
        </div>
        {productsLink ? (
          <Link to={productsLink} className="text-sm text-cyan-300 hover:text-cyan-200">
            Revisar productos y comisiones
          </Link>
        ) : null}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-700 text-left text-slate-400">
            <tr>
              <th className="py-2 pr-3">Fecha</th>
              <th className="py-2 pr-3">Venta</th>
              <th className="py-2 pr-3">Cliente</th>
              <th className="py-2 pr-3">Lista</th>
              <th className="py-2 pr-3 text-right">Total</th>
              <th className="py-2 text-right">Comisión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {liquidacion.ventas.map((venta) => (
              <tr key={venta.id}>
                <td className="py-2 pr-3 text-slate-300">{formatDate(venta.fecha || venta.fecha_venta || venta.fecha_entrega)}</td>
                <td className="py-2 pr-3 text-slate-200">#{venta.id}</td>
                <td className="py-2 pr-3 text-slate-300">{venta.cliente || '-'}</td>
                <td className="py-2 pr-3 text-slate-300">{venta.listas?.join(', ') || '-'}</td>
                <td className="py-2 pr-3 text-right text-slate-300">{formatMoney(venta.total)}</td>
                <td className="py-2 text-right font-semibold text-emerald-300">{formatMoney(venta.comision_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!liquidacion.ventas.length ? (
          <div className="py-6 text-center text-sm text-slate-500">No hay ventas entregadas en el rango seleccionado.</div>
        ) : null}
      </div>
    </div>
  );
}

export function PaymentsHistoryTable({ pagos }: { pagos: Array<any> }) {
  return (
    <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Historial de pagos</div>
      <h3 className="mt-1 text-lg font-semibold text-slate-100">Pagos registrados</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-700 text-left text-slate-400">
            <tr>
              <th className="py-2 pr-3">Fecha</th>
              <th className="py-2 pr-3">Período</th>
              <th className="py-2 pr-3 text-right">Liquidado</th>
              <th className="py-2 pr-3 text-right">Pagado</th>
              <th className="py-2 pr-3">Método</th>
              <th className="py-2">Notas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {pagos.map((pago) => (
              <tr key={pago.id}>
                <td className="py-2 pr-3 text-slate-300">{formatDateTime(pago.fecha_pago)}</td>
                <td className="py-2 pr-3 text-slate-300">
                  {formatDate(pago.desde)} - {formatDate(pago.hasta)}
                </td>
                <td className="py-2 pr-3 text-right text-slate-300">{formatMoney(Number(pago.monto_calculado || 0))}</td>
                <td className="py-2 pr-3 text-right font-semibold text-emerald-300">{formatMoney(Number(pago.monto_pagado || 0))}</td>
                <td className="py-2 pr-3 text-slate-300">{pago.metodo || '-'}</td>
                <td className="py-2 text-slate-400">{pago.notas || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!pagos.length ? (
          <div className="py-6 text-center text-sm text-slate-500">Todavía no hay pagos registrados.</div>
        ) : null}
      </div>
    </div>
  );
}

export function PeriodPaymentsTable({ pagos }: { pagos: Array<any> }) {
  return (
    <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Pagos del período</div>
      <div className="mt-4 space-y-3">
        {pagos.map((pago) => (
          <div key={pago.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">{formatMoney(Number(pago.monto_pagado || 0))}</div>
                <div className="text-xs text-slate-400">{formatDateTime(pago.fecha_pago)}</div>
              </div>
              <div className="text-xs text-slate-400">{pago.metodo || 'Sin método'}</div>
            </div>
            {pago.notas ? <div className="mt-2 text-sm text-slate-300">{pago.notas}</div> : null}
          </div>
        ))}
        {!pagos.length ? <div className="text-sm text-slate-500">No hay pagos cargados para este período.</div> : null}
      </div>
    </div>
  );
}

export function PeriodAdelantosTable({ adelantos }: { adelantos: Array<any> }) {
  return (
    <div className="rounded-3xl border border-slate-700/60 bg-slate-900/60 p-5">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Adelantos</div>
      <div className="mt-4 space-y-3">
        {adelantos.map((adelanto) => (
          <div key={adelanto.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">{formatMoney(Number(adelanto.monto || 0))}</div>
                <div className="text-xs text-slate-400">{formatDate(adelanto.fecha)}</div>
              </div>
              <div className="text-xs text-slate-400">{adelanto.creado_en ? formatDateTime(adelanto.creado_en) : ''}</div>
            </div>
            {adelanto.notas ? <div className="mt-2 text-sm text-slate-300">{adelanto.notas}</div> : null}
          </div>
        ))}
        {!adelantos.length ? <div className="text-sm text-slate-500">No hay adelantos en este período.</div> : null}
      </div>
    </div>
  );
}
