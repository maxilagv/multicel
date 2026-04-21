import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Alert from '../components/Alert';
import TextInput from '../components/TextInput';
import Button from '../ui/Button';
import { Api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { getRoleFromToken } from '../lib/auth';
import { useMediaQuery } from '../hooks/useMediaQuery';

type Role = {
  id: number;
  nombre: string;
};

type Deposito = {
  id: number;
  nombre: string;
  codigo?: string | null;
};

type UserRoleName = 'vendedor' | 'fletero' | 'gerente_sucursal';

type Usuario = {
  id: number;
  nombre: string;
  email: string;
  rol?: string | null;
  activo?: boolean;
  caja_tipo_default?: 'home_office' | 'sucursal';
  deposito_principal_id?: number | null;
  deposito_principal_nombre?: string | null;
  deposito_principal_codigo?: string | null;
  deleted_at?: string | null;
};

type PerformanceRow = {
  id: number;
  ventas_count: number;
  total_ventas: number;
  margen: number;
};

type AuditRow = {
  id: number;
  usuario_email?: string | null;
  accion: string;
  entidad?: string | null;
  entidad_id?: number | null;
  ip_address?: string | null;
  created_at: string;
};

type MfaStatus = {
  enabled: boolean;
  backup_codes_remaining: number;
};

type MfaSetup = {
  qrCodeDataUrl: string;
  otpauthUrl: string;
  secret: string;
  expires_in_seconds: number;
};

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeActive(value: unknown) {
  if (value === undefined || value === null) return true;
  return Boolean(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAuditAction(row: AuditRow) {
  const entity = row.entidad ? ` / ${row.entidad}` : '';
  const entityId = row.entidad_id ? ` #${row.entidad_id}` : '';
  return `${row.accion}${entity}${entityId}`;
}

function formatPrimaryDeposito(usuario: Usuario) {
  const nombre = String(usuario.deposito_principal_nombre || '').trim();
  const codigo = String(usuario.deposito_principal_codigo || '').trim();
  if (!nombre) return 'Sin deposito principal';
  return codigo ? `${nombre} (${codigo})` : nombre;
}

function formatRoleLabel(value?: string | null) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'gerente_sucursal') return 'Administrador de sucursal';
  if (normalized === 'vendedor') return 'Vendedor';
  if (normalized === 'fletero') return 'Fletero';
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'gerente') return 'Gerente';
  return value || '-';
}

