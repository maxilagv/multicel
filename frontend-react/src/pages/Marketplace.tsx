import { useEffect, useState } from 'react';
import ChartCard from '../ui/ChartCard';
import DataTable from '../ui/DataTable';
import Button from '../ui/Button';
import Alert from '../components/Alert';
import { Api } from '../lib/api';

type Pyme = {
  id: number;
  nombre: string;
  rubro?: string | null;
  contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  localidad?: string | null;
  provincia?: string | null;
  activo: boolean | number;
};

type Alianza = {
  id: number;
  pyme_id: number;
  pyme_nombre?: string | null;
  nombre?: string | null;
  estado: string;
  comision_tipo: 'porcentaje' | 'monto';
  comision_valor: number;
  beneficio_tipo: 'porcentaje' | 'monto';
  beneficio_valor: number;
  limite_usos: number;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
  activo: boolean | number;
};

type Referido = {
  id: number;
  alianza_id: number;
  alianza_nombre?: string | null;
  codigo: string;
  estado: string;
  max_usos: number;
  usos_actuales: number;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
};

type Oferta = {
  id: number;
  alianza_id: number;
  nombre: string;
  descripcion?: string | null;
  precio_fijo?: number | null;
  activo: boolean | number;
};

type ReporteAlianza = {
  alianza_id: number;
  alianza_nombre?: string | null;
  pyme_id: number;
  pyme_nombre?: string | null;
  usos: number;
  total_venta: number;
  descuento_total: number;
  comision_total: number;
};

const emptyPymeForm = {
  nombre: '',
  rubro: '',
  contacto: '',
  telefono: '',
  email: '',
  localidad: '',
  provincia: '',
  notas: '',
};

const emptyAlianzaForm = {
  pyme_id: '',
  nombre: '',
  estado: 'activa',
  comision_tipo: 'porcentaje',
  comision_valor: '0',
  beneficio_tipo: 'porcentaje',
  beneficio_valor: '0',
  limite_usos: '',
  vigencia_desde: '',
  vigencia_hasta: '',
  notas: '',
};

const emptyReferidoForm = {
  alianza_id: '',
  codigo: '',
  estado: 'activo',
  max_usos: '',
  vigencia_desde: '',
  vigencia_hasta: '',
  beneficio_tipo: '',
  beneficio_valor: '',
  notas: '',
};

const emptyOfertaForm = {
  nombre: '',
  descripcion: '',
  precio_fijo: '',
};

