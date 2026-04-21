import { useState, useMemo, type FormEvent } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { Api } from '../../../lib/api';
import Button from '../../../ui/Button';
import { normalizePresupuestoTipo, buildBudgetPie } from '../utils';
import { PIE_COLORS } from '../constants';
import type {
  PresupuestoRow,
  PresupuestoVsRealRow,
  PresupuestoTotales,
  PresupuestoCategorias,
} from '../types';

interface PresupuestosTabProps {
  presupuestoCategorias: PresupuestoCategorias;
}

export default function PresupuestosTab({ presupuestoCategorias }: PresupuestosTabProps) {
  const now = new Date();
  const [presupuestoAnio, setPresupuestoAnio] = useState<number>(now.getFullYear());
  const [presupuestoMes, setPresupuestoMes] = useState<number>(now.getMonth() + 1);
  const [presupuestosMes, setPresupuestosMes] = useState<PresupuestoRow[]>([]);
  const [presupuestoVsRealRows, setPresupuestoVsRealRows] = useState<PresupuestoVsRealRow[]>([]);
  const [presupuestoTotales, setPresupuestoTotales] = useState<PresupuestoTotales>({
    presupuestoVentas: 0,
    realVentas: 0,
    presupuestoGastos: 0,
    realGastos: 0,
  });
  const [presupuestoForm, setPresupuestoForm] = useState({
    id: undefined as number | undefined,
    tipo: 'ventas' as 'ventas' | 'gastos',
    categoria: '',
    monto: '',
  });
  const [presupuestoGuardando, setPresupuestoGuardando] = useState(false);
  const [presupuestoError, setPresupuestoError] = useState<string | null>(null);
  const [presupuestoOk, setPresupuestoOk] = useState<string | null>(null);

  async function loadPresupuestos(anio: number, mes: number) {
    try {
      const [presRes, vsRealRes] = await Promise.all([
        Api.presupuestos({ anio, mes }).catch(() => []),
        Api.presupuestoVsReal({ anio, mes }).catch(() => ({ items: [], totales: {} })),
      ]);

      setPresupuestosMes(
        (presRes as any[]).map((p) => ({
          id: p.id,
          anio: Number(p.anio || anio),
          mes: Number(p.mes || mes),
          tipo: normalizePresupuestoTipo(p.tipo),
          categoria: p.categoria,
          monto: Number(p.monto || 0),
        }))
      );

      setPresupuestoVsRealRows(
        ((vsRealRes as any)?.items || []).map((r: any) => ({
          tipo: r.tipo,
          categoria: r.categoria,
          presupuesto: Number(r.presupuesto || 0),
          real: Number(r.real || 0),
          diferencia: Number(r.diferencia || 0),
        }))
      );

      const totales = (vsRealRes as any)?.totales || {};
      setPresupuestoTotales({
        presupuestoVentas: Number(totales.presupuestoVentas || 0),
        realVentas: Number(totales.realVentas || 0),
        presupuestoGastos: Number(totales.presupuestoGastos || 0),
        realGastos: Number(totales.realGastos || 0),
      });
    } catch {
      setPresupuestosMes([]);
      setPresupuestoVsRealRows([]);
      setPresupuestoTotales({
        presupuestoVentas: 0,
        realVentas: 0,
        presupuestoGastos: 0,
        realGastos: 0,
      });
    }
  }

  async function handleGuardarPresupuesto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPresupuestoError(null);
    setPresupuestoOk(null);

    const categoria = presupuestoForm.categoria.trim();
    const monto = Number(presupuestoForm.monto);

    if (!categoria) {
      setPresupuestoError('Categoria requerida');
      return;
    }
    if (!Number.isFinite(monto) || monto < 0) {
      setPresupuestoError('Monto invalido');
      return;
    }

    setPresupuestoGuardando(true);
    try {
      await Api.guardarPresupuesto({
        anio: presupuestoAnio,
        mes: presupuestoMes,
        tipo: presupuestoForm.tipo,
        categoria,
        monto,
      });
      setPresupuestoOk('Presupuesto guardado');
      setPresupuestoForm({
        id: undefined,
        tipo: presupuestoForm.tipo,
        categoria: '',
        monto: '',
      });
      await loadPresupuestos(presupuestoAnio, presupuestoMes);
    } catch (e) {
      setPresupuestoError(e instanceof Error ? e.message : 'No se pudo guardar el presupuesto');
    } finally {
      setPresupuestoGuardando(false);
    }
  }

  function handleEditarPresupuesto(row: PresupuestoRow) {
    setPresupuestoForm({
      id: row.id,
      tipo: normalizePresupuestoTipo(row.tipo),
      categoria: row.categoria,
      monto: row.monto.toString(),
    });
  }

  function handleCancelarPresupuesto() {
    setPresupuestoForm({
      id: undefined,
      tipo: 'ventas',
      categoria: '',
      monto: '',
    });
    setPresupuestoError(null);
    setPresupuestoOk(null);
  }

  async function handleEliminarPresupuesto(row: PresupuestoRow) {
    if (!row.id) return;
    if (!window.confirm('Eliminar presupuesto seleccionado?')) return;
    setPresupuestoError(null);
    setPresupuestoOk(null);
    try {
      await Api.eliminarPresupuesto(row.id);
      setPresupuestoOk('Presupuesto eliminado');
      if (presupuestoForm.id === row.id) {
        handleCancelarPresupuesto();
      }
      await loadPresupuestos(presupuestoAnio, presupuestoMes);
    } catch (e) {
      setPresupuestoError(e instanceof Error ? e.message : 'No se pudo eliminar el presupuesto');
    }
  }

  const presupuestoEditando = presupuestoForm.id != null;
  const categoriasSugeridas =
    presupuestoForm.tipo === 'ventas' ? presupuestoCategorias.ventas : presupuestoCategorias.gastos;

  const totalPresupuestoMes = useMemo(
    () => presupuestoVsRealRows.reduce((acc, r) => acc + r.presupuesto, 0),
    [presupuestoVsRealRows]
  );

  const totalRealMes = useMemo(
    () => presupuestoVsRealRows.reduce((acc, r) => acc + r.real, 0),
    [presupuestoVsRealRows]
  );

  const presupuestoVentasPie = useMemo(
    () => buildBudgetPie(presupuestoTotales.presupuestoVentas, presupuestoTotales.realVentas),
    [presupuestoTotales]
  );

  const presupuestoGastosPie = useMemo(
    () => buildBudgetPie(presupuestoTotales.presupuestoGastos, presupuestoTotales.realGastos),
    [presupuestoTotales]
  );

  const presupuestoVentasExceso = useMemo(
    () => Math.max(presupuestoTotales.realVentas - presupuestoTotales.presupuestoVentas, 0),
    [presupuestoTotales]
  );

  const presupuestoGastosExceso = useMemo(
    () => Math.max(presupuestoTotales.realGastos - presupuestoTotales.presupuestoGastos, 0),
    [presupuestoTotales]
  );

  // Load on mount and when anio/mes change
  useMemo(() => {
    loadPresupuestos(presupuestoAnio, presupuestoMes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presupuestoAnio, presupuestoMes]);

  return (
    <div className="app-card finance-card p-4 space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <div className="text-sm text-slate-300 mb-1">Presupuesto vs real por categoria</div>
          <div className="text-xs text-slate-500">
            Total presupuesto:{' '}
            <span className="font-medium text-slate-200 dark:text-slate-200">
              {totalPresupuestoMes.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            {' - '}Total real:{' '}
            <span className="font-medium text-slate-200 dark:text-slate-200">
              {totalRealMes.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Anio</label>
            <input
              type="number"
              className="input-modern text-xs md:text-sm w-24"
              value={presupuestoAnio}
              onChange={(e) => setPresupuestoAnio(Number(e.target.value) || presupuestoAnio)}
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Mes</label>
            <select
              className="input-modern text-xs md:text-sm w-28"
              value={presupuestoMes}
              onChange={(e) => setPresupuestoMes(Number(e.target.value) || presupuestoMes)}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m.toString().padStart(2, '0')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="h-72 lg:col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={presupuestoVsRealRows.map((r) => ({
                label: `${r.tipo === 'ventas' ? 'Ventas' : 'Gastos'} - ${r.categoria}`,
                presupuesto: r.presupuesto,
                real: r.real,
              }))}
              margin={{ left: 0, right: 0 }}
            >
              <XAxis dataKey="label" hide />
              <YAxis />
              <Tooltip formatter={(value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} />
              <Bar dataKey="presupuesto" stackId="a" fill="#6366f1" name="Presupuesto" />
              <Bar dataKey="real" stackId="a" fill="#f59e0b" name="Real" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="app-panel p-3 space-y-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">Ventas</div>
            <div className="h-36">
              {presupuestoVentasPie.length === 0 ? (
                <div className="text-xs text-slate-500">Sin presupuesto de ventas.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={presupuestoVentasPie} dataKey="value" nameKey="name" innerRadius={35} outerRadius={60}>
                      {presupuestoVentasPie.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="text-xs text-slate-500">
              Presupuesto: {presupuestoTotales.presupuestoVentas.toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
              - Real: {presupuestoTotales.realVentas.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            {presupuestoVentasExceso > 0 && (
              <div className="text-xs text-amber-600 mt-1">
                Exceso: {presupuestoVentasExceso.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">Gastos</div>
            <div className="h-36">
              {presupuestoGastosPie.length === 0 ? (
                <div className="text-xs text-slate-500">Sin presupuesto de gastos.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={presupuestoGastosPie} dataKey="value" nameKey="name" innerRadius={35} outerRadius={60}>
                      {presupuestoGastosPie.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="text-xs text-slate-500">
              Presupuesto: {presupuestoTotales.presupuestoGastos.toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
              - Real: {presupuestoTotales.realGastos.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            {presupuestoGastosExceso > 0 && (
              <div className="text-xs text-amber-600 mt-1">
                Exceso: {presupuestoGastosExceso.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2 px-2">Tipo</th>
                <th className="py-2 px-2">Categoria</th>
                <th className="py-2 px-2 text-right">Presupuesto</th>
                <th className="py-2 px-2 text-right">Real</th>
                <th className="py-2 px-2 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {presupuestoVsRealRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">
                    Sin datos de presupuesto para el mes seleccionado.
                  </td>
                </tr>
              )}
              {presupuestoVsRealRows.map((r, idx) => (
                <tr key={`${r.tipo}-${r.categoria}-${idx}`} className="border-t border-white/10 hover:bg-white/5">
                  <td className="py-2 px-2 capitalize">{r.tipo}</td>
                  <td className="py-2 px-2">{r.categoria}</td>
                  <td className="py-2 px-2 text-right">
                    {r.presupuesto.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {r.real.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {r.diferencia.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="app-panel p-3">
            <div className="text-sm text-slate-300 mb-2">
              {presupuestoEditando ? 'Editar presupuesto' : 'Nuevo presupuesto'}
            </div>
            <form className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end" onSubmit={handleGuardarPresupuesto}>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Tipo</label>
                <select
                  className="input-modern text-xs md:text-sm w-full"
                  value={presupuestoForm.tipo}
                  onChange={(e) =>
                    setPresupuestoForm((prev) => ({ ...prev, tipo: e.target.value as 'ventas' | 'gastos' }))
                  }
                >
                  <option value="ventas">Ventas</option>
                  <option value="gastos">Gastos</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Categoria</label>
                <input
                  className="input-modern text-xs md:text-sm w-full"
                  value={presupuestoForm.categoria}
                  list="presupuesto-categorias"
                  onChange={(e) => setPresupuestoForm((prev) => ({ ...prev, categoria: e.target.value }))}
                  placeholder="Ej: Servicios"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Monto</label>
                <input
                  type="number"
                  min="0"
                  className="input-modern text-xs md:text-sm w-full"
                  value={presupuestoForm.monto}
                  onChange={(e) => setPresupuestoForm((prev) => ({ ...prev, monto: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={presupuestoGuardando}>
                  {presupuestoEditando ? 'Actualizar' : 'Guardar'}
                </Button>
                {presupuestoEditando && (
                  <Button type="button" variant="ghost" onClick={handleCancelarPresupuesto}>
                    Cancelar
                  </Button>
                )}
              </div>
            </form>
            <datalist id="presupuesto-categorias">
              {categoriasSugeridas.map((cat) => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
            {presupuestoError && (
              <div className="text-xs text-red-600 mt-2">{presupuestoError}</div>
            )}
            {presupuestoOk && (
              <div className="text-xs text-emerald-600 mt-2">{presupuestoOk}</div>
            )}
          </div>

          <div className="app-panel p-3">
            <div className="text-sm text-slate-300 mb-2">Presupuestos del mes</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs md:text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-2 px-2">Tipo</th>
                    <th className="py-2 px-2">Categoria</th>
                    <th className="py-2 px-2 text-right">Monto</th>
                    <th className="py-2 px-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {presupuestosMes.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-500">
                        Sin presupuestos cargados.
                      </td>
                    </tr>
                  )}
                  {presupuestosMes.map((p) => (
                    <tr key={p.id ?? `${p.tipo}-${p.categoria}`} className="border-t border-white/10 hover:bg-white/5">
                      <td className="py-2 px-2 capitalize">{p.tipo}</td>
                      <td className="py-2 px-2">{p.categoria}</td>
                      <td className="py-2 px-2 text-right">
                        {p.monto.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2 px-2 text-right space-x-2">
                        <button
                          type="button"
                          className="text-indigo-600 hover:text-indigo-500 text-xs"
                          onClick={() => handleEditarPresupuesto(p)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="text-rose-600 hover:text-rose-500 text-xs"
                          onClick={() => handleEliminarPresupuesto(p)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
