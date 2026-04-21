import { useEffect, useMemo, useState } from 'react';
import { Api } from '../lib/api';
import ChartCard from '../ui/ChartCard';

const IVA_OPTIONS = [
  { value: 'responsable_inscripto', label: 'Responsable inscripto' },
  { value: 'monotributo', label: 'Monotributo' },
  { value: 'exento', label: 'Exento' },
  { value: 'consumidor_final', label: 'Consumidor final' },
  { value: 'no_categorizado', label: 'No categorizado' },
];

type ArcaConfig = {
  id?: number;
  cuit?: string;
  razon_social?: string;
  condicion_iva?: string;
  domicilio_fiscal?: string;
  provincia?: string;
  localidad?: string;
  codigo_postal?: string;
  ambiente?: 'homologacion' | 'produccion';
  permitir_sin_entrega?: boolean;
  permitir_sin_pago?: boolean;
  precios_incluyen_iva?: boolean;
  has_certificado?: boolean;
  has_clave_privada?: boolean;
  certificado_vto?: string | null;
  certificado_nombre_archivo?: string | null;
  p12_subido_en?: string | null;
  default_tipo_comprobante?: 'A' | 'B' | 'C' | null;
  alicuotas_iva?: number[];
};

type PuntoVenta = {
  id: number;
  punto_venta: number;
  nombre?: string | null;
  activo?: number | boolean;
};

type DepositoRow = {
  id: number;
  nombre: string;
  codigo?: string | null;
  punto_venta_id?: number | null;
  punto_venta?: number | null;
  punto_venta_nombre?: string | null;
};

async function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsText(file);
  });
}

