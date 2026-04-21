import { Api } from '../../lib/api';
import Button from '../../ui/Button';
import Alert from '../../components/Alert';
import SpreadsheetImportPanel from '../../components/SpreadsheetImportPanel';
import type { Cliente, Zona, ClienteForm } from './types';

type DeudaAnteriorForm = {
  tiene: boolean;
  monto: string;
};

type ClienteFormPanelProps = {
  form: ClienteForm;
  editingCliente: Cliente | null;
  canSubmit: boolean;
  zonas: Zona[];
  error: string | null;
  padronLoading: boolean;
  padronError: string | null;
  padronOverwrite: boolean;
  deudaAnteriorForm: DeudaAnteriorForm;
  onChange: (changes: Partial<ClienteForm>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onCompletarPadron: () => void;
  onPadronOverwriteChange: (val: boolean) => void;
  onDeudaAnteriorChange: (changes: Partial<DeudaAnteriorForm>) => void;
  onImportCompleted: () => Promise<void>;
  q: string;
};

export default function ClienteFormPanel({
  form,
  editingCliente,
  canSubmit,
  zonas,
  error,
  padronLoading,
  padronError,
  padronOverwrite,
  deudaAnteriorForm,
  onChange,
  onSubmit,
  onCancel,
  onCompletarPadron,
  onPadronOverwriteChange,
  onDeudaAnteriorChange,
  onImportCompleted,
}: ClienteFormPanelProps) {
  return (
    <>
      <div className="app-card p-4">
        <form
          onSubmit={onSubmit}
          className="grid grid-cols-1 md:grid-cols-6 gap-2"
        >
          {error && (
            <div className="md:col-span-6">
              <Alert kind="error" message={error} />
            </div>
          )}
          <input
            className="input-modern text-sm"
            placeholder="Nombre"
            value={form.nombre}
            onChange={(e) => onChange({ nombre: e.target.value })}
          />
          <input
            className="input-modern text-sm"
            placeholder="Apellido"
            value={form.apellido}
            onChange={(e) => onChange({ apellido: e.target.value })}
          />
          <input
            className="input-modern text-sm"
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => onChange({ email: e.target.value })}
          />
          <input
            className="input-modern text-sm"
            placeholder="Telefono"
            value={form.telefono}
            onChange={(e) => onChange({ telefono: e.target.value })}
          />
          <input
            className="input-modern text-sm"
            placeholder="Direccion"
            value={form.direccion}
            onChange={(e) => onChange({ direccion: e.target.value })}
          />
          <input
            className="input-modern text-sm"
            placeholder="Entre calles"
            value={form.entre_calles}
            onChange={(e) => onChange({ entre_calles: e.target.value })}
          />
          <input
            className="input-modern text-sm"
            placeholder="CUIT/CUIL"
            value={form.cuit_cuil}
            onChange={(e) => onChange({ cuit_cuil: e.target.value })}
          />
          <div className="md:col-span-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onCompletarPadron}
              className="px-3 py-1.5 rounded bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/30 text-indigo-200 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={!editingCliente || padronLoading}
            >
              {padronLoading ? 'Consultando padrón...' : 'Completar desde padrón'}
            </button>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                className="rounded border-white/20"
                checked={padronOverwrite}
                onChange={(e) => onPadronOverwriteChange(e.target.checked)}
              />
              Sobrescribir nombre/apellido
            </label>
            {padronError && <span className="text-xs text-rose-300">{padronError}</span>}
          </div>
          <div className="md:col-span-6 grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              className="input-modern text-sm"
              value={form.tipo_doc}
              onChange={(e) => onChange({ tipo_doc: e.target.value })}
            >
              <option value="">Tipo documento</option>
              <option value="CUIT">CUIT</option>
              <option value="CUIL">CUIL</option>
              <option value="DNI">DNI</option>
              <option value="CONSUMIDOR_FINAL">Consumidor final</option>
            </select>
            <input
              className="input-modern text-sm"
              placeholder="Nº documento"
              value={form.nro_doc}
              onChange={(e) => onChange({ nro_doc: e.target.value })}
            />
            <select
              className="input-modern text-sm"
              value={form.condicion_iva}
              onChange={(e) => onChange({ condicion_iva: e.target.value })}
            >
              <option value="">Condicion IVA</option>
              <option value="responsable_inscripto">Responsable inscripto</option>
              <option value="monotributo">Monotributo</option>
              <option value="consumidor_final">Consumidor final</option>
              <option value="exento">Exento</option>
              <option value="no_categorizado">No categorizado</option>
            </select>
            <input
              className="input-modern text-sm md:col-span-2"
              placeholder="Domicilio fiscal"
              value={form.domicilio_fiscal}
              onChange={(e) => onChange({ domicilio_fiscal: e.target.value })}
            />
            <input
              className="input-modern text-sm"
              placeholder="Provincia"
              value={form.provincia}
              onChange={(e) => onChange({ provincia: e.target.value })}
            />
            <input
              className="input-modern text-sm"
              placeholder="Localidad"
              value={form.localidad}
              onChange={(e) => onChange({ localidad: e.target.value })}
            />
            <input
              className="input-modern text-sm"
              placeholder="Codigo postal"
              value={form.codigo_postal}
              onChange={(e) => onChange({ codigo_postal: e.target.value })}
            />
          </div>
          <select
            className="input-modern text-sm"
            value={form.zona_id}
            onChange={(e) => onChange({ zona_id: e.target.value })}
          >
            <option value="">Zona</option>
            {zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre}
              </option>
            ))}
          </select>
          <select
            className="input-modern text-sm"
            value={form.tipo_cliente}
            onChange={(e) => onChange({ tipo_cliente: e.target.value as any })}
          >
            <option value="minorista">Minorista</option>
            <option value="mayorista">Mayorista</option>
            <option value="distribuidor">Distribuidor</option>
          </select>
          <input
            className="input-modern text-sm"
            placeholder="Segmento / rubro"
            value={form.segmento}
            onChange={(e) => onChange({ segmento: e.target.value })}
          />
          <input
            className="input-modern text-sm"
            placeholder="Tags (ej: VIP, Moroso)"
            value={form.tags}
            onChange={(e) => onChange({ tags: e.target.value })}
          />
          {!editingCliente && (
            <>
              <label className="md:col-span-6 flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  className="accent-slate-200"
                  checked={deudaAnteriorForm.tiene}
                  onChange={(e) => onDeudaAnteriorChange({ tiene: e.target.checked })}
                />
                ¿Tiene deuda anterior?
              </label>
              {deudaAnteriorForm.tiene && (
                <input
                  className="input-modern text-sm md:col-span-2"
                  placeholder="Monto deuda anterior"
                  type="number"
                  min="0"
                  step="0.01"
                  value={deudaAnteriorForm.monto}
                  onChange={(e) => onDeudaAnteriorChange({ monto: e.target.value })}
                />
              )}
            </>
          )}
          <div className="md:col-span-6 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canSubmit}>
              {editingCliente ? 'Guardar cambios' : 'Registrar cliente'}
            </Button>
            {editingCliente && (
              <button
                type="button"
                className="input-modern text-sm"
                onClick={onCancel}
              >
                Cancelar edicion
              </button>
            )}
          </div>
        </form>
      </div>
      <SpreadsheetImportPanel
        title="Importar clientes desde Excel"
        description="Permite migrar padrones completos, detecta emails duplicados, normaliza teléfonos y deja trazabilidad por fila si algo falla."
        templateName="plantilla-clientes.csv"
        templateHeaders={[
          'nombre',
          'apellido',
          'email',
          'telefono',
          'direccion',
          'cuit_cuil',
          'condicion_iva',
          'estado',
        ]}
        upload={(file, opts) =>
          Api.importarClientesExcel(file, {
            dryRun: opts?.dryRun,
            async: opts?.async,
          })
        }
        onCompleted={onImportCompleted}
      />
    </>
  );
}
