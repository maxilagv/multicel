import Alert from '../../components/Alert';
import HelpTooltip from '../../components/HelpTooltip';
import ClienteCobranzaSection from './ClienteCobranzaSection';
import type {
  Cliente,
  VentaCliente,
  CrmOportunidad,
  CrmActividad,
  ClienteAcceso,
  RiesgoMora,
  PromesaCobranza,
  RecordatorioCobranza,
  MetodoPago,
  PagoMetodoForm,
  HistorialPago,
  HistorialCuentaItem,
  ClienteInsight,
  ClienteMensaje,
  ClienteTimelineItem,
} from './types';

type ResumenSeleccionado = {
  totalComprado: number;
  ticketPromedio: number;
  ultimaCompra: Date | null;
  deudaCorriente: number;
  comprasCount: number;
  frecuenciaPromedioDias: number | null;
  rankingPosicion: number | null;
  rankingTotal: number;
};

type PromesaFormState = {
  monto: string;
  fecha: string;
  canal: 'whatsapp' | 'email' | 'telefono' | 'manual';
  notas: string;
};

type RecordatorioFormState = {
  canal: 'whatsapp' | 'email' | 'manual';
  destino: string;
  template_code: string;
  mensaje: string;
};

type PagoDeudaFormState = {
  fecha: string;
  venta_id: string;
};

type ClienteDetallePanelProps = {
  selectedCliente: Cliente;
  detalleLoading: boolean;
  detalleError: string | null;
  isMobile: boolean;
  deudaUmbralRojo: number;
  // Resumen
  resumenSeleccionado: ResumenSeleccionado;
  // CRM
  crmOpps: CrmOportunidad[];
  crmActs: CrmActividad[];
  clienteInsight: ClienteInsight | null;
  clienteMensajes: ClienteMensaje[];
  clienteTimeline: ClienteTimelineItem[];
  // Acceso
  clienteAcceso: ClienteAcceso | null;
  accessError: string | null;
  accessSaving: boolean;
  // Cuenta corriente
  historialCuenta: HistorialCuentaItem[];
  ventasPendientes: VentaCliente[];
  saldoDeudaAnterior: number;
  pagoDeudaForm: PagoDeudaFormState;
  pagoMetodos: PagoMetodoForm[];
  pagoDeudaSaving: boolean;
  pagoDeudaError: string | null;
  metodosPago: MetodoPago[];
  metodosPagoLoading: boolean;
  metodosPagoError: string | null;
  totalPagoMetodos: number;
  canSubmitPago: boolean;
  // Cobranza
  riesgoMora: RiesgoMora | null;
  promesasCobranza: PromesaCobranza[];
  recordatoriosCobranza: RecordatorioCobranza[];
  cobranzaLoading: boolean;
  cobranzaError: string | null;
  promesaForm: PromesaFormState;
  promesaSaving: boolean;
  recordatorioForm: RecordatorioFormState;
  recordatorioSaving: boolean;
  // Historial modal
  showHistorialModal: boolean;
  historialPagos: HistorialPago[];
  historialLoading: boolean;
  historialError: string | null;
  historialDeleting: boolean;
  // Handlers
  onClose: () => void;
  onAbrirHistorial: () => void;
  onConfigurarAcceso: () => void;
  onCrearActividadRapida: () => void;
  onPagoDeudaFormChange: (changes: Partial<PagoDeudaFormState>) => void;
  onUpdatePagoMetodo: (index: number, changes: Partial<PagoMetodoForm>) => void;
  onAddPagoMetodoRow: () => void;
  onRemovePagoMetodoRow: (index: number) => void;
  onRegistrarPago: (e: React.FormEvent) => void;
  onLoadCobranza: () => void;
  onPromesaFormChange: (changes: Partial<PromesaFormState>) => void;
  onCrearPromesa: () => void;
  onActualizarEstadoPromesa: (id: number, estado: PromesaCobranza['estado']) => void;
  onRecordatorioFormChange: (changes: Partial<RecordatorioFormState>) => void;
  onCrearRecordatorio: () => void;
  onCloseHistorialModal: () => void;
  onEliminarPagoHistorial: (item: HistorialPago) => void;
};