function parseAliquotas(values: string[]) {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

export default function Arca() {
  const [config, setConfig] = useState<ArcaConfig | null>(null);
  const [configForm, setConfigForm] = useState({
    cuit: '',
    razon_social: '',
    condicion_iva: '',
    domicilio_fiscal: '',
    provincia: '',
    localidad: '',
    codigo_postal: '',
    ambiente: 'homologacion' as 'homologacion' | 'produccion',
    permitir_sin_entrega: false,
    permitir_sin_pago: false,
    precios_incluyen_iva: true,
    default_tipo_comprobante: 'B' as 'A' | 'B' | 'C',
    alicuotas_iva: ['21'],
    certificado_pem: '',
    clave_privada_pem: '',
    passphrase: '',
  });
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);
  const [p12File, setP12File] = useState<File | null>(null);
  const [p12Uploading, setP12Uploading] = useState(false);
  const [p12Error, setP12Error] = useState<string | null>(null);
  const [p12Success, setP12Success] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [libroMes, setLibroMes] = useState(new Date().toISOString().slice(0, 7));
  const [libroLoading, setLibroLoading] = useState(false);
  const [libroError, setLibroError] = useState<string | null>(null);
  const [libroResult, setLibroResult] = useState<any | null>(null);

  const [puntosVenta, setPuntosVenta] = useState<PuntoVenta[]>([]);
  const [depositos, setDepositos] = useState<DepositoRow[]>([]);
  const [pvForm, setPvForm] = useState({ punto_venta: '', nombre: '' });
  const [pvSaving, setPvSaving] = useState(false);
  const [pvError, setPvError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [cfg, pvs, deps] = await Promise.all([
          Api.arcaConfig().catch(() => null),
          Api.arcaPuntosVenta().catch(() => []),
          Api.arcaDepositos().catch(() => []),
        ]);
        if (cfg) {
          setConfig(cfg as ArcaConfig);
          setConfigForm((prev) => ({
            ...prev,
            cuit: (cfg as any).cuit || '',
            razon_social: (cfg as any).razon_social || '',
            condicion_iva: (cfg as any).condicion_iva || '',
            domicilio_fiscal: (cfg as any).domicilio_fiscal || '',
            provincia: (cfg as any).provincia || '',
            localidad: (cfg as any).localidad || '',
            codigo_postal: (cfg as any).codigo_postal || '',
            ambiente: (cfg as any).ambiente || 'homologacion',
            permitir_sin_entrega: Boolean((cfg as any).permitir_sin_entrega),
            permitir_sin_pago: Boolean((cfg as any).permitir_sin_pago),
            precios_incluyen_iva: (cfg as any).precios_incluyen_iva !== undefined
              ? Boolean((cfg as any).precios_incluyen_iva)
              : true,
            default_tipo_comprobante: (cfg as any).default_tipo_comprobante || 'B',
            alicuotas_iva: Array.isArray((cfg as any).alicuotas_iva) && (cfg as any).alicuotas_iva.length
              ? (cfg as any).alicuotas_iva.map((value: number) => String(value))
              : ['21'],
          }));
        }
        setPuntosVenta(pvs as PuntoVenta[]);
        setDepositos(deps as DepositoRow[]);
      } catch (e) {
        // fallback silencioso
      }
    }
    load();
  }, []);

  const pvOptions = useMemo(() => {
    return puntosVenta.map((pv) => ({
      value: pv.id,
      label: `${String(pv.punto_venta).padStart(4, '0')} ${pv.nombre ? `- ${pv.nombre}` : ''}`.trim(),
    }));
  }, [puntosVenta]);

  async function saveConfig() {
    setConfigError(null);
    setConfigSuccess(null);
    setConfigSaving(true);
    try {
      const payload: any = {
        cuit: configForm.cuit,
        razon_social: configForm.razon_social,
        condicion_iva: configForm.condicion_iva,
        domicilio_fiscal: configForm.domicilio_fiscal,
        provincia: configForm.provincia,
        localidad: configForm.localidad,
        codigo_postal: configForm.codigo_postal,
        ambiente: configForm.ambiente,
        permitir_sin_entrega: configForm.permitir_sin_entrega,
        permitir_sin_pago: configForm.permitir_sin_pago,
        precios_incluyen_iva: configForm.precios_incluyen_iva,
        default_tipo_comprobante: configForm.default_tipo_comprobante,
        alicuotas_iva: parseAliquotas(configForm.alicuotas_iva),
      };
      if (configForm.certificado_pem.trim()) payload.certificado_pem = configForm.certificado_pem;
      if (configForm.clave_privada_pem.trim()) payload.clave_privada_pem = configForm.clave_privada_pem;
      if (configForm.passphrase.trim()) payload.passphrase = configForm.passphrase;
      const saved = await Api.arcaSaveConfig(payload);
      setConfig(saved as ArcaConfig);
      setConfigSuccess('Configuración guardada');
      setConfigForm((prev) => ({
        ...prev,
        certificado_pem: '',
        clave_privada_pem: '',
        passphrase: '',
      }));
    } catch (e: any) {
      setConfigError(e?.message || 'No se pudo guardar configuración');
    } finally {
      setConfigSaving(false);
    }
  }

  async function testConexion() {
    setTestError(null);
    setTestResult(null);
    setTestLoading(true);
    try {
      const res = await Api.arcaTest();
      setTestResult(res);
    } catch (e: any) {
      setTestError(e?.message || 'No se pudo probar conexión');
    } finally {
      setTestLoading(false);
    }
  }

  async function uploadP12() {
    if (!p12File) {
      setP12Error('Seleccioná un archivo .p12 o .pfx.');
      return;
    }
    setP12Error(null);
    setP12Success(null);
    setP12Uploading(true);
    try {
      const saved = await Api.arcaUploadP12(p12File, configForm.passphrase || '');
      setConfig(saved as ArcaConfig);
      setP12Success('Certificado importado correctamente desde .p12');
      setP12File(null);
    } catch (e: any) {
      setP12Error(e?.message || 'No se pudo importar el certificado .p12');
    } finally {
      setP12Uploading(false);
    }
  }

  async function cargarLibroIva() {
    setLibroError(null);
    setLibroLoading(true);
    try {
      const data = await Api.libroIvaDigital({
        mes: libroMes,
        tipo: 'ventas',
        format: 'json',
      });
      setLibroResult(data);
    } catch (e: any) {
      setLibroError(e?.message || 'No se pudo consultar el libro IVA');
      setLibroResult(null);
    } finally {
      setLibroLoading(false);
    }
  }

  async function descargarLibroIva(format: 'csv' | 'xlsx') {
    setLibroError(null);
    setLibroLoading(true);
    try {
      const blob = await Api.libroIvaDigital({
        mes: libroMes,
        tipo: 'ventas',
        format,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `libro-iva-ventas-${libroMes}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch (e: any) {
      setLibroError(e?.message || 'No se pudo descargar el libro IVA');
    } finally {
      setLibroLoading(false);
    }
  }

  async function crearPuntoVenta() {
    setPvError(null);
    const pvNum = Number(pvForm.punto_venta);
    if (!Number.isFinite(pvNum) || pvNum <= 0) {
      setPvError('Punto de venta inválido');
      return;
    }
    setPvSaving(true);
    try {
      await Api.arcaCrearPuntoVenta({ punto_venta: pvNum, nombre: pvForm.nombre || undefined });
      const updated = await Api.arcaPuntosVenta();
      setPuntosVenta(updated as PuntoVenta[]);
      setPvForm({ punto_venta: '', nombre: '' });
    } catch (e: any) {
      setPvError(e?.message || 'No se pudo crear punto de venta');
    } finally {
      setPvSaving(false);
    }
  }

  async function eliminarPuntoVenta(id: number) {
    if (!window.confirm('Eliminar punto de venta?')) return;
    try {
      await Api.arcaEliminarPuntoVenta(id);
      const updated = await Api.arcaPuntosVenta();
      setPuntosVenta(updated as PuntoVenta[]);
    } catch (e: any) {
      setPvError(e?.message || 'No se pudo eliminar punto de venta');
    }
  }

  async function asignarDeposito(depositoId: number, puntoVentaId: number) {
    try {
      await Api.arcaAsignarDeposito({ deposito_id: depositoId, punto_venta_id: puntoVentaId });
      const deps = await Api.arcaDepositos();
      setDepositos(deps as DepositoRow[]);
    } catch (e: any) {
      setPvError(e?.message || 'No se pudo asignar depósito');
    }
  }

  return (
    <div className="space-y-6">
      <ChartCard title="ARCA - Configuración">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="text-sm">
              <div className="text-slate-400 mb-1">CUIT</div>
              <input
                className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                value={configForm.cuit}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, cuit: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <div className="text-slate-400 mb-1">Razón social</div>
              <input
                className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                value={configForm.razon_social}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, razon_social: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <div className="text-slate-400 mb-1">Condición IVA</div>
              <select
                className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                value={configForm.condicion_iva}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, condicion_iva: e.target.value }))}
              >
                <option value="">Seleccionar...</option>
                {IVA_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <div className="text-slate-400 mb-1">Domicilio fiscal</div>
              <input
                className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                value={configForm.domicilio_fiscal}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, domicilio_fiscal: e.target.value }))}
              />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <label className="text-sm">
                <div className="text-slate-400 mb-1">Provincia</div>
                <input
                  className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                  value={configForm.provincia}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, provincia: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <div className="text-slate-400 mb-1">Localidad</div>
                <input
                  className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                  value={configForm.localidad}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, localidad: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <div className="text-slate-400 mb-1">Código postal</div>
                <input
                  className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                  value={configForm.codigo_postal}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, codigo_postal: e.target.value }))}
                />
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm">
              <div className="text-slate-400 mb-1">Ambiente</div>
              <select
                className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                value={configForm.ambiente}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, ambiente: e.target.value as any }))}
              >
                <option value="homologacion">Homologación</option>
                <option value="produccion">Producción</option>
              </select>
            </label>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="rounded border-white/20"
                  checked={configForm.permitir_sin_entrega}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, permitir_sin_entrega: e.target.checked }))}
                />
                Permitir facturar sin entrega
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="rounded border-white/20"
                  checked={configForm.permitir_sin_pago}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, permitir_sin_pago: e.target.checked }))}
                />
                Permitir facturar sin pago
              </label>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="rounded border-white/20"
                  checked={configForm.precios_incluyen_iva}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, precios_incluyen_iva: e.target.checked }))}
                />
                Precios incluyen IVA
              </label>
            </div>
            <label className="text-sm">
              <div className="text-slate-400 mb-1">Tipo de comprobante por defecto</div>
              <select
                className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                value={configForm.default_tipo_comprobante}
                onChange={(e) =>
                  setConfigForm((prev) => ({
                    ...prev,
                    default_tipo_comprobante: e.target.value as 'A' | 'B' | 'C',
                  }))
                }
              >
                <option value="A">Factura A</option>
                <option value="B">Factura B</option>
                <option value="C">Factura C</option>
              </select>
            </label>
            <div className="space-y-2">
              <div className="text-sm text-slate-400">Alicuotas de IVA habilitadas</div>
              <div className="flex flex-wrap gap-3 text-sm text-slate-300">
                {[10.5, 21, 27, 0].map((iva) => {
                  const label = iva === 0 ? 'Exento' : `${String(iva).replace('.', ',')}%`;
                  const checked = configForm.alicuotas_iva.includes(String(iva));
                  return (
                    <label key={iva} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="rounded border-white/20"
                        checked={checked}
                        onChange={(e) => {
                          setConfigForm((prev) => ({
                            ...prev,
                            alicuotas_iva: e.target.checked
                              ? [...prev.alicuotas_iva, String(iva)]
                              : prev.alicuotas_iva.filter((item) => item !== String(iva)),
                          }));
                        }}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="text-xs text-slate-400">
              Certificado cargado: {config?.has_certificado ? 'Sí' : 'No'} · Clave privada: {config?.has_clave_privada ? 'Sí' : 'No'}
              {config?.certificado_vto ? ` (Vto ${config.certificado_vto})` : ''}
            </div>
            <div className="text-xs text-slate-400">
              Archivo .p12: {config?.certificado_nombre_archivo || 'No cargado'}
              {config?.p12_subido_en ? ` · Subido ${new Date(config.p12_subido_en).toLocaleString('es-AR')}` : ''}
            </div>
            <label className="text-sm">
              <div className="text-slate-400 mb-1">Certificado (.pem/.crt)</div>
              <input
                type="file"
                className="text-xs text-slate-300"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const text = await readFileText(file);
                  setConfigForm((prev) => ({ ...prev, certificado_pem: text }));
                }}
              />
              <textarea
                className="mt-1 w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                rows={4}
                placeholder="Pegá el certificado si preferís"
                value={configForm.certificado_pem}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, certificado_pem: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <div className="text-slate-400 mb-1">Clave privada (.key/.pem)</div>
              <input
                type="file"
                className="text-xs text-slate-300"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const text = await readFileText(file);
                  setConfigForm((prev) => ({ ...prev, clave_privada_pem: text }));
                }}
              />
              <textarea
                className="mt-1 w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-xs"
                rows={4}
                placeholder="Pegá la clave privada si preferís"
                value={configForm.clave_privada_pem}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, clave_privada_pem: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              <div className="text-slate-400 mb-1">Passphrase (si aplica)</div>
              <input
                type="password"
                className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                value={configForm.passphrase}
                onChange={(e) => setConfigForm((prev) => ({ ...prev, passphrase: e.target.value }))}
              />
            </label>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
              <div className="text-sm font-medium text-slate-100">Importar certificado .p12 / .pfx</div>
              <div className="text-xs text-slate-400">
                Extrae certificado y clave privada para usarlos en emisión automática.
              </div>
              <input
                type="file"
                accept=".p12,.pfx,application/x-pkcs12"
                className="text-xs text-slate-300"
                onChange={(e) => setP12File(e.target.files?.[0] || null)}
              />
              {p12Error && <div className="text-xs text-rose-300">{p12Error}</div>}
              {p12Success && <div className="text-xs text-emerald-300">{p12Success}</div>}
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-cyan-500/20 border border-cyan-500/30 hover:bg-cyan-500/30 text-cyan-200 text-sm"
                onClick={uploadP12}
                disabled={p12Uploading}
              >
                {p12Uploading ? 'Importando...' : 'Subir .p12'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-200 text-sm"
            onClick={saveConfig}
            disabled={configSaving}
          >
            {configSaving ? 'Guardando...' : 'Guardar configuración'}
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-white/10 border border-white/20 hover:bg-white/20 text-slate-200 text-sm"
            onClick={testConexion}
            disabled={testLoading}
          >
            {testLoading ? 'Probando...' : 'Probar conexión'}
          </button>
          {configError && <span className="text-sm text-rose-300">{configError}</span>}
          {configSuccess && <span className="text-sm text-emerald-300">{configSuccess}</span>}
        </div>
        {testError && <div className="mt-2 text-sm text-rose-300">{testError}</div>}
        {testResult && (
          <div className="mt-2 text-xs text-slate-300">
            Token expira: {testResult.token_expires || '-'}
            <div>Dummy: App {testResult?.dummy?.appServer} | DB {testResult?.dummy?.dbServer} | Auth {testResult?.dummy?.authServer}</div>
          </div>
        )}
      </ChartCard>

      <ChartCard title="ARCA - Puntos de venta">
        {pvError && <div className="text-sm text-rose-300 mb-2">{pvError}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
          <input
            className="input-modern text-sm"
            placeholder="Punto de venta (ej: 1)"
            value={pvForm.punto_venta}
            onChange={(e) => setPvForm((prev) => ({ ...prev, punto_venta: e.target.value }))}
          />
          <input
            className="input-modern text-sm"
            placeholder="Nombre / sucursal"
            value={pvForm.nombre}
            onChange={(e) => setPvForm((prev) => ({ ...prev, nombre: e.target.value }))}
          />
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-200 text-sm"
            onClick={crearPuntoVenta}
            disabled={pvSaving}
          >
            {pvSaving ? 'Guardando...' : 'Agregar PV'}
          </button>
        </div>
        <div className="overflow-x-auto text-sm">
          <table className="min-w-full">
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-2 pr-3">PV</th>
                <th className="py-2 pr-3">Nombre</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {puntosVenta.map((pv) => (
                <tr key={pv.id} className="border-t border-white/10">
                  <td className="py-2 pr-3">{String(pv.punto_venta).padStart(4, '0')}</td>
                  <td className="py-2 pr-3">{pv.nombre || '-'}</td>
                  <td className="py-2 pr-3">{pv.activo ? 'Activo' : 'Inactivo'}</td>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/30 hover:bg-rose-500/30 text-rose-200 text-xs"
                      onClick={() => eliminarPuntoVenta(pv.id)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {!puntosVenta.length && (
                <tr><td className="py-2 text-slate-400" colSpan={4}>Sin puntos de venta</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <ChartCard title="ARCA - Asignar PV a depósitos">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {depositos.map((dep) => (
            <div key={dep.id} className="p-3 rounded border border-white/10 bg-white/5">
              <div className="text-sm text-slate-200 font-medium">{dep.nombre}</div>
              <div className="text-xs text-slate-400">{dep.codigo || 'Sin código'}</div>
              <div className="mt-2">
                <select
                  className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                  value={dep.punto_venta_id || ''}
                  onChange={(e) => {
                    const pvId = e.target.value ? Number(e.target.value) : 0;
                    if (pvId) asignarDeposito(dep.id, pvId);
                  }}
                >
                  <option value="">Seleccionar PV...</option>
                  {pvOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          {!depositos.length && <div className="text-slate-400">Sin depósitos disponibles.</div>}
        </div>
      </ChartCard>

      <ChartCard title="ARCA - Libro IVA Digital">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
          <div className="space-y-3">
            <label className="text-sm">
              <div className="text-slate-400 mb-1">Mes</div>
              <input
                type="month"
                className="w-full bg-white/10 border border-white/10 rounded px-2 py-1 text-sm"
                value={libroMes}
                onChange={(e) => setLibroMes(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-200 text-sm"
                onClick={cargarLibroIva}
                disabled={libroLoading}
              >
                {libroLoading ? 'Consultando...' : 'Ver resumen'}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-white/10 border border-white/20 hover:bg-white/20 text-slate-200 text-sm"
                onClick={() => void descargarLibroIva('csv')}
                disabled={libroLoading}
              >
                CSV
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-white/10 border border-white/20 hover:bg-white/20 text-slate-200 text-sm"
                onClick={() => void descargarLibroIva('xlsx')}
                disabled={libroLoading}
              >
                Excel
              </button>
            </div>
            {libroError && <div className="text-sm text-rose-300">{libroError}</div>}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            {!libroResult ? (
              <div className="text-sm text-slate-400">
                Consultá el período para ver resumen de comprobantes, neto gravado, IVA y total.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Comprobantes</div>
                    <div className="text-lg font-semibold text-slate-100">
                      {Number(libroResult?.summary?.comprobantes || 0)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Neto gravado</div>
                    <div className="text-lg font-semibold text-slate-100">
                      ${Number(libroResult?.summary?.neto_gravado || 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">IVA total</div>
                    <div className="text-lg font-semibold text-slate-100">
                      ${(
                        Number(libroResult?.summary?.iva_10_5 || 0) +
                        Number(libroResult?.summary?.iva_21 || 0) +
                        Number(libroResult?.summary?.iva_27 || 0)
                      ).toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Importe total</div>
                    <div className="text-lg font-semibold text-slate-100">
                      ${Number(libroResult?.summary?.total || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="text-left text-slate-400">
                      <tr>
                        <th className="py-2 pr-3">Fecha</th>
                        <th className="py-2 pr-3">Comprobante</th>
                        <th className="py-2 pr-3">Cliente</th>
                        <th className="py-2 pr-3">Neto</th>
                        <th className="py-2 pr-3">IVA</th>
                        <th className="py-2 pr-3">Total</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-200">
                      {(Array.isArray(libroResult?.items) ? libroResult.items : []).slice(0, 20).map((item: any, index: number) => (
                        <tr key={`libro-item-${index}`} className="border-t border-white/10">
                          <td className="py-2 pr-3">{item?.fecha || '-'}</td>
                          <td className="py-2 pr-3">
                            {item?.tipo || '-'} {item?.punto_venta || '-'}-{item?.numero || '-'}
                          </td>
                          <td className="py-2 pr-3">{item?.cliente || '-'}</td>
                          <td className="py-2 pr-3">${Number(item?.neto_gravado || 0).toFixed(2)}</td>
                          <td className="py-2 pr-3">
                            ${(
                              Number(item?.iva_10_5 || 0) +
                              Number(item?.iva_21 || 0) +
                              Number(item?.iva_27 || 0)
                            ).toFixed(2)}
                          </td>
                          <td className="py-2 pr-3">${Number(item?.total || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </ChartCard>
    </div>
  );
}


