/**
 * ConfiguracionAlertas.tsx
 *
 * Panel de configuración de alertas WhatsApp automáticas para el dueño.
 * Permite activar/desactivar cada tipo de alerta, configurar el teléfono
 * destino y enviar un mensaje de prueba para verificar la conexión.
 */

import { useEffect, useState } from 'react';
import { Bell, BellOff, Phone, TrendingUp, Package, Clock, Send, Save, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Api } from '../lib/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AlertConfig {
  enabled: boolean;
  ownerPhone: string | null;
  stock: { enabled: boolean; threshold: number };
  daily: { enabled: boolean; hour: number };
  bigSale: { enabled: boolean; minArs: number };
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type TestStatus = 'idle' | 'sending' | 'ok' | 'error';

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function SectionToggle({
  label,
  description,
  icon: Icon,
  enabled,
  onChange,
}: {
  label: string;
  description: string;
  icon: React.ElementType;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/8 transition-colors">
      <div className="mt-0.5 flex-shrink-0">
        <Icon size={20} className={enabled ? 'text-cyan-400' : 'text-slate-500'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-200">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</div>
      </div>
      <div className="flex-shrink-0 mt-0.5">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onChange(!enabled)}
          className={`relative inline-flex h-5 w-9 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
            enabled ? 'bg-cyan-500' : 'bg-slate-700'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </label>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <span className="text-sm text-slate-400 sm:w-52 flex-shrink-0">{label}</span>
      {children}
    </div>
  );
}

function NumericInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (!Number.isNaN(n)) onChange(n);
      }}
      className="w-full sm:w-40 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-40"
    />
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ConfiguracionAlertas() {
  const [config, setConfig] = useState<AlertConfig>({
    enabled: true,
    ownerPhone: '',
    stock:   { enabled: true,  threshold: 5 },
    daily:   { enabled: true,  hour: 20 },
    bigSale: { enabled: true,  minArs: 100000 },
  });

  const [loading,    setLoading]    = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testMsg,    setTestMsg]    = useState('');

  // ─── Carga inicial ─────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    Api.getAlertConfig()
      .then((data: AlertConfig) => {
        if (!cancelled) {
          setConfig({
            enabled:    data.enabled ?? true,
            ownerPhone: data.ownerPhone ?? '',
            stock:   { enabled: data.stock?.enabled   ?? true, threshold: data.stock?.threshold   ?? 5 },
            daily:   { enabled: data.daily?.enabled   ?? true, hour:      data.daily?.hour         ?? 20 },
            bigSale: { enabled: data.bigSale?.enabled ?? true, minArs:    data.bigSale?.minArs     ?? 100000 },
          });
        }
      })
      .catch(() => { /* carga silenciosa */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ─── Guardar ───────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaveStatus('saving');
    try {
      await Api.saveAlertConfig(config as unknown as Record<string, unknown>);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  }

  // ─── Prueba ────────────────────────────────────────────────────────────────

  async function handleTest() {
    setTestStatus('sending');
    setTestMsg('');
    try {
      const res: any = await Api.testAlert();
      if (res?.ok) {
        setTestStatus('ok');
        setTestMsg('Mensaje de prueba enviado correctamente.');
      } else {
        setTestStatus('error');
        setTestMsg(res?.error || 'No se pudo enviar el mensaje de prueba.');
      }
    } catch {
      setTestStatus('error');
      setTestMsg('Error de red al enviar la prueba.');
    }
    setTimeout(() => { setTestStatus('idle'); setTestMsg(''); }, 6000);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 text-sm">
        Cargando configuración de alertas...
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Encabezado */}
      <div>
        <h1 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
          <Bell size={20} className="text-cyan-400" />
          Alertas WhatsApp
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Recibí notificaciones automáticas en tu WhatsApp ante eventos importantes del negocio.
        </p>
      </div>

      {/* Interruptor maestro */}
      <SectionToggle
        label="Alertas habilitadas"
        description="Activa o desactiva todas las alertas automáticas. El teléfono debe estar configurado abajo."
        icon={config.enabled ? Bell : BellOff}
        enabled={config.enabled}
        onChange={(v) => setConfig((c) => ({ ...c, enabled: v }))}
      />

      {/* Teléfono del dueño */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
          <Phone size={16} className="text-cyan-400" />
          Teléfono del dueño
        </div>
        <FieldRow label="Número E.164">
          <input
            type="tel"
            inputMode="tel"
            value={config.ownerPhone ?? ''}
            placeholder="+5491112345678"
            onChange={(e) => setConfig((c) => ({ ...c, ownerPhone: e.target.value }))}
            className="flex-1 sm:flex-none sm:w-64 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </FieldRow>
        <p className="text-xs text-slate-600">
          Incluí el código de país. Ej: Argentina con código de área → +5491112345678
        </p>
      </div>

      {/* Resumen diario */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
        <SectionToggle
          label="Resumen diario"
          description="Recibí un resumen de ventas, clientes y producto más vendido cada día a la hora que configures."
          icon={Clock}
          enabled={config.daily.enabled}
          onChange={(v) => setConfig((c) => ({ ...c, daily: { ...c.daily, enabled: v } }))}
        />
        <FieldRow label="Hora del resumen (0-23)">
          <NumericInput
            value={config.daily.hour}
            min={0}
            max={23}
            disabled={!config.daily.enabled}
            onChange={(v) =>
              setConfig((c) => ({ ...c, daily: { ...c.daily, hour: Math.min(23, Math.max(0, v)) } }))
            }
          />
        </FieldRow>
      </div>

      {/* Stock bajo */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
        <SectionToggle
          label="Alerta de stock bajo"
          description="Recibí una alerta cuando algún producto baja del mínimo de unidades. Una vez cada 24 h por producto."
          icon={Package}
          enabled={config.stock.enabled}
          onChange={(v) => setConfig((c) => ({ ...c, stock: { ...c.stock, enabled: v } }))}
        />
        <FieldRow label="Stock mínimo (unidades)">
          <NumericInput
            value={config.stock.threshold}
            min={0}
            disabled={!config.stock.enabled}
            onChange={(v) =>
              setConfig((c) => ({ ...c, stock: { ...c.stock, threshold: Math.max(0, v) } }))
            }
          />
        </FieldRow>
      </div>

      {/* Venta grande */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
        <SectionToggle
          label="Alerta de venta grande"
          description="Recibí un aviso cada vez que se registra una venta por encima del importe mínimo configurado."
          icon={TrendingUp}
          enabled={config.bigSale.enabled}
          onChange={(v) => setConfig((c) => ({ ...c, bigSale: { ...c.bigSale, enabled: v } }))}
        />
        <FieldRow label="Importe mínimo (ARS)">
          <NumericInput
            value={config.bigSale.minArs}
            min={0}
            step={1000}
            disabled={!config.bigSale.enabled}
            onChange={(v) =>
              setConfig((c) => ({ ...c, bigSale: { ...c.bigSale, minArs: Math.max(0, v) } }))
            }
          />
        </FieldRow>
      </div>

      {/* Acciones */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">

        {/* Guardar */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saveStatus === 'saving' ? (
            <>
              <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Guardando...
            </>
          ) : saveStatus === 'saved' ? (
            <>
              <CheckCircle size={16} />
              Guardado
            </>
          ) : saveStatus === 'error' ? (
            <>
              <XCircle size={16} />
              Error al guardar
            </>
          ) : (
            <>
              <Save size={16} />
              Guardar cambios
            </>
          )}
        </button>

        {/* Enviar prueba */}
        <button
          type="button"
          onClick={handleTest}
          disabled={testStatus === 'sending'}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-sm text-slate-300 hover:text-slate-100 hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          {testStatus === 'sending' ? (
            <>
              <span className="h-4 w-4 border-2 border-slate-400/40 border-t-slate-400 rounded-full animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send size={14} />
              Enviar mensaje de prueba
            </>
          )}
        </button>
      </div>

      {/* Feedback de la prueba */}
      {testMsg && (
        <div
          className={`flex items-start gap-2 px-4 py-3 rounded-xl text-sm ${
            testStatus === 'ok' || testStatus === 'idle'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}
        >
          {testStatus === 'ok' || testStatus === 'idle' ? (
            <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          )}
          {testMsg}
        </div>
      )}

      {/* Nota informativa */}
      <div className="text-xs text-slate-600 border-t border-white/5 pt-4 leading-relaxed">
        Las alertas se envían a través del mismo WhatsApp conectado en la sección de Configuración.
        Si WhatsApp no está conectado, los mensajes se descartan (no se encolan).
        El sistema aplica un límite interno de 20 mensajes por hora para proteger la cuenta.
      </div>
    </div>
  );
}
