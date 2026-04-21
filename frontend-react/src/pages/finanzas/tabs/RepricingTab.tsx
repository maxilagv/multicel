import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Api } from '../../../lib/api';
import { usePriceLabels } from '../../../lib/priceLabels';
import {
  flattenCategoryTree,
  type CategoryNode,
  type FlatCategoryNode,
} from '../../../lib/categoryTree';
import Button from '../../../ui/Button';
import HelpTooltip from '../../../components/HelpTooltip';
import type { RepricingRuleRow, RepricingPreviewRow } from '../types';

function parseIds(raw: string): number[] {
  return String(raw || '')
    .split(',')
    .map((x) => Number(String(x).trim()))
    .filter((x) => Number.isInteger(x) && x > 0);
}

function toOptionalNumber(raw: string): number | undefined {
  if (String(raw || '').trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function mapPreviewRows(raw: any): RepricingPreviewRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any) => ({
    producto_id: Number(r.producto_id || 0),
    producto: String(r.producto || ''),
    regla_nombre: r.regla_nombre ? String(r.regla_nombre) : '',
    costo_ars: Number(r.costo_ars || 0),
    precio_actual: r.precio_actual || {},
    precio_sugerido: r.precio_sugerido || {},
  }));
}

function buildVentaImpact(rows: RepricingPreviewRow[]) {
  const totals = rows.reduce(
    (acc, row) => {
      const actual = Number(row.precio_actual?.venta || 0);
      const sugerido = Number(row.precio_sugerido?.venta || 0);
      acc.actual += actual;
      acc.sugerido += sugerido;
      return acc;
    },
    { actual: 0, sugerido: 0 }
  );
  const delta = totals.sugerido - totals.actual;
  const deltaPct = totals.actual > 0 ? (delta / totals.actual) * 100 : 0;
  return { ...totals, delta, deltaPct };
}

