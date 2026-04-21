/**
 * Módulo de Medicina Laboral y ART
 * ────────────────────────────────
 * Gestión de carpetas de salud ocupacional:
 * Apertura → Informes por sector → PDF / Mail → Facturación
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen, Plus, Search, X, FileText, CheckCircle2, AlertTriangle,
  Mail, RefreshCw, DollarSign, Paperclip, ClipboardList, Building2,
  User, Calendar, Clock, Download, ChevronRight, Stethoscope, Eye,
  ReceiptText, History, BookOpen, ChevronDown,
} from 'lucide-react';
import { Api } from '../lib/api';
import { useToast } from '../context/ToastContext';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

type Cliente   = { id: number; nombre: string; apellido?: string | null; email?: string | null };
type TipoExamen = { id: number; nombre: string };
type Usuario   = { id: number; nombre: string };

type CarpetaResumen = {
  id: number;
  numero_carpeta: string;
  cliente_pagador_id: number;
  cliente_pagador_nombre: string;
  empleado_nombre: string;
  empleado_dni?: string | null;
  tipo_carpeta: string;
  tipo_examen_nombre?: string | null;
  estado: string;
  total_informes: number;
  informes_firmados: number;
  informes_pendientes: number;
};

type Informe = {
  id: number;
  sector_nombre: string;
  estado: string;
  profesional_id?: number | null;
  profesional_nombre?: string | null;
  resumen?: string | null;
  hallazgos?: string | null;
  aptitud_laboral?: string | null;
};

type Practica = {
  id: number;
  nomenclador_descripcion?: string | null;
  descripcion_manual?: string | null;
  cantidad: number;
  precio_unitario: number;
  facturado: boolean;
  facturado_venta_id?: number | null;
};

type Documento = {
  id: number;
  nombre_archivo: string;
  url_archivo: string;
  descripcion?: string | null;
};

type Evento = { id: number; detalle?: string | null; created_at: string };

type CarpetaDetalle = CarpetaResumen & {
  empleado_email?: string | null;
  fecha_apertura?: string | null;
  fecha_turno?: string | null;
  proximo_control_fecha?: string | null;
  resumen_clinico?: string | null;
  observaciones?: string | null;
  informes: Informe[];
  practicas: Practica[];
  documentos: Documento[];
  eventos: Evento[];
};

type Nomenclador = {
  id: number;
  cliente_pagador_id: number;
  cliente_pagador_nombre: string;
  tipo_examen_id?: number | null;
  tipo_examen_nombre?: string | null;
  codigo: string;
  descripcion: string;
  precio_unitario: number;
  activo: boolean;
};

type Ausentismo = {
  id: number;
  numero_carpeta: string;
  empleado_nombre: string;
  proximo_control_fecha: string;
  cliente_pagador_nombre: string;
  cliente_pagador_email?: string | null;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function money(value: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value || 0);
}
function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('es-AR');
}
function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('es-AR');
}

// ─── Configuración visual ──────────────────────────────────────────────────────

const TIPO_CARPETA: Record<string, { label: string; bg: string; text: string; border: string; emoji: string }> = {
  ingreso:   { label: 'Alta laboral',       bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40', emoji: '🟢' },
  periodico: { label: 'Control periódico',  bg: 'bg-blue-500/20',    text: 'text-blue-300',    border: 'border-blue-500/40',    emoji: '🔄' },
  egreso:    { label: 'Baja laboral',       bg: 'bg-rose-500/20',    text: 'text-rose-300',    border: 'border-rose-500/40',    emoji: '🔴' },
  art:       { label: 'Seguimiento ART',    bg: 'bg-amber-500/20',   text: 'text-amber-300',   border: 'border-amber-500/40',   emoji: '⚡' },
};

const INFORME_ESTADO: Record<string, { label: string; bg: string; text: string; border: string }> = {
  pendiente: { label: 'Pendiente', bg: 'bg-amber-500/20',   text: 'text-amber-300',   border: 'border-amber-500/40' },
  realizado: { label: 'Realizado', bg: 'bg-blue-500/20',    text: 'text-blue-300',    border: 'border-blue-500/40' },
  firmado:   { label: 'Firmado ✓', bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40' },
};

type MainTab    = 'carpetas' | 'ausentismo' | 'facturacion' | 'nomencladores';
type DetalleTab = 'informes' | 'practicas'  | 'documentos'  | 'historial';

// ─── Componente principal ──────────────────────────────────────────────────────

export default function CarpetasLaborales() {
  const toast = useToast();

  // Datos base
  const [clientes,      setClientes]      = useState<Cliente[]>([]);
  const [usuarios,      setUsuarios]      = useState<Usuario[]>([]);
  const [tipos,         setTipos]         = useState<TipoExamen[]>([]);
  const [carpetas,      setCarpetas]      = useState<CarpetaResumen[]>([]);
  const [ausentismo,    setAusentismo]    = useState<Ausentismo[]>([]);
  const [nomencladores, setNomencladores] = useState<Nomenclador[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);

  // UI
  const [tab,             setTab]             = useState<MainTab>('carpetas');
  const [busqueda,        setBusqueda]        = useState('');
  const [showNueva,       setShowNueva]       = useState(false);
  const [showTutorial,    setShowTutorial]    = useState(false);
  const [detalle,         setDetalle]         = useState<CarpetaDetalle | null>(null);
  const [loadingDetalle,  setLoadingDetalle]  = useState(false);
  const [detalleTab,      setDetalleTab]      = useState<DetalleTab>('informes');

  // Formularios
  const [carpetaForm, setCarpetaForm] = useState({
    cliente_pagador_id: '', tipo_examen_id: '', tipo_carpeta: 'ingreso',
    empleado_nombre: '', empleado_dni: '', empleado_email: '',
    fecha_turno: '', proximo_control_fecha: '', ausentismo_controlar: false,
  });
  const [nomencladorForm, setNomencladorForm] = useState({
    cliente_pagador_id: '', tipo_examen_id: '', codigo: '', descripcion: '', precio_unitario: '',
  });
  const [docForm,  setDocForm]  = useState({ nombre_archivo: '', url_archivo: '', descripcion: '' });
  const [factura,  setFactura]  = useState({ cliente_pagador_id: '', periodo: new Date().toISOString().slice(0, 7) });
  const [drafts,   setDrafts]   = useState<Record<number, Partial<Informe>>>({});

  // ─── Carga de datos ──────────────────────────────────────────────────────────

  async function loadBase() {
    setLoading(true);
    try {
      const [clientesRows, usuariosRows, tiposRows, carpetasRows, ausentismoRows, nomencladoresRows] = await Promise.all([
        Api.clientes({ estado: 'activo', all: true }),
        Api.usuarios({ activo: true }),
        Api.laboralTiposExamen(),
        Api.laboralCarpetas({ limit: 200 }),
        Api.laboralAusentismoPendiente(30),
        Api.laboralNomencladores(),
      ]);
      setClientes((clientesRows || []) as Cliente[]);
      setUsuarios((usuariosRows || []) as Usuario[]);
      setTipos((tiposRows || []) as TipoExamen[]);
      setCarpetas((carpetasRows || []) as CarpetaResumen[]);
      setAusentismo((ausentismoRows || []) as Ausentismo[]);
      setNomencladores((nomencladoresRows || []) as Nomenclador[]);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudieron cargar las carpetas');
    } finally {
      setLoading(false);
    }
  }

  async function openCarpeta(id: number) {
    setLoadingDetalle(true);
    setDetalle(null);
    setDetalleTab('informes');
    setDrafts({});
    try {
      const row = await Api.laboralDetalleCarpeta(id);
      setDetalle(row as CarpetaDetalle);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo abrir la carpeta');
    } finally {
      setLoadingDetalle(false);
    }
  }

  useEffect(() => { loadBase(); }, []);

  // ─── Acciones ────────────────────────────────────────────────────────────────

  async function createCarpeta() {
    if (!carpetaForm.cliente_pagador_id || !carpetaForm.empleado_nombre.trim()) {
      toast.error('Completá la empresa y el nombre del empleado');
      return;
    }
    setSaving(true);
    try {
      const created: any = await Api.laboralCrearCarpeta({
        ...carpetaForm,
        cliente_pagador_id: Number(carpetaForm.cliente_pagador_id),
        tipo_examen_id: carpetaForm.tipo_examen_id ? Number(carpetaForm.tipo_examen_id) : undefined,
      });
      toast.success('¡Carpeta creada! El sistema generó los sectores automáticamente.');
      setCarpetaForm({
        cliente_pagador_id: '', tipo_examen_id: '', tipo_carpeta: 'ingreso',
        empleado_nombre: '', empleado_dni: '', empleado_email: '',
        fecha_turno: '', proximo_control_fecha: '', ausentismo_controlar: false,
      });
      setShowNueva(false);
      await loadBase();
      if (created?.id) await openCarpeta(Number(created.id));
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo crear la carpeta');
    } finally {
      setSaving(false);
    }
  }

  async function saveReport(id: number) {
    if (!detalle) return;
    setSaving(true);
    try {
      await Api.laboralActualizarInforme(detalle.id, id, drafts[id] || {});
      await openCarpeta(detalle.id);
      toast.success('Informe actualizado');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar el informe');
    } finally {
      setSaving(false);
    }
  }

  async function addDocument() {
    if (!detalle || !docForm.nombre_archivo.trim() || !docForm.url_archivo.trim()) {
      toast.error('Indicá el nombre y la URL del documento');
      return;
    }
    setSaving(true);
    try {
      await Api.laboralAgregarDocumento(detalle.id, docForm);
      setDocForm({ nombre_archivo: '', url_archivo: '', descripcion: '' });
      await openCarpeta(detalle.id);
      toast.success('Documento agregado');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo agregar el documento');
    } finally {
      setSaving(false);
    }
  }

  async function sendMail() {
    if (!detalle) return;
    setSaving(true);
    try {
      await Api.laboralEnviarMail(detalle.id, { email: detalle.empleado_email || undefined });
      toast.success('Mail registrado y enviado');
      await openCarpeta(detalle.id);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo enviar el mail');
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    if (!detalle) return;
    try {
      const blob = await Api.laboralPdf(detalle.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 2500);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo generar el PDF');
    }
  }

  async function billPeriod() {
    if (!factura.cliente_pagador_id) { toast.error('Seleccioná la empresa a facturar'); return; }
    setSaving(true);
    try {
      const result: any = await Api.laboralFacturarLote({
        cliente_pagador_id: Number(factura.cliente_pagador_id),
        periodo: factura.periodo,
      });
      toast.success(`Venta #${result?.venta_id || '-'} generada por ${money(Number(result?.total || 0))}`);
      await loadBase();
      if (detalle) await openCarpeta(detalle.id);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo facturar el período');
    } finally {
      setSaving(false);
    }
  }

  async function sendReminders() {
    setSaving(true);
    try {
      const result: any = await Api.laboralEnviarRecordatorios({ dias: 30 });
      toast.success(`Recordatorios enviados: ${result?.enviados || 0}`);
      await loadBase();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudieron enviar los recordatorios');
    } finally {
      setSaving(false);
    }
  }

  async function createNomenclador() {
    if (!nomencladorForm.cliente_pagador_id || !nomencladorForm.codigo.trim() || !nomencladorForm.descripcion.trim()) {
      toast.error('Completá empresa, código y descripción');
      return;
    }
    setSaving(true);
    try {
      await Api.laboralCrearNomenclador({
        cliente_pagador_id: Number(nomencladorForm.cliente_pagador_id),
        tipo_examen_id: nomencladorForm.tipo_examen_id ? Number(nomencladorForm.tipo_examen_id) : undefined,
        codigo: nomencladorForm.codigo.trim(),
        descripcion: nomencladorForm.descripcion.trim(),
        precio_unitario: Number(nomencladorForm.precio_unitario || 0),
      });
      setNomencladorForm({ cliente_pagador_id: '', tipo_examen_id: '', codigo: '', descripcion: '', precio_unitario: '' });
      toast.success('Nomenclador guardado');
      await loadBase();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar el nomenclador');
    } finally {
      setSaving(false);
    }
  }

  // ─── Derivados ───────────────────────────────────────────────────────────────

  const summary = useMemo(() => ({
    abiertas:     carpetas.filter((c) => c.estado !== 'cerrada').length,
    pendientes:   carpetas.reduce((acc, c) => acc + Number(c.informes_pendientes || 0), 0),
    controles:    ausentismo.length,
    sinFacturar:  detalle?.practicas.filter((p) => !p.facturado).length || 0,
  }), [ausentismo.length, carpetas, detalle]);

  const carpetasFiltradas = useMemo(() => {
    if (!busqueda.trim()) return carpetas;
    const q = busqueda.toLowerCase();
    return carpetas.filter((c) =>
      c.empleado_nombre.toLowerCase().includes(q) ||
      c.cliente_pagador_nombre.toLowerCase().includes(q) ||
      c.numero_carpeta.toLowerCase().includes(q)
    );
  }, [carpetas, busqueda]);

  const detalleProgress = useMemo(() => {
    if (!detalle?.total_informes) return 0;
    return Math.round((detalle.informes_firmados / detalle.total_informes) * 100);
  }, [detalle]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="app-title">Medicina Laboral y ART</h1>
          <p className="app-subtitle">
            Abrí carpetas por empleado, completá los informes de cada sector y emití PDF, mail y facturación desde un solo lugar.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowTutorial((v) => !v)}
            className="btn-secondary flex items-center gap-1.5 text-sm"
            title="Ver guía de uso"
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">¿Cómo se usa?</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTutorial ? 'rotate-180' : ''}`} />
          </button>
          {tab === 'carpetas' && (
            <button onClick={() => setShowNueva(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nueva carpeta
            </button>
          )}
        </div>
      </div>

      {/* Tutorial paso a paso */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="app-card p-5 border-indigo-500/30 bg-indigo-500/5 space-y-5">
              {/* Intro */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-indigo-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100 mb-1">¿Para qué sirve Medicina Laboral?</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Este módulo gestiona los <strong className="text-slate-200">exámenes y controles de salud ocupacional</strong> de los empleados.
                    Cada empleado tiene una carpeta con sus informes médicos, prácticas realizadas y documentos adjuntos.
                    Desde acá generás los PDF, enviás por mail y facturás todo a la empresa empleadora.
                  </p>
                </div>
              </div>

              <hr className="border-white/10" />

              {/* Pasos del flujo */}
              <div>
                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-3">Flujo recomendado — así funciona</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    {
                      paso: '1', icon: FolderOpen, color: 'text-indigo-300', bg: 'bg-indigo-500/15', border: 'border-indigo-500/30',
                      titulo: 'Abrí la carpeta',
                      desc: 'Al recibir a un empleado, creás una nueva carpeta. Seleccionás la empresa que paga, el tipo de examen (ingreso, periódico, egreso) y los datos del empleado.',
                    },
                    {
                      paso: '2', icon: Stethoscope, color: 'text-sky-300', bg: 'bg-sky-500/15', border: 'border-sky-500/30',
                      titulo: 'Completá los informes',
                      desc: 'Cada carpeta tiene informes por sector (laboratorio, cardiología, oftalmología, etc.). El profesional de cada área completa su parte y firma el informe.',
                    },
                    {
                      paso: '3', icon: FileText, color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30',
                      titulo: 'Generá el PDF y envialo',
                      desc: 'Una vez firmados todos los informes, generás el PDF de la carpeta completa. Podés enviarlo por mail directamente al empleado o a la empresa desde el sistema.',
                    },
                    {
                      paso: '4', icon: DollarSign, color: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/30',
                      titulo: 'Facturá las prácticas',
                      desc: 'Cada práctica realizada (análisis, electrocardiograma, etc.) queda registrada con su precio. Desde la sección Facturación podés generar la venta a la empresa pagadora.',
                    },
                  ].map(({ paso, icon: Icon, color, bg, border, titulo, desc }) => (
                    <div key={paso} className={`rounded-xl p-4 ${bg} border ${border} space-y-2`}>
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${bg} border ${border} ${color} shrink-0`}>{paso}</span>
                        <Icon className={`w-4 h-4 ${color}`} />
                        <span className={`text-sm font-semibold ${color}`}>{titulo}</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <hr className="border-white/10" />

              {/* Detalle de secciones + consejos */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Qué hace cada sección</p>
                  {[
                    { icon: '📁', titulo: 'Carpetas', desc: 'Lista de todos los exámenes. Hacé clic en cualquiera para ver el detalle completo: informes, prácticas, documentos e historial.' },
                    { icon: '📅', titulo: 'Ausentismo', desc: 'Seguimiento de empleados que requieren controles periódicos. Te avisa cuando un control está por vencer para que puedas coordinarlo a tiempo.' },
                    { icon: '💵', titulo: 'Facturación', desc: 'Vista de prácticas sin facturar agrupadas por empresa. Con un clic podés generar la venta de todo lo pendiente de una empresa.' },
                    { icon: '📋', titulo: 'Nomencladores', desc: 'Catálogo de prácticas médicas con precios. Desde acá gestionás qué estudios se ofrecen y cuánto vale cada uno.' },
                  ].map(({ icon, titulo, desc }) => (
                    <div key={titulo} className="flex gap-3">
                      <span className="text-lg shrink-0 mt-0.5">{icon}</span>
                      <div>
                        <p className="text-sm font-medium text-slate-200">{titulo}</p>
                        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Consejos prácticos</p>
                  {[
                    { icon: '💡', titulo: 'Completá todos los informes antes del PDF', desc: 'El PDF se genera con todos los datos disponibles. Si hay informes pendientes, quedarán en blanco en el documento.' },
                    { icon: '🏷️', titulo: 'Cargá las prácticas al momento', desc: 'Cuando realizás un estudio, registralo en la carpeta del empleado de inmediato. Así no se pierden ítems al facturar.' },
                    { icon: '📧', titulo: 'Usá el envío por mail integrado', desc: 'Evitá descargar el PDF y mandarlo manual. El sistema lo envía directamente al mail del empleado con un solo clic.' },
                    { icon: '🔔', titulo: 'Revisá "Controles próximos" seguido', desc: 'En el tablero superior ves cuántos controles vencen pronto. Entrá a Ausentismo para coordinar los turnos a tiempo.' },
                  ].map(({ icon, titulo, desc }) => (
                    <div key={titulo} className="flex gap-3">
                      <span className="text-lg shrink-0 mt-0.5">{icon}</span>
                      <div>
                        <p className="text-sm font-medium text-slate-200">{titulo}</p>
                        <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-slate-600">¿Dudas? Pedile ayuda a tu administrador.</p>
                <button onClick={() => setShowTutorial(false)} className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
                  Cerrar guía <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Carpetas activas',    value: summary.abiertas,    icon: FolderOpen,    color: 'text-indigo-300',  onClick: () => setTab('carpetas') },
          { label: 'Informes pendientes', value: summary.pendientes,   icon: ClipboardList, color: 'text-amber-300',   onClick: () => setTab('carpetas') },
          { label: 'Controles próximos',  value: summary.controles,   icon: Clock,         color: 'text-rose-300',    onClick: () => setTab('ausentismo') },
          { label: 'Sin facturar',        value: summary.sinFacturar,  icon: DollarSign,    color: 'text-emerald-300', onClick: () => setTab('facturacion') },
        ].map(({ label, value, icon: Icon, color, onClick }) => (
          <button key={label} onClick={onClick}
            className="app-card p-4 flex items-center gap-3 hover:border-white/20 transition-all text-left w-full">
            <Icon className={`w-8 h-8 ${color} shrink-0 opacity-70`} />
            <div>
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-2xl font-bold text-slate-100 mt-0.5">{value}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Barra de tabs */}
      <div className="flex gap-1 border-b border-white/10">
        {[
          { id: 'carpetas',      label: 'Carpetas',     icon: FolderOpen },
          { id: 'ausentismo',    label: 'Ausentismo',   icon: Clock },
          { id: 'facturacion',   label: 'Facturación',  icon: ReceiptText },
          { id: 'nomencladores', label: 'Nomencladores',icon: ClipboardList },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id as MainTab)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-all ${
              tab === id
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── TAB: CARPETAS ── */}
      {tab === 'carpetas' && (
        <div className="space-y-4">
          {/* Buscador */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por empleado, empresa o número de carpeta..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="input-field pl-10 w-full text-sm"
              />
            </div>
            <button onClick={loadBase} disabled={loading}
              className="btn-secondary flex items-center gap-1.5 text-sm">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
            </button>
          </div>

          {/* Lista de carpetas */}
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map((i) => (
                <div key={i} className="app-card p-4 animate-pulse">
                  <div className="h-4 bg-white/10 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-white/5 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : carpetasFiltradas.length === 0 ? (
            <div className="app-card p-12 text-center">
              <FolderOpen className="w-14 h-14 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400 font-medium">
                {busqueda ? 'No hay carpetas que coincidan con la búsqueda' : 'Todavía no hay carpetas cargadas'}
              </p>
              <p className="text-slate-600 text-sm mt-1">
                {!busqueda && 'Hacé clic en "Nueva carpeta" para abrir la primera'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {carpetasFiltradas.map((carpeta) => {
                const progress = carpeta.total_informes > 0
                  ? Math.round((carpeta.informes_firmados / carpeta.total_informes) * 100)
                  : 0;
                const cfg = TIPO_CARPETA[carpeta.tipo_carpeta] || TIPO_CARPETA.ingreso;
                const cerrada = carpeta.estado === 'cerrada';
                return (
                  <button key={carpeta.id} onClick={() => openCarpeta(carpeta.id)}
                    className="app-card p-4 w-full text-left hover:border-indigo-400/30 hover:bg-indigo-500/5 transition-all group">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${cfg.bg}`}>
                        {cfg.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white">{carpeta.empleado_nombre}</span>
                          <span className="text-xs text-slate-500">#{carpeta.numero_carpeta}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            {cfg.label}
                          </span>
                          {cerrada && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/40 bg-slate-500/20 px-2 py-0.5 text-xs text-slate-400">
                              Cerrada
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{carpeta.cliente_pagador_nombre}</span>
                          {carpeta.empleado_dni && <span><User className="w-3 h-3 inline" /> {carpeta.empleado_dni}</span>}
                          {carpeta.tipo_examen_nombre && <span><Stethoscope className="w-3 h-3 inline" /> {carpeta.tipo_examen_nombre}</span>}
                        </div>
                        {/* Barra de progreso */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className={`text-xs font-medium ${progress === 100 ? 'text-emerald-300' : 'text-slate-400'}`}>
                            {progress}%
                          </span>
                          {carpeta.informes_pendientes > 0 && (
                            <span className="text-xs text-amber-400">
                              {carpeta.informes_pendientes} pendiente{carpeta.informes_pendientes > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0 mt-1" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: AUSENTISMO ── */}
      {tab === 'ausentismo' && (
        <div className="space-y-4">
          <div className="app-card p-5">
            <div className="flex items-start gap-3">
              <Clock className="w-8 h-8 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-white">Control de ausentismo</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Acá ves los empleados cuyo control periódico vence en los próximos 30 días.
                  Podés enviar recordatorios automáticos a todas las empresas de una sola vez.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <button onClick={sendReminders} disabled={saving}
                className="btn-primary flex items-center gap-2">
                <Mail className="w-4 h-4" />
                {saving ? 'Enviando...' : `Enviar recordatorios (${ausentismo.length} empleado${ausentismo.length !== 1 ? 's' : ''})`}
              </button>
            </div>
          </div>

          {ausentismo.length === 0 ? (
            <div className="app-card p-12 text-center">
              <CheckCircle2 className="w-14 h-14 mx-auto mb-3 text-emerald-600" />
              <p className="text-slate-400 font-medium">Todo al día</p>
              <p className="text-slate-600 text-sm mt-1">No hay controles próximos a vencer en los próximos 30 días</p>
            </div>
          ) : (
            <div className="space-y-2">
              {ausentismo.map((item) => {
                const dias = Math.ceil((new Date(item.proximo_control_fecha).getTime() - Date.now()) / 86400000);
                const urgente = dias <= 7;
                return (
                  <div key={item.id} className={`app-card p-4 flex items-center gap-3 ${urgente ? 'border-rose-500/30' : ''}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${urgente ? 'bg-rose-500/20' : 'bg-amber-500/20'}`}>
                      <Clock className={`w-5 h-5 ${urgente ? 'text-rose-400' : 'text-amber-400'}`} />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-white">{item.empleado_nombre}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <Building2 className="w-3 h-3 inline mr-1" />{item.cliente_pagador_nombre}
                        {' · '}Carpeta #{item.numero_carpeta}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold ${urgente ? 'text-rose-300' : 'text-amber-300'}`}>
                        {dias <= 0 ? 'Vencido' : `${dias} día${dias !== 1 ? 's' : ''}`}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(item.proximo_control_fecha)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: FACTURACIÓN ── */}
      {tab === 'facturacion' && (
        <div className="max-w-lg space-y-4">
          <div className="app-card p-5">
            <div className="flex items-center gap-3 mb-4">
              <ReceiptText className="w-6 h-6 text-emerald-400" />
              <h3 className="font-semibold text-white">Facturación por período</h3>
            </div>
            <p className="text-sm text-slate-400 mb-5">
              El sistema agrupa todas las prácticas pendientes de una empresa en el período elegido
              y genera una sola venta. Las prácticas ya facturadas no se incluyen.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Empresa o cliente a facturar <span className="text-red-400">*</span></label>
                <select className="input-field w-full" value={factura.cliente_pagador_id}
                  onChange={(e) => setFactura((prev) => ({ ...prev, cliente_pagador_id: e.target.value }))}>
                  <option value="">Seleccioná una empresa...</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Período</label>
                <input type="month" className="input-field w-full" value={factura.periodo}
                  onChange={(e) => setFactura((prev) => ({ ...prev, periodo: e.target.value }))} />
              </div>
              <button onClick={billPeriod} disabled={saving}
                className="btn-primary w-full flex items-center justify-center gap-2">
                <ReceiptText className="w-4 h-4" />
                {saving ? 'Generando venta...' : 'Generar venta del período'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: NOMENCLADORES ── */}
      {tab === 'nomencladores' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[400px,1fr]">
          {/* Formulario */}
          <div className="app-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-indigo-400" />
              <h3 className="font-semibold text-white">Nuevo nomenclador</h3>
            </div>
            <p className="text-xs text-slate-400">
              Los nomencladores definen qué prácticas y precios se agregan automáticamente al abrir cada carpeta.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Empresa o cliente <span className="text-red-400">*</span></label>
                <select className="input-field w-full" value={nomencladorForm.cliente_pagador_id}
                  onChange={(e) => setNomencladorForm((prev) => ({ ...prev, cliente_pagador_id: e.target.value }))}>
                  <option value="">Seleccioná una empresa...</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Aplica a tipo de examen</label>
                <select className="input-field w-full" value={nomencladorForm.tipo_examen_id}
                  onChange={(e) => setNomencladorForm((prev) => ({ ...prev, tipo_examen_id: e.target.value }))}>
                  <option value="">Todos los exámenes</option>
                  {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-[120px,1fr] gap-2">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Código <span className="text-red-400">*</span></label>
                  <input className="input-field w-full" placeholder="ej: LAB001" value={nomencladorForm.codigo}
                    onChange={(e) => setNomencladorForm((prev) => ({ ...prev, codigo: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Descripción <span className="text-red-400">*</span></label>
                  <input className="input-field w-full" placeholder="Aparece en la factura" value={nomencladorForm.descripcion}
                    onChange={(e) => setNomencladorForm((prev) => ({ ...prev, descripcion: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Precio unitario</label>
                <input type="number" min="0" className="input-field w-full" placeholder="0.00" value={nomencladorForm.precio_unitario}
                  onChange={(e) => setNomencladorForm((prev) => ({ ...prev, precio_unitario: e.target.value }))} />
              </div>
              <button onClick={createNomenclador} disabled={saving} className="btn-primary w-full">
                {saving ? 'Guardando...' : 'Guardar nomenclador'}
              </button>
            </div>
          </div>

          {/* Lista */}
          <div className="space-y-2">
            <p className="text-sm text-slate-400 font-medium">{nomencladores.length} nomencladores configurados</p>
            {nomencladores.length === 0 ? (
              <div className="app-card p-10 text-center">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p className="text-slate-400">No hay nomencladores cargados todavía</p>
              </div>
            ) : nomencladores.map((item) => (
              <div key={item.id} className="app-card p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500 font-mono bg-white/5 px-1.5 py-0.5 rounded">{item.codigo}</span>
                    <span className="text-white font-medium text-sm">{item.descripcion}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {item.cliente_pagador_nombre}
                    {item.tipo_examen_nombre ? ` · ${item.tipo_examen_nombre}` : ' · Todos los exámenes'}
                  </p>
                </div>
                <span className="text-emerald-300 font-semibold text-sm shrink-0">{money(item.precio_unitario)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL: Nueva carpeta ── */}
      <AnimatePresence>
        {showNueva && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-slate-900 border-b border-white/10 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-indigo-400" />
                  <h2 className="font-semibold text-white">Abrir nueva carpeta</h2>
                </div>
                <button onClick={() => setShowNueva(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Info */}
                <div className="rounded-xl bg-indigo-500/10 border border-indigo-400/20 px-4 py-3 text-sm text-indigo-200">
                  Al guardar, el sistema crea automáticamente los sectores de informe y los ítems de facturación según el tipo de examen.
                </div>

                {/* Sección 1: Empresa y tipo */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">1. Empresa y tipo de examen</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Empresa que paga <span className="text-red-400">*</span></label>
                      <select className="input-field w-full" value={carpetaForm.cliente_pagador_id}
                        onChange={(e) => setCarpetaForm((prev) => ({ ...prev, cliente_pagador_id: e.target.value }))}>
                        <option value="">Seleccioná una empresa...</option>
                        {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Tipo de examen</label>
                        <select className="input-field w-full" value={carpetaForm.tipo_examen_id}
                          onChange={(e) => setCarpetaForm((prev) => ({ ...prev, tipo_examen_id: e.target.value }))}>
                          <option value="">Sin especificar</option>
                          {tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Tipo de carpeta</label>
                        <select className="input-field w-full" value={carpetaForm.tipo_carpeta}
                          onChange={(e) => setCarpetaForm((prev) => ({ ...prev, tipo_carpeta: e.target.value }))}>
                          <option value="ingreso">Alta laboral</option>
                          <option value="periodico">Control periódico</option>
                          <option value="egreso">Baja laboral</option>
                          <option value="art">Seguimiento ART</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sección 2: Empleado */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">2. Datos del empleado</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Nombre completo <span className="text-red-400">*</span></label>
                      <input className="input-field w-full" placeholder="Juan Pérez" value={carpetaForm.empleado_nombre}
                        onChange={(e) => setCarpetaForm((prev) => ({ ...prev, empleado_nombre: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">DNI</label>
                        <input className="input-field w-full" placeholder="12.345.678" value={carpetaForm.empleado_dni}
                          onChange={(e) => setCarpetaForm((prev) => ({ ...prev, empleado_dni: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Email</label>
                        <input type="email" className="input-field w-full" placeholder="empleado@empresa.com" value={carpetaForm.empleado_email}
                          onChange={(e) => setCarpetaForm((prev) => ({ ...prev, empleado_email: e.target.value }))} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sección 3: Fechas */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">3. Fechas (opcional)</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Fecha y hora del turno</label>
                      <input type="datetime-local" className="input-field w-full" value={carpetaForm.fecha_turno}
                        onChange={(e) => setCarpetaForm((prev) => ({ ...prev, fecha_turno: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Próximo control programado</label>
                      <input type="date" className="input-field w-full" value={carpetaForm.proximo_control_fecha}
                        onChange={(e) => setCarpetaForm((prev) => ({ ...prev, proximo_control_fecha: e.target.value }))} />
                    </div>
                    <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer">
                      <input type="checkbox" className="w-4 h-4 rounded"
                        checked={carpetaForm.ausentismo_controlar}
                        onChange={(e) => setCarpetaForm((prev) => ({ ...prev, ausentismo_controlar: e.target.checked }))} />
                      Activar control de ausentismo (aparecerá en la lista de seguimiento)
                    </label>
                  </div>
                </div>

                {/* Botones */}
                <div className="flex gap-3 pt-2">
                  <button onClick={createCarpeta} disabled={saving}
                    className="btn-primary flex-1 flex items-center justify-center gap-2">
                    <FolderOpen className="w-4 h-4" />
                    {saving ? 'Creando carpeta...' : 'Crear carpeta'}
                  </button>
                  <button onClick={() => setShowNueva(false)} className="btn-secondary px-5">
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Detalle de carpeta ── */}
      <AnimatePresence>
        {(detalle || loadingDetalle) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col"
            >
              {loadingDetalle && !detalle ? (
                <div className="flex-1 flex items-center justify-center p-12">
                  <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
                </div>
              ) : detalle ? (
                <>
                  {/* Header del modal */}
                  <div className="sticky top-0 bg-slate-900 border-b border-white/10 px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${TIPO_CARPETA[detalle.tipo_carpeta]?.bg || 'bg-indigo-500/20'}`}>
                          {TIPO_CARPETA[detalle.tipo_carpeta]?.emoji || '📁'}
                        </div>
                        <div>
                          <h2 className="font-bold text-white text-lg">{detalle.empleado_nombre}</h2>
                          <p className="text-sm text-slate-400">
                            {detalle.cliente_pagador_nombre}
                            {' · '}#{detalle.numero_carpeta}
                            {' · '}{TIPO_CARPETA[detalle.tipo_carpeta]?.label}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={downloadPdf} title="Descargar PDF"
                          className="btn-secondary flex items-center gap-1.5 text-xs">
                          <Download className="w-3.5 h-3.5" /> PDF
                        </button>
                        <button onClick={sendMail} disabled={saving} title="Enviar por mail"
                          className="btn-secondary flex items-center gap-1.5 text-xs">
                          <Mail className="w-3.5 h-3.5" /> Mail
                        </button>
                        <button onClick={() => setDetalle(null)} className="text-slate-400 hover:text-white transition-colors ml-1">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Barra de progreso del modal */}
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${detalleProgress === 100 ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                          style={{ width: `${detalleProgress}%` }}
                        />
                      </div>
                      <span className={`text-xs font-semibold ${detalleProgress === 100 ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {detalleProgress === 100 ? '✓ Completo' : `${detalleProgress}% completado`}
                      </span>
                    </div>

                    {/* Tabs del detalle */}
                    <div className="flex gap-1 mt-3 -mb-px">
                      {[
                        { id: 'informes',   label: 'Informes',   icon: FileText },
                        { id: 'practicas',  label: 'Prácticas',  icon: DollarSign },
                        { id: 'documentos', label: 'Documentos', icon: Paperclip },
                        { id: 'historial',  label: 'Historial',  icon: History },
                      ].map(({ id, label, icon: Icon }) => (
                        <button key={id} onClick={() => setDetalleTab(id as DetalleTab)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-all ${
                            detalleTab === id
                              ? 'border-indigo-400 text-indigo-300'
                              : 'border-transparent text-slate-500 hover:text-slate-300'
                          }`}>
                          <Icon className="w-3.5 h-3.5" /> {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cuerpo scrolleable */}
                  <div className="flex-1 overflow-y-auto p-6">

                    {/* Tab: Informes por sector */}
                    {detalleTab === 'informes' && (
                      <div className="space-y-3">
                        {detalle.informes.length === 0 ? (
                          <div className="text-center py-10 text-slate-500">
                            <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No hay sectores configurados para esta carpeta</p>
                          </div>
                        ) : detalle.informes.map((informe) => {
                          const draft = drafts[informe.id] || {};
                          const estadoActual = String(draft.estado || informe.estado);
                          const cfg = INFORME_ESTADO[estadoActual] || INFORME_ESTADO.pendiente;
                          return (
                            <div key={informe.id} className={`rounded-xl border p-4 space-y-3 ${
                              estadoActual === 'firmado' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-white/3'
                            }`}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Stethoscope className="w-4 h-4 text-slate-400 shrink-0" />
                                  <span className="font-medium text-white">{informe.sector_nombre}</span>
                                </div>
                                <span className={`text-xs rounded-full border px-2.5 py-1 font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                  {cfg.label}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-xs text-slate-500 mb-1">Estado del informe</label>
                                  <select className="input-field w-full text-sm"
                                    value={estadoActual}
                                    onChange={(e) => setDrafts((prev) => ({ ...prev, [informe.id]: { ...prev[informe.id], estado: e.target.value } }))}>
                                    <option value="pendiente">Pendiente</option>
                                    <option value="realizado">Realizado</option>
                                    <option value="firmado">Firmado</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-slate-500 mb-1">Profesional responsable</label>
                                  <select className="input-field w-full text-sm"
                                    value={String(draft.profesional_id || informe.profesional_id || '')}
                                    onChange={(e) => setDrafts((prev) => ({ ...prev, [informe.id]: { ...prev[informe.id], profesional_id: e.target.value ? Number(e.target.value) : undefined } }))}>
                                    <option value="">Sin asignar</option>
                                    {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                                  </select>
                                </div>
                              </div>

                              <div>
                                <label className="block text-xs text-slate-500 mb-1">Aptitud laboral</label>
                                <input className="input-field w-full text-sm" placeholder="ej: Apto, Apto con restricciones, No apto..."
                                  value={String(draft.aptitud_laboral ?? informe.aptitud_laboral ?? '')}
                                  onChange={(e) => setDrafts((prev) => ({ ...prev, [informe.id]: { ...prev[informe.id], aptitud_laboral: e.target.value } }))} />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-500 mb-1">Resumen para lectura rápida</label>
                                <textarea className="input-field w-full text-sm min-h-[60px] resize-none"
                                  placeholder="Resumen breve del resultado..."
                                  value={String(draft.resumen ?? informe.resumen ?? '')}
                                  onChange={(e) => setDrafts((prev) => ({ ...prev, [informe.id]: { ...prev[informe.id], resumen: e.target.value } }))} />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-500 mb-1">Hallazgos y observaciones</label>
                                <textarea className="input-field w-full text-sm min-h-[80px] resize-none"
                                  placeholder="Detalle clínico, hallazgos relevantes..."
                                  value={String(draft.hallazgos ?? informe.hallazgos ?? '')}
                                  onChange={(e) => setDrafts((prev) => ({ ...prev, [informe.id]: { ...prev[informe.id], hallazgos: e.target.value } }))} />
                              </div>

                              <div className="flex justify-end">
                                <button onClick={() => saveReport(informe.id)} disabled={saving}
                                  className="btn-secondary text-sm flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  {saving ? 'Guardando...' : 'Guardar informe'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Tab: Prácticas */}
                    {detalleTab === 'practicas' && (
                      <div className="space-y-3">
                        {detalle.practicas.length === 0 ? (
                          <div className="text-center py-10 text-slate-500">
                            <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No hay prácticas asociadas todavía</p>
                          </div>
                        ) : (
                          <>
                            {detalle.practicas.map((item) => (
                              <div key={item.id} className="flex items-center gap-3 p-4 rounded-xl border border-white/10 bg-white/3">
                                <div className="flex-1">
                                  <p className="text-white font-medium">{item.nomenclador_descripcion || item.descripcion_manual || 'Práctica'}</p>
                                  <p className="text-xs text-slate-500 mt-0.5">{item.cantidad} unidad{item.cantidad !== 1 ? 'es' : ''} × {money(item.precio_unitario)}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-semibold text-white">{money(item.cantidad * item.precio_unitario)}</p>
                                  <span className={`text-xs ${item.facturado ? 'text-emerald-300' : 'text-amber-300'}`}>
                                    {item.facturado ? `✓ Venta #${item.facturado_venta_id}` : 'Pendiente de facturar'}
                                  </span>
                                </div>
                              </div>
                            ))}
                            <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                              <span className="text-sm text-slate-400">Total prácticas</span>
                              <span className="font-bold text-white">
                                {money(detalle.practicas.reduce((s, p) => s + p.cantidad * p.precio_unitario, 0))}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Tab: Documentos */}
                    {detalleTab === 'documentos' && (
                      <div className="space-y-4">
                        {detalle.documentos.length === 0 ? (
                          <div className="text-center py-8 text-slate-500">
                            <Paperclip className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No hay documentos adjuntos</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {detalle.documentos.map((doc) => (
                              <a key={doc.id} href={doc.url_archivo} target="_blank" rel="noreferrer"
                                className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/3 hover:border-indigo-400/30 hover:bg-indigo-500/5 transition-all group">
                                <FileText className="w-8 h-8 text-indigo-400 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-medium text-sm truncate">{doc.nombre_archivo}</p>
                                  <p className="text-xs text-slate-500">{doc.descripcion || 'Documento adjunto'}</p>
                                </div>
                                <Eye className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors shrink-0" />
                              </a>
                            ))}
                          </div>
                        )}

                        <div className="p-4 rounded-xl border border-white/10 bg-white/3 space-y-3">
                          <p className="text-sm font-medium text-slate-300">Adjuntar documento</p>
                          <p className="text-xs text-slate-500">Pegá la URL del archivo (Cloudinary, Google Drive, Dropbox, etc.)</p>
                          <input className="input-field w-full text-sm" placeholder="Nombre del archivo"
                            value={docForm.nombre_archivo} onChange={(e) => setDocForm((prev) => ({ ...prev, nombre_archivo: e.target.value }))} />
                          <input type="url" className="input-field w-full text-sm" placeholder="URL del documento (https://...)"
                            value={docForm.url_archivo} onChange={(e) => setDocForm((prev) => ({ ...prev, url_archivo: e.target.value }))} />
                          <input className="input-field w-full text-sm" placeholder="Descripción (opcional)"
                            value={docForm.descripcion} onChange={(e) => setDocForm((prev) => ({ ...prev, descripcion: e.target.value }))} />
                          <button onClick={addDocument} disabled={saving} className="btn-secondary text-sm flex items-center gap-1.5">
                            <Paperclip className="w-4 h-4" /> {saving ? 'Guardando...' : 'Adjuntar'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Tab: Historial */}
                    {detalleTab === 'historial' && (
                      <div>
                        {detalle.eventos.length === 0 ? (
                          <div className="text-center py-10 text-slate-500">
                            <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">Sin historial de movimientos</p>
                          </div>
                        ) : (
                          <div className="relative">
                            <div className="absolute left-3.5 top-4 bottom-4 w-px bg-white/10" />
                            <div className="space-y-4">
                              {detalle.eventos.map((ev) => (
                                <div key={ev.id} className="flex gap-4 items-start">
                                  <div className="relative z-10 w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shrink-0">
                                    <div className="w-2 h-2 rounded-full bg-indigo-400" />
                                  </div>
                                  <div className="flex-1 pb-1">
                                    <p className="text-sm text-slate-200">{ev.detalle || 'Movimiento registrado'}</p>
                                    <p className="text-xs text-slate-600 mt-1">{formatDateTime(ev.created_at)}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
