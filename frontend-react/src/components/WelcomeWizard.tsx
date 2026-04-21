import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  BadgeDollarSign,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Package,
  ShoppingBasket,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { Api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { getRoleFromToken } from '../lib/auth';
import { uploadImageToCloudinary } from '../lib/cloudinary';
import Button from '../ui/Button';
import Alert from './Alert';

const STORAGE_KEY = 'kaisen_wizard_dismissed';

type SetupSnapshot = {
  products: number;
  clients: number;
  paymentMethods: number;
};

type BusinessProfile = {
  nombre: string;
  direccion: string;
  logo_url: string;
  client_mode: 'manual' | 'anonymous' | 'later';
};

type PaymentMethodToggle = {
  key: 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'cuenta_corriente';
  label: string;
  aliases: readonly string[];
  active: boolean;
  id?: number;
};

type ExistingPaymentMethod = {
  id: number;
  nombre: string;
  activo?: boolean;
  moneda?: string | null;
  orden?: number;
};

function hasBeenDismissed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

function dismissWizard() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // ignore
  }
}

function resetDismissedState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: total }).map((_, index) => (
        <span
          key={index}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            index === current ? 'w-6 bg-cyan-300' : 'w-2 bg-white/15'
          }`}
        />
      ))}
    </div>
  );
}

function buildPaymentMethodToggles(
  existingMethods: ExistingPaymentMethod[] = []
): PaymentMethodToggle[] {
  const base = [
    {
      key: 'efectivo',
      label: 'Efectivo',
      aliases: ['efectivo', 'cash'],
    },
    {
      key: 'debito',
      label: 'Debito',
      aliases: ['debito', 'tarjeta debito', 'débito'],
    },
    {
      key: 'credito',
      label: 'Credito',
      aliases: ['credito', 'tarjeta credito', 'crédito'],
    },
    {
      key: 'transferencia',
      label: 'Transferencia',
      aliases: ['transferencia', 'transferencia bancaria'],
    },
    {
      key: 'cuenta_corriente',
      label: 'Cuenta corriente',
      aliases: ['cuenta corriente', 'cuenta_corriente', 'cta cte'],
    },
  ] as const;

  return base.map((method) => {
    const matched = existingMethods.find((row) =>
      method.aliases.some((alias) =>
        String(row.nombre || '')
          .trim()
          .toLowerCase()
          .includes(alias)
      )
    );

    return {
      ...method,
      id: matched?.id,
      active: Boolean(matched?.activo),
    };
  });
}

function downloadProductsTemplate() {
  const csv = [
    'nombre,categoria_path,costo_pesos,stock,codigo,image_url',
    'Coca Cola 2L,Bebidas > Gaseosas,1200,12,7790001,',
    'Pan lactal,Almacen > Panificados,850,20,7790002,',
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'plantilla-productos-kaisen.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function WelcomeWizard() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [snapshot, setSnapshot] = useState<SetupSnapshot>({
    products: 0,
    clients: 0,
    paymentMethods: 0,
  });
  const [profile, setProfile] = useState<BusinessProfile>({
    nombre: '',
    direccion: '',
    logo_url: '',
    client_mode: 'manual',
  });
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodToggle[]>([]);

  async function loadWizardContext() {
    setLoading(true);
    setError(null);
    try {
      const [products, clients, paymentMethodsRows, businessProfile] = await Promise.all([
        Api.productos({ limit: 3 }),
        Api.clientes({ limit: 3 }),
        Api.metodosPago({ inactivos: true }).catch(() => []),
        Api.businessProfile().catch(() => ({})),
      ]);

      const nextSnapshot = {
        products: Array.isArray(products) ? products.length : 0,
        clients: Array.isArray(clients) ? clients.length : 0,
        paymentMethods: Array.isArray(paymentMethodsRows)
          ? paymentMethodsRows.filter((row: any) => Boolean(row?.activo)).length
          : 0,
      };

      setSnapshot(nextSnapshot);
      setPaymentMethods(
        buildPaymentMethodToggles((paymentMethodsRows || []) as ExistingPaymentMethod[])
      );
      setProfile({
        nombre: String((businessProfile as any)?.nombre || '').trim(),
        direccion: String((businessProfile as any)?.direccion || '').trim(),
        logo_url: String((businessProfile as any)?.logo_url || '').trim(),
        client_mode:
          (businessProfile as any)?.client_mode === 'anonymous' ||
          (businessProfile as any)?.client_mode === 'later'
            ? (businessProfile as any).client_mode
            : 'manual',
      });

      const hasBusinessProfile =
        String((businessProfile as any)?.nombre || '').trim().length > 0 &&
        String((businessProfile as any)?.direccion || '').trim().length > 0;
      const hasProducts = nextSnapshot.products > 0;
      const hasPaymentMethods = nextSnapshot.paymentMethods > 0;
      const shouldShow = !hasBeenDismissed() && (!hasBusinessProfile || !hasProducts || !hasPaymentMethods);

      setVisible(shouldShow);
      if (!shouldShow && !hasBusinessProfile && !hasProducts && !hasPaymentMethods) {
        resetDismissedState();
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar el onboarding inicial'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (role !== 'admin') return;
    loadWizardContext();
  }, [role]);

  useEffect(() => {
    const onEscape = () => {
      setVisible(false);
      dismissWizard();
    };

    window.addEventListener('kaisen:escape', onEscape as EventListener);
    return () => window.removeEventListener('kaisen:escape', onEscape as EventListener);
  }, []);

  const enabledPaymentMethods = useMemo(
    () => paymentMethods.filter((method) => method.active),
    [paymentMethods]
  );

  const businessReady =
    profile.nombre.trim().length > 0 && profile.direccion.trim().length > 0;

  const steps = useMemo(
    () => [
      {
        id: 'negocio',
        icon: <Building2 size={22} className="text-cyan-300" />,
        title: `Bienvenido${profile.nombre ? ` a ${profile.nombre}` : ' a tu negocio'}`,
        subtitle: 'Nombre comercial, direccion y logo visibles para todo el equipo.',
        status: businessReady ? 'Perfil confirmado' : 'Pendiente',
      },
      {
        id: 'productos',
        icon: <Package size={22} className="text-amber-300" />,
        title: 'Carga tus productos',
        subtitle:
          snapshot.products > 0
            ? `${snapshot.products} producto${snapshot.products > 1 ? 's' : ''} detectados`
            : 'Todavia no hay productos cargados',
        status: snapshot.products > 0 ? 'Catalogo inicial listo' : 'Pendiente',
      },
      {
        id: 'cobros',
        icon: <BadgeDollarSign size={22} className="text-emerald-300" />,
        title: 'Configura tus metodos de pago',
        subtitle:
          enabledPaymentMethods.length > 0
            ? `${enabledPaymentMethods.length} metodo${enabledPaymentMethods.length > 1 ? 's' : ''} activo${enabledPaymentMethods.length > 1 ? 's' : ''}`
            : 'Todavia no definiste como cobrar',
        status: enabledPaymentMethods.length > 0 ? 'Cobros listos' : 'Pendiente',
      },
      {
        id: 'clientes',
        icon: <Users size={22} className="text-fuchsia-300" />,
        title: 'Agrega tus clientes',
        subtitle:
          profile.client_mode === 'anonymous'
            ? 'Tu negocio opera por mostrador o consumidor final.'
            : snapshot.clients > 0
              ? `${snapshot.clients} cliente${snapshot.clients > 1 ? 's' : ''} cargados`
              : 'Puedes cargar clientes ahora o mas adelante',
        status:
          profile.client_mode === 'anonymous' || snapshot.clients > 0 || profile.client_mode === 'later'
            ? 'Configurado'
            : 'Pendiente',
      },
      {
        id: 'venta',
        icon: <ShoppingBasket size={22} className="text-cyan-300" />,
        title: 'Todo listo. Hace tu primera venta',
        subtitle: 'La ruta corta es Caja Rapida: buscar, cobrar e imprimir.',
        status:
          businessReady && snapshot.products > 0 && enabledPaymentMethods.length > 0
            ? 'Listo para abrir caja'
            : 'Faltan pasos basicos',
      },
    ],
    [
      businessReady,
      enabledPaymentMethods.length,
      profile.client_mode,
      profile.nombre,
      snapshot.clients,
      snapshot.products,
    ]
  );

  const current = steps[step];

  async function persistBusinessProfile() {
    if (!businessReady) {
      setError('Completa nombre y direccion antes de continuar.');
      return false;
    }

    await Api.guardarBusinessProfile({
      nombre: profile.nombre.trim(),
      direccion: profile.direccion.trim(),
      logo_url: profile.logo_url.trim() || undefined,
      client_mode: profile.client_mode,
    });
    return true;
  }

  async function persistPaymentMethods() {
    if (!enabledPaymentMethods.length) {
      setError('Marca al menos un metodo de pago para continuar.');
      return false;
    }

    for (const method of paymentMethods) {
      if (method.id) {
        await Api.actualizarMetodoPago(method.id, {
          nombre: method.label,
          activo: method.active,
        });
        continue;
      }

      if (method.active) {
        await Api.crearMetodoPago({
          nombre: method.label,
          activo: true,
          moneda: 'ARS',
          orden: paymentMethods.findIndex((row) => row.key === method.key) + 1,
        });
      }
    }

    return true;
  }

  async function persistClientMode() {
    await Api.guardarBusinessProfile({
      client_mode: profile.client_mode,
    });
    return true;
  }

  async function handlePrimaryAction() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (step === 0) {
        const ok = await persistBusinessProfile();
        if (!ok) return;
        setSuccess('Perfil del negocio guardado.');
        setStep(1);
        await loadWizardContext();
        return;
      }

      if (step === 1) {
        dismissWizard();
        navigate('/app/productos');
        setVisible(false);
        return;
      }

      if (step === 2) {
        const ok = await persistPaymentMethods();
        if (!ok) return;
        setSuccess('Metodos de pago actualizados.');
        setStep(3);
        await loadWizardContext();
        return;
      }

      if (step === 3) {
        await persistClientMode();
        if (profile.client_mode === 'manual') {
          dismissWizard();
          navigate('/app/clientes');
          setVisible(false);
        } else {
          setStep(4);
        }
        setSuccess('Preferencia de clientes guardada.');
        return;
      }

      dismissWizard();
      navigate('/app/caja');
      setVisible(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo completar este paso'
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File | null) {
    if (!file) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const url = await uploadImageToCloudinary(file);
      setProfile((currentProfile) => ({ ...currentProfile, logo_url: url }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'No se pudo subir el logo');
    } finally {
      setUploadingLogo(false);
    }
  }

  function closeWizard() {
    dismissWizard();
    setVisible(false);
  }

  if (role !== 'admin' || loading || !visible) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Asistente de onboarding inicial"
      className="fixed inset-0 z-[9998] overflow-y-auto overscroll-contain p-2 sm:p-4"
    >
      <button
        type="button"
        className="fixed inset-0 bg-black/75 backdrop-blur-sm"
        onClick={closeWizard}
        aria-label="Cerrar asistente"
      />

      <section className="relative z-10 mx-auto flex min-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/95 shadow-[0_30px_90px_rgba(0,0,0,0.5)] sm:min-h-0 sm:max-h-[calc(100dvh-2rem)] lg:grid lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="hidden border-b border-white/10 bg-white/5 p-6 lg:flex lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.26em] text-cyan-200">
                  Onboarding guiado
                </div>
                <h2 className="mt-3 text-2xl font-semibold text-slate-50">
                  Deja el negocio listo para vender en minutos
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  Cada paso elimina una friccion real: identidad, catalogo, cobro, clientes y primera venta.
                </p>
              </div>
              <button
                type="button"
                onClick={closeWizard}
                aria-label="Cerrar onboarding"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 space-y-3 overflow-y-auto pr-1">
              {steps.map((wizardStep, index) => (
                <button
                  key={wizardStep.id}
                  type="button"
                  onClick={() => setStep(index)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    index === step
                      ? 'border-cyan-400/40 bg-cyan-400/10'
                      : 'border-white/10 bg-slate-950/50 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-black/20">
                      {wizardStep.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100">
                          {wizardStep.title}
                        </span>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                          Paso {index + 1}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-400">{wizardStep.status}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <div className="border-b border-white/10 bg-slate-950/95 px-4 py-4 sm:px-6 lg:hidden">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.26em] text-cyan-200">
                  Onboarding guiado
                </div>
                <h2 className="mt-3 text-xl font-semibold text-slate-50 sm:text-2xl">
                  Deja el negocio listo para vender en minutos
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Cada paso elimina una friccion real: identidad, catalogo, cobro, clientes y primera venta.
                </p>
              </div>
              <button
                type="button"
                onClick={closeWizard}
                aria-label="Cerrar onboarding"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {steps.map((wizardStep, index) => (
                <button
                  key={wizardStep.id}
                  type="button"
                  onClick={() => setStep(index)}
                  className={`shrink-0 rounded-2xl border px-3 py-3 text-left transition ${
                    index === step
                      ? 'border-cyan-400/40 bg-cyan-400/10'
                      : 'border-white/10 bg-slate-950/50 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-black/20">
                      {wizardStep.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-100">Paso {index + 1}</div>
                      <div className="max-w-[10rem] truncate text-xs text-slate-400">
                        {wizardStep.status}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Paso {step + 1} de {steps.length}
              </div>
              <div className="shrink-0">
                <StepDots current={step} total={steps.length} />
              </div>
            </div>

            <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1 sm:pr-2">
              <div className="pb-6">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-3xl bg-white/5">
                  {current.icon}
                </div>
                <h3 className="mt-4 text-2xl font-semibold text-slate-50 sm:text-3xl">
                  {current.title}
                </h3>
                <p className="mt-3 text-sm text-cyan-100 sm:text-base">{current.subtitle}</p>

                <div className="mt-6 space-y-4">
                  {error && <Alert kind="error" message={error} />}
                  {success && <Alert kind="info" message={success} />}
                </div>

                {step === 0 && (
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm text-slate-200">Nombre del negocio</span>
                      <input
                        className="input-modern text-sm"
                        value={profile.nombre}
                        onChange={(event) =>
                          setProfile((currentProfile) => ({
                            ...currentProfile,
                            nombre: event.target.value,
                          }))
                        }
                        placeholder="Ej: Almacen San Martin"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm text-slate-200">Direccion</span>
                      <input
                        className="input-modern text-sm"
                        value={profile.direccion}
                        onChange={(event) =>
                          setProfile((currentProfile) => ({
                            ...currentProfile,
                            direccion: event.target.value,
                          }))
                        }
                        placeholder="Ej: Av. Siempre Viva 123"
                      />
                    </label>
                    <div className="space-y-2 sm:col-span-2">
                      <span className="text-sm text-slate-200">Logo</span>
                      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center">
                        <label className="inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/10">
                          <Upload size={16} />
                          <span>{uploadingLogo ? 'Subiendo...' : 'Subir logo'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploadingLogo}
                            onChange={(event) => handleLogoUpload(event.target.files?.[0] || null)}
                          />
                        </label>
                        <input
                          className="input-modern text-sm md:flex-1"
                          value={profile.logo_url}
                          onChange={(event) =>
                            setProfile((currentProfile) => ({
                              ...currentProfile,
                              logo_url: event.target.value,
                            }))
                          }
                          placeholder="O pega una URL de imagen"
                        />
                        {profile.logo_url ? (
                          <img
                            src={profile.logo_url}
                            alt="Logo del negocio"
                            className="h-16 w-16 rounded-2xl object-cover"
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className="mt-6 space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-medium text-slate-100">
                        Tus productos son la base de caja, stock y reportes.
                      </div>
                      <div className="mt-2 text-sm text-slate-300">
                        Puedes importar desde Excel con una plantilla simple o cargar productos manualmente.
                      </div>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <Button type="button" className="min-h-[48px] w-full sm:w-auto" onClick={downloadProductsTemplate}>
                        <FileSpreadsheet size={16} className="mr-2" />
                        Descargar plantilla
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-[48px] w-full sm:w-auto"
                        onClick={() => {
                          dismissWizard();
                          navigate('/app/productos');
                          setVisible(false);
                        }}
                      >
                        Ir a productos
                      </Button>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-4 text-sm text-slate-300">
                      Estado actual: {snapshot.products > 0
                        ? `${snapshot.products} producto${snapshot.products > 1 ? 's' : ''} detectados`
                        : 'sin productos cargados'}
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="mt-6 space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      {paymentMethods.map((method) => (
                        <label
                          key={method.key}
                          className={`flex min-h-[64px] items-center gap-3 rounded-2xl border px-4 py-4 text-sm transition ${
                            method.active
                              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
                              : 'border-white/10 bg-white/5 text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded border-white/20 bg-black/30"
                            checked={method.active}
                            onChange={(event) =>
                              setPaymentMethods((currentMethods) =>
                                currentMethods.map((currentMethod) =>
                                  currentMethod.key === method.key
                                    ? { ...currentMethod, active: event.target.checked }
                                    : currentMethod
                                )
                              )
                            }
                          />
                          <span className="font-medium">{method.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-4 text-sm text-slate-300">
                      Marca solo lo que ya usas en el mostrador. No hace falta tomar decisiones tecnicas.
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="mt-6 space-y-4">
                    <div className="grid gap-3">
                      {[
                        {
                          value: 'manual',
                          title: 'Quiero cargar clientes ahora',
                          detail: 'Ideal si vendes a cuentas corrientes, repartos o necesitas historial por cliente.',
                        },
                        {
                          value: 'later',
                          title: 'Los cargare despues',
                          detail: 'Puedes empezar a vender ya y completar la base de clientes mas tarde.',
                        },
                        {
                          value: 'anonymous',
                          title: 'Mis ventas son anonimas de mostrador',
                          detail: 'Usaremos consumidor final como flujo principal para ventas rapidas.',
                        },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setProfile((currentProfile) => ({
                              ...currentProfile,
                              client_mode: option.value as BusinessProfile['client_mode'],
                            }))
                          }
                          className={`rounded-2xl border px-4 py-4 text-left transition ${
                            profile.client_mode === option.value
                              ? 'border-fuchsia-400/30 bg-fuchsia-400/10'
                              : 'border-white/10 bg-white/5 hover:bg-white/10'
                          }`}
                        >
                          <div className="text-sm font-semibold text-slate-100">{option.title}</div>
                          <div className="mt-2 text-sm text-slate-300">{option.detail}</div>
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          dismissWizard();
                          navigate('/app/clientes');
                          setVisible(false);
                        }}
                      >
                        Ir a clientes
                      </Button>
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="mt-6 space-y-4">
                    <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
                      <div className="text-sm font-semibold text-emerald-100">
                        Caja Rapida quedo lista para operar.
                      </div>
                      <div className="mt-3 text-sm leading-7 text-slate-200">
                        Perfil del negocio: {businessReady ? 'ok' : 'pendiente'}.
                        Catalogo: {snapshot.products > 0 ? `${snapshot.products} productos` : 'sin productos'}.
                        Cobros: {enabledPaymentMethods.length} metodo{enabledPaymentMethods.length === 1 ? '' : 's'}.
                        Clientes: {profile.client_mode === 'anonymous'
                          ? 'modo mostrador'
                          : snapshot.clients > 0
                            ? `${snapshot.clients} cargados`
                            : 'pendientes'}.
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="min-h-[56px] w-full text-base"
                      onClick={() => {
                        dismissWizard();
                        navigate('/app/caja');
                        setVisible(false);
                      }}
                    >
                      Abrir caja
                      <ChevronRight size={18} className="ml-2" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-white/10 bg-slate-950/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 sm:pt-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((currentStep) => currentStep - 1)}
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-slate-200 transition hover:bg-white/10 sm:w-auto"
                >
                  <ChevronLeft size={16} />
                  Anterior
                </button>
              )}
              {step < steps.length - 1 && (
                <button
                  type="button"
                  onClick={handlePrimaryAction}
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-5 text-sm font-semibold text-slate-950 disabled:opacity-60 sm:w-auto"
                  disabled={saving || uploadingLogo}
                >
                  {saving ? 'Guardando...' : step === 1 ? 'Ir al catalogo' : 'Guardar y seguir'}
                  <ChevronRight size={16} />
                </button>
              )}
              {step === steps.length - 1 && (
                <button
                  type="button"
                  onClick={handlePrimaryAction}
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-emerald-300 px-5 text-sm font-semibold text-slate-950 disabled:opacity-60 sm:w-auto"
                  disabled={saving}
                >
                  {saving ? 'Abriendo...' : 'Abrir Caja Rapida'}
                  <ChevronRight size={16} />
                </button>
              )}
              </div>

              <button
                type="button"
                onClick={closeWizard}
                className="mt-4 w-full text-center text-sm text-slate-500 transition hover:text-slate-300 sm:w-auto sm:text-left"
              >
                Omitir por ahora
              </button>
            </div>
          </div>
      </section>
    </div>,
    document.body,
  );
}