export default function Marketplace() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pymes, setPymes] = useState<Pyme[]>([]);
  const [alianzas, setAlianzas] = useState<Alianza[]>([]);
  const [referidos, setReferidos] = useState<Referido[]>([]);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [reportes, setReportes] = useState<ReporteAlianza[]>([]);

  const [showPymeForm, setShowPymeForm] = useState(false);
  const [pymeForm, setPymeForm] = useState({ ...emptyPymeForm });
  const [pymeError, setPymeError] = useState<string | null>(null);

  const [showAlianzaForm, setShowAlianzaForm] = useState(false);
  const [alianzaForm, setAlianzaForm] = useState({ ...emptyAlianzaForm });
  const [alianzaError, setAlianzaError] = useState<string | null>(null);

  const [showReferidoForm, setShowReferidoForm] = useState(false);
  const [referidoForm, setReferidoForm] = useState({ ...emptyReferidoForm });
  const [referidoError, setReferidoError] = useState<string | null>(null);

  const [selectedAlianzaId, setSelectedAlianzaId] = useState<number | ''>('');
  const [ofertaForm, setOfertaForm] = useState({ ...emptyOfertaForm });
  const [ofertaError, setOfertaError] = useState<string | null>(null);

  const [reportDesde, setReportDesde] = useState('');
  const [reportHasta, setReportHasta] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);

  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncWarnings, setSyncWarnings] = useState<string[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function loadBase() {
    setLoading(true);
    setError(null);
    try {
      const [p, a, r] = await Promise.all([
        Api.marketplacePymes({ limit: 200 }),
        Api.marketplaceAlianzas({ limit: 200 }),
        Api.marketplaceReferidos({ limit: 200 }),
      ]);
      setPymes(p || []);
      setAlianzas(a || []);
      setReferidos(r || []);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar datos de marketplace');
    } finally {
      setLoading(false);
    }
  }

  async function loadOfertas(targetAlianzaId?: number | '') {
    if (!targetAlianzaId) {
      setOfertas([]);
      return;
    }
    try {
      const rows = await Api.marketplaceOfertas(Number(targetAlianzaId));
      setOfertas(rows || []);
    } catch (e: any) {
      setOfertas([]);
    }
  }

  async function loadReportes() {
    setReportError(null);
    try {
      const rows = await Api.marketplaceReporteAlianzas({
        desde: reportDesde ? new Date(reportDesde).toISOString().slice(0, 10) : undefined,
        hasta: reportHasta ? new Date(reportHasta).toISOString().slice(0, 10) : undefined,
      });
      setReportes(rows || []);
    } catch (e: any) {
      setReportError(e?.message || 'No se pudieron cargar reportes');
    }
  }

  useEffect(() => {
    loadBase();
  }, []);

  useEffect(() => {
    loadOfertas(selectedAlianzaId);
  }, [selectedAlianzaId]);

  async function crearPyme() {
    setPymeError(null);
    if (!pymeForm.nombre.trim()) {
      setPymeError('El nombre es obligatorio');
      return;
    }
    try {
      await Api.marketplaceCrearPyme({
        ...pymeForm,
        nombre: pymeForm.nombre.trim(),
      });
      setPymeForm({ ...emptyPymeForm });
      setShowPymeForm(false);
      await loadBase();
    } catch (e: any) {
      setPymeError(e?.message || 'No se pudo crear la pyme');
    }
  }

  async function togglePyme(p: Pyme) {
    try {
      await Api.marketplaceActualizarPyme(p.id, { activo: !p.activo });
      await loadBase();
    } catch (e: any) {
      setError(e?.message || 'No se pudo actualizar la pyme');
    }
  }

  async function crearAlianza() {
    setAlianzaError(null);
    if (!alianzaForm.pyme_id) {
      setAlianzaError('Selecciona una pyme');
      return;
    }
    try {
      const body: any = {
        pyme_id: Number(alianzaForm.pyme_id),
        nombre: alianzaForm.nombre.trim() || undefined,
        estado: alianzaForm.estado,
        comision_tipo: alianzaForm.comision_tipo,
        comision_valor: Number(alianzaForm.comision_valor || 0),
        beneficio_tipo: alianzaForm.beneficio_tipo,
        beneficio_valor: Number(alianzaForm.beneficio_valor || 0),
        limite_usos: alianzaForm.limite_usos ? Number(alianzaForm.limite_usos) : 0,
        vigencia_desde: alianzaForm.vigencia_desde ? new Date(alianzaForm.vigencia_desde).toISOString() : undefined,
        vigencia_hasta: alianzaForm.vigencia_hasta ? new Date(alianzaForm.vigencia_hasta).toISOString() : undefined,
        notas: alianzaForm.notas.trim() || undefined,
      };
      await Api.marketplaceCrearAlianza(body);
      setAlianzaForm({ ...emptyAlianzaForm });
      setShowAlianzaForm(false);
      await loadBase();
    } catch (e: any) {
      setAlianzaError(e?.message || 'No se pudo crear la alianza');
    }
  }

  async function setAlianzaEstado(a: Alianza, estado: string) {
    try {
      await Api.marketplaceActualizarAlianza(a.id, { estado });
      await loadBase();
    } catch (e: any) {
      setError(e?.message || 'No se pudo actualizar la alianza');
    }
  }

  async function crearReferido() {
    setReferidoError(null);
    if (!referidoForm.alianza_id) {
      setReferidoError('Selecciona una alianza');
      return;
    }
    try {
      const body: any = {
        alianza_id: Number(referidoForm.alianza_id),
        codigo: referidoForm.codigo.trim() || undefined,
        estado: referidoForm.estado,
        max_usos: referidoForm.max_usos ? Number(referidoForm.max_usos) : 0,
        vigencia_desde: referidoForm.vigencia_desde ? new Date(referidoForm.vigencia_desde).toISOString() : undefined,
        vigencia_hasta: referidoForm.vigencia_hasta ? new Date(referidoForm.vigencia_hasta).toISOString() : undefined,
        beneficio_tipo: referidoForm.beneficio_tipo || undefined,
        beneficio_valor: referidoForm.beneficio_valor ? Number(referidoForm.beneficio_valor) : undefined,
        notas: referidoForm.notas.trim() || undefined,
      };
      await Api.marketplaceCrearReferido(body);
      setReferidoForm({ ...emptyReferidoForm });
      setShowReferidoForm(false);
      await loadBase();
    } catch (e: any) {
      setReferidoError(e?.message || 'No se pudo crear el referido');
    }
  }

  async function toggleReferido(r: Referido) {
    try {
      const nuevoEstado = r.estado === 'activo' ? 'inactivo' : 'activo';
      await Api.marketplaceActualizarReferido(r.id, { estado: nuevoEstado });
      await loadBase();
    } catch (e: any) {
      setError(e?.message || 'No se pudo actualizar el referido');
    }
  }

  async function crearOferta() {
    setOfertaError(null);
    if (!selectedAlianzaId) {
      setOfertaError('Selecciona una alianza');
      return;
    }
    if (!ofertaForm.nombre.trim()) {
      setOfertaError('El nombre de la oferta es obligatorio');
      return;
    }
    try {
      await Api.marketplaceCrearOferta(Number(selectedAlianzaId), {
        nombre: ofertaForm.nombre.trim(),
        descripcion: ofertaForm.descripcion.trim() || undefined,
        precio_fijo: ofertaForm.precio_fijo ? Number(ofertaForm.precio_fijo) : undefined,
      });
      setOfertaForm({ ...emptyOfertaForm });
      await loadOfertas(selectedAlianzaId);
    } catch (e: any) {
      setOfertaError(e?.message || 'No se pudo crear la oferta');
    }
  }

  async function toggleOferta(o: Oferta) {
    try {
      await Api.marketplaceActualizarOferta(o.id, { activo: !o.activo });
      await loadOfertas(selectedAlianzaId);
    } catch (e: any) {
      setOfertaError(e?.message || 'No se pudo actualizar la oferta');
    }
  }

  async function exportSync() {
    setSyncError(null);
    setSyncMsg(null);
    setSyncWarnings([]);
    try {
      const payload = await Api.marketplaceSyncExport();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `marketplace-sync-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSyncMsg('Exportación generada.');
    } catch (e: any) {
      setSyncError(e?.message || 'No se pudo exportar');
    }
  }

  async function importSync(file?: File | null) {
    if (!file) return;
    setSyncError(null);
    setSyncMsg(null);
    setSyncWarnings([]);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const result = await Api.marketplaceSyncImport(payload);
      const warnings = (result?.warnings || []).map((w: any) => w.message || String(w));
      setSyncWarnings(warnings);
      setSyncMsg('Importación completada.');
      await loadBase();
    } catch (e: any) {
      setSyncError(e?.message || 'No se pudo importar');
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert kind="error" message={error} />}

      <ChartCard
        title="Pymes aliadas"
        right={
          <button
            onClick={() => setShowPymeForm((s) => !s)}
            className="px-3 py-1.5 rounded bg-primary-500/20 border border-primary-500/30 hover:bg-primary-500/30 text-primary-200 text-sm"
          >
            {showPymeForm ? 'Cancelar' : 'Nueva pyme'}
          </button>
        }
      >
        {showPymeForm && (
          <div className="mb-4 p-3 rounded-lg border border-white/10 bg-white/5">
            {pymeError && <Alert kind="error" message={pymeError} />}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
              <input className="input-modern" placeholder="Nombre" value={pymeForm.nombre} onChange={(e) => setPymeForm({ ...pymeForm, nombre: e.target.value })} />
              <input className="input-modern" placeholder="Rubro" value={pymeForm.rubro} onChange={(e) => setPymeForm({ ...pymeForm, rubro: e.target.value })} />
              <input className="input-modern" placeholder="Contacto" value={pymeForm.contacto} onChange={(e) => setPymeForm({ ...pymeForm, contacto: e.target.value })} />
              <input className="input-modern" placeholder="Teléfono" value={pymeForm.telefono} onChange={(e) => setPymeForm({ ...pymeForm, telefono: e.target.value })} />
              <input className="input-modern" placeholder="Email" value={pymeForm.email} onChange={(e) => setPymeForm({ ...pymeForm, email: e.target.value })} />
              <input className="input-modern" placeholder="Localidad" value={pymeForm.localidad} onChange={(e) => setPymeForm({ ...pymeForm, localidad: e.target.value })} />
              <input className="input-modern" placeholder="Provincia" value={pymeForm.provincia} onChange={(e) => setPymeForm({ ...pymeForm, provincia: e.target.value })} />
              <input className="input-modern md:col-span-2" placeholder="Notas" value={pymeForm.notas} onChange={(e) => setPymeForm({ ...pymeForm, notas: e.target.value })} />
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={crearPyme}>Crear</Button>
            </div>
          </div>
        )}
        <DataTable
          headers={
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-2 px-2">Nombre</th>
                <th className="py-2 px-2">Rubro</th>
                <th className="py-2 px-2">Contacto</th>
                <th className="py-2 px-2">Teléfono</th>
                <th className="py-2 px-2">Estado</th>
                <th className="py-2 px-2">Acciones</th>
              </tr>
            </thead>
          }
        >
          <tbody className="text-slate-200">
            {(loading ? [] : pymes).map((p) => (
              <tr key={p.id} className="border-t border-white/10 hover:bg-white/5">
                <td className="py-2 px-2">{p.nombre}</td>
                <td className="py-2 px-2">{p.rubro || '-'}</td>
                <td className="py-2 px-2">{p.contacto || '-'}</td>
                <td className="py-2 px-2">{p.telefono || '-'}</td>
                <td className="py-2 px-2">{p.activo ? 'Activa' : 'Inactiva'}</td>
                <td className="py-2 px-2">
                  <button
                    onClick={() => togglePyme(p)}
                    className="px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20 text-xs text-slate-200"
                  >
                    {p.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && pymes.length === 0 && (
              <tr>
                <td className="py-3 px-2 text-slate-400" colSpan={6}>
                  Sin pymes registradas
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </ChartCard>

      <ChartCard
        title="Alianzas"
        right={
          <button
            onClick={() => setShowAlianzaForm((s) => !s)}
            className="px-3 py-1.5 rounded bg-primary-500/20 border border-primary-500/30 hover:bg-primary-500/30 text-primary-200 text-sm"
          >
            {showAlianzaForm ? 'Cancelar' : 'Nueva alianza'}
          </button>
        }
      >
        {showAlianzaForm && (
          <div className="mb-4 p-3 rounded-lg border border-white/10 bg-white/5">
            {alianzaError && <Alert kind="error" message={alianzaError} />}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
              <select className="input-modern" value={alianzaForm.pyme_id} onChange={(e) => setAlianzaForm({ ...alianzaForm, pyme_id: e.target.value })}>
                <option value="">Pyme</option>
                {pymes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <input className="input-modern md:col-span-2" placeholder="Nombre de alianza (opcional)" value={alianzaForm.nombre} onChange={(e) => setAlianzaForm({ ...alianzaForm, nombre: e.target.value })} />
              <select className="input-modern" value={alianzaForm.estado} onChange={(e) => setAlianzaForm({ ...alianzaForm, estado: e.target.value })}>
                <option value="activa">Activa</option>
                <option value="pausada">Pausada</option>
                <option value="vencida">Vencida</option>
              </select>
              <select className="input-modern" value={alianzaForm.comision_tipo} onChange={(e) => setAlianzaForm({ ...alianzaForm, comision_tipo: e.target.value })}>
                <option value="porcentaje">Comisión %</option>
                <option value="monto">Comisión $</option>
              </select>
              <input className="input-modern" type="number" step="0.01" placeholder="Comisión" value={alianzaForm.comision_valor} onChange={(e) => setAlianzaForm({ ...alianzaForm, comision_valor: e.target.value })} />
              <select className="input-modern" value={alianzaForm.beneficio_tipo} onChange={(e) => setAlianzaForm({ ...alianzaForm, beneficio_tipo: e.target.value })}>
                <option value="porcentaje">Beneficio %</option>
                <option value="monto">Beneficio $</option>
              </select>
              <input className="input-modern" type="number" step="0.01" placeholder="Beneficio" value={alianzaForm.beneficio_valor} onChange={(e) => setAlianzaForm({ ...alianzaForm, beneficio_valor: e.target.value })} />
              <input className="input-modern" type="number" placeholder="Límite de usos" value={alianzaForm.limite_usos} onChange={(e) => setAlianzaForm({ ...alianzaForm, limite_usos: e.target.value })} />
              <input className="input-modern" type="date" value={alianzaForm.vigencia_desde} onChange={(e) => setAlianzaForm({ ...alianzaForm, vigencia_desde: e.target.value })} />
              <input className="input-modern" type="date" value={alianzaForm.vigencia_hasta} onChange={(e) => setAlianzaForm({ ...alianzaForm, vigencia_hasta: e.target.value })} />
              <input className="input-modern md:col-span-2" placeholder="Notas" value={alianzaForm.notas} onChange={(e) => setAlianzaForm({ ...alianzaForm, notas: e.target.value })} />
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={crearAlianza}>Crear</Button>
            </div>
          </div>
        )}
        <DataTable
          headers={
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-2 px-2">Pyme</th>
                <th className="py-2 px-2">Nombre</th>
                <th className="py-2 px-2">Comisión</th>
                <th className="py-2 px-2">Beneficio</th>
                <th className="py-2 px-2">Estado</th>
                <th className="py-2 px-2">Acciones</th>
              </tr>
            </thead>
          }
        >
          <tbody className="text-slate-200">
            {(loading ? [] : alianzas).map((a) => (
              <tr key={a.id} className="border-t border-white/10 hover:bg-white/5">
                <td className="py-2 px-2">{a.pyme_nombre || '-'}</td>
                <td className="py-2 px-2">{a.nombre || '-'}</td>
                <td className="py-2 px-2">
                  {a.comision_tipo === 'monto' ? `$${a.comision_valor}` : `${a.comision_valor}%`}
                </td>
                <td className="py-2 px-2">
                  {a.beneficio_tipo === 'monto' ? `$${a.beneficio_valor}` : `${a.beneficio_valor}%`}
                </td>
                <td className="py-2 px-2">{a.estado}</td>
                <td className="py-2 px-2 space-x-2">
                  {a.estado !== 'activa' && (
                    <button
                      onClick={() => setAlianzaEstado(a, 'activa')}
                      className="px-2 py-1 rounded bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-xs text-emerald-200"
                    >
                      Activar
                    </button>
                  )}
                  {a.estado === 'activa' && (
                    <button
                      onClick={() => setAlianzaEstado(a, 'pausada')}
                      className="px-2 py-1 rounded bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 text-xs text-amber-200"
                    >
                      Pausar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && alianzas.length === 0 && (
              <tr>
                <td className="py-3 px-2 text-slate-400" colSpan={6}>
                  Sin alianzas registradas
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </ChartCard>

      <ChartCard
        title="Referidos"
        right={
          <button
            onClick={() => setShowReferidoForm((s) => !s)}
            className="px-3 py-1.5 rounded bg-primary-500/20 border border-primary-500/30 hover:bg-primary-500/30 text-primary-200 text-sm"
          >
            {showReferidoForm ? 'Cancelar' : 'Nuevo referido'}
          </button>
        }
      >
        {showReferidoForm && (
          <div className="mb-4 p-3 rounded-lg border border-white/10 bg-white/5">
            {referidoError && <Alert kind="error" message={referidoError} />}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
              <select className="input-modern" value={referidoForm.alianza_id} onChange={(e) => setReferidoForm({ ...referidoForm, alianza_id: e.target.value })}>
                <option value="">Alianza</option>
                {alianzas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre || `Alianza ${a.id}`} - {a.pyme_nombre || ''}
                  </option>
                ))}
              </select>
              <input className="input-modern" placeholder="Código (opcional)" value={referidoForm.codigo} onChange={(e) => setReferidoForm({ ...referidoForm, codigo: e.target.value })} />
              <select className="input-modern" value={referidoForm.estado} onChange={(e) => setReferidoForm({ ...referidoForm, estado: e.target.value })}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
              <input className="input-modern" type="number" placeholder="Max usos" value={referidoForm.max_usos} onChange={(e) => setReferidoForm({ ...referidoForm, max_usos: e.target.value })} />
              <input className="input-modern" type="date" value={referidoForm.vigencia_desde} onChange={(e) => setReferidoForm({ ...referidoForm, vigencia_desde: e.target.value })} />
              <input className="input-modern" type="date" value={referidoForm.vigencia_hasta} onChange={(e) => setReferidoForm({ ...referidoForm, vigencia_hasta: e.target.value })} />
              <select className="input-modern" value={referidoForm.beneficio_tipo} onChange={(e) => setReferidoForm({ ...referidoForm, beneficio_tipo: e.target.value })}>
                <option value="">Beneficio (opcional)</option>
                <option value="porcentaje">Porcentaje</option>
                <option value="monto">Monto fijo</option>
              </select>
              <input className="input-modern" type="number" step="0.01" placeholder="Valor beneficio" value={referidoForm.beneficio_valor} onChange={(e) => setReferidoForm({ ...referidoForm, beneficio_valor: e.target.value })} />
              <input className="input-modern md:col-span-2" placeholder="Notas" value={referidoForm.notas} onChange={(e) => setReferidoForm({ ...referidoForm, notas: e.target.value })} />
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={crearReferido}>Crear</Button>
            </div>
          </div>
        )}
        <DataTable
          headers={
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-2 px-2">Código</th>
                <th className="py-2 px-2">Alianza</th>
                <th className="py-2 px-2">Usos</th>
                <th className="py-2 px-2">Estado</th>
                <th className="py-2 px-2">Acciones</th>
              </tr>
            </thead>
          }
        >
          <tbody className="text-slate-200">
            {(loading ? [] : referidos).map((r) => (
              <tr key={r.id} className="border-t border-white/10 hover:bg-white/5">
                <td className="py-2 px-2 font-mono text-xs">{r.codigo}</td>
                <td className="py-2 px-2">{r.alianza_nombre || '-'}</td>
                <td className="py-2 px-2">{r.usos_actuales}/{r.max_usos || '∞'}</td>
                <td className="py-2 px-2">{r.estado}</td>
                <td className="py-2 px-2">
                  <button
                    onClick={() => toggleReferido(r)}
                    className="px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20 text-xs text-slate-200"
                  >
                    {r.estado === 'activo' ? 'Inactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && referidos.length === 0 && (
              <tr>
                <td className="py-3 px-2 text-slate-400" colSpan={5}>
                  Sin referidos
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </ChartCard>

      <ChartCard title="Ofertas / paquetes">
        {ofertaError && <Alert kind="error" message={ofertaError} />}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm mb-3">
          <select className="input-modern" value={selectedAlianzaId} onChange={(e) => setSelectedAlianzaId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Seleccionar alianza</option>
            {alianzas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre || `Alianza ${a.id}`} - {a.pyme_nombre || ''}
              </option>
            ))}
          </select>
          <input className="input-modern" placeholder="Nombre de oferta" value={ofertaForm.nombre} onChange={(e) => setOfertaForm({ ...ofertaForm, nombre: e.target.value })} />
          <input className="input-modern" placeholder="Descripción" value={ofertaForm.descripcion} onChange={(e) => setOfertaForm({ ...ofertaForm, descripcion: e.target.value })} />
          <input className="input-modern" type="number" step="0.01" placeholder="Precio fijo" value={ofertaForm.precio_fijo} onChange={(e) => setOfertaForm({ ...ofertaForm, precio_fijo: e.target.value })} />
        </div>
        <div className="mb-4 flex justify-end">
          <Button onClick={crearOferta}>Agregar oferta</Button>
        </div>
        <DataTable
          headers={
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-2 px-2">Nombre</th>
                <th className="py-2 px-2">Precio</th>
                <th className="py-2 px-2">Estado</th>
                <th className="py-2 px-2">Acciones</th>
              </tr>
            </thead>
          }
        >
          <tbody className="text-slate-200">
            {ofertas.map((o) => (
              <tr key={o.id} className="border-t border-white/10 hover:bg-white/5">
                <td className="py-2 px-2">{o.nombre}</td>
                <td className="py-2 px-2">{o.precio_fijo != null ? `$${Number(o.precio_fijo).toFixed(2)}` : '-'}</td>
                <td className="py-2 px-2">{o.activo ? 'Activa' : 'Inactiva'}</td>
                <td className="py-2 px-2">
                  <button
                    onClick={() => toggleOferta(o)}
                    className="px-2 py-1 rounded bg-white/10 border border-white/20 hover:bg-white/20 text-xs text-slate-200"
                  >
                    {o.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
            {!ofertas.length && (
              <tr>
                <td className="py-3 px-2 text-slate-400" colSpan={4}>
                  Sin ofertas para esta alianza
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </ChartCard>

      <ChartCard
        title="Reportes de alianzas"
        right={
          <button
            onClick={loadReportes}
            className="px-3 py-1.5 rounded bg-white/10 border border-white/20 hover:bg-white/20 text-sm text-slate-200"
          >
            Actualizar
          </button>
        }
      >
        {reportError && <Alert kind="error" message={reportError} />}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm mb-3">
          <input className="input-modern" type="date" value={reportDesde} onChange={(e) => setReportDesde(e.target.value)} />
          <input className="input-modern" type="date" value={reportHasta} onChange={(e) => setReportHasta(e.target.value)} />
        </div>
        <DataTable
          headers={
            <thead className="text-left text-slate-400">
              <tr>
                <th className="py-2 px-2">Pyme</th>
                <th className="py-2 px-2">Alianza</th>
                <th className="py-2 px-2">Usos</th>
                <th className="py-2 px-2">Venta total</th>
                <th className="py-2 px-2">Comisión</th>
              </tr>
            </thead>
          }
        >
          <tbody className="text-slate-200">
            {reportes.map((r) => (
              <tr key={r.alianza_id} className="border-t border-white/10 hover:bg-white/5">
                <td className="py-2 px-2">{r.pyme_nombre || '-'}</td>
                <td className="py-2 px-2">{r.alianza_nombre || '-'}</td>
                <td className="py-2 px-2">{r.usos}</td>
                <td className="py-2 px-2">${Number(r.total_venta || 0).toFixed(2)}</td>
                <td className="py-2 px-2">${Number(r.comision_total || 0).toFixed(2)}</td>
              </tr>
            ))}
            {!reportes.length && (
              <tr>
                <td className="py-3 px-2 text-slate-400" colSpan={5}>
                  Sin datos de reportes
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      </ChartCard>

      <ChartCard title="Sync offline">
        {(syncError || syncMsg) && (
          <div className="mb-3 space-y-2">
            {syncError && <Alert kind="error" message={syncError} />}
            {syncMsg && <Alert kind="info" message={syncMsg} />}
          </div>
        )}
        {syncWarnings.length > 0 && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs p-2 space-y-1">
            {syncWarnings.map((w, i) => (
              <div key={i}>- {w}</div>
            ))}
          </div>
        )}
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <button
            onClick={exportSync}
            className="px-3 py-1.5 rounded bg-primary-500/20 border border-primary-500/30 hover:bg-primary-500/30 text-primary-200 text-sm"
          >
            Exportar JSON
          </button>
          <label className="text-sm text-slate-300">
            <span className="mr-2">Importar JSON</span>
            <input
              type="file"
              accept="application/json"
              className="text-xs"
              onChange={(e) => importSync(e.target.files?.[0])}
            />
          </label>
        </div>
      </ChartCard>
    </div>
  );
}
