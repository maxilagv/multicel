import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Api } from '../lib/api';
import { usePriceLabels } from '../lib/priceLabels';
import { uploadImageToCloudinary } from '../lib/cloudinary';
import Alert from '../components/Alert';
import Button from '../ui/Button';
import ProductPicker from '../components/ProductPicker';

type ProductoOption = {
  id: number;
  name: string;
  category_name?: string | null;
  image_url?: string | null;
  precio_final?: number | null;
  price?: number | null;
};

type ClienteWhatsapp = {
  id: number;
  nombre: string;
  apellido?: string | null;
  telefono?: string | null;
  telefono_e164?: string | null;
  whatsapp_opt_in?: boolean | number | null;
  whatsapp_status?: string | null;
};

type CampaignRow = {
  id: number;
  nombre: string;
  estado: string;
  total_recipients?: number;
  sent_recipients?: number;
  failed_recipients?: number;
  created_at?: string;
};

export default function CatalogoAdmin() {
  const { labels: priceLabels } = usePriceLabels();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [emitLoading, setEmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [emitUrl, setEmitUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [productos, setProductos] = useState<ProductoOption[]>([]);
  const [activeTab, setActiveTab] = useState<'config' | 'excel' | 'whatsapp'>('config');
  const [excelPriceType, setExcelPriceType] = useState<
    'distribuidor' | 'mayorista' | 'final'
  >('distribuidor');
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [excelSuccess, setExcelSuccess] = useState<string | null>(null);
  const [pdfMode, setPdfMode] = useState<'precios' | 'ofertas'>('precios');
  const [pdfPriceType, setPdfPriceType] = useState<'distribuidor' | 'mayorista' | 'final'>(
    'distribuidor'
  );
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSuccess, setPdfSuccess] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [wsMode, setWsMode] = useState<'precios' | 'ofertas'>('ofertas');
  const [wsPriceType, setWsPriceType] = useState<'distribuidor' | 'mayorista' | 'final'>(
    'distribuidor'
  );
  const [wsCampaignName, setWsCampaignName] = useState('');
  const [wsMessage, setWsMessage] = useState('Hola, te compartimos nuestro PDF de ofertas.');
  const [wsClients, setWsClients] = useState<ClienteWhatsapp[]>([]);
  const [wsFilter, setWsFilter] = useState('');
  const [wsSelectedIds, setWsSelectedIds] = useState<number[]>([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [wsSuccess, setWsSuccess] = useState<string | null>(null);
  const [wsCampaigns, setWsCampaigns] = useState<CampaignRow[]>([]);
  const [form, setForm] = useState({
    nombre: '',
    logo_url: '',
    pdf_logo_url: '',
    dominio: '',
    destacado_producto_id: '',
    price_type: 'final' as 'final' | 'distribuidor' | 'mayorista',
  });

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [config, productosResp, clientesResp, campanasResp] = await Promise.all([
          Api.catalogoConfig(),
          Api.productos({ all: true, paginated: true }).catch(() => ({})),
          Api.clientes({ all: true, limit: 1000 }).catch(() => []),
          Api.catalogoWhatsappCampanias({ limit: 30 }).catch(() => []),
        ]);
        if (!mounted) return;
        const cfg: any = config || {};
        const prodsData: any = (productosResp as any).data || productosResp || [];
        const list = Array.isArray(prodsData) ? prodsData : [];
        setProductos(
          list.map((p: any) => ({
            id: Number(p.id),
            name: p.name,
            category_name: p.category_name,
            image_url: p.image_url,
            precio_final: p.precio_final,
            price: p.price,
          }))
        );
        const clientsList = Array.isArray(clientesResp) ? (clientesResp as any[]) : [];
        setWsClients(
          clientsList.map((c) => ({
            id: Number(c.id),
            nombre: String(c.nombre || ''),
            apellido: c.apellido || '',
            telefono: c.telefono || null,
            telefono_e164: c.telefono_e164 || null,
            whatsapp_opt_in: c.whatsapp_opt_in,
            whatsapp_status: c.whatsapp_status || null,
          }))
        );
        setWsCampaigns(Array.isArray(campanasResp) ? (campanasResp as CampaignRow[]) : []);
        setForm({
          nombre: cfg.nombre || '',
          logo_url: cfg.logo_url || '',
          pdf_logo_url: cfg.pdf_logo_url || '',
          dominio: cfg.dominio || '',
          destacado_producto_id:
            cfg.destacado_producto_id != null ? String(cfg.destacado_producto_id) : '',
          price_type: (cfg.price_type as any) || 'final',
        });
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'No se pudo cargar el catalogo');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) window.URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  async function handleLogoFile(
    e: ChangeEvent<HTMLInputElement>,
    target: 'logo_url' | 'pdf_logo_url' = 'logo_url'
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadingLogo(true);
    try {
      const url = await uploadImageToCloudinary(file);
      setForm((prev) => ({ ...prev, [target]: url }));
    } catch (e) {
      setUploadError(
        e instanceof Error ? e.message : 'No se pudo subir el logo'
      );
    } finally {
      setUploadingLogo(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setEmitUrl(null);
    setSaving(true);
    try {
      await Api.guardarCatalogoConfig({
        nombre: form.nombre.trim(),
        logo_url: form.logo_url.trim(),
        pdf_logo_url: form.pdf_logo_url.trim(),
        dominio: form.dominio.trim(),
        destacado_producto_id: form.destacado_producto_id
          ? Number(form.destacado_producto_id)
          : null,
        publicado: true,
        price_type: form.price_type,
      });
      setSuccess('Configuracion del catalogo guardada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el catalogo');
    } finally {
      setSaving(false);
    }
  }

  async function onEmitCatalog() {
    setError(null);
    setSuccess(null);
    setEmitLoading(true);
    try {
      const res: any = await Api.emitirCatalogo();
      const url = String(res?.url || '').trim();
      if (!url) {
        throw new Error('No se pudo resolver la URL de publicacion');
      }
      setEmitUrl(url);
      setSuccess(`Catalogo emitido en ${url}`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo emitir el catalogo');
    } finally {
      setEmitLoading(false);
    }
  }

  const destacadoPreview = useMemo(() => {
    const id = Number(form.destacado_producto_id || 0);
    return productos.find((p) => p.id === id) || null;
  }, [form.destacado_producto_id, productos]);
  const productOptions = useMemo(
    () =>
      productos.map((p) => ({
        id: p.id,
        name: p.name,
        category_name: p.category_name || null,
      })),
    [productos],
  );

  async function handleDownloadExcel() {
    setExcelError(null);
    setExcelSuccess(null);
    setExcelLoading(true);
    try {
      const blob = await Api.descargarCatalogoExcel(excelPriceType);
      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = `catalogo-${excelPriceType}-${dateStamp}.xlsx`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setExcelSuccess('Excel generado.');
    } catch (e) {
      setExcelError(
        e instanceof Error ? e.message : 'No se pudo generar el excel'
      );
    } finally {
      setExcelLoading(false);
    }
  }

  async function handleDownloadPdf() {
    setPdfError(null);
    setPdfSuccess(null);
    setPdfLoading(true);
    try {
      const blob = await Api.descargarCatalogoPdf(pdfMode, pdfPriceType, {
        cacheBust: Date.now(),
      });
      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename =
        pdfMode === 'ofertas'
          ? `catalogo-ofertas-${dateStamp}.pdf`
          : `catalogo-${pdfPriceType}-${dateStamp}.pdf`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setPdfSuccess('PDF generado.');
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'No se pudo generar el PDF');
    } finally {
      setPdfLoading(false);
    }
  }

  async function handlePreviewPdf() {
    setPdfPreviewError(null);
    setPdfPreviewLoading(true);
    try {
      const blob = await Api.descargarCatalogoPdf(pdfMode, pdfPriceType, {
        cacheBust: Date.now(),
      });
      const url = window.URL.createObjectURL(blob);
      setPdfPreviewUrl((prev) => {
        if (prev) window.URL.revokeObjectURL(prev);
        return url;
      });
      setPdfPreviewOpen(true);
    } catch (e) {
      setPdfPreviewError(e instanceof Error ? e.message : 'No se pudo generar la vista previa del PDF');
    } finally {
      setPdfPreviewLoading(false);
    }
  }

  const wsFilteredClients = useMemo(() => {
    const q = wsFilter.trim().toLowerCase();
    const base = (wsClients || []).filter((c) => Boolean(c.telefono_e164 || c.telefono));
    if (!q) return base;
    return base.filter((c) => {
      const full = `${c.nombre || ''} ${c.apellido || ''}`.trim().toLowerCase();
      const t1 = String(c.telefono_e164 || '').toLowerCase();
      const t2 = String(c.telefono || '').toLowerCase();
      return full.includes(q) || t1.includes(q) || t2.includes(q);
    });
  }, [wsClients, wsFilter]);

  function toggleWsClient(id: number) {
    setWsSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectAllFiltered() {
    setWsSelectedIds(Array.from(new Set(wsFilteredClients.map((c) => c.id))));
  }

  function clearWsSelection() {
    setWsSelectedIds([]);
  }

  async function reloadWsCampaigns() {
    try {
      const rows = await Api.catalogoWhatsappCampanias({ limit: 30 });
      setWsCampaigns(Array.isArray(rows) ? (rows as CampaignRow[]) : []);
    } catch {
      // keep previous rows
    }
  }

  async function handleSendWhatsapp() {
    if (!wsSelectedIds.length) {
      setWsError('Selecciona al menos un contacto');
      return;
    }
    setWsLoading(true);
    setWsError(null);
    setWsSuccess(null);
    try {
      const out: any = await Api.enviarCatalogoWhatsappCampania({
        mode: wsMode,
        price_type: wsPriceType,
        campaign_name: wsCampaignName.trim() || undefined,
        message_text: wsMessage.trim() || undefined,
        cliente_ids: wsSelectedIds,
      });
      const summary = out?.summary || {};
      setWsSuccess(
        `Campana #${out?.campaign_id} enviada. Sent: ${Number(summary.sent || 0)} | Failed: ${Number(
          summary.failed || 0
        )} | Pending: ${Number(summary.pending || 0)}`
      );
      await reloadWsCampaigns();
    } catch (e) {
      setWsError(e instanceof Error ? e.message : 'No se pudo enviar la campana de WhatsApp');
    } finally {
      setWsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-100">Catalogo</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={[
              'px-4 h-9 rounded-full text-xs font-semibold tracking-wide transition',
              activeTab === 'config'
                ? 'bg-primary-500/20 text-white border border-primary-500/30'
                : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10',
            ].join(' ')}
            onClick={() => setActiveTab('config')}
          >
            CATALOGO
          </button>
          <button
            type="button"
            className={[
              'px-4 h-9 rounded-full text-xs font-semibold tracking-wide transition',
              activeTab === 'excel'
                ? 'bg-primary-500/20 text-white border border-primary-500/30'
                : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10',
            ].join(' ')}
            onClick={() => setActiveTab('excel')}
          >
            EXCEL
          </button>
          <button
            type="button"
            className={[
              'px-4 h-9 rounded-full text-xs font-semibold tracking-wide transition',
              activeTab === 'whatsapp'
                ? 'bg-primary-500/20 text-white border border-primary-500/30'
                : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10',
            ].join(' ')}
            onClick={() => setActiveTab('whatsapp')}
          >
            WHATSAPP
          </button>
        </div>
      </div>

      {activeTab === 'config' ? (
        <form
          onSubmit={onSave}
          className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_0_1px_rgba(255,255,255,0.04),0_0_0_1px_rgba(139,92,246,0.15),0_8px_20px_rgba(34,211,238,0.08)] p-4 space-y-4"
        >
          {(error || success || uploadError) && (
            <div className="space-y-2">
              {error && <Alert kind="error" message={error} />}
              {uploadError && <Alert kind="error" message={uploadError} />}
              {success && <Alert kind="info" message={success} />}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="text-sm text-slate-300">Datos visibles en el catalogo</div>
              <input
                className="input-modern w-full text-sm"
                placeholder="Nombre de la empresa"
                value={form.nombre}
                onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                disabled={loading || saving}
              />
              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  className="input-modern w-full text-sm"
                  onChange={(e) => handleLogoFile(e, 'logo_url')}
                  disabled={loading || saving}
                />
                <input
                  className="input-modern w-full text-sm"
                  placeholder="URL del logo"
                  value={form.logo_url}
                  onChange={(e) => setForm((prev) => ({ ...prev, logo_url: e.target.value }))}
                  disabled={loading || saving}
                />
                {uploadingLogo && (
                  <div className="text-xs text-slate-400">Subiendo logo...</div>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-xs text-slate-400">Logo portada PDF</label>
                <input
                  type="file"
                  accept="image/*"
                  className="input-modern w-full text-sm"
                  onChange={(e) => handleLogoFile(e, 'pdf_logo_url')}
                  disabled={loading || saving}
                />
                <input
                  className="input-modern w-full text-sm"
                  placeholder="URL del logo portada PDF"
                  value={form.pdf_logo_url}
                  onChange={(e) => setForm((prev) => ({ ...prev, pdf_logo_url: e.target.value }))}
                  disabled={loading || saving}
                />
              </div>
              <input
                className="input-modern w-full text-sm"
                placeholder="Dominio publico (ej: catalogo.midominio.com)"
                value={form.dominio}
                onChange={(e) => setForm((prev) => ({ ...prev, dominio: e.target.value }))}
                disabled={loading || saving || emitLoading}
              />
              <div className="space-y-1">
                <label className="block text-xs text-slate-400">Precio visible en el catalogo</label>
                <select
                  className="input-modern w-full text-sm"
                  value={form.price_type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      price_type: e.target.value as 'final' | 'distribuidor' | 'mayorista',
                    }))
                  }
                  disabled={loading || saving}
                >
                  <option value="final">{priceLabels.final}</option>
                  <option value="distribuidor">{priceLabels.local}</option>
                  <option value="mayorista">{priceLabels.distribuidor}</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm text-slate-300">Producto destacado (hero)</div>
              <ProductPicker
                options={productOptions}
                value={form.destacado_producto_id ? Number(form.destacado_producto_id) : null}
                onChange={(id) =>
                  setForm((prev) => ({
                    ...prev,
                    destacado_producto_id: id == null ? '' : String(id),
                  }))
                }
                placeholder="Sin destacado"
                disabled={loading || saving}
                allowClear
              />
              {destacadoPreview && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  {destacadoPreview.image_url ? (
                    <img
                      src={destacadoPreview.image_url}
                      alt={destacadoPreview.name}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-white/10 flex items-center justify-center text-xs text-slate-400">
                      Sin imagen
                    </div>
                  )}
                  <div>
                    <div className="text-sm text-slate-100">{destacadoPreview.name}</div>
                    <div className="text-xs text-slate-400">
                      {destacadoPreview.precio_final != null
                        ? `$${destacadoPreview.precio_final.toFixed(2)}`
                        : destacadoPreview.price != null
                        ? `$${destacadoPreview.price.toFixed(2)}`
                        : 'Sin precio'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-xs text-slate-400">
              Define el dominio y usa "Emitir catalogo" para publicar la URL final.
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving || loading}>
                {saving ? 'Guardando...' : 'Guardar configuracion'}
              </Button>
              <button
                type="button"
                className="h-11 rounded-lg bg-emerald-600 text-white px-4 text-sm font-medium disabled:opacity-60"
                onClick={onEmitCatalog}
                disabled={saving || loading || emitLoading}
              >
                {emitLoading ? 'Emitiendo...' : 'Emitir catalogo'}
              </button>
            </div>
          </div>
          {emitUrl && (
            <div className="text-xs text-emerald-300 break-all">
              URL emitida: {emitUrl}
            </div>
          )}
        </form>
      ) : activeTab === 'excel' ? (
        <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_0_1px_rgba(255,255,255,0.04),0_0_0_1px_rgba(139,92,246,0.15),0_8px_20px_rgba(34,211,238,0.08)] p-4 space-y-4">
          {(excelError || excelSuccess || pdfError || pdfSuccess || pdfPreviewError) && (
            <div className="space-y-2">
              {excelError && <Alert kind="error" message={excelError} />}
              {excelSuccess && <Alert kind="info" message={excelSuccess} />}
              {pdfError && <Alert kind="error" message={pdfError} />}
              {pdfSuccess && <Alert kind="info" message={pdfSuccess} />}
              {pdfPreviewError && <Alert kind="error" message={pdfPreviewError} />}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <div className="text-sm text-slate-300">Exportacion Excel</div>
              <div className="text-xs text-slate-400">
                Incluye categorias y productos con el precio elegido.
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Precio a exportar</div>
              <select
                className="input-modern w-full text-sm"
                value={excelPriceType}
                onChange={(e) =>
                  setExcelPriceType(e.target.value as 'distribuidor' | 'mayorista' | 'final')
                }
              >
                    <option value="distribuidor">{priceLabels.local}</option>
                    <option value="mayorista">{priceLabels.distribuidor}</option>
                    <option value="final">{priceLabels.final}</option>
                  </select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" loading={excelLoading} onClick={handleDownloadExcel}>
              {excelLoading ? 'Generando...' : 'Descargar Excel'}
            </Button>
          </div>

          <div className="border-t border-white/10 pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <div className="text-sm text-slate-300">Exportacion PDF</div>
              <div className="text-xs text-slate-400">
                Genera un PDF estetico del catalogo en modo precios u ofertas.
              </div>
              <div className="text-xs text-cyan-300/90">
                En modo ofertas, el PDF prioriza la imagen de la oferta y mantiene las fotos por producto.
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Modo PDF</div>
              <select
                className="input-modern w-full text-sm"
                value={pdfMode}
                onChange={(e) => setPdfMode(e.target.value === 'ofertas' ? 'ofertas' : 'precios')}
              >
                <option value="precios">Productos y precios</option>
                <option value="ofertas">Ofertas activas</option>
              </select>
            </div>
            <div className="md:col-span-1 space-y-2">
              <div className="text-xs text-slate-400">Precio para modo productos</div>
              <select
                className="input-modern w-full text-sm"
                value={pdfPriceType}
                onChange={(e) =>
                  setPdfPriceType(e.target.value as 'distribuidor' | 'mayorista' | 'final')
                }
                disabled={pdfMode === 'ofertas'}
              >
                <option value="distribuidor">{priceLabels.local}</option>
                <option value="mayorista">{priceLabels.distribuidor}</option>
                <option value="final">{priceLabels.final}</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              loading={pdfPreviewLoading}
              onClick={handlePreviewPdf}
            >
              {pdfPreviewLoading ? 'Generando...' : 'Vista previa PDF'}
            </Button>
            <Button type="button" loading={pdfLoading} onClick={handleDownloadPdf}>
              {pdfLoading ? 'Generando...' : 'Descargar PDF'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_0_1px_rgba(255,255,255,0.04),0_0_0_1px_rgba(139,92,246,0.15),0_8px_20px_rgba(34,211,238,0.08)] p-4 space-y-4">
          {(wsError || wsSuccess) && (
            <div className="space-y-2">
              {wsError && <Alert kind="error" message={wsError} />}
              {wsSuccess && <Alert kind="info" message={wsSuccess} />}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Modo PDF</div>
              <select
                className="input-modern w-full text-sm"
                value={wsMode}
                onChange={(e) => setWsMode(e.target.value === 'ofertas' ? 'ofertas' : 'precios')}
              >
                <option value="ofertas">Ofertas</option>
                <option value="precios">Productos y precios</option>
              </select>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Tipo de precio</div>
              <select
                className="input-modern w-full text-sm"
                value={wsPriceType}
                onChange={(e) =>
                  setWsPriceType(e.target.value as 'distribuidor' | 'mayorista' | 'final')
                }
                disabled={wsMode === 'ofertas'}
              >
                <option value="distribuidor">{priceLabels.local}</option>
                <option value="mayorista">{priceLabels.distribuidor}</option>
                <option value="final">{priceLabels.final}</option>
              </select>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Nombre de campana</div>
              <input
                className="input-modern w-full text-sm"
                placeholder="Campana WhatsApp"
                value={wsCampaignName}
                onChange={(e) => setWsCampaignName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-400">Mensaje</div>
            <textarea
              className="input-modern w-full text-sm min-h-[90px]"
              value={wsMessage}
              onChange={(e) => setWsMessage(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-2">
              <div className="text-xs text-slate-400">Buscar contactos</div>
              <input
                className="input-modern w-full text-sm"
                placeholder="Nombre o telefono"
                value={wsFilter}
                onChange={(e) => setWsFilter(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={selectAllFiltered}>
                Seleccionar filtrados
              </Button>
              <Button type="button" variant="outline" onClick={clearWsSelection}>
                Limpiar
              </Button>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            Seleccionados: {wsSelectedIds.length} / Contactos con telefono: {wsFilteredClients.length}
          </div>

          <div className="max-h-[280px] overflow-auto rounded-xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-900/90 text-left text-slate-300">
                <tr>
                  <th className="py-2 px-2">Sel</th>
                  <th className="py-2 px-2">Cliente</th>
                  <th className="py-2 px-2">Telefono</th>
                  <th className="py-2 px-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {wsFilteredClients.map((c) => {
                  const checked = wsSelectedIds.includes(c.id);
                  return (
                    <tr key={c.id} className="border-t border-white/10 text-slate-200">
                      <td className="py-2 px-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleWsClient(c.id)}
                        />
                      </td>
                      <td className="py-2 px-2">{`${c.nombre || ''} ${c.apellido || ''}`.trim()}</td>
                      <td className="py-2 px-2">{c.telefono_e164 || c.telefono || '-'}</td>
                      <td className="py-2 px-2">{c.whatsapp_status || 'unknown'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button type="button" loading={wsLoading} onClick={handleSendWhatsapp}>
              {wsLoading ? 'Enviando...' : 'Enviar a WhatsApp'}
            </Button>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-300">Historial de campanas</div>
              <Button type="button" variant="outline" onClick={reloadWsCampaigns}>
                Actualizar
              </Button>
            </div>
            <div className="max-h-[220px] overflow-auto rounded-xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-900/90 text-left text-slate-300">
                  <tr>
                    <th className="py-2 px-2">Campana</th>
                    <th className="py-2 px-2">Estado</th>
                    <th className="py-2 px-2">Total</th>
                    <th className="py-2 px-2">Enviados</th>
                    <th className="py-2 px-2">Fallidos</th>
                  </tr>
                </thead>
                <tbody>
                  {wsCampaigns.map((c) => (
                    <tr key={c.id} className="border-t border-white/10 text-slate-200">
                      <td className="py-2 px-2">{c.nombre || `Campana #${c.id}`}</td>
                      <td className="py-2 px-2">{c.estado}</td>
                      <td className="py-2 px-2">{Number(c.total_recipients || 0)}</td>
                      <td className="py-2 px-2">{Number(c.sent_recipients || 0)}</td>
                      <td className="py-2 px-2">{Number(c.failed_recipients || 0)}</td>
                    </tr>
                  ))}
                  {!wsCampaigns.length && (
                    <tr>
                      <td className="py-3 px-2 text-slate-400" colSpan={5}>
                        Sin campanas registradas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {pdfPreviewOpen && (
        <div className="fixed inset-0 z-[70] bg-slate-950/75 backdrop-blur-sm p-3 md:p-6">
          <div className="mx-auto h-full w-full max-w-6xl rounded-2xl border border-white/15 bg-slate-950/95 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-sm text-slate-100 font-medium">Vista previa PDF de catalogo</div>
                <div className="text-xs text-slate-400">
                  Modo: {pdfMode === 'ofertas' ? 'Ofertas' : 'Productos y precios'}
                </div>
              </div>
              <Button type="button" variant="outline" onClick={() => setPdfPreviewOpen(false)}>
                Cerrar
              </Button>
            </div>
            <div className="flex-1 bg-slate-900/60">
              {pdfPreviewUrl ? (
                <iframe
                  title="Vista previa PDF de catalogo"
                  src={pdfPreviewUrl}
                  className="h-full w-full"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-sm text-slate-400">
                  No se pudo cargar la vista previa del PDF.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