export default function RepricingTab() {
  const { labels: priceLabels } = usePriceLabels();
  const [repricingRules, setRepricingRules] = useState<RepricingRuleRow[]>([]);
  const [repricingRulesLoading, setRepricingRulesLoading] = useState(false);
  const [repricingRulesError, setRepricingRulesError] = useState<string | null>(null);
  const [repricingPreviewRows, setRepricingPreviewRows] = useState<RepricingPreviewRow[]>([]);
  const [repricingPreviewLoading, setRepricingPreviewLoading] = useState(false);
  const [repricingPreviewError, setRepricingPreviewError] = useState<string | null>(null);
  const [repricingApplyMsg, setRepricingApplyMsg] = useState<string | null>(null);
  const [repricingLimit, setRepricingLimit] = useState<number>(120);
  const [repricingProductIds, setRepricingProductIds] = useState<string>('');
  const [repricingCategoryId, setRepricingCategoryId] = useState<string>('');
  const [repricingIncludeDescendants, setRepricingIncludeDescendants] = useState(true);
  const [repricingSaving, setRepricingSaving] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<FlatCategoryNode[]>([]);
  const [categoryOptionsLoading, setCategoryOptionsLoading] = useState(false);
  const [categoryOptionsError, setCategoryOptionsError] = useState<string | null>(null);
  const [bulkPricePreviewRows, setBulkPricePreviewRows] = useState<RepricingPreviewRow[]>([]);
  const [bulkPriceLoading, setBulkPriceLoading] = useState(false);
  const [bulkPriceError, setBulkPriceError] = useState<string | null>(null);
  const [bulkPriceApplyMsg, setBulkPriceApplyMsg] = useState<string | null>(null);
  const [bulkPriceForm, setBulkPriceForm] = useState({
    category_id: '',
    include_descendants: true,
    limit: '500',
    precio_venta: '',
    precio_local: '',
    precio_distribuidor: '',
    precio_final: '',
  });
  const [repricingForm, setRepricingForm] = useState({
    nombre: '',
    scope: 'global' as 'global' | 'categoria' | 'proveedor' | 'producto',
    scope_ref_id: '',
    channel: '' as '' | 'local' | 'distribuidor' | 'final',
    margin_min: '0.15',
    margin_target: '0.30',
    usd_pass_through: '1',
    rounding_step: '1',
    prioridad: '100',
    status: 'active' as 'active' | 'inactive',
  });

  useEffect(() => {
    void loadRepricingRules(false);
    void loadCategoryOptions();
  }, []);

  async function loadCategoryOptions() {
    setCategoryOptionsLoading(true);
    setCategoryOptionsError(null);
    try {
      const tree = (await Api.categoriasTree()) as CategoryNode[];
      setCategoryOptions(flattenCategoryTree(tree || []));
    } catch (e) {
      setCategoryOptions([]);
      setCategoryOptionsError(e instanceof Error ? e.message : 'No se pudieron cargar categorias');
    } finally {
      setCategoryOptionsLoading(false);
    }
  }

  async function loadRepricingRules(showError = false) {
    setRepricingRulesLoading(true);
    if (!showError) setRepricingRulesError(null);
    try {
      const rows = await Api.ownerRepricingRules();
      const safeRows = Array.isArray(rows)
        ? rows.map((r: any) => ({
            id: Number(r.id || 0),
            nombre: String(r.nombre || ''),
            scope: String(r.scope || 'global') as RepricingRuleRow['scope'],
            scope_ref_id: r.scope_ref_id == null ? null : Number(r.scope_ref_id),
            channel: r.channel ? (String(r.channel) as RepricingRuleRow['channel']) : null,
            margin_min: Number(r.margin_min || 0),
            margin_target: Number(r.margin_target || 0),
            usd_pass_through: Number(r.usd_pass_through || 0),
            rounding_step: Number(r.rounding_step || 1),
            prioridad: Number(r.prioridad || 100),
            status: String(r.status || 'active') as RepricingRuleRow['status'],
          }))
        : [];
      setRepricingRules(safeRows);
    } catch (e) {
      if (showError) {
        setRepricingRulesError(e instanceof Error ? e.message : 'No se pudieron cargar reglas de repricing');
      }
      setRepricingRules([]);
    } finally {
      setRepricingRulesLoading(false);
    }
  }

  async function handleCreateRepricingRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRepricingRulesError(null);
    setRepricingApplyMsg(null);
    if (repricingForm.nombre.trim().length < 3) {
      setRepricingRulesError('Nombre de regla invalido');
      return;
    }
    setRepricingSaving(true);
    try {
      await Api.ownerCreateRepricingRule({
        nombre: repricingForm.nombre.trim(),
        scope: repricingForm.scope,
        scope_ref_id: repricingForm.scope_ref_id ? Number(repricingForm.scope_ref_id) : null,
        channel: repricingForm.channel || null,
        margin_min: Number(repricingForm.margin_min || 0.15),
        margin_target: Number(repricingForm.margin_target || 0.3),
        usd_pass_through: Number(repricingForm.usd_pass_through || 1),
        rounding_step: Number(repricingForm.rounding_step || 1),
        prioridad: Number(repricingForm.prioridad || 100),
        status: repricingForm.status,
      });
      setRepricingForm((prev) => ({ ...prev, nombre: '', scope_ref_id: '' }));
      await loadRepricingRules(false);
    } catch (e) {
      setRepricingRulesError(e instanceof Error ? e.message : 'No se pudo crear la regla');
    } finally {
      setRepricingSaving(false);
    }
  }

  async function handleToggleRepricingRule(rule: RepricingRuleRow) {
    setRepricingRulesError(null);
    try {
      await Api.ownerUpdateRepricingRule(rule.id, {
        status: rule.status === 'active' ? 'inactive' : 'active',
      });
      await loadRepricingRules(false);
    } catch (e) {
      setRepricingRulesError(e instanceof Error ? e.message : 'No se pudo actualizar la regla');
    }
  }

  async function handlePreviewRepricing() {
    const ids = parseIds(repricingProductIds);
    const categoryId = Number(repricingCategoryId || 0);
    if (!ids.length && !(Number.isInteger(categoryId) && categoryId > 0)) {
      setRepricingPreviewRows([]);
      setRepricingPreviewError('Elegi una categoria/subcategoria o carga IDs de productos.');
      return;
    }
    setRepricingPreviewLoading(true);
    setRepricingPreviewError(null);
    setRepricingApplyMsg(null);
    try {
      const out = await Api.ownerRepricingPreview({
        limit: Math.max(1, Number(repricingLimit) || 1),
        product_ids: ids.length ? ids : undefined,
        category_id: Number.isInteger(categoryId) && categoryId > 0 ? categoryId : undefined,
        include_descendants: repricingIncludeDescendants,
      });
      setRepricingPreviewRows(mapPreviewRows(out));
    } catch (e) {
      setRepricingPreviewError(e instanceof Error ? e.message : 'No se pudo generar preview');
      setRepricingPreviewRows([]);
    } finally {
      setRepricingPreviewLoading(false);
    }
  }

  async function handleApplyRepricing() {
    const ids = parseIds(repricingProductIds);
    const categoryId = Number(repricingCategoryId || 0);
    if (!ids.length && !(Number.isInteger(categoryId) && categoryId > 0)) {
      setRepricingPreviewError('Elegi una categoria/subcategoria o carga IDs de productos.');
      return;
    }
    setRepricingPreviewError(null);
    setRepricingApplyMsg(null);
    try {
      const out = await Api.ownerRepricingApply({
        limit: Math.max(1, Number(repricingLimit) || 1),
        product_ids: ids.length ? ids : undefined,
        category_id: Number.isInteger(categoryId) && categoryId > 0 ? categoryId : undefined,
        include_descendants: repricingIncludeDescendants,
      });
      setRepricingApplyMsg(`Repricing aplicado. Productos actualizados: ${Number(out?.changed || 0)}`);
      setRepricingPreviewRows(mapPreviewRows(out?.preview));
    } catch (e) {
      setRepricingPreviewError(e instanceof Error ? e.message : 'No se pudo aplicar repricing');
    }
  }

  function buildBulkPricePayload() {
    return {
      category_id: Number(bulkPriceForm.category_id || 0) || undefined,
      include_descendants: bulkPriceForm.include_descendants,
      limit: Math.max(1, Number(bulkPriceForm.limit) || 1),
      precio_venta: toOptionalNumber(bulkPriceForm.precio_venta),
      precio_local: toOptionalNumber(bulkPriceForm.precio_local),
      precio_distribuidor: toOptionalNumber(bulkPriceForm.precio_distribuidor),
      precio_final: toOptionalNumber(bulkPriceForm.precio_final),
    };
  }

  async function handlePreviewBulkPrice() {
    const payload = buildBulkPricePayload();
    if (!payload.category_id) {
      setBulkPricePreviewRows([]);
      setBulkPriceError('Elegi una categoria o subcategoria.');
      return;
    }
    if (
      payload.precio_venta == null &&
      payload.precio_local == null &&
      payload.precio_distribuidor == null &&
      payload.precio_final == null
    ) {
      setBulkPricePreviewRows([]);
      setBulkPriceError('Carga al menos un precio para simular.');
      return;
    }
    setBulkPriceLoading(true);
    setBulkPriceError(null);
    setBulkPriceApplyMsg(null);
    try {
      const out = await Api.ownerBulkPricePreview(payload);
      setBulkPricePreviewRows(mapPreviewRows(out));
    } catch (e) {
      setBulkPricePreviewRows([]);
      setBulkPriceError(e instanceof Error ? e.message : 'No se pudo generar preview de precios');
    } finally {
      setBulkPriceLoading(false);
    }
  }

  async function handleApplyBulkPrice() {
    const payload = buildBulkPricePayload();
    if (!payload.category_id) {
      setBulkPriceError('Elegi una categoria o subcategoria.');
      return;
    }
    if (
      payload.precio_venta == null &&
      payload.precio_local == null &&
      payload.precio_distribuidor == null &&
      payload.precio_final == null
    ) {
      setBulkPriceError('Carga al menos un precio para aplicar.');
      return;
    }
    setBulkPriceLoading(true);
    setBulkPriceError(null);
    setBulkPriceApplyMsg(null);
    try {
      const out = await Api.ownerBulkPriceApply(payload);
      setBulkPriceApplyMsg(`Precios aplicados. Productos actualizados: ${Number(out?.changed || 0)}`);
      setBulkPricePreviewRows(mapPreviewRows(out?.preview));
    } catch (e) {
      setBulkPriceError(e instanceof Error ? e.message : 'No se pudieron aplicar precios masivos');
    } finally {
      setBulkPriceLoading(false);
    }
  }

  const repricingImpact = useMemo(() => buildVentaImpact(repricingPreviewRows), [repricingPreviewRows]);
  const bulkPriceImpact = useMemo(() => buildVentaImpact(bulkPricePreviewRows), [bulkPricePreviewRows]);
  const bulkPriceTargetCount = useMemo(
    () =>
      [
        bulkPriceForm.precio_venta,
        bulkPriceForm.precio_local,
        bulkPriceForm.precio_distribuidor,
        bulkPriceForm.precio_final,
      ].filter((value) => String(value || '').trim() !== '').length,
    [bulkPriceForm]
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="app-card finance-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm text-slate-300">
            <span>Nueva regla de repricing</span>
            <HelpTooltip>
              Las reglas de repricing sirven para recalcular precios segun margen minimo, objetivo y canal antes de aplicar cambios masivos.
            </HelpTooltip>
          </div>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-2" onSubmit={handleCreateRepricingRule}>
            <input
              className="input-modern text-xs md:col-span-2"
              placeholder="Nombre de regla"
              value={repricingForm.nombre}
              onChange={(e) => setRepricingForm((prev) => ({ ...prev, nombre: e.target.value }))}
            />
            <select
              className="input-modern text-xs"
              value={repricingForm.scope}
              onChange={(e) =>
                setRepricingForm((prev) => ({
                  ...prev,
                  scope: e.target.value as 'global' | 'categoria' | 'proveedor' | 'producto',
                }))
              }
            >
              <option value="global">Global</option>
              <option value="categoria">Categoria</option>
              <option value="proveedor">Proveedor</option>
              <option value="producto">Producto</option>
            </select>
            <input
              className="input-modern text-xs"
              placeholder="Scope ref id"
              value={repricingForm.scope_ref_id}
              onChange={(e) => setRepricingForm((prev) => ({ ...prev, scope_ref_id: e.target.value }))}
            />
            <select
              className="input-modern text-xs"
              value={repricingForm.channel}
              onChange={(e) =>
                setRepricingForm((prev) => ({
                  ...prev,
                  channel: e.target.value as '' | 'local' | 'distribuidor' | 'final',
                }))
              }
            >
              <option value="">Canal: todos</option>
              <option value="local">{priceLabels.local}</option>
              <option value="distribuidor">{priceLabels.distribuidor}</option>
              <option value="final">{priceLabels.final}</option>
            </select>
            <input
              className="input-modern text-xs"
              placeholder="Prioridad"
              value={repricingForm.prioridad}
              onChange={(e) => setRepricingForm((prev) => ({ ...prev, prioridad: e.target.value }))}
            />
            <input
              className="input-modern text-xs"
              placeholder="Margen minimo"
              value={repricingForm.margin_min}
              onChange={(e) => setRepricingForm((prev) => ({ ...prev, margin_min: e.target.value }))}
            />
            <input
              className="input-modern text-xs"
              placeholder="Margen objetivo"
              value={repricingForm.margin_target}
              onChange={(e) => setRepricingForm((prev) => ({ ...prev, margin_target: e.target.value }))}
            />
            <input
              className="input-modern text-xs"
              placeholder="USD pass"
              value={repricingForm.usd_pass_through}
              onChange={(e) => setRepricingForm((prev) => ({ ...prev, usd_pass_through: e.target.value }))}
            />
            <input
              className="input-modern text-xs"
              placeholder="Rounding"
              value={repricingForm.rounding_step}
              onChange={(e) => setRepricingForm((prev) => ({ ...prev, rounding_step: e.target.value }))}
            />
            <select
              className="input-modern text-xs"
              value={repricingForm.status}
              onChange={(e) =>
                setRepricingForm((prev) => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <div className="flex items-center gap-2 md:col-span-2">
              <Button type="submit" className="h-8 px-3 text-xs" disabled={repricingSaving}>
                {repricingSaving ? 'Guardando...' : 'Guardar regla'}
              </Button>
              <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => loadRepricingRules(true)} disabled={repricingRulesLoading}>
                {repricingRulesLoading ? 'Actualizando...' : 'Actualizar reglas'}
              </Button>
            </div>
          </form>
          {repricingRulesError && <div className="text-xs text-rose-300 mt-2">{repricingRulesError}</div>}
        </div>

        <div className="app-card finance-card p-4">
          <div className="text-sm text-slate-300 mb-2">Reglas cargadas</div>
          <div className="space-y-2 max-h-[340px] overflow-auto pr-1">
            {repricingRules.length === 0 && <div className="text-xs text-slate-500">Sin reglas.</div>}
            {repricingRules.map((r) => (
              <div key={r.id} className="rounded-lg border border-white/10 bg-white/5 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-200">{r.nombre}</div>
                  <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleToggleRepricingRule(r)}>
                    {r.status === 'active' ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
                <div className="text-[11px] text-slate-400">
                  {r.scope}
                  {r.scope_ref_id ? ` #${r.scope_ref_id}` : ''} - {r.channel || 'all'} - prioridad {r.prioridad}
                </div>
                <div className="text-[11px] text-slate-500">
                  min {r.margin_min} | target {r.margin_target} | pass {r.usd_pass_through}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="app-card finance-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span>Precios masivos por categoria</span>
          <HelpTooltip>
            Ideal para productos recien importados. Elegi una categoria o subcategoria y carga precios fijos. Si dejas un campo vacio, ese precio no se modifica.
          </HelpTooltip>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          <select
            className="input-modern text-xs md:col-span-2"
            value={bulkPriceForm.category_id}
            onChange={(e) =>
              setBulkPriceForm((prev) => ({
                ...prev,
                category_id: e.target.value,
              }))
            }
            disabled={categoryOptionsLoading}
          >
            <option value="">
              {categoryOptionsLoading ? 'Cargando categorias...' : 'Elegir categoria o subcategoria'}
            </option>
            {categoryOptions.map((node) => (
              <option key={node.id} value={node.id}>
                {node.pathLabel}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            className="input-modern text-xs"
            placeholder="Limite"
            value={bulkPriceForm.limit}
            onChange={(e) => setBulkPriceForm((prev) => ({ ...prev, limit: e.target.value }))}
          />
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={bulkPriceForm.include_descendants}
              onChange={(e) =>
                setBulkPriceForm((prev) => ({
                  ...prev,
                  include_descendants: e.target.checked,
                }))
              }
            />
            Incluir subcategorias
          </label>
          <input
            type="number"
            min={0}
            className="input-modern text-xs"
            placeholder="Precio venta"
            value={bulkPriceForm.precio_venta}
            onChange={(e) => setBulkPriceForm((prev) => ({ ...prev, precio_venta: e.target.value }))}
          />
          <input
            type="number"
            min={0}
            className="input-modern text-xs"
            placeholder={priceLabels.local}
            value={bulkPriceForm.precio_local}
            onChange={(e) => setBulkPriceForm((prev) => ({ ...prev, precio_local: e.target.value }))}
          />
          <input
            type="number"
            min={0}
            className="input-modern text-xs"
            placeholder={priceLabels.distribuidor}
            value={bulkPriceForm.precio_distribuidor}
            onChange={(e) =>
              setBulkPriceForm((prev) => ({ ...prev, precio_distribuidor: e.target.value }))
            }
          />
          <input
            type="number"
            min={0}
            className="input-modern text-xs"
            placeholder="Precio final"
            value={bulkPriceForm.precio_final}
            onChange={(e) => setBulkPriceForm((prev) => ({ ...prev, precio_final: e.target.value }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" className="h-8 px-3 text-xs" onClick={handlePreviewBulkPrice} disabled={bulkPriceLoading}>
            {bulkPriceLoading ? 'Simulando...' : 'Simular precios'}
          </Button>
          <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={handleApplyBulkPrice} disabled={bulkPriceLoading}>
            Aplicar precios
          </Button>
          {categoryOptionsError && <div className="text-xs text-rose-300">{categoryOptionsError}</div>}
        </div>
        {bulkPriceError && <div className="text-xs text-rose-300">{bulkPriceError}</div>}
        {bulkPriceApplyMsg && <div className="text-xs text-emerald-300">{bulkPriceApplyMsg}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] text-slate-400 uppercase">Productos afectados</div>
            <div className="text-base font-semibold font-data text-slate-100">
              {bulkPricePreviewRows.length.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] text-slate-400 uppercase">Campos cargados</div>
            <div className="text-base font-semibold font-data text-cyan-200">
              {bulkPriceTargetCount.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] text-slate-400 uppercase">Delta venta</div>
            <div className="text-base font-semibold font-data text-emerald-200">
              ${bulkPriceImpact.delta.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({bulkPriceImpact.deltaPct.toFixed(2)}%)
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2 px-2">Producto</th>
                <th className="py-2 px-2 text-right">Venta actual</th>
                <th className="py-2 px-2 text-right">Venta nueva</th>
                <th className="py-2 px-2 text-right">Local actual</th>
                <th className="py-2 px-2 text-right">Local nuevo</th>
                <th className="py-2 px-2 text-right">Dist actual</th>
                <th className="py-2 px-2 text-right">Dist nuevo</th>
                <th className="py-2 px-2 text-right">Final actual</th>
                <th className="py-2 px-2 text-right">Final nuevo</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {bulkPricePreviewRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-3 px-2 text-slate-500">
                    Simula una categoria para ver los cambios de precio antes de aplicarlos.
                  </td>
                </tr>
              )}
              {bulkPricePreviewRows.map((row) => (
                <tr key={row.producto_id} className="border-t border-white/10 hover:bg-white/5">
                  <td className="py-2 px-2">{row.producto}</td>
                  <td className="py-2 px-2 text-right font-data">
                    ${Number(row.precio_actual?.venta || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 px-2 text-right font-data text-cyan-200">
                    ${Number(row.precio_sugerido?.venta || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 px-2 text-right font-data">
                    ${Number(row.precio_actual?.local || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 px-2 text-right font-data text-cyan-200">
                    ${Number(row.precio_sugerido?.local || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 px-2 text-right font-data">
                    ${Number(row.precio_actual?.distribuidor || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 px-2 text-right font-data text-cyan-200">
                    ${Number(row.precio_sugerido?.distribuidor || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 px-2 text-right font-data">
                    ${Number(row.precio_actual?.final || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 px-2 text-right font-data text-cyan-200">
                    ${Number(row.precio_sugerido?.final || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="app-card finance-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span>Repricing por reglas</span>
          <HelpTooltip>
            Este bloque recalcula precios desde reglas de margen y costo. Puedes filtrarlo por categoria o por IDs concretos.
          </HelpTooltip>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select
            className="input-modern text-xs min-w-[260px]"
            value={repricingCategoryId}
            onChange={(e) => setRepricingCategoryId(e.target.value)}
            disabled={categoryOptionsLoading}
          >
            <option value="">
              {categoryOptionsLoading ? 'Cargando categorias...' : 'Filtrar por categoria/subcategoria'}
            </option>
            {categoryOptions.map((node) => (
              <option key={node.id} value={node.id}>
                {node.pathLabel}
              </option>
            ))}
          </select>
          <input
            className="input-modern text-xs grow min-w-[260px]"
            placeholder="Producto IDs (coma), opcional"
            value={repricingProductIds}
            onChange={(e) => setRepricingProductIds(e.target.value)}
          />
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={repricingIncludeDescendants}
              onChange={(e) => setRepricingIncludeDescendants(e.target.checked)}
            />
            Incluir subcategorias
          </label>
          <input
            type="number"
            min={1}
            className="input-modern text-xs w-24"
            value={repricingLimit}
            onChange={(e) => setRepricingLimit(Number(e.target.value) || 1)}
          />
          <Button type="button" className="h-8 px-3 text-xs" onClick={handlePreviewRepricing} disabled={repricingPreviewLoading}>
            {repricingPreviewLoading ? 'Simulando...' : 'Simular'}
          </Button>
          <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={handleApplyRepricing} disabled={repricingPreviewLoading}>
            Aplicar
          </Button>
        </div>
        {repricingPreviewError && <div className="text-xs text-rose-300">{repricingPreviewError}</div>}
        {repricingApplyMsg && <div className="text-xs text-emerald-300">{repricingApplyMsg}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] text-slate-400 uppercase">Actual</div>
            <div className="text-base font-semibold font-data text-slate-100">
              ${repricingImpact.actual.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] text-slate-400 uppercase">Sugerido</div>
            <div className="text-base font-semibold font-data text-cyan-200">
              ${repricingImpact.sugerido.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="text-[11px] text-slate-400 uppercase">Delta</div>
            <div className="text-base font-semibold font-data text-emerald-200">
              ${repricingImpact.delta.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({repricingImpact.deltaPct.toFixed(2)}%)
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="py-2 px-2">Producto</th>
                <th className="py-2 px-2 text-right">Costo ARS</th>
                <th className="py-2 px-2 text-right">Venta actual</th>
                <th className="py-2 px-2 text-right">Venta sugerida</th>
                <th className="py-2 px-2 text-right">Delta %</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {repricingPreviewRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 px-2 text-slate-500">
                    Ejecuta simulacion para ver impacto por regla.
                  </td>
                </tr>
              )}
              {repricingPreviewRows.map((r) => {
                const actual = Number(r.precio_actual?.venta || 0);
                const sugerido = Number(r.precio_sugerido?.venta || 0);
                const deltaPct = actual > 0 ? ((sugerido - actual) / actual) * 100 : 0;
                return (
                  <tr key={r.producto_id} className="border-t border-white/10 hover:bg-white/5">
                    <td className="py-2 px-2">{r.producto}</td>
                    <td className="py-2 px-2 text-right font-data">${Number(r.costo_ars || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="py-2 px-2 text-right font-data">${actual.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="py-2 px-2 text-right font-data">${sugerido.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="py-2 px-2 text-right font-data">{deltaPct.toFixed(2)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
