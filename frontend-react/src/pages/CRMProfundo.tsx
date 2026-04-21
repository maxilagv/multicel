/**
 * Módulo CRM Profundo
 * ──────────────────
 * Gestión de relaciones comerciales: Cuentas → Oportunidades → Seguimientos → Proyectos
 * Cualquier miembro del equipo puede ver el historial completo de cada cuenta.
 */

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Search, X, TrendingUp, CalendarDays, FolderKanban,
  Building2, Phone, Mail, User, ChevronRight, RefreshCw,
  Clock, Target, Briefcase, AlertTriangle,
  Eye, History, ListTodo, UserPlus,
  BookOpen, ChevronDown,
} from 'lucide-react';
import { Api } from '../lib/api';
import { useToast } from '../context/ToastContext';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

type Cuenta = {
  id: number; nombre: string; tipo: string; cliente_id?: number | null;
  estado?: string; email?: string | null; telefono?: string | null;
};
type Oportunidad = {
  id: number; titulo: string; cliente_nombre?: string | null;
  fase: string; valor_estimado: number; crm_cuenta_id?: number | null;
};
type Actividad = {
  id: number; asunto: string; tipo: string; cliente_nombre?: string | null;
  estado: string; fecha_hora?: string | null;
};
type Proyecto = {
  id: number; nombre: string; cuenta_nombre?: string | null;
  estado: string; progreso_pct: number; responsable_nombre?: string | null;
};
type Contacto    = { id: number; nombre: string; cargo?: string | null; email?: string | null };
type Tarea       = { id: number; nombre: string; estado: string; fecha_fin?: string | null; responsable_nombre?: string | null };
type Usuario     = { id: number; nombre: string };
type Cliente     = { id: number; nombre: string; apellido?: string | null };
type HistorialOp = { id: number; estado_anterior?: string | null; estado_nuevo: string; notas?: string | null; created_at: string };
type VentaFicha  = { id: number; fecha: string; total: number; estado_pago?: string | null };
type FichaCliente = {
  resumen: { deuda_pendiente: number; total_ventas: number; oportunidades_abiertas: number; actividades_pendientes: number; proyectos_activos: number };
  ventas:        VentaFicha[];
  oportunidades: Oportunidad[];
  actividades:   Actividad[];
  contactos:     Contacto[];
  proyectos:     Proyecto[];
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

const TIPO_CUENTA: Record<string, { label: string; bg: string; text: string; border: string; emoji: string }> = {
  potencial: { label: 'Potencial', bg: 'bg-amber-500/20',   text: 'text-amber-300',   border: 'border-amber-500/40',   emoji: '⭐' },
  cliente:   { label: 'Cliente',   bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40', emoji: '✅' },
  proveedor: { label: 'Proveedor', bg: 'bg-blue-500/20',    text: 'text-blue-300',    border: 'border-blue-500/40',    emoji: '📦' },
};

const FASE_OPP: Record<string, { label: string; bg: string; text: string; border: string; orden: number }> = {
  lead:        { label: 'Lead',        bg: 'bg-slate-500/20',   text: 'text-slate-300',   border: 'border-slate-500/40',   orden: 0 },
  contacto:    { label: 'Contacto',    bg: 'bg-blue-500/20',    text: 'text-blue-300',    border: 'border-blue-500/40',    orden: 1 },
  propuesta:   { label: 'Propuesta',   bg: 'bg-indigo-500/20',  text: 'text-indigo-300',  border: 'border-indigo-500/40',  orden: 2 },
  negociacion: { label: 'Negociación', bg: 'bg-amber-500/20',   text: 'text-amber-300',   border: 'border-amber-500/40',   orden: 3 },
  ganado:      { label: 'Ganado',      bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40', orden: 4 },
  perdido:     { label: 'Perdido',     bg: 'bg-red-500/20',     text: 'text-red-300',     border: 'border-red-500/40',     orden: 5 },
};

const TIPO_ACTIVIDAD: Record<string, { label: string; emoji: string; color: string }> = {
  llamada:      { label: 'Llamada',      emoji: '📞', color: 'text-blue-300' },
  reunion:      { label: 'Reunión',      emoji: '🤝', color: 'text-indigo-300' },
  tarea:        { label: 'Tarea',        emoji: '✅', color: 'text-amber-300' },
  visita:       { label: 'Visita',       emoji: '🚗', color: 'text-emerald-300' },
  email:        { label: 'Email',        emoji: '📧', color: 'text-sky-300' },
  recordatorio: { label: 'Recordatorio', emoji: '🔔', color: 'text-rose-300' },
};

const ESTADO_PROYECTO: Record<string, { label: string; bg: string; text: string; border: string }> = {
  planificado: { label: 'Planificado', bg: 'bg-slate-500/20',   text: 'text-slate-300',   border: 'border-slate-500/40' },
  en_progreso: { label: 'En progreso', bg: 'bg-blue-500/20',    text: 'text-blue-300',    border: 'border-blue-500/40' },
  en_espera:   { label: 'En espera',   bg: 'bg-amber-500/20',   text: 'text-amber-300',   border: 'border-amber-500/40' },
  completado:  { label: 'Completado',  bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40' },
  cancelado:   { label: 'Cancelado',   bg: 'bg-red-500/20',     text: 'text-red-300',     border: 'border-red-500/40' },
};

const ESTADO_TAREA: Record<string, { label: string; text: string }> = {
  pendiente:   { label: 'Pendiente',   text: 'text-amber-300' },
  completada:  { label: 'Completada',  text: 'text-emerald-300' },
  bloqueada:   { label: 'Bloqueada',   text: 'text-red-300' },
  en_progreso: { label: 'En progreso', text: 'text-blue-300' },
};

type MainTab      = 'cuentas' | 'oportunidades' | 'seguimientos' | 'proyectos';
type CuentaDetTab = 'resumen' | 'oportunidades' | 'seguimientos' | 'contactos' | 'proyectos';

// ─── Componente principal ──────────────────────────────────────────────────────

export default function CRMProfundo() {
  const toast = useToast();

  // Datos
  const [cuentas,       setCuentas]       = useState<Cuenta[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);
  const [actividades,   setActividades]   = useState<Actividad[]>([]);
  const [proyectos,     setProyectos]     = useState<Proyecto[]>([]);
  const [clientes,      setClientes]      = useState<Cliente[]>([]);
  const [usuarios,      setUsuarios]      = useState<Usuario[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);

  // UI principal
  const [tab,           setTab]           = useState<MainTab>('cuentas');
  const [busqueda,      setBusqueda]      = useState('');
  const [showTutorial,  setShowTutorial]  = useState(false);

  // Modales de creación
  const [showNuevaCuenta,      setShowNuevaCuenta]      = useState(false);
  const [showNuevaOpp,         setShowNuevaOpp]         = useState(false);
  const [showNuevaActividad,   setShowNuevaActividad]   = useState(false);
  const [showNuevoProyecto,    setShowNuevoProyecto]    = useState(false);

  // Panel de detalle de cuenta
  const [cuentaDetalle,        setCuentaDetalle]        = useState<Cuenta | null>(null);
  const [cuentaDetTab,         setCuentaDetTab]         = useState<CuentaDetTab>('resumen');
  const [contactos,            setContactos]            = useState<Contacto[]>([]);
  const [fichaCliente,         setFichaCliente]         = useState<FichaCliente | null>(null);
  const [loadingDetalle,       setLoadingDetalle]       = useState(false);

  // Panel de detalle de proyecto
  const [proyectoDetalle,      setProyectoDetalle]      = useState<Proyecto | null>(null);
  const [tareas,               setTareas]               = useState<Tarea[]>([]);

  // Historial de oportunidad
  const [historialOppId,       setHistorialOppId]       = useState<number | null>(null);
  const [historialOpp,         setHistorialOpp]         = useState<HistorialOp[]>([]);

  // Formularios de creación
  const [cuentaForm,   setCuentaForm]   = useState({ tipo: 'potencial', nombre: '', cliente_id: '' });
  const [oppForm,      setOppForm]      = useState({ crm_cuenta_id: '', titulo: '', fase: 'lead', valor_estimado: '', probabilidad: '30' });
  const [actForm,      setActForm]      = useState({ crm_cuenta_id: '', tipo: 'llamada', asunto: '', fecha_hora: '' });
  const [projectForm,  setProjectForm]  = useState({ crm_cuenta_id: '', nombre: '', responsable_usuario_id: '' });
  const [contactForm,  setContactForm]  = useState({ nombre: '', cargo: '', email: '' });
  const [taskForm,     setTaskForm]     = useState({ nombre: '', fecha_fin: '' });

  // ─── Carga de datos ──────────────────────────────────────────────────────────

  async function load() {
    setLoading(true);
    try {
      const [cuentasR, oppR, actR, proyR, clientesR, usuariosR] = await Promise.all([
        Api.crmCuentas({ limit: 200 }),
        Api.oportunidades({ limit: 200 }),
        Api.actividades({ include_completed: true, limit: 200 }),
        Api.crmProyectos({ limit: 200 }),
        Api.clientes({ estado: 'activo', all: true }),
        Api.usuarios({ activo: true }),
      ]);
      setCuentas((cuentasR || []) as Cuenta[]);
      setOportunidades((oppR || []) as Oportunidad[]);
      setActividades((actR || []) as Actividad[]);
      setProyectos((proyR || []) as Proyecto[]);
      setClientes((clientesR || []) as Cliente[]);
      setUsuarios((usuariosR || []) as Usuario[]);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo cargar el CRM');
    } finally {
      setLoading(false);
    }
  }

  async function openCuenta(cuenta: Cuenta) {
    setCuentaDetalle(cuenta);
    setCuentaDetTab('resumen');
    setLoadingDetalle(true);
    try {
      const [contactosR, ficha] = await Promise.all([
        Api.crmContactos({ crm_cuenta_id: cuenta.id }),
        cuenta.cliente_id ? Api.crmFichaCliente(Number(cuenta.cliente_id)) : Promise.resolve(null),
      ]);
      setContactos((contactosR || []) as Contacto[]);
      setFichaCliente((ficha || null) as FichaCliente | null);
      setOppForm((p) => ({ ...p, crm_cuenta_id: String(cuenta.id) }));
      setActForm((p) => ({ ...p, crm_cuenta_id: String(cuenta.id) }));
      setProjectForm((p) => ({ ...p, crm_cuenta_id: String(cuenta.id) }));
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo cargar la ficha');
    } finally {
      setLoadingDetalle(false);
    }
  }

  async function openProyecto(proyecto: Proyecto) {
    setProyectoDetalle(proyecto);
    try {
      const detail: any = await Api.crmDetalleProyecto(proyecto.id);
      setTareas((detail?.tareas || []) as Tarea[]);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo abrir el proyecto');
    }
  }

  async function openHistorialOpp(id: number) {
    setHistorialOppId(id);
    try {
      const rows = await Api.crmHistorialOportunidad(id);
      setHistorialOpp((rows || []) as HistorialOp[]);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo cargar el historial');
    }
  }

  useEffect(() => { load(); }, []);

  // ─── Acciones ────────────────────────────────────────────────────────────────

  async function saveCuenta() {
    if (!cuentaForm.nombre.trim()) { toast.error('Indicá el nombre de la cuenta'); return; }
    setSaving(true);
    try {
      await Api.crmCrearCuenta({ ...cuentaForm, cliente_id: cuentaForm.cliente_id ? Number(cuentaForm.cliente_id) : undefined });
      setCuentaForm({ tipo: 'potencial', nombre: '', cliente_id: '' });
      setShowNuevaCuenta(false);
      toast.success('Cuenta guardada');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar la cuenta');
    } finally {
      setSaving(false);
    }
  }

  async function saveOpportunity() {
    if (!oppForm.crm_cuenta_id || !oppForm.titulo.trim()) { toast.error('Seleccioná una cuenta y describí la oportunidad'); return; }
    setSaving(true);
    try {
      await Api.crearOportunidad({
        ...oppForm, crm_cuenta_id: Number(oppForm.crm_cuenta_id),
        valor_estimado: Number(oppForm.valor_estimado || 0),
        probabilidad: Number(oppForm.probabilidad || 0),
      });
      setOppForm((p) => ({ ...p, titulo: '', valor_estimado: '', probabilidad: '30' }));
      setShowNuevaOpp(false);
      toast.success('Oportunidad guardada');
      await load();
      if (cuentaDetalle) await openCuenta(cuentaDetalle);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar la oportunidad');
    } finally {
      setSaving(false);
    }
  }

  async function saveActivity() {
    if (!actForm.crm_cuenta_id || !actForm.asunto.trim()) { toast.error('Seleccioná una cuenta y escribí el asunto'); return; }
    setSaving(true);
    try {
      await Api.crearActividad({ ...actForm, crm_cuenta_id: Number(actForm.crm_cuenta_id) });
      setActForm((p) => ({ ...p, asunto: '', fecha_hora: '' }));
      setShowNuevaActividad(false);
      toast.success('Seguimiento guardado');
      await load();
      if (cuentaDetalle) await openCuenta(cuentaDetalle);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar el seguimiento');
    } finally {
      setSaving(false);
    }
  }

  async function saveProject() {
    if (!projectForm.crm_cuenta_id || !projectForm.nombre.trim()) { toast.error('Seleccioná una cuenta y nombrá el proyecto'); return; }
    setSaving(true);
    try {
      await Api.crmCrearProyecto({
        ...projectForm, crm_cuenta_id: Number(projectForm.crm_cuenta_id),
        responsable_usuario_id: projectForm.responsable_usuario_id ? Number(projectForm.responsable_usuario_id) : undefined,
      });
      setProjectForm((p) => ({ ...p, nombre: '' }));
      setShowNuevoProyecto(false);
      toast.success('Proyecto guardado');
      await load();
      if (cuentaDetalle) await openCuenta(cuentaDetalle);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar el proyecto');
    } finally {
      setSaving(false);
    }
  }

  async function saveContact() {
    if (!cuentaDetalle || !contactForm.nombre.trim()) { toast.error('Escribí el nombre del contacto'); return; }
    setSaving(true);
    try {
      await Api.crmCrearContacto({ ...contactForm, crm_cuenta_id: cuentaDetalle.id });
      setContactForm({ nombre: '', cargo: '', email: '' });
      toast.success('Contacto guardado');
      await openCuenta(cuentaDetalle);
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar el contacto');
    } finally {
      setSaving(false);
    }
  }

  async function saveTask() {
    if (!proyectoDetalle || !taskForm.nombre.trim()) { toast.error('Escribí el nombre de la tarea'); return; }
    setSaving(true);
    try {
      await Api.crmCrearTareaProyecto(proyectoDetalle.id, taskForm);
      setTaskForm({ nombre: '', fecha_fin: '' });
      toast.success('Tarea agregada');
      await openProyecto(proyectoDetalle);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo guardar la tarea');
    } finally {
      setSaving(false);
    }
  }

  // ─── Derivados ───────────────────────────────────────────────────────────────

  const summary = useMemo(() => ({
    cuentas:      cuentas.filter((c) => c.estado !== 'inactivo').length,
    abiertas:     oportunidades.filter((o) => !['ganado', 'perdido'].includes(o.fase)).length,
    pendientes:   actividades.filter((a) => a.estado === 'pendiente').length,
    proyectos:    proyectos.filter((p) => !['completado', 'cancelado'].includes(p.estado)).length,
  }), [actividades, cuentas, oportunidades, proyectos]);

  const cuentasFiltradas = useMemo(() => {
    if (!busqueda.trim()) return cuentas;
    const q = busqueda.toLowerCase();
    return cuentas.filter((c) =>
      c.nombre.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.telefono || '').toLowerCase().includes(q)
    );
  }, [cuentas, busqueda]);

  const oppsPorFase = useMemo(() => {
    const mapa: Record<string, Oportunidad[]> = {};
    for (const fase of Object.keys(FASE_OPP)) { mapa[fase] = []; }
    for (const o of oportunidades) {
      if (mapa[o.fase]) mapa[o.fase].push(o);
    }
    return mapa;
  }, [oportunidades]);

  const actividadesPendientes  = useMemo(() => actividades.filter((a) => a.estado === 'pendiente'), [actividades]);
  const actividadesCompletadas = useMemo(() => actividades.filter((a) => a.estado !== 'pendiente'), [actividades]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  const btnTabCreate = (
    tab === 'cuentas'        ? () => setShowNuevaCuenta(true) :
    tab === 'oportunidades'  ? () => setShowNuevaOpp(true) :
    tab === 'seguimientos'   ? () => setShowNuevaActividad(true) :
                               () => setShowNuevoProyecto(true)
  );

  const btnTabLabel = (
    tab === 'cuentas'        ? 'Nueva cuenta' :
    tab === 'oportunidades'  ? 'Nueva oportunidad' :
    tab === 'seguimientos'   ? 'Nuevo seguimiento' :
                               'Nuevo proyecto'
  );

  return (
    <div className="space-y-6">

      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="app-title">CRM</h1>
          <p className="app-subtitle">
            Registrá cuentas, hacé seguimiento de oportunidades y organizá proyectos. Todo el equipo ve el mismo historial.
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
          <button onClick={btnTabCreate} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> {btnTabLabel}
          </button>
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
                  <BookOpen className="w-4.5 h-4.5 text-indigo-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100 mb-1">¿Para qué sirve el CRM?</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    El CRM es tu herramienta para <strong className="text-slate-200">gestionar todas las relaciones comerciales</strong> en un solo lugar.
                    Podés saber en qué etapa está cada cliente, qué conversaciones tuviste, cuánto dinero hay en juego y qué proyectos están en marcha.
                    Todo el equipo ve la misma información, sin que nadie pierda el hilo.
                  </p>
                </div>
              </div>

              <hr className="border-white/10" />

              {/* Pasos del flujo */}
              <div>
                <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-3">Flujo recomendado — empezá por acá</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    {
                      paso: '1', icon: Building2, color: 'text-indigo-300', bg: 'bg-indigo-500/15', border: 'border-indigo-500/30',
                      titulo: 'Creá una cuenta',
                      desc: 'Cada empresa o contacto comercial es una "Cuenta". Podés asociarla a un cliente existente o crearla desde cero. Acá se concentra toda la información de esa relación.',
                    },
                    {
                      paso: '2', icon: TrendingUp, color: 'text-amber-300', bg: 'bg-amber-500/15', border: 'border-amber-500/30',
                      titulo: 'Registrá una oportunidad',
                      desc: 'Una oportunidad es una posible venta o negocio. La vas moviendo por etapas: Lead → Contacto → Propuesta → Negociación → Ganado. Podés poner el valor estimado para ver cuánto dinero tenés en juego.',
                    },
                    {
                      paso: '3', icon: CalendarDays, color: 'text-rose-300', bg: 'bg-rose-500/15', border: 'border-rose-500/30',
                      titulo: 'Hacé seguimiento',
                      desc: 'Registrá cada llamada, reunión, email o visita como un "Seguimiento". Así nunca perdés el hilo de qué hablaste con cada cuenta. Podés asignarle fecha y prioridad.',
                    },
                    {
                      paso: '4', icon: FolderKanban, color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30',
                      titulo: 'Organizá proyectos',
                      desc: 'Cuando un negocio se cierra, convertilo en un Proyecto. Los proyectos tienen tareas, fechas, responsables y un porcentaje de avance para que sepas siempre en qué estado está.',
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

              {/* Detalle de secciones */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Qué hace cada sección</p>
                  {[
                    { icon: '🏢', titulo: 'Cuentas', desc: 'Son los contactos o empresas con las que trabajás. Hacé clic en cualquiera para ver su historial completo: oportunidades, seguimientos, contactos de esa empresa y proyectos.' },
                    { icon: '📈', titulo: 'Oportunidades', desc: 'Mostrá todos los negocios posibles organizados por etapa. Podés ver el embudo de ventas y entender en qué fase se traban más los cierres.' },
                    { icon: '📅', titulo: 'Seguimientos', desc: 'Lista de todas las interacciones comerciales. Las "pendientes" son las que todavía no se completaron. Marcalas como completadas cuando las hagas.' },
                    { icon: '📁', titulo: 'Proyectos', desc: 'Proyectos activos con sus tareas. Cada proyecto muestra el % de avance calculado automáticamente según las tareas completadas.' },
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
                    { icon: '💡', titulo: 'Empezá por las cuentas', desc: 'Cargá primero todas las empresas o contactos con los que operás. El resto (oportunidades, seguimientos) se asocia a ellas.' },
                    { icon: '🔁', titulo: 'Actualizá las fases', desc: 'Cuando avancés una negociación, entrá a la oportunidad y cambiá la fase. Así el embudo queda siempre actualizado.' },
                    { icon: '📋', titulo: 'Usá seguimientos como agenda', desc: 'Antes de cada llamada o reunión, creá un seguimiento con fecha. Después de hacerla, marcala como completada y escribí el resultado.' },
                    { icon: '👥', titulo: 'Asigná responsables', desc: 'Cuando crees un seguimiento o proyecto, asignalo a la persona del equipo que lo tiene que resolver. Así cada uno sabe qué tiene pendiente.' },
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
          { label: 'Cuentas activas',         value: summary.cuentas,    icon: Users,         color: 'text-indigo-300',  tab: 'cuentas' as MainTab },
          { label: 'Oportunidades abiertas',  value: summary.abiertas,   icon: TrendingUp,    color: 'text-amber-300',   tab: 'oportunidades' as MainTab },
          { label: 'Seguimientos pendientes', value: summary.pendientes, icon: Clock,         color: 'text-rose-300',    tab: 'seguimientos' as MainTab },
          { label: 'Proyectos activos',       value: summary.proyectos,  icon: FolderKanban,  color: 'text-emerald-300', tab: 'proyectos' as MainTab },
        ].map(({ label, value, icon: Icon, color, tab: t }) => (
          <button key={label} onClick={() => setTab(t)}
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
          { id: 'cuentas',       label: 'Cuentas',       icon: Users },
          { id: 'oportunidades', label: 'Oportunidades', icon: TrendingUp },
          { id: 'seguimientos',  label: 'Seguimientos',  icon: CalendarDays },
          { id: 'proyectos',     label: 'Proyectos',     icon: FolderKanban },
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

      {/* ── TAB: CUENTAS ── */}
      {tab === 'cuentas' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar por nombre, email o teléfono..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="input-field pl-10 w-full text-sm"
              />
            </div>
            <button onClick={load} disabled={loading} className="btn-secondary flex items-center gap-1.5 text-sm">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
            </button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map((i) => <div key={i} className="app-card p-4 animate-pulse h-16" />)}
            </div>
          ) : cuentasFiltradas.length === 0 ? (
            <div className="app-card p-12 text-center">
              <Users className="w-14 h-14 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400 font-medium">
                {busqueda ? 'No hay cuentas que coincidan' : 'Todavía no hay cuentas cargadas'}
              </p>
              <p className="text-slate-600 text-sm mt-1">
                {!busqueda && 'Hacé clic en "Nueva cuenta" para empezar'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {cuentasFiltradas.map((cuenta) => {
                const cfg = TIPO_CUENTA[cuenta.tipo] || TIPO_CUENTA.potencial;
                return (
                  <button key={cuenta.id} onClick={() => openCuenta(cuenta)}
                    className="app-card p-4 w-full text-left hover:border-indigo-400/30 hover:bg-indigo-500/5 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${cfg.bg}`}>
                        {cfg.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white">{cuenta.nombre}</span>
                          <span className={`text-xs rounded-full border px-2 py-0.5 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-0.5 text-xs text-slate-500">
                          {cuenta.email    && <span className="flex items-center gap-1"><Mail  className="w-3 h-3" /> {cuenta.email}</span>}
                          {cuenta.telefono && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {cuenta.telefono}</span>}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: OPORTUNIDADES ── */}
      {tab === 'oportunidades' && (
        <div className="space-y-6">
          {/* Embudo por fases */}
          {(['lead', 'contacto', 'propuesta', 'negociacion'] as const).map((fase) => {
            const cfg   = FASE_OPP[fase];
            const items = oppsPorFase[fase] || [];
            if (!items.length) return null;
            return (
              <div key={fase}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold uppercase tracking-widest ${cfg.text}`}>{cfg.label}</span>
                  <span className={`text-xs rounded-full border px-2 py-0.5 ${cfg.bg} ${cfg.text} ${cfg.border}`}>{items.length}</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
                <div className="space-y-2">
                  {items.map((opp) => (
                    <div key={opp.id}
                      className={`app-card p-4 flex items-center gap-3 cursor-pointer hover:border-white/20 transition-all ${historialOppId === opp.id ? 'border-indigo-400/40 bg-indigo-500/5' : ''}`}
                      onClick={() => openHistorialOpp(opp.id)}>
                      <Target className={`w-5 h-5 shrink-0 ${cfg.text}`} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white">{opp.titulo}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{opp.cliente_nombre || 'Sin cuenta'}</p>
                      </div>
                      <span className="font-semibold text-emerald-300 text-sm shrink-0">{money(opp.valor_estimado)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Ganadas / Perdidas en fila */}
          {(['ganado', 'perdido'] as const).map((fase) => {
            const items = oppsPorFase[fase] || [];
            if (!items.length) return null;
            const cfg = FASE_OPP[fase];
            return (
              <div key={fase}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold uppercase tracking-widest ${cfg.text}`}>{cfg.label}</span>
                  <span className={`text-xs rounded-full border px-2 py-0.5 ${cfg.bg} ${cfg.text} ${cfg.border}`}>{items.length}</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map((opp) => (
                    <div key={opp.id} className="app-card p-3 flex items-center gap-2">
                      <span className="text-sm text-slate-300">{opp.titulo}</span>
                      <span className="ml-auto text-xs text-slate-500">{money(opp.valor_estimado)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {oportunidades.length === 0 && (
            <div className="app-card p-12 text-center">
              <TrendingUp className="w-14 h-14 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400 font-medium">No hay oportunidades todavía</p>
              <p className="text-slate-600 text-sm mt-1">Creá una oportunidad vinculada a una cuenta</p>
            </div>
          )}

          {/* Panel de historial de oportunidad seleccionada */}
          {historialOppId && (
            <div className="app-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-400" />
                  <span className="font-medium text-white text-sm">Historial de avance</span>
                </div>
                <button onClick={() => setHistorialOppId(null)} className="text-slate-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {historialOpp.length === 0 ? (
                <p className="text-sm text-slate-500">No hay historial para esta oportunidad</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-3.5 top-4 bottom-4 w-px bg-white/10" />
                  <div className="space-y-3">
                    {historialOpp.map((h) => {
                      const cfg = FASE_OPP[h.estado_nuevo] || FASE_OPP.lead;
                      return (
                        <div key={h.id} className="flex gap-4 items-start">
                          <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${cfg.bg} border ${cfg.border}`}>
                            <div className="w-2 h-2 rounded-full bg-current" />
                          </div>
                          <div className="flex-1 pb-1">
                            <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
                            {h.estado_anterior && (
                              <span className="text-xs text-slate-600 ml-2">desde {FASE_OPP[h.estado_anterior]?.label || h.estado_anterior}</span>
                            )}
                            {h.notas && <p className="text-xs text-slate-400 mt-1">{h.notas}</p>}
                            <p className="text-xs text-slate-600 mt-0.5">{formatDateTime(h.created_at)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: SEGUIMIENTOS ── */}
      {tab === 'seguimientos' && (
        <div className="space-y-4">
          {/* Pendientes */}
          {actividadesPendientes.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-400 mb-2">
                Pendientes ({actividadesPendientes.length})
              </p>
              <div className="space-y-2">
                {actividadesPendientes.map((act) => {
                  const cfg = TIPO_ACTIVIDAD[act.tipo] || TIPO_ACTIVIDAD.tarea;
                  return (
                    <div key={act.id} className="app-card p-4 flex items-center gap-3 border-amber-500/10">
                      <span className="text-2xl shrink-0">{cfg.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white">{act.asunto}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {cfg.label}
                          {act.cliente_nombre ? ` · ${act.cliente_nombre}` : ''}
                          {act.fecha_hora ? ` · ${formatDateTime(act.fecha_hora)}` : ''}
                        </p>
                      </div>
                      <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 shrink-0">
                        Pendiente
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completados */}
          {actividadesCompletadas.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
                Completados ({actividadesCompletadas.length})
              </p>
              <div className="space-y-2">
                {actividadesCompletadas.slice(0, 20).map((act) => {
                  const cfg = TIPO_ACTIVIDAD[act.tipo] || TIPO_ACTIVIDAD.tarea;
                  return (
                    <div key={act.id} className="app-card p-3 flex items-center gap-3 opacity-60">
                      <span className="text-lg shrink-0">{cfg.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-300 line-through">{act.asunto}</p>
                        <p className="text-xs text-slate-600">{act.cliente_nombre} · {formatDateTime(act.fecha_hora)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {actividades.length === 0 && (
            <div className="app-card p-12 text-center">
              <CalendarDays className="w-14 h-14 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400 font-medium">No hay seguimientos registrados</p>
              <p className="text-slate-600 text-sm mt-1">Registrá llamadas, reuniones, tareas y recordatorios</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: PROYECTOS ── */}
      {tab === 'proyectos' && (
        <div className="space-y-3">
          {loading ? (
            <div className="space-y-3">{[1,2].map((i) => <div key={i} className="app-card p-4 animate-pulse h-20" />)}</div>
          ) : proyectos.length === 0 ? (
            <div className="app-card p-12 text-center">
              <FolderKanban className="w-14 h-14 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400 font-medium">No hay proyectos todavía</p>
              <p className="text-slate-600 text-sm mt-1">Creá un proyecto vinculado a una cuenta</p>
            </div>
          ) : proyectos.map((proyecto) => {
            const cfg = ESTADO_PROYECTO[proyecto.estado] || ESTADO_PROYECTO.planificado;
            const activo = proyectoDetalle?.id === proyecto.id;
            return (
              <div key={proyecto.id}>
                <button onClick={() => activo ? setProyectoDetalle(null) : openProyecto(proyecto)}
                  className={`app-card p-4 w-full text-left hover:border-indigo-400/30 transition-all ${activo ? 'border-indigo-400/40 bg-indigo-500/5' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center shrink-0">
                      <Briefcase className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white">{proyecto.nombre}</span>
                        <span className={`text-xs rounded-full border px-2 py-0.5 ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.label}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {proyecto.cuenta_nombre || 'Sin cuenta'} · {proyecto.responsable_nombre || 'Sin responsable'}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${proyecto.progreso_pct >= 100 ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                            style={{ width: `${proyecto.progreso_pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">{proyecto.progreso_pct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-all shrink-0 ${activo ? 'rotate-90 text-indigo-400' : 'text-slate-600'}`} />
                  </div>
                </button>

                {/* Panel inline de tareas del proyecto */}
                {activo && (
                  <div className="ml-4 border-l border-indigo-400/20 pl-4 space-y-3 py-3">
                    {tareas.length === 0 ? (
                      <p className="text-sm text-slate-500">No hay tareas para este proyecto todavía.</p>
                    ) : tareas.map((tarea) => {
                      const t = ESTADO_TAREA[tarea.estado] || ESTADO_TAREA.pendiente;
                      const vencida = tarea.fecha_fin && new Date(tarea.fecha_fin) < new Date() && tarea.estado !== 'completada';
                      return (
                        <div key={tarea.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
                          <ListTodo className="w-4 h-4 text-slate-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${tarea.estado === 'completada' ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                              {tarea.nombre}
                            </p>
                            <p className="text-xs text-slate-600">
                              {tarea.responsable_nombre || 'Sin responsable'}
                              {tarea.fecha_fin && ` · vence ${formatDate(tarea.fecha_fin)}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {vencida && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                            <span className={`text-xs ${t.text}`}>{t.label}</span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Mini formulario para agregar tarea */}
                    <div className="flex gap-2 pt-1">
                      <input className="input-field flex-1 text-sm" placeholder="Nueva tarea..."
                        value={taskForm.nombre}
                        onChange={(e) => setTaskForm((p) => ({ ...p, nombre: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveTask(); }}
                      />
                      <input type="date" className="input-field text-sm w-36"
                        value={taskForm.fecha_fin}
                        onChange={(e) => setTaskForm((p) => ({ ...p, fecha_fin: e.target.value }))}
                      />
                      <button onClick={saveTask} disabled={saving} className="btn-secondary text-sm whitespace-nowrap">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL: Nueva cuenta ── */}
      <AnimatePresence>
        {showNuevaCuenta && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md"
            >
              <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-indigo-400" />
                  <h2 className="font-semibold text-white">Nueva cuenta</h2>
                </div>
                <button onClick={() => setShowNuevaCuenta(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="rounded-xl bg-indigo-500/10 border border-indigo-400/20 px-4 py-3 text-sm text-indigo-200">
                  Creá una sola cuenta por empresa. Desde ahí vas a registrar oportunidades, seguimientos, proyectos y contactos.
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tipo de cuenta</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['potencial', 'cliente', 'proveedor'] as const).map((tipo) => {
                      const c = TIPO_CUENTA[tipo];
                      return (
                        <button key={tipo} onClick={() => setCuentaForm((p) => ({ ...p, tipo }))}
                          className={`p-3 rounded-xl border text-center transition-all ${
                            cuentaForm.tipo === tipo
                              ? `${c.bg} ${c.text} ${c.border}`
                              : 'border-white/10 bg-white/3 text-slate-400 hover:bg-white/8'
                          }`}>
                          <span className="block text-lg">{c.emoji}</span>
                          <span className="block text-xs mt-1 font-medium">{c.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Nombre de la empresa / cuenta <span className="text-red-400">*</span></label>
                  <input className="input-field w-full" placeholder="ej: Empresa ABC SA"
                    value={cuentaForm.nombre}
                    onChange={(e) => setCuentaForm((p) => ({ ...p, nombre: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveCuenta(); }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Vincular a cliente existente (opcional)</label>
                  <select className="input-field w-full" value={cuentaForm.cliente_id}
                    onChange={(e) => setCuentaForm((p) => ({ ...p, cliente_id: e.target.value }))}>
                    <option value="">Sin vincular</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.apellido ? ` ${c.apellido}` : ''}</option>)}
                  </select>
                  <p className="text-xs text-slate-600 mt-1">Al vincular, la ficha mostrará ventas, deuda y datos financieros del cliente.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={saveCuenta} disabled={saving} className="btn-primary flex-1">
                    {saving ? 'Guardando...' : 'Crear cuenta'}
                  </button>
                  <button onClick={() => setShowNuevaCuenta(false)} className="btn-secondary px-5">Cancelar</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Nueva oportunidad ── */}
      <AnimatePresence>
        {showNuevaOpp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md"
            >
              <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-amber-400" />
                  <h2 className="font-semibold text-white">Nueva oportunidad</h2>
                </div>
                <button onClick={() => setShowNuevaOpp(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Cuenta <span className="text-red-400">*</span></label>
                  <select className="input-field w-full" value={oppForm.crm_cuenta_id}
                    onChange={(e) => setOppForm((p) => ({ ...p, crm_cuenta_id: e.target.value }))}>
                    <option value="">Seleccioná una cuenta...</option>
                    {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">¿Qué se está negociando? <span className="text-red-400">*</span></label>
                  <input className="input-field w-full" placeholder="ej: Contrato de mantenimiento anual"
                    value={oppForm.titulo} onChange={(e) => setOppForm((p) => ({ ...p, titulo: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Fase</label>
                    <select className="input-field w-full" value={oppForm.fase}
                      onChange={(e) => setOppForm((p) => ({ ...p, fase: e.target.value }))}>
                      {Object.entries(FASE_OPP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Monto estimado</label>
                    <input type="number" className="input-field w-full" placeholder="0"
                      value={oppForm.valor_estimado} onChange={(e) => setOppForm((p) => ({ ...p, valor_estimado: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={saveOpportunity} disabled={saving} className="btn-primary flex-1">
                    {saving ? 'Guardando...' : 'Guardar oportunidad'}
                  </button>
                  <button onClick={() => setShowNuevaOpp(false)} className="btn-secondary px-5">Cancelar</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Nuevo seguimiento ── */}
      <AnimatePresence>
        {showNuevaActividad && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md"
            >
              <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-blue-400" />
                  <h2 className="font-semibold text-white">Nuevo seguimiento</h2>
                </div>
                <button onClick={() => setShowNuevaActividad(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Cuenta <span className="text-red-400">*</span></label>
                  <select className="input-field w-full" value={actForm.crm_cuenta_id}
                    onChange={(e) => setActForm((p) => ({ ...p, crm_cuenta_id: e.target.value }))}>
                    <option value="">Seleccioná una cuenta...</option>
                    {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tipo de seguimiento</label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(TIPO_ACTIVIDAD).map(([k, v]) => (
                      <button key={k} onClick={() => setActForm((p) => ({ ...p, tipo: k }))}
                        className={`p-2.5 rounded-xl border text-center text-xs transition-all ${
                          actForm.tipo === k
                            ? 'border-indigo-400/50 bg-indigo-500/15 text-indigo-200'
                            : 'border-white/10 bg-white/3 text-slate-400 hover:bg-white/8'
                        }`}>
                        <span className="block text-lg">{v.emoji}</span>
                        <span className="block mt-1">{v.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Asunto <span className="text-red-400">*</span></label>
                  <input className="input-field w-full" placeholder="ej: Llamada para seguimiento de propuesta"
                    value={actForm.asunto} onChange={(e) => setActForm((p) => ({ ...p, asunto: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Fecha y hora (opcional)</label>
                  <input type="datetime-local" className="input-field w-full"
                    value={actForm.fecha_hora} onChange={(e) => setActForm((p) => ({ ...p, fecha_hora: e.target.value }))} />
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={saveActivity} disabled={saving} className="btn-primary flex-1">
                    {saving ? 'Guardando...' : 'Guardar seguimiento'}
                  </button>
                  <button onClick={() => setShowNuevaActividad(false)} className="btn-secondary px-5">Cancelar</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── MODAL: Nuevo proyecto ── */}
      <AnimatePresence>
        {showNuevoProyecto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md"
            >
              <div className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderKanban className="w-5 h-5 text-emerald-400" />
                  <h2 className="font-semibold text-white">Nuevo proyecto</h2>
                </div>
                <button onClick={() => setShowNuevoProyecto(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Cuenta <span className="text-red-400">*</span></label>
                  <select className="input-field w-full" value={projectForm.crm_cuenta_id}
                    onChange={(e) => setProjectForm((p) => ({ ...p, crm_cuenta_id: e.target.value }))}>
                    <option value="">Seleccioná una cuenta...</option>
                    {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Nombre del proyecto <span className="text-red-400">*</span></label>
                  <input className="input-field w-full" placeholder="ej: Implementación sistema de facturación"
                    value={projectForm.nombre} onChange={(e) => setProjectForm((p) => ({ ...p, nombre: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Responsable</label>
                  <select className="input-field w-full" value={projectForm.responsable_usuario_id}
                    onChange={(e) => setProjectForm((p) => ({ ...p, responsable_usuario_id: e.target.value }))}>
                    <option value="">Sin asignar</option>
                    {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={saveProject} disabled={saving} className="btn-primary flex-1">
                    {saving ? 'Guardando...' : 'Crear proyecto'}
                  </button>
                  <button onClick={() => setShowNuevoProyecto(false)} className="btn-secondary px-5">Cancelar</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── PANEL LATERAL: Detalle de cuenta ── */}
      <AnimatePresence>
        {cuentaDetalle && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setCuentaDetalle(null); }}>
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-lg bg-slate-900 border-l border-white/10 shadow-2xl flex flex-col h-full"
            >
              {/* Header */}
              <div className="border-b border-white/10 px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${TIPO_CUENTA[cuentaDetalle.tipo]?.bg || 'bg-indigo-500/20'}`}>
                      {TIPO_CUENTA[cuentaDetalle.tipo]?.emoji || '🏢'}
                    </div>
                    <div>
                      <h2 className="font-bold text-white">{cuentaDetalle.nombre}</h2>
                      <p className="text-xs text-slate-400">{TIPO_CUENTA[cuentaDetalle.tipo]?.label || cuentaDetalle.tipo}</p>
                    </div>
                  </div>
                  <button onClick={() => setCuentaDetalle(null)} className="text-slate-400 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Acciones rápidas */}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => { setShowNuevaOpp(true); }}
                    className="btn-secondary text-xs flex items-center gap-1">
                    <Target className="w-3.5 h-3.5" /> Oportunidad
                  </button>
                  <button onClick={() => { setShowNuevaActividad(true); }}
                    className="btn-secondary text-xs flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5" /> Seguimiento
                  </button>
                  <button onClick={() => { setShowNuevoProyecto(true); }}
                    className="btn-secondary text-xs flex items-center gap-1">
                    <FolderKanban className="w-3.5 h-3.5" /> Proyecto
                  </button>
                </div>

                {/* Tabs del detalle */}
                <div className="flex gap-0.5 mt-3 -mb-px flex-wrap">
                  {[
                    { id: 'resumen',        label: 'Resumen',     icon: Eye },
                    { id: 'oportunidades',  label: 'Opps.',       icon: TrendingUp },
                    { id: 'seguimientos',   label: 'Seguim.',     icon: CalendarDays },
                    { id: 'contactos',      label: 'Contactos',   icon: Users },
                    { id: 'proyectos',      label: 'Proyectos',   icon: FolderKanban },
                  ].map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => setCuentaDetTab(id as CuentaDetTab)}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-all ${
                        cuentaDetTab === id
                          ? 'border-indigo-400 text-indigo-300'
                          : 'border-transparent text-slate-500 hover:text-slate-300'
                      }`}>
                      <Icon className="w-3 h-3" /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contenido scrolleable */}
              <div className="flex-1 overflow-y-auto p-5">
                {loadingDetalle ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                  </div>
                ) : (
                  <>
                    {/* Tab: Resumen */}
                    {cuentaDetTab === 'resumen' && (
                      <div className="space-y-4">
                        {/* Info de contacto */}
                        <div className="app-card p-4 space-y-2">
                          {cuentaDetalle.email    && <p className="text-sm flex items-center gap-2"><Mail  className="w-4 h-4 text-slate-500 shrink-0" />{cuentaDetalle.email}</p>}
                          {cuentaDetalle.telefono && <p className="text-sm flex items-center gap-2"><Phone className="w-4 h-4 text-slate-500 shrink-0" />{cuentaDetalle.telefono}</p>}
                          {!cuentaDetalle.email && !cuentaDetalle.telefono && (
                            <p className="text-sm text-slate-500">Sin datos de contacto registrados</p>
                          )}
                        </div>

                        {/* Métricas del cliente */}
                        {fichaCliente && (
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: 'Deuda actual',     value: money(fichaCliente.resumen.deuda_pendiente || 0), color: fichaCliente.resumen.deuda_pendiente > 0 ? 'text-rose-300' : 'text-emerald-300' },
                              { label: 'Ventas totales',   value: String(fichaCliente.resumen.total_ventas || 0),   color: 'text-slate-100' },
                              { label: 'Opps. abiertas',   value: String(fichaCliente.resumen.oportunidades_abiertas || 0), color: 'text-amber-300' },
                              { label: 'Proyectos activos',value: String(fichaCliente.resumen.proyectos_activos || 0), color: 'text-indigo-300' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="app-card p-3">
                                <p className="text-xs text-slate-500">{label}</p>
                                <p className={`text-lg font-bold mt-0.5 ${color}`}>{value}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Últimas ventas */}
                        {fichaCliente?.ventas?.length ? (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">Últimas ventas</p>
                            <div className="space-y-1.5">
                              {fichaCliente.ventas.slice(0, 4).map((v) => (
                                <div key={v.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-white/3 border border-white/5 text-sm">
                                  <span className="text-slate-400">Venta #{v.id}</span>
                                  <span className="text-slate-600">·</span>
                                  <span className="text-slate-400">{formatDate(v.fecha)}</span>
                                  <span className="ml-auto font-medium text-white">{money(Number(v.total || 0))}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Tab: Oportunidades */}
                    {cuentaDetTab === 'oportunidades' && (
                      <div className="space-y-2">
                        {(fichaCliente?.oportunidades || oportunidades.filter((o) => o.crm_cuenta_id === cuentaDetalle.id)).length === 0 ? (
                          <div className="text-center py-10">
                            <Target className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                            <p className="text-sm text-slate-500">No hay oportunidades para esta cuenta</p>
                            <button onClick={() => setShowNuevaOpp(true)} className="btn-secondary text-xs mt-3">
                              + Agregar oportunidad
                            </button>
                          </div>
                        ) : (fichaCliente?.oportunidades || oportunidades.filter((o) => o.crm_cuenta_id === cuentaDetalle.id)).map((opp) => {
                          const cfg = FASE_OPP[opp.fase] || FASE_OPP.lead;
                          return (
                            <div key={opp.id} className="app-card p-3 flex items-center gap-2">
                              <div className="flex-1">
                                <p className="text-sm text-white font-medium">{opp.titulo}</p>
                                <span className={`text-xs rounded-full border px-2 py-0.5 ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.label}</span>
                              </div>
                              <span className="text-sm font-semibold text-emerald-300">{money(opp.valor_estimado)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Tab: Seguimientos */}
                    {cuentaDetTab === 'seguimientos' && (
                      <div className="space-y-2">
                        {(fichaCliente?.actividades || actividades.filter((a) => (a as any).crm_cuenta_id === cuentaDetalle.id)).length === 0 ? (
                          <div className="text-center py-10">
                            <CalendarDays className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                            <p className="text-sm text-slate-500">No hay seguimientos para esta cuenta</p>
                          </div>
                        ) : (fichaCliente?.actividades || []).map((act) => {
                          const cfg = TIPO_ACTIVIDAD[act.tipo] || TIPO_ACTIVIDAD.tarea;
                          return (
                            <div key={act.id} className="app-card p-3 flex items-center gap-2">
                              <span className="text-lg shrink-0">{cfg.emoji}</span>
                              <div className="flex-1">
                                <p className="text-sm text-white">{act.asunto}</p>
                                <p className="text-xs text-slate-500">{cfg.label} · {formatDateTime(act.fecha_hora)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Tab: Contactos */}
                    {cuentaDetTab === 'contactos' && (
                      <div className="space-y-4">
                        {contactos.length === 0 ? (
                          <div className="text-center py-8">
                            <User className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                            <p className="text-sm text-slate-500">No hay contactos registrados</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {contactos.map((c) => (
                              <div key={c.id} className="app-card p-3 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                                  <User className="w-4 h-4 text-indigo-400" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white">{c.nombre}</p>
                                  <p className="text-xs text-slate-500">{c.cargo || 'Sin cargo'}{c.email ? ` · ${c.email}` : ''}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Formulario para agregar contacto */}
                        <div className="p-4 rounded-xl border border-white/10 bg-white/3 space-y-3">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Agregar contacto</p>
                          <input className="input-field w-full text-sm" placeholder="Nombre completo *"
                            value={contactForm.nombre} onChange={(e) => setContactForm((p) => ({ ...p, nombre: e.target.value }))} />
                          <input className="input-field w-full text-sm" placeholder="Cargo"
                            value={contactForm.cargo} onChange={(e) => setContactForm((p) => ({ ...p, cargo: e.target.value }))} />
                          <input type="email" className="input-field w-full text-sm" placeholder="Email"
                            value={contactForm.email} onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))} />
                          <button onClick={saveContact} disabled={saving} className="btn-secondary text-sm w-full flex items-center justify-center gap-1.5">
                            <UserPlus className="w-4 h-4" /> {saving ? 'Guardando...' : 'Agregar contacto'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Tab: Proyectos */}
                    {cuentaDetTab === 'proyectos' && (
                      <div className="space-y-2">
                        {(fichaCliente?.proyectos || proyectos.filter((p) => (p as any).crm_cuenta_id === cuentaDetalle.id)).length === 0 ? (
                          <div className="text-center py-10">
                            <FolderKanban className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                            <p className="text-sm text-slate-500">No hay proyectos para esta cuenta</p>
                            <button onClick={() => setShowNuevoProyecto(true)} className="btn-secondary text-xs mt-3">
                              + Crear proyecto
                            </button>
                          </div>
                        ) : (fichaCliente?.proyectos || []).map((p) => {
                          const cfg = ESTADO_PROYECTO[p.estado] || ESTADO_PROYECTO.planificado;
                          return (
                            <div key={p.id} className="app-card p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-medium text-white flex-1">{p.nombre}</span>
                                <span className={`text-xs rounded-full border px-2 py-0.5 ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.label}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${p.progreso_pct}%` }} />
                                </div>
                                <span className="text-xs text-slate-500">{p.progreso_pct.toFixed(0)}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
