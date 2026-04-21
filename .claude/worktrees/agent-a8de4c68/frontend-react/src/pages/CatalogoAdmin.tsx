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
  const [activeTab, setActiveTab] = useState<'config' | 'excel'>('config');
  const [excelPriceType, setExcelPriceType] = useState<
    'distribuidor' | 'mayorista' | 'final'
  >('distribuidor');
  const [excelLoading, setExcelLoading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [excelSuccess, setExcelSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre: '',
    logo_url: '',
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
        const [config, productosResp] = await Promise.all([
          Api.catalogoConfig(),
          Api.productos({ all: true, paginated: true }).catch(() => ({})),
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
        setForm({
          nombre: cfg.nombre || '',
          logo_url: cfg.logo_url || '',
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

  async function handleLogoFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploadingLogo(true);
    try {
      const url = await uploadImageToCloudinary(file);
      setForm((prev) => ({ ...prev, logo_url: url }));
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
                  onChange={handleLogoFile}
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
                  <option value="final">Precio final</option>
                  <option value="distribuidor">Precio distribuidor</option>
                  <option value="mayorista">Precio mayorista</option>
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
      ) : (
        <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_0_0_1px_rgba(255,255,255,0.04),0_0_0_1px_rgba(139,92,246,0.15),0_8px_20px_rgba(34,211,238,0.08)] p-4 space-y-4">
          {(excelError || excelSuccess) && (
            <div className="space-y-2">
              {excelError && <Alert kind="error" message={excelError} />}
              {excelSuccess && <Alert kind="info" message={excelSuccess} />}
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
        </div>
      )}
    </div>
  );
}
