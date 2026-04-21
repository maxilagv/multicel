import { useState, type FormEvent } from 'react';
import { Api } from '../../../lib/api';
import Button from '../../../ui/Button';
import type { FiscalRuleRow, FiscalSimulationResult } from '../types';

export default function FiscalTab() {
  const [fiscalRules, setFiscalRules] = useState<FiscalRuleRow[]>([]);
  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [fiscalError, setFiscalError] = useState<string | null>(null);
  const [fiscalSuccess, setFiscalSuccess] = useState<string | null>(null);
  const [fiscalSaving, setFiscalSaving] = useState(false);
  const [fiscalForm, setFiscalForm] = useState({
    tipo: 'retencion' as 'retencion' | 'percepcion',
    nombre: '',
    impuesto: 'iibb',
    jurisdiccion: 'nacional',
    scope: 'global' as 'global' | 'cliente' | 'proveedor' | 'producto',
    scope_ref_id: '',
    alicuota: '3',
    monto_minimo: '0',
    vigencia_desde: '',
    vigencia_hasta: '',
    prioridad: '100',
    activo: true,
  });
  const [fiscalSimForm, setFiscalSimForm] = useState({
    monto: '',
    fecha: '',
    cliente_id: '',
    proveedor_id: '',
    producto_id: '',
  });
  const [fiscalSimLoading, setFiscalSimLoading] = useState(false);
  const [fiscalSimError, setFiscalSimError] = useState<string | null>(null);
  const [fiscalSimResult, setFiscalSimResult] = useState<FiscalSimulationResult | null>(null);

  async function loadFiscalRules(showError = false) {
    setFiscalLoading(true);
    if (!showError) setFiscalError(null);
    try {
      const rows = await Api.ownerFiscalRules();
      const safeRows = Array.isArray(rows)
        ? rows.map((r: any) => ({
            id: Number(r.id || 0),
            tipo: String(r.tipo || 'retencion') as FiscalRuleRow['tipo'],
            nombre: String(r.nombre || ''),
            impuesto: r.impuesto ? String(r.impuesto) : '',
            jurisdiccion: r.jurisdiccion ? String(r.jurisdiccion) : '',
            scope: String(r.scope || 'global') as FiscalRuleRow['scope'],
            scope_ref_id: r.scope_ref_id == null ? null : Number(r.scope_ref_id),
            alicuota: Number(r.alicuota || 0),
            monto_minimo: Number(r.monto_minimo || 0),
            vigencia_desde: r.vigencia_desde ? String(r.vigencia_desde).slice(0, 10) : '',
            vigencia_hasta: r.vigencia_hasta ? String(r.vigencia_hasta).slice(0, 10) : '',
            activo: Number(r.activo || 0),
            prioridad: Number(r.prioridad || 100),
          }))
        : [];
      setFiscalRules(safeRows);
    } catch (e) {
      if (showError) {
        setFiscalError(e instanceof Error ? e.message : 'No se pudieron cargar reglas fiscales');
      }
      setFiscalRules([]);
    } finally {
      setFiscalLoading(false);
    }
  }

  async function handleCreateFiscalRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFiscalError(null);
    setFiscalSuccess(null);
    if (fiscalForm.nombre.trim().length < 3) {
      setFiscalError('Nombre de regla fiscal invalido');
      return;
    }
    const alicuota = Number(fiscalForm.alicuota);
    if (!Number.isFinite(alicuota) || alicuota < 0) {
      setFiscalError('Alicuota invalida');
      return;
    }
    setFiscalSaving(true);
    try {
      await Api.ownerCreateFiscalRule({
        tipo: fiscalForm.tipo,
        nombre: fiscalForm.nombre.trim(),
        impuesto: fiscalForm.impuesto.trim() || undefined,
        jurisdiccion: fiscalForm.jurisdiccion.trim() || undefined,
        scope: fiscalForm.scope,
        scope_ref_id: fiscalForm.scope_ref_id ? Number(fiscalForm.scope_ref_id) : null,
        alicuota,
        monto_minimo: Number(fiscalForm.monto_minimo || 0),
        vigencia_desde: fiscalForm.vigencia_desde || null,
        vigencia_hasta: fiscalForm.vigencia_hasta || null,
        prioridad: Number(fiscalForm.prioridad || 100),
        activo: fiscalForm.activo,
      });
      setFiscalForm((prev) => ({ ...prev, nombre: '', scope_ref_id: '' }));
      setFiscalSuccess('Regla fiscal creada');
      await loadFiscalRules(false);
    } catch (e) {
      setFiscalError(e instanceof Error ? e.message : 'No se pudo crear la regla fiscal');
    } finally {
      setFiscalSaving(false);
    }
  }

  async function handleToggleFiscalRule(rule: FiscalRuleRow) {
    setFiscalError(null);
    setFiscalSuccess(null);
    try {
      await Api.ownerUpdateFiscalRule(rule.id, { activo: Number(rule.activo || 0) !== 1 });
      setFiscalSuccess('Regla fiscal actualizada');
      await loadFiscalRules(false);
    } catch (e) {
      setFiscalError(e instanceof Error ? e.message : 'No se pudo actualizar la regla fiscal');
    }
  }

  async function handleFiscalSimulation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFiscalSimError(null);
    setFiscalSimResult(null);
    const monto = Number(fiscalSimForm.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      setFiscalSimError('Monto invalido para simular');
      return;
    }
    setFiscalSimLoading(true);
    try {
      const out = await Api.ownerSimulateFiscal({
        monto,
        fecha: fiscalSimForm.fecha || undefined,
        cliente_id: fiscalSimForm.cliente_id ? Number(fiscalSimForm.cliente_id) : undefined,
        proveedor_id: fiscalSimForm.proveedor_id ? Number(fiscalSimForm.proveedor_id) : undefined,
        producto_id: fiscalSimForm.producto_id ? Number(fiscalSimForm.producto_id) : undefined,
      });
      setFiscalSimResult({
        monto_base: Number(out?.monto_base || 0),
        total_fiscal: Number(out?.total_fiscal || 0),
        detalle: Array.isArray(out?.detalle)
          ? out.detalle.map((d: any) => ({
              rule_id: Number(d.rule_id || 0),
              nombre: String(d.nombre || ''),
              tipo: String(d.tipo || ''),
              alicuota: Number(d.alicuota || 0),
              monto: Number(d.monto || 0),
            }))
          : [],
      });
    } catch (e) {
      setFiscalSimError(e instanceof Error ? e.message : 'No se pudo simular fiscal AR');
    } finally {
      setFiscalSimLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="app-card finance-card p-4">
          <div className="text-sm text-slate-300 mb-2">Nueva regla fiscal AR</div>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-2" onSubmit={handleCreateFiscalRule}>
            <select
              className="input-modern text-xs"
              value={fiscalForm.tipo}
              onChange={(e) =>
                setFiscalForm((prev) => ({
                  ...prev,
                  tipo: e.target.value as 'retencion' | 'percepcion',
                }))
              }
            >
              <option value="retencion">Retencion</option>
              <option value="percepcion">Percepcion</option>
            </select>
            <input
              className="input-modern text-xs"
              placeholder="Nombre"
              value={fiscalForm.nombre}
              onChange={(e) => setFiscalForm((prev) => ({ ...prev, nombre: e.target.value }))}
            />
            <input
              className="input-modern text-xs"
              placeholder="Impuesto"
              value={fiscalForm.impuesto}
              onChange={(e) => setFiscalForm((prev) => ({ ...prev, impuesto: e.target.value }))}
            />
            <input
              className="input-modern text-xs"
              placeholder="Jurisdiccion"
              value={fiscalForm.jurisdiccion}
              onChange={(e) => setFiscalForm((prev) => ({ ...prev, jurisdiccion: e.target.value }))}
            />
            <select
              className="input-modern text-xs"
              value={fiscalForm.scope}
              onChange={(e) =>
                setFiscalForm((prev) => ({
                  ...prev,
                  scope: e.target.value as 'global' | 'cliente' | 'proveedor' | 'producto',
                }))
              }
            >
              <option value="global">Global</option>
              <option value="cliente">Cliente</option>
              <option value="proveedor">Proveedor</option>
              <option value="producto">Producto</option>
            </select>
            <input
              className="input-modern text-xs"
              placeholder="Scope ref id"
              value={fiscalForm.scope_ref_id}
              onChange={(e) => setFiscalForm((prev) => ({ ...prev, scope_ref_id: e.target.value }))}
            />
            <input
              className="input-modern text-xs"
              placeholder="Alicuota (%)"
              value={fiscalForm.alicuota}
              onChange={(e) => setFiscalForm((prev) => ({ ...prev, alicuota: e.target.value }))}
            />
            <input
              className="input-modern text-xs"
              placeholder="Monto minimo"
              value={fiscalForm.monto_minimo}
              onChange={(e) => setFiscalForm((prev) => ({ ...prev, monto_minimo: e.target.value }))}
            />
            <input
              type="date"
              className="input-modern text-xs"
              value={fiscalForm.vigencia_desde}
              onChange={(e) => setFiscalForm((prev) => ({ ...prev, vigencia_desde: e.target.value }))}
            />
            <input
              type="date"
              className="input-modern text-xs"
              value={fiscalForm.vigencia_hasta}
              onChange={(e) => setFiscalForm((prev) => ({ ...prev, vigencia_hasta: e.target.value }))}
            />
            <input
              className="input-modern text-xs"
              placeholder="Prioridad"
              value={fiscalForm.prioridad}
              onChange={(e) => setFiscalForm((prev) => ({ ...prev, prioridad: e.target.value }))}
            />
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={fiscalForm.activo}
                onChange={(e) => setFiscalForm((prev) => ({ ...prev, activo: e.target.checked }))}
              />
              Activo
            </label>
            <div className="flex items-center gap-2 md:col-span-2">
              <Button type="submit" className="h-8 px-3 text-xs" disabled={fiscalSaving}>
                {fiscalSaving ? 'Guardando...' : 'Guardar regla'}
              </Button>
              <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => loadFiscalRules(true)} disabled={fiscalLoading}>
                {fiscalLoading ? 'Actualizando...' : 'Actualizar reglas'}
              </Button>
            </div>
          </form>
          {fiscalError && <div className="text-xs text-rose-300 mt-2">{fiscalError}</div>}
          {fiscalSuccess && <div className="text-xs text-emerald-300 mt-2">{fiscalSuccess}</div>}
        </div>

        <div className="app-card finance-card p-4">
          <div className="text-sm text-slate-300 mb-2">Simulador fiscal AR</div>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-2" onSubmit={handleFiscalSimulation}>
            <input
              className="input-modern text-xs"
              placeholder="Monto base"
              value={fiscalSimForm.monto}
              onChange={(e) => setFiscalSimForm((prev) => ({ ...prev, monto: e.target.value }))}
            />
            <input
              type="date"
              className="input-modern text-xs"
              value={fiscalSimForm.fecha}
              onChange={(e) => setFiscalSimForm((prev) => ({ ...prev, fecha: e.target.value }))}
            />
            <input
              className="input-modern text-xs"
              placeholder="Cliente ID"
              value={fiscalSimForm.cliente_id}
              onChange={(e) => setFiscalSimForm((prev) => ({ ...prev, cliente_id: e.target.value }))}
            />
            <input
              className="input-modern text-xs"
              placeholder="Proveedor ID"
              value={fiscalSimForm.proveedor_id}
              onChange={(e) => setFiscalSimForm((prev) => ({ ...prev, proveedor_id: e.target.value }))}
            />
            <input
              className="input-modern text-xs md:col-span-2"
              placeholder="Producto ID"
              value={fiscalSimForm.producto_id}
              onChange={(e) => setFiscalSimForm((prev) => ({ ...prev, producto_id: e.target.value }))}
            />
            <Button type="submit" className="h-8 px-3 text-xs md:col-span-2" disabled={fiscalSimLoading}>
              {fiscalSimLoading ? 'Simulando...' : 'Simular calculo'}
            </Button>
          </form>
          {fiscalSimError && <div className="text-xs text-rose-300 mt-2">{fiscalSimError}</div>}
          {fiscalSimResult && (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-slate-300">
                Base: ${Number(fiscalSimResult.monto_base || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-cyan-200">
                Total fiscal: ${Number(fiscalSimResult.total_fiscal || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
              <div className="space-y-1 max-h-40 overflow-auto pr-1">
                {fiscalSimResult.detalle.length === 0 && (
                  <div className="text-xs text-slate-500">No aplican reglas para esta simulacion.</div>
                )}
                {fiscalSimResult.detalle.map((d) => (
                  <div key={d.rule_id} className="rounded border border-white/10 bg-white/5 p-2 text-xs">
                    <div className="text-slate-200">{d.nombre}</div>
                    <div className="text-slate-400">
                      {d.tipo} - {Number(d.alicuota || 0).toFixed(2)}% - ${Number(d.monto || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="app-card finance-card p-4">
        <div className="text-sm text-slate-300 mb-2">Reglas fiscales vigentes</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2 px-2">Nombre</th>
                <th className="py-2 px-2">Tipo</th>
                <th className="py-2 px-2">Scope</th>
                <th className="py-2 px-2 text-right">Alicuota</th>
                <th className="py-2 px-2 text-right">Minimo</th>
                <th className="py-2 px-2 text-right">Prioridad</th>
                <th className="py-2 px-2">Estado</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {fiscalRules.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-3 px-2 text-slate-500">
                    Sin reglas fiscales cargadas.
                  </td>
                </tr>
              )}
              {fiscalRules.map((r) => (
                <tr key={r.id} className="border-t border-white/10 hover:bg-white/5">
                  <td className="py-2 px-2">{r.nombre}</td>
                  <td className="py-2 px-2">{r.tipo}</td>
                  <td className="py-2 px-2">
                    {r.scope}
                    {r.scope_ref_id ? ` #${r.scope_ref_id}` : ''}
                  </td>
                  <td className="py-2 px-2 text-right font-data">{Number(r.alicuota || 0).toFixed(2)}%</td>
                  <td className="py-2 px-2 text-right font-data">${Number(r.monto_minimo || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="py-2 px-2 text-right font-data">{Number(r.prioridad || 0)}</td>
                  <td className="py-2 px-2">
                    <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleToggleFiscalRule(r)}>
                      {Number(r.activo || 0) === 1 ? 'Desactivar' : 'Activar'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