function leadSegmentLabel(segment?: ClienteInsight['lead_segmento'] | null) {
  if (segment === 'vip') return 'VIP';
  if (segment === 'frecuente') return 'Frecuente';
  if (segment === 'activo') return 'Activo';
  if (segment === 'dormido') return 'Dormido';
  return 'Inactivo';
}

function leadSegmentClass(segment?: ClienteInsight['lead_segmento'] | null) {
  if (segment === 'vip') return 'bg-amber-500/20 border-amber-500/40 text-amber-100';
  if (segment === 'frecuente') return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-100';
  if (segment === 'activo') return 'bg-sky-500/20 border-sky-500/40 text-sky-100';
  if (segment === 'dormido') return 'bg-orange-500/20 border-orange-500/40 text-orange-100';
  return 'bg-rose-500/20 border-rose-500/40 text-rose-100';
}

function messageStatusLabel(message: ClienteMensaje) {
  if (message.provider_status === 'read') return 'Leido';
  if (message.provider_status === 'delivered') return 'Entregado';
  if (message.provider_status === 'failed') return 'Fallido';
  if (message.provider_status === 'sent') return 'Enviado';
  return message.direccion === 'recibido' ? 'Recibido' : 'Registrado';
}

export default function ClienteDetallePanel({
  selectedCliente,
  detalleLoading,
  detalleError,
  isMobile,
  deudaUmbralRojo,
  resumenSeleccionado,
  crmOpps,
  crmActs,
  clienteInsight,
  clienteMensajes,
  clienteTimeline,
  clienteAcceso,
  accessError,
  accessSaving,
  historialCuenta,
  ventasPendientes,
  saldoDeudaAnterior,
  pagoDeudaForm,
  pagoMetodos,
  pagoDeudaSaving,
  pagoDeudaError,
  metodosPago,
  metodosPagoLoading,
  metodosPagoError,
  totalPagoMetodos,
  canSubmitPago,
  riesgoMora,
  promesasCobranza,
  recordatoriosCobranza,
  cobranzaLoading,
  cobranzaError,
  promesaForm,
  promesaSaving,
  recordatorioForm,
  recordatorioSaving,
  showHistorialModal,
  historialPagos,
  historialLoading,
  historialError,
  historialDeleting,
  onClose,
  onAbrirHistorial,
  onConfigurarAcceso,
  onCrearActividadRapida,
  onPagoDeudaFormChange,
  onUpdatePagoMetodo,
  onAddPagoMetodoRow,
  onRemovePagoMetodoRow,
  onRegistrarPago,
  onLoadCobranza,
  onPromesaFormChange,
  onCrearPromesa,
  onActualizarEstadoPromesa,
  onRecordatorioFormChange,
  onCrearRecordatorio,
  onCloseHistorialModal,
  onEliminarPagoHistorial,
}: ClienteDetallePanelProps) {
  return (
    <>
      <div className="app-card p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">Ficha del cliente</h3>
            <p className="text-sm text-slate-400">
              {selectedCliente.nombre} {selectedCliente.apellido || ''} Â·{' '}
              {selectedCliente.email || '-'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-sky-100">
                Sucursal: {selectedCliente.deposito_principal_nombre || 'Sin sucursal'}
              </span>
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-indigo-100">
                Responsable: {selectedCliente.responsable_nombre || 'Sin responsable'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="px-2 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-200 text-xs"
              onClick={onAbrirHistorial}
            >
              Historial de pagos y entregas
            </button>
            <button
              className="px-2 py-1 rounded bg-slate-500/20 hover:bg-slate-500/30 border border-slate-500/40 text-slate-200 text-xs"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </div>
        {detalleError && (
          <div className="mb-3">
            <Alert kind="error" message={detalleError} />
          </div>
        )}
        {detalleLoading ? (
          <div className="py-6 text-center text-slate-500">
            Cargando ficha del cliente...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 text-sm">
              <div className="space-y-1">
                <div className="text-xs text-slate-400 uppercase">Datos</div>
                <div>
                  Telefono:{' '}
                  <span className="text-slate-200">
                    {selectedCliente.telefono || '-'}
                  </span>
                </div>
                <div>
                  Direccion:{' '}
                  <span className="text-slate-200">
                    {selectedCliente.direccion || '-'}
                  </span>
                </div>
                <div>
                  Entre calles:{' '}
                  <span className="text-slate-200">
                    {selectedCliente.entre_calles || '-'}
                  </span>
                </div>
                <div>
                  CUIT/CUIL:{' '}
                  <span className="text-slate-200">
                    {selectedCliente.cuit_cuil || '-'}
                  </span>
                </div>
                <div>
                  Sucursal:{' '}
                  <span className="text-slate-200">
                    {selectedCliente.deposito_principal_nombre || '-'}
                  </span>
                </div>
                <div>
                  Responsable:{' '}
                  <span className="text-slate-200">
                    {selectedCliente.responsable_nombre || '-'}
                    {selectedCliente.responsable_rol
                      ? ` (${selectedCliente.responsable_rol})`
                      : ''}
                  </span>
                </div>
                {accessError && (
                  <div className="text-xs text-rose-300">{accessError}</div>
                )}
                <div>
                  Acceso web:{' '}
                  <span className="text-slate-200">
                    {clienteAcceso?.has_access ? 'Activo' : 'Sin acceso'}
                  </span>
                </div>
                <div>
                  Email de ingreso:{' '}
                  <span className="text-slate-200">
                    {clienteAcceso?.email || selectedCliente.email || '-'}
                  </span>
                </div>
                {clienteAcceso?.last_login_at && (
                  <div className="text-xs text-slate-400">
                    Ultimo ingreso:{' '}
                    {new Date(clienteAcceso.last_login_at).toLocaleString()}
                  </div>
                )}
                <button
                  type="button"
                  onClick={onConfigurarAcceso}
                  className="mt-2 px-2 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={accessSaving}
                >
                  {accessSaving
                    ? 'Guardando...'
                    : clienteAcceso?.has_access
                    ? 'Resetear contrasena'
                    : 'Crear contrasena'}
                </button>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-400 uppercase">Resumen</div>
                <div>
                  Total comprado:{' '}
                  <span className="text-slate-200">
                    ${resumenSeleccionado.totalComprado.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="inline-flex items-center gap-2">
                    Ticket promedio
                    <HelpTooltip>
                      El ticket promedio es el total comprado dividido por la cantidad de ventas del cliente.
                    </HelpTooltip>
                  </span>
                  :{' '}
                  <span className="text-slate-200">
                    {resumenSeleccionado.comprasCount
                      ? `$${resumenSeleccionado.ticketPromedio.toFixed(2)}`
                      : '-'}
                  </span>
                </div>
                <div>
                  Compras realizadas:{' '}
                  <span className="text-slate-200">
                    {resumenSeleccionado.comprasCount}
                  </span>
                </div>
                {clienteInsight && (
                  <>
                    <div>
                      Grupo actual:{' '}
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${leadSegmentClass(clienteInsight.lead_segmento)}`}
                      >
                        {leadSegmentLabel(clienteInsight.lead_segmento)}
                      </span>
                    </div>
                    <div>
                      Prioridad:{' '}
                      <span className="text-slate-200">
                        {clienteInsight.lead_score}/100
                      </span>
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-1">
                <div className="text-xs text-slate-400 uppercase">Situacion</div>
                <div>
                  Deuda corriente:{' '}
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs border ${
                      resumenSeleccionado.deudaCorriente <= 0
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                        : resumenSeleccionado.deudaCorriente < deudaUmbralRojo
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                          : 'bg-rose-500/20 border-rose-500/40 text-rose-200'
                    }`}
                  >
                    ${resumenSeleccionado.deudaCorriente.toFixed(2)}
                  </span>
                </div>
                <div>
                  Última compra:{' '}
                  <span className="text-slate-200">
                    {resumenSeleccionado.ultimaCompra
                      ? resumenSeleccionado.ultimaCompra.toLocaleString()
                      : '-'}
                  </span>
                </div>
                {clienteInsight?.fecha_nacimiento && (
                  <div>
                    Cumpleanos:{' '}
                    <span className="text-slate-200">
                      {new Date(clienteInsight.fecha_nacimiento).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-200 mb-2">
                  Cuenta corriente
                </h4>
                {isMobile ? (
                  <div className="space-y-2">
                    {historialCuenta.map((item) => {
                      const montoTexto =
                        typeof item.monto === 'number'
                          ? item.monto.toFixed(2)
                          : null;
                      const movimiento =
                        item.tipo === 'pago'
                          ? `Pago $${montoTexto ?? '0.00'}`
                          : item.tipo === 'compra'
                            ? `Compro $${montoTexto ?? '0.00'}`
                            : 'Se llevo';
                      return (
                        <article key={item.id} className="app-panel p-3 text-xs space-y-1">
                          <div className="text-slate-100">{movimiento}</div>
                          <div className="text-slate-400">
                            {item.fecha ? new Date(item.fecha).toLocaleDateString() : '-'}
                          </div>
                          <div className="text-slate-300">{item.detalle || '-'}</div>
                        </article>
                      );
                    })}
                    {!historialCuenta.length && (
                      <div className="app-panel p-3 text-xs text-slate-400">
                        Sin movimientos registrados
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs md:text-sm">
                      <thead className="text-left text-slate-400">
                        <tr>
                          <th className="py-1 pr-2">Fecha</th>
                          <th className="py-1 pr-2">Movimiento</th>
                          <th className="py-1 pr-2">Detalle</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-200">
                        {historialCuenta.map((item) => {
                          const montoTexto =
                            typeof item.monto === 'number'
                              ? item.monto.toFixed(2)
                              : null;
                          const movimiento =
                            item.tipo === 'pago'
                              ? `Pago $${montoTexto ?? '0.00'}`
                              : item.tipo === 'compra'
                                ? `Compro $${montoTexto ?? '0.00'}`
                                : 'Se llevo';
                          return (
                            <tr
                              key={item.id}
                              className="border-t border-white/10 hover:bg-white/5"
                            >
                              <td className="py-1 pr-2">
                                {item.fecha ? new Date(item.fecha).toLocaleDateString() : '-'}
                              </td>
                              <td className="py-1 pr-2">{movimiento}</td>
                              <td className="py-1 pr-2">{item.detalle || '-'}</td>
                            </tr>
                          );
                        })}
                        {!historialCuenta.length && (
                          <tr>
                            <td className="py-2 text-slate-400" colSpan={3}>
                              Sin movimientos registrados
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200 mb-2">
                  Pago cuenta corriente
                </h4>
                {pagoDeudaError && (
                  <div className="text-xs text-rose-300 mb-2">{pagoDeudaError}</div>
                )}
                {!ventasPendientes.length && saldoDeudaAnterior <= 0 ? (
                  <div className="text-sm text-slate-400">
                    No hay deuda pendiente para registrar pagos.
                  </div>
                ) : (
                  <form
                    className="space-y-3 text-sm"
                    onSubmit={onRegistrarPago}
                  >
                    <label className="block">
                      <div className="text-slate-300 mb-1">Venta pendiente</div>
                      <select
                        className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                        value={pagoDeudaForm.venta_id}
                        onChange={(e) =>
                          onPagoDeudaFormChange({ venta_id: e.target.value })
                        }
                        disabled={pagoDeudaSaving}
                      >
                        <option value="">Cuenta corriente</option>
                        {ventasPendientes.map((v) => (
                          <option key={v.id} value={v.id}>
                            Venta #{v.id} - saldo ${Number(v.saldo_pendiente ?? v.neto ?? 0).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Formas de pago</span>
                        <button
                          type="button"
                          className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs"
                          onClick={onAddPagoMetodoRow}
                          disabled={pagoDeudaSaving}
                        >
                          Agregar metodo
                        </button>
                      </div>
                      {metodosPagoLoading && (
                        <div className="text-xs text-slate-400">Cargando metodos...</div>
                      )}
                      {metodosPagoError && (
                        <div className="text-xs text-rose-300">{metodosPagoError}</div>
                      )}
                      {!metodosPagoLoading && !metodosPago.length && (
                        <div className="text-xs text-amber-200">
                          No hay metodos de pago configurados. Crea uno en Configuracion.
                        </div>
                      )}
                      <div className="space-y-2">
                        {pagoMetodos.map((row, index) => {
                          const metodo = metodosPago.find(
                            (m) => String(m.id) === String(row.metodo_id)
                          );
                          const moneda = row.moneda || metodo?.moneda || 'ARS';
                          return (
                            <div
                              key={`metodo-${index}`}
                              className="grid grid-cols-1 md:grid-cols-[1.4fr_0.8fr_auto] gap-2 items-center"
                            >
                              <select
                                className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                                value={row.metodo_id}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const metodoSel = metodosPago.find(
                                    (m) => String(m.id) === String(value)
                                  );
                                  onUpdatePagoMetodo(index, {
                                    metodo_id: value,
                                    moneda: metodoSel?.moneda || '',
                                  });
                                }}
                                disabled={pagoDeudaSaving || metodosPagoLoading}
                              >
                                <option value="">Selecciona metodo</option>
                                {metodosPago.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.nombre}
                                  </option>
                                ))}
                              </select>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                                  value={row.monto}
                                  onChange={(e) =>
                                    onUpdatePagoMetodo(index, { monto: e.target.value })
                                  }
                                  disabled={pagoDeudaSaving}
                                />
                                <span className="text-[11px] text-slate-400 w-10 text-right">
                                  {moneda || 'ARS'}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs disabled:opacity-50"
                                onClick={() => onRemovePagoMetodoRow(index)}
                                disabled={pagoMetodos.length <= 1 || pagoDeudaSaving}
                              >
                                Quitar
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Total</span>
                        <span className="text-slate-100">
                          ${totalPagoMetodos.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <label className="block">
                      <div className="text-slate-300 mb-1">Fecha</div>
                      <input
                        type="date"
                        className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-sm text-slate-100"
                        value={pagoDeudaForm.fecha}
                        onChange={(e) =>
                          onPagoDeudaFormChange({ fecha: e.target.value })
                        }
                        disabled={pagoDeudaSaving}
                      />
                    </label>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-100 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!canSubmitPago}
                      >
                        {pagoDeudaSaving ? 'Registrando...' : 'Registrar pago'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-200">
                  Estado de la relacion
                </h4>
                <div>
                  Frecuencia prom. entre compras:{' '}
                  <span className="text-slate-200">
                    {resumenSeleccionado.frecuenciaPromedioDias != null
                      ? `${resumenSeleccionado.frecuenciaPromedioDias.toFixed(1)} días`
                      : '-'}
                  </span>
                </div>
                <div>
                  Ranking (top clientes):{' '}
                  <span className="text-slate-200">
                    {resumenSeleccionado.rankingPosicion
                      ? `#${resumenSeleccionado.rankingPosicion} de ${resumenSeleccionado.rankingTotal}`
                      : resumenSeleccionado.rankingTotal
                      ? 'Fuera del top cargado'
                      : '-'}
                  </span>
                </div>
                {clienteInsight && (
                  <>
                    <div>
                      Dias desde la ultima compra:{' '}
                      <span className="text-slate-200">
                        {clienteInsight.dias_desde_ultima_compra ?? '-'}
                      </span>
                    </div>
                    <div>
                      Recomendacion:{' '}
                      <span className="text-slate-200">{clienteInsight.sugerencia}</span>
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-200">
                  Seguimiento comercial
                </h4>
                <div>
                  Oportunidades abiertas:{' '}
                  <span className="text-slate-200">{crmOpps.length}</span>
                </div>
                <div>
                  Seguimientos recientes:{' '}
                  <span className="text-slate-200">{crmActs.length}</span>
                </div>
                <div className="mt-1">
                  <button
                    type="button"
                    onClick={onCrearActividadRapida}
                    className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200 text-xs"
                  >
                    Registrar seguimiento
                  </button>
                </div>
                <div className="mt-2">
                  <div className="text-xs text-slate-400 uppercase mb-1">
                    Oportunidades
                  </div>
                  <ul className="space-y-1 text-xs text-slate-200">
                    {crmOpps.slice(0, 5).map((o) => (
                      <li key={o.id}>
                        <span className="font-medium">{o.titulo}</span>{' '}
                        <span className="text-slate-400">
                          Â· {o.fase}
                          {typeof o.valor_estimado === 'number'
                            ? ` Â· $${o.valor_estimado.toFixed(0)}`
                            : ''}
                        </span>
                      </li>
                    ))}
                    {!crmOpps.length && (
                      <li className="text-slate-400">Sin oportunidades abiertas</li>
                    )}
                  </ul>
                </div>
                <div className="mt-3">
                  <div className="text-xs text-slate-400 uppercase mb-1">
                    Ultimos seguimientos
                  </div>
                  <ul className="space-y-1 text-xs text-slate-200">
                    {crmActs.slice(0, 5).map((a) => (
                      <li key={a.id}>
                        <span className="font-medium">{a.tipo}</span>{' '}
                        <span>- {a.asunto}</span>{' '}
                        <span className="text-slate-400">
                          {a.fecha_hora
                            ? `Â· ${new Date(a.fecha_hora).toLocaleString()}`
                            : ''}{' '}
                          Â· {a.estado}
                        </span>
                      </li>
                    ))}
                    {!crmActs.length && (
                      <li className="text-slate-400">Todavia no hay seguimientos registrados</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-200">
                  Mensajes de WhatsApp
                </h4>
                <ul className="space-y-2">
                  {clienteMensajes.slice(0, 6).map((message) => (
                    <li key={message.id} className="app-panel p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-100">
                          {message.direccion === 'recibido' ? 'Mensaje del cliente' : 'Mensaje enviado'}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {message.created_at ? new Date(message.created_at).toLocaleString() : '-'}
                        </span>
                      </div>
                      <div className="text-slate-300">
                        {message.contenido || message.plantilla_codigo || 'Mensaje sin texto visible'}
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                        <span>{messageStatusLabel(message)}</span>
                        {message.automatizado && (
                          <span>
                            Automatico{message.automatizacion_nombre ? ` · ${message.automatizacion_nombre}` : ''}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                  {!clienteMensajes.length && (
                    <li className="app-panel p-3 text-slate-400">
                      Todavia no hay mensajes registrados para este cliente.
                    </li>
                  )}
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-200">
                  Actividad reciente
                </h4>
                <ul className="space-y-2">
                  {clienteTimeline.slice(0, 8).map((item, index) => (
                    <li key={`${item.tipo}-${index}-${item.fecha}`} className="app-panel p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-100">{item.titulo}</span>
                        <span className="text-[11px] text-slate-400">
                          {item.fecha ? new Date(item.fecha).toLocaleString() : '-'}
                        </span>
                      </div>
                      <div className="text-slate-300">{item.detalle || '-'}</div>
                    </li>
                  ))}
                  {!clienteTimeline.length && (
                    <li className="app-panel p-3 text-slate-400">
                      No hay movimientos recientes para mostrar.
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <ClienteCobranzaSection
              selectedClienteId={selectedCliente.id}
              riesgoMora={riesgoMora}
              promesasCobranza={promesasCobranza}
              recordatoriosCobranza={recordatoriosCobranza}
              cobranzaLoading={cobranzaLoading}
              cobranzaError={cobranzaError}
              promesaForm={promesaForm}
              promesaSaving={promesaSaving}
              recordatorioForm={recordatorioForm}
              recordatorioSaving={recordatorioSaving}
              onRefresh={onLoadCobranza}
              onPromesaFormChange={onPromesaFormChange}
              onCrearPromesa={onCrearPromesa}
              onActualizarEstadoPromesa={onActualizarEstadoPromesa}
              onRecordatorioFormChange={onRecordatorioFormChange}
              onCrearRecordatorio={onCrearRecordatorio}
            />
          </>
        )}
      </div>

      {showHistorialModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-2 sm:p-4">
          <div className="app-card mobile-modal-card w-full max-w-4xl p-4 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-sm text-slate-400">Historial de pagos y entregas</div>
                <div className="text-base text-slate-100">
                  Cliente #{selectedCliente.id} - {selectedCliente.nombre}
                  {selectedCliente.apellido ? ` ${selectedCliente.apellido}` : ''}
                </div>
              </div>
              <button
                type="button"
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-xs"
                onClick={onCloseHistorialModal}
                disabled={historialDeleting}
              >
                Cerrar
              </button>
            </div>
            {historialError && (
              <div className="text-xs text-rose-300">{historialError}</div>
            )}
            {historialLoading ? (
              <div className="py-6 text-center text-slate-400">Cargando historial...</div>
            ) : isMobile ? (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {historialPagos.map((h) => (
                  <article key={`${h.tipo}-${h.id}`} className="app-panel p-3 text-xs space-y-1">
                    <div className="text-slate-100">
                      {h.tipo === 'pago_venta'
                        ? 'Pago venta'
                        : h.tipo === 'pago_cuenta'
                          ? 'Pago cuenta corriente'
                          : h.tipo === 'pago_deuda_inicial'
                            ? 'Pago deuda'
                            : 'Entrega'}
                    </div>
                    <div className="text-slate-400">
                      {h.fecha ? new Date(h.fecha).toLocaleString() : '-'}
                    </div>
                    <div className="text-slate-300">
                      {h.tipo === 'pago_venta'
                        ? h.venta_id
                          ? `Venta #${h.venta_id}`
                          : '-'
                        : h.tipo === 'pago_cuenta'
                          ? 'Cuenta corriente'
                          : h.tipo === 'entrega_venta'
                            ? h.venta_id
                              ? `Entrega venta #${h.venta_id}`
                              : 'Entrega'
                            : 'Pago deuda'}
                    </div>
                    <div className="text-slate-300">
                      {h.detalle
                        ? h.tipo === 'entrega_venta'
                          ? `Se entrego ${h.detalle}`
                          : h.detalle
                        : '-'}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-slate-100">
                        {h.monto != null ? `$${Number(h.monto || 0).toFixed(2)}` : '-'}
                      </div>
                      {h.tipo === 'entrega_venta' ? (
                        <span className="text-slate-500">-</span>
                      ) : (
                        <button
                          type="button"
                          className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-[11px]"
                          onClick={() => onEliminarPagoHistorial(h)}
                          disabled={historialDeleting}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {!historialPagos.length && (
                  <div className="app-panel p-3 text-xs text-slate-400">
                    Sin movimientos registrados
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto text-xs md:text-sm max-h-[60vh]">
                <table className="min-w-full">
                  <thead className="text-left text-slate-400">
                    <tr>
                      <th className="py-1 pr-2">Fecha</th>
                      <th className="py-1 pr-2">Tipo</th>
                      <th className="py-1 pr-2">Referencia</th>
                      <th className="py-1 pr-2">Monto</th>
                      <th className="py-1 pr-2">Detalle</th>
                      <th className="py-1 pr-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {historialPagos.map((h) => (
                      <tr key={`${h.tipo}-${h.id}`} className="border-t border-white/10 hover:bg-white/5">
                        <td className="py-1 pr-2">
                          {h.fecha ? new Date(h.fecha).toLocaleString() : '-'}
                        </td>
                        <td className="py-1 pr-2">
                          {h.tipo === 'pago_venta'
                            ? 'Pago venta'
                            : h.tipo === 'pago_cuenta'
                              ? 'Pago cuenta corriente'
                              : h.tipo === 'pago_deuda_inicial'
                                ? 'Pago deuda'
                                : 'Entrega'}
                        </td>
                        <td className="py-1 pr-2">
                          {h.tipo === 'pago_venta'
                            ? h.venta_id
                              ? `Venta #${h.venta_id}`
                              : '-'
                            : h.tipo === 'pago_cuenta'
                              ? 'Cuenta corriente'
                              : h.tipo === 'entrega_venta'
                                ? h.venta_id
                                  ? `Entrega venta #${h.venta_id}`
                                  : 'Entrega'
                                : 'Pago deuda'}
                        </td>
                        <td className="py-1 pr-2">
                          {h.monto != null ? `$${Number(h.monto || 0).toFixed(2)}` : '-'}
                        </td>
                        <td className="py-1 pr-2">
                          {h.detalle
                            ? h.tipo === 'entrega_venta'
                              ? `Se entrego ${h.detalle}`
                              : h.detalle
                            : '-'}
                        </td>
                        <td className="py-1 pr-2">
                          {h.tipo === 'entrega_venta' ? (
                            <span className="text-slate-500">-</span>
                          ) : (
                            <button
                              type="button"
                              className="px-2 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-200 text-[11px]"
                              onClick={() => onEliminarPagoHistorial(h)}
                              disabled={historialDeleting}
                            >
                              Eliminar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!historialPagos.length && (
                      <tr>
                        <td className="py-2 text-slate-400" colSpan={6}>
                          Sin movimientos registrados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