export default function Usuarios() {
  const { accessToken } = useAuth();
  const role = useMemo(() => getRoleFromToken(accessToken), [accessToken]);
  const isAdmin = role === 'admin';
  const isSucursalManager = role === 'gerente_sucursal';
  const canManageUsers = isAdmin || isSucursalManager;
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [roles, setRoles] = useState<Role[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [deletedUsuarios, setDeletedUsuarios] = useState<Usuario[]>([]);
  const [performance, setPerformance] = useState<PerformanceRow[]>([]);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activo, setActivo] = useState(true);
  const [selectedRole, setSelectedRole] = useState<UserRoleName>('vendedor');
  const [selectedDepositoPrincipalId, setSelectedDepositoPrincipalId] = useState<number | ''>('');
  const [cajaTipoDefault, setCajaTipoDefault] = useState<'home_office' | 'sucursal'>('sucursal');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [mfaConfirmCode, setMfaConfirmCode] = useState('');
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const [mfaDisableBackupCode, setMfaDisableBackupCode] = useState('');
  const [useBackupForDisable, setUseBackupForDisable] = useState(false);
  const [mfaBackupCodes, setMfaBackupCodes] = useState<string[]>([]);
  const [mfaLoading, setMfaLoading] = useState(false);

  const selectedRoleId = useMemo(() => {
    const roleRow = roles.find((row) => row.nombre === selectedRole);
    return roleRow?.id || null;
  }, [roles, selectedRole]);

  const allowedRoleSet = useMemo(() => {
    return new Set(isAdmin ? ['vendedor', 'fletero', 'gerente_sucursal'] : ['vendedor', 'fletero']);
  }, [isAdmin]);

  const roleOptions = useMemo(
    () =>
      ([
        { value: 'vendedor', label: 'Vendedor' },
        { value: 'fletero', label: 'Fletero' },
        ...(isAdmin
          ? [{ value: 'gerente_sucursal', label: 'Administrador de sucursal' }]
          : []),
      ] as Array<{ value: UserRoleName; label: string }>),
    [isAdmin]
  );

  const requiresBaseDeposito = isAdmin && selectedRole === 'gerente_sucursal';

  const perfById = useMemo(() => {
    const map = new Map<number, PerformanceRow>();
    for (const row of performance) {
      map.set(Number(row.id), {
        id: Number(row.id),
        ventas_count: toNumber(row.ventas_count),
        total_ventas: toNumber(row.total_ventas),
        margen: toNumber(row.margen),
      });
    }
    return map;
  }, [performance]);

  const avgMargin = useMemo(() => {
    const values = performance.map((row) => toNumber(row.margen)).filter((value) => value > 0);
    if (!values.length) return 0;
    return values.reduce((acc, value) => acc + value, 0) / values.length;
  }, [performance]);

  function labelForPerformance(margen: number) {
    if (avgMargin <= 0) return margen > 0 ? 'Rinde bien' : 'Viene mal';
    if (margen >= avgMargin * 1.2) return 'Rinde bien';
    if (margen >= avgMargin * 0.7) return 'Rinde poco';
    return 'Viene mal';
  }

  const loadData = useCallback(async () => {
    if (!canManageUsers) return;
    setLoading(true);
    setError(null);
    try {
      const rolesPromise = Api.roles().catch(() => []);
      const usersPromise = Api.usuarios();
      const performancePromise = Api.usuariosRendimiento({
        desde: desde || undefined,
        hasta: hasta || undefined,
      }).catch(() => []);
      const depositosPromise = isAdmin ? Api.depositos().catch(() => []) : Promise.resolve([]);

      const [rolesRes, usersRes, trashRes, perfRes, auditRes, mfaRes, depositosRes] = isAdmin
        ? await Promise.all([
            rolesPromise,
            usersPromise,
            Api.usuariosPapelera(),
            performancePromise,
            Api.auditLog({ limit: 20 }),
            Api.mfaStatus().catch(() => null),
            depositosPromise,
          ])
        : await Promise.all([
            rolesPromise,
            usersPromise,
            Promise.resolve([]),
            performancePromise,
            Promise.resolve([]),
            Promise.resolve(null),
            depositosPromise,
          ]);

      setRoles(Array.isArray(rolesRes) ? (rolesRes as Role[]) : []);
      setUsuarios(
        Array.isArray(usersRes)
          ? (usersRes as Usuario[]).filter((user) => allowedRoleSet.has(String(user.rol || '').trim().toLowerCase()))
          : []
      );
      setDeletedUsuarios(Array.isArray(trashRes) ? (trashRes as Usuario[]) : []);
      setPerformance(Array.isArray(perfRes) ? (perfRes as PerformanceRow[]) : []);
      setAuditRows(Array.isArray(auditRes) ? (auditRes as AuditRow[]) : []);
      setMfaStatus(mfaRes as MfaStatus | null);
      setDepositos(Array.isArray(depositosRes) ? (depositosRes as Deposito[]) : []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, [allowedRoleSet, canManageUsers, desde, hasta, isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (requiresBaseDeposito && !selectedDepositoPrincipalId) {
        setError('Debes elegir la sucursal base para el administrador de sucursal.');
        setSaving(false);
        return;
      }

      const payload: Record<string, unknown> = {
        nombre: nombre.trim(),
        email: email.trim(),
        activo,
        rol: selectedRole,
        caja_tipo_default: cajaTipoDefault,
      };
      if (requiresBaseDeposito) {
        payload.deposito_principal_id = Number(selectedDepositoPrincipalId);
      }

      if (password.trim()) payload.password = password.trim();

      if (editingId) {
        await Api.actualizarUsuario(editingId, payload);
        setSuccess('Usuario actualizado');
      } else {
        if (!payload.password) {
          setError('La contrasena es obligatoria para crear el usuario.');
          setSaving(false);
          return;
        }
        await Api.crearUsuario(payload);
        setSuccess('Usuario creado');
      }

      cancelEdit();
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo guardar el usuario');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(usuario: Usuario) {
    setEditingId(usuario.id);
    setNombre(usuario.nombre || '');
    setEmail(usuario.email || '');
    setPassword('');
    setActivo(normalizeActive(usuario.activo));
    setSelectedRole(
      usuario.rol === 'fletero'
        ? 'fletero'
        : usuario.rol === 'gerente_sucursal'
          ? 'gerente_sucursal'
          : 'vendedor'
    );
    setSelectedDepositoPrincipalId(
      Number.isInteger(Number(usuario.deposito_principal_id)) && Number(usuario.deposito_principal_id) > 0
        ? Number(usuario.deposito_principal_id)
        : ''
    );
    setCajaTipoDefault(usuario.caja_tipo_default === 'home_office' ? 'home_office' : 'sucursal');
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setNombre('');
    setEmail('');
    setPassword('');
    setActivo(true);
    setSelectedRole('vendedor');
    setSelectedDepositoPrincipalId('');
    setCajaTipoDefault('sucursal');
  }

  async function handleDeleteUser(id: number) {
    const confirmed = window.confirm('Este usuario se enviara a papelera. Podras restaurarlo despues.');
    if (!confirmed) return;
    setError(null);
    setSuccess(null);
    try {
      await Api.eliminarUsuario(id);
      setSuccess('Usuario enviado a papelera');
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo eliminar el usuario');
    }
  }

  async function handleRestoreUser(id: number) {
    setError(null);
    setSuccess(null);
    try {
      await Api.restaurarUsuario(id);
      setSuccess('Usuario restaurado');
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo restaurar el usuario');
    }
  }

  async function startMfaSetup() {
    setMfaLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = (await Api.mfaSetup()) as any;
      setMfaSetup({
        qrCodeDataUrl: String(result.qrCodeDataUrl || ''),
        otpauthUrl: String(result.otpauthUrl || ''),
        secret: String(result.secret || ''),
        expires_in_seconds: Number(result.expires_in_seconds || 0),
      });
      setMfaBackupCodes([]);
      setSuccess('Escanea el QR y confirma con un codigo de 6 digitos.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo iniciar MFA');
    } finally {
      setMfaLoading(false);
    }
  }

  async function confirmMfaSetup() {
    if (!mfaConfirmCode.trim()) {
      setError('Ingresa el codigo de tu app autenticadora.');
      return;
    }
    setMfaLoading(true);
    setError(null);
    try {
      const result = (await Api.mfaConfirm({ code: mfaConfirmCode.trim() })) as any;
      setMfaBackupCodes(Array.isArray(result?.backup_codes) ? result.backup_codes : []);
      setMfaSetup(null);
      setMfaConfirmCode('');
      setSuccess('MFA activado correctamente.');
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo confirmar MFA');
    } finally {
      setMfaLoading(false);
    }
  }

  async function disableMfa() {
    const payload = useBackupForDisable
      ? { backup_code: mfaDisableBackupCode.trim() }
      : { totp_code: mfaDisableCode.trim() };

    if (!payload.backup_code && !payload.totp_code) {
      setError('Ingresa un codigo valido para desactivar MFA.');
      return;
    }

    setMfaLoading(true);
    setError(null);
    try {
      await Api.mfaDisable(payload);
      setMfaSetup(null);
      setMfaBackupCodes([]);
      setMfaDisableCode('');
      setMfaDisableBackupCode('');
      setSuccess('MFA deshabilitado.');
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No se pudo desactivar MFA');
    } finally {
      setMfaLoading(false);
    }
  }

  if (!canManageUsers) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-100">Usuarios</h2>
        <Alert kind="error" message="No tienes permisos para administrar usuarios." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Usuarios</h2>
          <p className="text-sm text-slate-400">
            {isAdmin
              ? 'Gestion operativa, seguridad MFA y trazabilidad de cambios sensibles.'
              : 'Gestion de vendedores y fleteros dentro de tu sucursal.'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="date"
            className="input-modern h-11 text-sm"
            value={desde}
            onChange={(event) => setDesde(event.target.value)}
          />
          <input
            type="date"
            className="input-modern h-11 text-sm"
            value={hasta}
            onChange={(event) => setHasta(event.target.value)}
          />
          <Button type="button" onClick={loadData} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </div>
      </div>

      {error && <Alert kind="error" message={error} />}
      {success && <Alert kind="info" message={success} />}

      <div
        className={
          isAdmin
            ? 'grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]'
            : 'grid grid-cols-1 gap-6'
        }
      >
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-3 text-sm text-slate-300">
            {editingId ? 'Editar usuario' : 'Registrar usuario'}
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <TextInput
              label="Nombre"
              type="text"
              name="nombre"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              required
            />
            <TextInput
              label="Email"
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <TextInput
              label={editingId ? 'Nueva contrasena (opcional)' : 'Contrasena'}
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required={!editingId}
            />
            <label className="text-sm text-slate-200">
              Rol
              <select
                className="input-modern mt-2 w-full"
                value={selectedRole}
                onChange={(event) => {
                  const nextRole = roleOptions.find((option) => option.value === event.target.value)?.value || 'vendedor';
                  setSelectedRole(nextRole);
                  if (nextRole !== 'gerente_sucursal') {
                    setSelectedDepositoPrincipalId('');
                  }
                }}
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {requiresBaseDeposito && (
              <label className="text-sm text-slate-200">
                Sucursal base
                <select
                  className="input-modern mt-2 w-full"
                  value={selectedDepositoPrincipalId === '' ? '' : String(selectedDepositoPrincipalId)}
                  onChange={(event) =>
                    setSelectedDepositoPrincipalId(event.target.value ? Number(event.target.value) : '')
                  }
                  required
                >
                  <option value="">
                    {depositos.length ? 'Selecciona la sucursal base' : 'No hay sucursales configuradas'}
                  </option>
                  {depositos.map((deposito) => (
                    <option key={deposito.id} value={deposito.id}>
                      {deposito.nombre}
                      {deposito.codigo ? ` (${deposito.codigo})` : ''}
                    </option>
                  ))}
                </select>
                <span className="mt-2 block text-xs text-slate-400">
                  Este usuario quedara limitado a esa sucursal y se usara como deposito principal.
                </span>
              </label>
            )}
            <label className="text-sm text-slate-200">
              Caja por defecto
              <select
                className="input-modern mt-2 w-full"
                value={cajaTipoDefault}
                onChange={(event) =>
                  setCajaTipoDefault(
                    event.target.value === 'home_office' ? 'home_office' : 'sucursal'
                  )
                }
              >
                <option value="sucursal">Sucursal</option>
                <option value="home_office">Home office</option>
              </select>
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={activo}
                onChange={(event) => setActivo(event.target.checked)}
              />
              Activo
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear usuario'}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </section>

        {isAdmin && (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-2 text-sm font-medium text-slate-100">
            Seguridad del administrador
          </div>
          <div className="text-xs text-slate-400">
            Protege este acceso con TOTP. El segundo factor se pedira en cada login del admin.
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div className="text-sm text-slate-200">
              MFA {mfaStatus?.enabled ? 'activo' : 'inactivo'}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Codigos de respaldo disponibles: {mfaStatus?.backup_codes_remaining ?? 0}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {!mfaStatus?.enabled ? (
                <Button type="button" onClick={startMfaSetup} disabled={mfaLoading}>
                  {mfaLoading ? 'Preparando...' : 'Activar MFA'}
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={disableMfa} disabled={mfaLoading}>
                  {mfaLoading ? 'Procesando...' : 'Desactivar MFA'}
                </Button>
              )}
            </div>

            {!mfaStatus?.enabled && mfaSetup && (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-cyan-200">Paso 1</div>
                  <div className="mt-2 text-sm text-slate-200">
                    Escanea este QR con Google Authenticator, Authy u otra app compatible.
                  </div>
                  {mfaSetup.qrCodeDataUrl ? (
                    <img
                      src={mfaSetup.qrCodeDataUrl}
                      alt="QR para activar MFA"
                      className="mt-4 h-48 w-48 rounded-2xl bg-white p-3"
                    />
                  ) : null}
                  <div className="mt-3 text-xs text-slate-400 break-all">
                    Secret manual: <span className="text-slate-200">{mfaSetup.secret}</span>
                  </div>
                </div>
                <TextInput
                  label="Codigo de autenticacion"
                  type="text"
                  name="mfa-confirm-code"
                  value={mfaConfirmCode}
                  onChange={(event) => setMfaConfirmCode(event.target.value)}
                  placeholder="000000"
                />
                <Button type="button" onClick={confirmMfaSetup} disabled={mfaLoading}>
                  {mfaLoading ? 'Confirmando...' : 'Confirmar activacion'}
                </Button>
              </div>
            )}

            {mfaStatus?.enabled && (
              <div className="mt-4 space-y-4">
                <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={useBackupForDisable}
                    onChange={(event) => setUseBackupForDisable(event.target.checked)}
                  />
                  Usar codigo de respaldo para desactivar
                </label>
                {useBackupForDisable ? (
                  <TextInput
                    label="Codigo de respaldo"
                    type="text"
                    name="mfa-disable-backup"
                    value={mfaDisableBackupCode}
                    onChange={(event) => setMfaDisableBackupCode(event.target.value)}
                    placeholder="ABCD-1234"
                  />
                ) : (
                  <TextInput
                    label="Codigo TOTP actual"
                    type="text"
                    name="mfa-disable-code"
                    value={mfaDisableCode}
                    onChange={(event) => setMfaDisableCode(event.target.value)}
                    placeholder="000000"
                  />
                )}
              </div>
            )}

            {mfaBackupCodes.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                <div className="text-sm font-medium text-amber-100">Guarda estos codigos ahora</div>
                <div className="mt-2 text-xs text-slate-300">
                  Cada codigo sirve una sola vez. Si los pierdes, tendras que volver a configurar MFA.
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-100">
                  {mfaBackupCodes.map((code) => (
                    <div key={code} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono">
                      {code}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          </section>
        )}
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-100">
              {isAdmin ? 'Usuarios operativos y administradores de sucursal' : 'Vendedores y fleteros'}
            </div>
            <div className="text-xs text-slate-400">
              {isAdmin
                ? 'Estado operativo, base asignada y rendimiento resumido por usuario.'
                : 'Estado operativo y rendimiento resumido por usuario.'}
            </div>
          </div>
          <div className="text-xs text-slate-400">
            {usuarios.length} activo{usuarios.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="overflow-x-auto">
          {isMobile ? (
            <div className="space-y-3">
              {usuarios.map((usuario) => {
                const perf = perfById.get(usuario.id);
                const margen = perf ? toNumber(perf.margen) : 0;
                const total = perf ? toNumber(perf.total_ventas) : 0;
                const ventasCount = perf ? toNumber(perf.ventas_count) : 0;
                return (
                  <article key={usuario.id} className="app-panel space-y-3 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-slate-100">{usuario.nombre || usuario.email}</div>
                        <div className="text-xs text-slate-400">{usuario.email}</div>
                        <div className="text-[11px] text-slate-500">
                          Base: {formatPrimaryDeposito(usuario)}
                        </div>
                      </div>
                      <span className="text-xs text-slate-300">{formatRoleLabel(usuario.rol)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="app-panel p-2">
                        <div className="text-slate-400">Ventas</div>
                        <div className="font-medium text-slate-100">{ventasCount}</div>
                      </div>
                      <div className="app-panel p-2">
                        <div className="text-slate-400">Total</div>
                        <div className="font-medium text-slate-100">{formatMoney(total)}</div>
                      </div>
                      <div className="app-panel p-2">
                        <div className="text-slate-400">Margen</div>
                        <div className="font-medium text-slate-100">{formatMoney(margen)}</div>
                      </div>
                      <div className="app-panel p-2">
                        <div className="text-slate-400">Rendimiento</div>
                        <div className="font-medium text-slate-100">{labelForPerformance(margen)}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => startEdit(usuario)}>
                        Editar
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => handleDeleteUser(usuario.id)}>
                        Papelera
                      </Button>
                    </div>
                  </article>
                );
              })}
              {!usuarios.length && (
                <div className="app-panel p-4 text-center text-slate-400">No hay usuarios registrados.</div>
              )}
            </div>
          ) : (
            <table className="min-w-full text-sm text-slate-200">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-2">Usuario</th>
                  <th className="py-2">Rol</th>
                  <th className="py-2">Ventas</th>
                  <th className="py-2">Total</th>
                  <th className="py-2">Margen</th>
                  <th className="py-2">Rendimiento</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {usuarios.map((usuario) => {
                  const perf = perfById.get(usuario.id);
                  const margen = perf ? toNumber(perf.margen) : 0;
                  const total = perf ? toNumber(perf.total_ventas) : 0;
                  const ventasCount = perf ? toNumber(perf.ventas_count) : 0;
                  return (
                    <tr key={usuario.id}>
                      <td className="py-2">
                        <div className="font-medium">{usuario.nombre || usuario.email}</div>
                        <div className="text-xs text-slate-400">{usuario.email}</div>
                        <div className="text-[11px] text-slate-500">
                          Base: {formatPrimaryDeposito(usuario)}
                        </div>
                      </td>
                      <td className="py-2">{formatRoleLabel(usuario.rol)}</td>
                      <td className="py-2">{ventasCount}</td>
                      <td className="py-2">{formatMoney(total)}</td>
                      <td className="py-2">{formatMoney(margen)}</td>
                      <td className="py-2">{labelForPerformance(margen)}</td>
                      <td className="py-2">{normalizeActive(usuario.activo) ? 'Activo' : 'Inactivo'}</td>
                      <td className="py-2 space-x-2">
                        <button
                          type="button"
                          className="text-xs text-indigo-300 hover:text-indigo-200"
                          onClick={() => startEdit(usuario)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="text-xs text-rose-300 hover:text-rose-200"
                          onClick={() => handleDeleteUser(usuario.id)}
                        >
                          Papelera
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!usuarios.length && (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-slate-400">
                      No hay usuarios registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {isAdmin && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-3 text-sm font-medium text-slate-100">Papelera de usuarios</div>
          <div className="space-y-3">
            {deletedUsuarios.map((usuario) => (
              <div
                key={usuario.id}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-medium text-slate-100">{usuario.nombre || usuario.email}</div>
                  <div className="text-xs text-slate-400">{usuario.email}</div>
                </div>
                <Button type="button" variant="outline" onClick={() => handleRestoreUser(usuario.id)}>
                  Restaurar
                </Button>
              </div>
            ))}
            {!deletedUsuarios.length && (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                No hay usuarios en papelera.
              </div>
            )}
          </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="mb-3 text-sm font-medium text-slate-100">Audit log reciente</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-slate-200">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-2">Fecha</th>
                  <th className="py-2">Usuario</th>
                  <th className="py-2">Accion</th>
                  <th className="py-2">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {auditRows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 text-xs text-slate-300">
                      {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}
                    </td>
                    <td className="py-2 text-xs">{row.usuario_email || 'sistema'}</td>
                    <td className="py-2 text-xs">{formatAuditAction(row)}</td>
                    <td className="py-2 text-xs text-slate-400">{row.ip_address || '-'}</td>
                  </tr>
                ))}
                {!auditRows.length && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400">
                      Sin movimientos auditados todavia.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </section>
        </div>
      )}
    </div>
  );
}
