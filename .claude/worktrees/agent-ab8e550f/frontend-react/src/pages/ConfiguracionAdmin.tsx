import { useEffect, useState, type FormEvent } from 'react';
import { Api, apiFetch } from '../lib/api';
import Alert from '../components/Alert';
import { useLicense } from '../context/LicenseContext';
import { FEATURE_LIST, hasFeature } from '../lib/features';

export default function ConfiguracionAdmin() {
  const { status: licenseStatus, loading: licenseLoading, refresh: refreshLicense } = useLicense();
  const [dolarBlue, setDolarBlue] = useState<string>('');
  const [deudaUmbral, setDeudaUmbral] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deudaSaving, setDeudaSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deudaError, setDeudaError] = useState<string | null>(null);
  const [deudaSuccess, setDeudaSuccess] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [usuariosLoading, setUsuariosLoading] = useState(false);
  const [usuariosError, setUsuariosError] = useState<string | null>(null);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [permisosSaving, setPermisosSaving] = useState(false);
  const [selectedUsuarioId, setSelectedUsuarioId] = useState<number | ''>('');
  const [usuarioDepositoIds, setUsuarioDepositoIds] = useState<number[]>([]);
  const [permisosSuccess, setPermisosSuccess] = useState<string | null>(null);
  const [permisosError, setPermisosError] = useState<string | null>(null);
  const [licenseCode, setLicenseCode] = useState('');
  const [licenseSaving, setLicenseSaving] = useState(false);
  const [licenseSuccess, setLicenseSuccess] = useState<string | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<any | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudSuccess, setCloudSuccess] = useState<string | null>(null);
  const [cloudSnapshotError, setCloudSnapshotError] = useState<string | null>(null);
  const [cloudSnapshotSuccess, setCloudSnapshotSuccess] = useState<string | null>(null);
  const [cloudSnapshotLoading, setCloudSnapshotLoading] = useState(false);
  const [cloudQueueStatus, setCloudQueueStatus] = useState<any | null>(null);
  const [cloudQueueLoading, setCloudQueueLoading] = useState(false);
  const [cloudQueueError, setCloudQueueError] = useState<string | null>(null);
  const [cloudToken, setCloudToken] = useState('');
  const [cloudEndpoint, setCloudEndpoint] = useState('');
  const [cloudSaving, setCloudSaving] = useState(false);
  const [networkPolicy, setNetworkPolicy] = useState<'off' | 'private' | 'subnet'>('off');
  const [networkSubnet, setNetworkSubnet] = useState<string>('');
  const [networkSaving, setNetworkSaving] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [networkSuccess, setNetworkSuccess] = useState<string | null>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<any | null>(null);
  const [backupStatusLoading, setBackupStatusLoading] = useState(false);
  const [backupSettings, setBackupSettings] = useState({
    enabled: true,
    interval_hours: '24',
    retention_days: '7',
    external_dir: '',
  });
  const [backupSettingsSaving, setBackupSettingsSaving] = useState(false);
  const [factoryResetting, setFactoryResetting] = useState(false);
  const [priceLabels, setPriceLabels] = useState({ local: '', distribuidor: '', final: '' });
  const [priceLabelsLoading, setPriceLabelsLoading] = useState(false);
  const [priceLabelsSaving, setPriceLabelsSaving] = useState(false);
  const [priceLabelsError, setPriceLabelsError] = useState<string | null>(null);
  const [priceLabelsSuccess, setPriceLabelsSuccess] = useState<string | null>(null);
  const [rankingMetric, setRankingMetric] = useState<'cantidad_ventas' | 'margen_venta'>('cantidad_ventas');
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingSaving, setRankingSaving] = useState(false);
  const [rankingError, setRankingError] = useState<string | null>(null);
  const [rankingSuccess, setRankingSuccess] = useState<string | null>(null);
  const [zonas, setZonas] = useState<any[]>([]);
  const [zonasLoading, setZonasLoading] = useState(false);
  const [zonasError, setZonasError] = useState<string | null>(null);
  const [zonasSuccess, setZonasSuccess] = useState<string | null>(null);
  const [zonaSaving, setZonaSaving] = useState(false);
  const [zonaForm, setZonaForm] = useState({ nombre: '', color_hex: '#64748B' });
  const [metodosPago, setMetodosPago] = useState<any[]>([]);
  const [metodosLoading, setMetodosLoading] = useState(false);
  const [metodosError, setMetodosError] = useState<string | null>(null);
  const [metodosSuccess, setMetodosSuccess] = useState<string | null>(null);
  const [showMetodosInactivos, setShowMetodosInactivos] = useState(false);
  const [metodoForm, setMetodoForm] = useState({ nombre: '', moneda: 'ARS', orden: '0' });
  const [metodoSaving, setMetodoSaving] = useState(false);
  const [editMetodoId, setEditMetodoId] = useState<number | null>(null);
  const [editMetodoForm, setEditMetodoForm] = useState({ nombre: '', moneda: '', orden: '', activo: true });
  const cloudEnabled = hasFeature(licenseStatus, 'cloud');
  const showCloudLinking = false;

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      setDeudaError(null);
      setDeudaSuccess(null);
      try {
        const [data, deudaData] = await Promise.all([
          Api.getDolarBlue(),
          Api.getDebtThreshold().catch(() => null),
        ]);
        if (!mounted) return;
        const valor =
          data && typeof (data as any).valor === 'number'
            ? (data as any).valor
            : null;
        if (valor != null) {
          setDolarBlue(String(valor));
        }
        const deudaValor =
          deudaData && typeof (deudaData as any).valor === 'number'
            ? (deudaData as any).valor
            : null;
        if (deudaValor != null) {
          setDeudaUmbral(String(deudaValor));
        }
      } catch (e) {
        if (!mounted) return;
        setError(
          e instanceof Error
            ? e.message
            : 'No se pudo cargar el dólar blue'
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setPriceLabelsLoading(true);
      setPriceLabelsError(null);
      try {
        const data = await Api.getPriceLabels();
        if (!active) return;
        setPriceLabels({
          local: data?.local || 'Precio Distribuidor',
          distribuidor: data?.distribuidor || 'Precio Mayorista',
          final: data?.final || 'Precio Final',
        });
      } catch (e) {
        if (!active) return;
        setPriceLabelsError(
          e instanceof Error ? e.message : 'No se pudieron cargar los nombres de precios'
        );
      } finally {
        if (active) setPriceLabelsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function loadMetodosPago() {
    setMetodosLoading(true);
    setMetodosError(null);
    try {
      const rows = await Api.metodosPago({ inactivos: showMetodosInactivos });
      setMetodosPago(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setMetodosError(
        e instanceof Error ? e.message : 'No se pudieron cargar los metodos de pago'
      );
      setMetodosPago([]);
    } finally {
      setMetodosLoading(false);
    }
  }

  async function loadRankingMetric() {
    setRankingLoading(true);
    setRankingError(null);
    try {
      const data = await Api.getRankingMetric();
      const valor = data?.valor === 'margen_venta' ? 'margen_venta' : 'cantidad_ventas';
      setRankingMetric(valor);
    } catch (e) {
      setRankingError(
        e instanceof Error ? e.message : 'No se pudo cargar la metrica de ranking'
      );
    } finally {
      setRankingLoading(false);
    }
  }

  async function loadZonas() {
    setZonasLoading(true);
    setZonasError(null);
    try {
      const rows = await Api.zonas({ inactivos: true });
      const parsed = Array.isArray(rows)
        ? rows.map((z: any) => ({
            ...z,
            activo: z.activo === undefined ? true : Boolean(z.activo),
          }))
        : [];
      setZonas(parsed);
    } catch (e) {
      setZonasError(e instanceof Error ? e.message : 'No se pudieron cargar las zonas');
      setZonas([]);
    } finally {
      setZonasLoading(false);
    }
  }

  useEffect(() => {
    loadMetodosPago();
  }, [showMetodosInactivos]);

  useEffect(() => {
    loadRankingMetric();
    loadZonas();
  }, []);

  useEffect(() => {
    (async () => {
      setUsuariosLoading(true);
      setUsuariosError(null);
      try {
        const [usersRes, depsRes] = await Promise.all([
          apiFetch('/api/usuarios').catch(() => []),
          Api.depositos().catch(() => []),
        ]);
        setUsuarios(Array.isArray(usersRes) ? usersRes : []);
        setDepositos(Array.isArray(depsRes) ? depsRes : []);
      } catch (e) {
        setUsuariosError(
          e instanceof Error
            ? e.message
            : 'No se pudieron cargar usuarios o depЗsitos',
        );
      } finally {
        setUsuariosLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await Api.getNetworkPolicy();
        if (!active) return;
        const policy = data?.policy === 'private' || data?.policy === 'subnet' ? data.policy : 'off';
        setNetworkPolicy(policy);
        setNetworkSubnet(data?.subnet || '');
      } catch (err) {
        if (!active) return;
        setNetworkError(err instanceof Error ? err.message : 'No se pudo cargar la politica de red');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!showCloudLinking) {
      setCloudStatus(null);
      setCloudEndpoint('');
      setCloudLoading(false);
      setCloudError(null);
      return () => {
        active = false;
      };
    }
    if (!cloudEnabled) {
      setCloudStatus(null);
      setCloudEndpoint('');
      setCloudLoading(false);
      setCloudError('Modulo cloud no habilitado en la licencia');
      return () => {
        active = false;
      };
    }
    (async () => {
      setCloudLoading(true);
      setCloudError(null);
      try {
        const data = await Api.cloudStatus();
        if (!active) return;
        setCloudStatus(data);
        setCloudEndpoint(data?.endpoint || '');
      } catch (err) {
        if (!active) return;
        setCloudError(err instanceof Error ? err.message : 'No se pudo cargar estado cloud');
      } finally {
        if (active) setCloudLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [cloudEnabled, showCloudLinking]);

  useEffect(() => {
    let active = true;
    (async () => {
      setBackupStatusLoading(true);
      setBackupError(null);
      try {
        const data = await Api.backupStatus();
        if (!active) return;
        setBackupStatus(data);
        setBackupSettings({
          enabled: Boolean(data?.settings?.enabled),
          interval_hours: String(data?.settings?.interval_hours ?? '24'),
          retention_days: String(data?.settings?.retention_days ?? '7'),
          external_dir: data?.settings?.external_dir || '',
        });
      } catch (err) {
        if (!active) return;
        setBackupError(
          err instanceof Error ? err.message : 'No se pudo cargar estado de backups'
        );
      } finally {
        if (active) setBackupStatusLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setBackupLoading(true);
      setBackupError(null);
      try {
        const data = await Api.listBackups();
        if (!active) return;
        setBackups(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!active) return;
        setBackupError(err instanceof Error ? err.message : 'No se pudieron cargar backups');
      } finally {
        if (active) setBackupLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    async function loadPermisos() {
      if (!selectedUsuarioId) {
        setUsuarioDepositoIds([]);
        return;
      }
      setPermisosError(null);
      setPermisosSuccess(null);
      try {
        const data = await apiFetch(`/api/usuarios/${selectedUsuarioId}/depositos`);
        const ids = Array.isArray(data)
          ? data
            .map((d: any) => Number(d.deposito_id ?? d.id))
            .filter((n) => Number.isInteger(n) && n > 0)
          : [];
        setUsuarioDepositoIds(ids);
      } catch (e) {
        setPermisosError(
          e instanceof Error
            ? e.message
            : 'No se pudieron cargar los depЗsitos del usuario',
        );
        setUsuarioDepositoIds([]);
      }
    }
    loadPermisos();
  }, [selectedUsuarioId]);

  async function onSubmitDolar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const valorNum = Number(dolarBlue);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      setError('Ingresá un valor de dólar válido mayor a 0');
      return;
    }
    setSaving(true);
    try {
      await Api.setDolarBlue(valorNum);
      setSuccess('Dólar blue actualizado correctamente');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudo guardar el valor de dólar'
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitDeudaUmbral(e: FormEvent) {
    e.preventDefault();
    setDeudaError(null);
    setDeudaSuccess(null);
    const valorNum = Number(deudaUmbral);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      setDeudaError('Ingresa un umbral valido mayor a 0');
      return;
    }
    setDeudaSaving(true);
    try {
      await Api.setDebtThreshold(valorNum);
      setDeudaSuccess('Umbral de deuda actualizado correctamente');
    } catch (e) {
      setDeudaError(
        e instanceof Error ? e.message : 'No se pudo guardar el umbral de deuda'
      );
    } finally {
      setDeudaSaving(false);
    }
  }

  function formatBackupDate(value?: string | null) {
    if (!value) return 'Nunca';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return 'Nunca';
    }
  }

  async function refreshBackupStatus(opts: { updateSettings?: boolean } = {}) {
    setBackupStatusLoading(true);
    setBackupError(null);
    try {
      const data = await Api.backupStatus();
      setBackupStatus(data);
      if (opts.updateSettings && data?.settings) {
        setBackupSettings({
          enabled: Boolean(data.settings.enabled),
          interval_hours: String(data.settings.interval_hours ?? '24'),
          retention_days: String(data.settings.retention_days ?? '7'),
          external_dir: data.settings.external_dir || '',
        });
      }
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'No se pudo cargar estado de backups');
    } finally {
      setBackupStatusLoading(false);
    }
  }

  async function onSavePriceLabels(e: FormEvent) {
    e.preventDefault();
    setPriceLabelsError(null);
    setPriceLabelsSuccess(null);
    if (!priceLabels.local.trim() || !priceLabels.distribuidor.trim() || !priceLabels.final.trim()) {
      setPriceLabelsError('Completa los tres nombres de precios');
      return;
    }
    setPriceLabelsSaving(true);
    try {
      await Api.setPriceLabels({
        local: priceLabels.local.trim(),
        distribuidor: priceLabels.distribuidor.trim(),
        final: priceLabels.final.trim(),
      });
      setPriceLabelsSuccess('Nombres de precios actualizados');
    } catch (e) {
      setPriceLabelsError(
        e instanceof Error ? e.message : 'No se pudieron guardar los nombres de precios'
      );
    } finally {
      setPriceLabelsSaving(false);
    }
  }

  async function onSaveRankingMetric(e: FormEvent) {
    e.preventDefault();
    setRankingError(null);
    setRankingSuccess(null);
    setRankingSaving(true);
    try {
      await Api.setRankingMetric(rankingMetric);
      setRankingSuccess('Metrica de ranking actualizada');
    } catch (e) {
      setRankingError(
        e instanceof Error ? e.message : 'No se pudo guardar la metrica'
      );
    } finally {
      setRankingSaving(false);
    }
  }

  async function onCreateZona(e: FormEvent) {
    e.preventDefault();
    setZonasError(null);
    setZonasSuccess(null);
    const nombre = zonaForm.nombre.trim();
    if (!nombre) {
      setZonasError('Ingresa un nombre para la zona');
      return;
    }
    setZonaSaving(true);
    try {
      await Api.crearZona({
        nombre,
        color_hex: zonaForm.color_hex || '#64748B',
        activo: true,
      });
      setZonaForm({ nombre: '', color_hex: '#64748B' });
      setZonasSuccess('Zona creada');
      await loadZonas();
    } catch (e) {
      setZonasError(e instanceof Error ? e.message : 'No se pudo crear la zona');
    } finally {
      setZonaSaving(false);
    }
  }

  function updateZonaField(id: number, changes: Partial<any>) {
    setZonas((prev) => prev.map((z) => (Number(z.id) === id ? { ...z, ...changes } : z)));
  }

  async function saveZona(id: number) {
    const zona = zonas.find((z) => Number(z.id) === id);
    if (!zona) return;
    const nombre = String(zona.nombre || '').trim();
    if (!nombre) {
      setZonasError('El nombre de la zona es requerido');
      return;
    }
    setZonasError(null);
    setZonasSuccess(null);
    setZonaSaving(true);
    try {
      await Api.actualizarZona(id, {
        nombre,
        color_hex: zona.color_hex || '#64748B',
        activo: Boolean(zona.activo),
      });
      setZonasSuccess('Zona actualizada');
      await loadZonas();
    } catch (e) {
      setZonasError(e instanceof Error ? e.message : 'No se pudo actualizar la zona');
    } finally {
      setZonaSaving(false);
    }
  }

  async function onCreateMetodoPago(e: FormEvent) {
    e.preventDefault();
    setMetodosError(null);
    setMetodosSuccess(null);
    const nombre = metodoForm.nombre.trim();
    if (!nombre) {
      setMetodosError('Ingresa un nombre de metodo');
      return;
    }
    const ordenNum = Number(metodoForm.orden || 0);
    setMetodoSaving(true);
    try {
      await Api.crearMetodoPago({
        nombre,
        moneda: metodoForm.moneda?.trim() || null,
        orden: Number.isFinite(ordenNum) ? ordenNum : 0,
        activo: true,
      });
      setMetodoForm({ nombre: '', moneda: metodoForm.moneda || 'ARS', orden: '0' });
      setMetodosSuccess('Metodo creado');
      await loadMetodosPago();
    } catch (e) {
      setMetodosError(
        e instanceof Error ? e.message : 'No se pudo crear el metodo'
      );
    } finally {
      setMetodoSaving(false);
    }
  }

  function startEditMetodo(m: any) {
    setEditMetodoId(Number(m.id));
    setEditMetodoForm({
      nombre: m.nombre || '',
      moneda: m.moneda || '',
      orden: String(m.orden ?? 0),
      activo: Boolean(m.activo),
    });
    setMetodosError(null);
    setMetodosSuccess(null);
  }

  function cancelEditMetodo() {
    setEditMetodoId(null);
    setEditMetodoForm({ nombre: '', moneda: '', orden: '', activo: true });
  }

  async function saveEditMetodo(id: number) {
    setMetodosError(null);
    setMetodosSuccess(null);
    const nombre = editMetodoForm.nombre.trim();
    if (!nombre) {
      setMetodosError('El nombre es requerido');
      return;
    }
    const ordenNum = Number(editMetodoForm.orden || 0);
    try {
      await Api.actualizarMetodoPago(id, {
        nombre,
        moneda: editMetodoForm.moneda ? editMetodoForm.moneda.trim() : null,
        orden: Number.isFinite(ordenNum) ? ordenNum : 0,
        activo: editMetodoForm.activo,
      });
      setMetodosSuccess('Metodo actualizado');
      cancelEditMetodo();
      await loadMetodosPago();
    } catch (e) {
      setMetodosError(
        e instanceof Error ? e.message : 'No se pudo actualizar el metodo'
      );
    }
  }

  async function toggleMetodoActivo(m: any) {
    setMetodosError(null);
    setMetodosSuccess(null);
    try {
      await Api.actualizarMetodoPago(Number(m.id), { activo: !m.activo });
      setMetodosSuccess(m.activo ? 'Metodo desactivado' : 'Metodo activado');
      await loadMetodosPago();
    } catch (e) {
      setMetodosError(
        e instanceof Error ? e.message : 'No se pudo actualizar el metodo'
      );
    }
  }

  async function onResetPanel() {
    setResetError(null);
    setResetSuccess(null);
    const confirmed = window.confirm(
      '¿Seguro que querés borrar todos los datos del panel (clientes, productos, ventas, compras, etc.)? Esta acción no se puede deshacer.'
    );
    if (!confirmed) return;
    setResetting(true);
    try {
      await Api.resetPanelData();
      setResetSuccess('Datos del panel limpiados correctamente.');
    } catch (e) {
      setResetError(
        e instanceof Error
          ? e.message
          : 'No se pudieron limpiar los datos del panel'
      );
    } finally {
      setResetting(false);
    }
  }

  function formatLicenseReason(reason: string | null) {
    if (!reason) return null;
    switch (reason) {
      case 'NO_LICENSE':
        return 'Sin licencia cargada';
      case 'EXPIRED':
        return 'Licencia vencida';
      case 'INSTALL_MISMATCH':
        return 'La licencia no corresponde a este equipo';
      case 'INVALID_SIGNATURE':
      case 'INVALID_CODE':
        return 'Licencia invalida';
      case 'NO_PUBLIC_KEY':
        return 'Servidor sin clave publica configurada';
      case 'DEMO_EXPIRED':
        return 'Demo vencida (consultar al proveedor)';
      default:
        return 'Licencia no valida';
    }
  }

  async function onActivateLicense(e: FormEvent) {
    e.preventDefault();
    setLicenseError(null);
    setLicenseSuccess(null);
    const code = licenseCode.trim();
    if (!code) {
      setLicenseError('PegÃ¡ el cÃ³digo de licencia');
      return;
    }
    setLicenseSaving(true);
    try {
      await Api.activateLicense(code);
      setLicenseSuccess('Licencia activada correctamente');
      setLicenseCode('');
      await refreshLicense();
    } catch (err) {
      setLicenseError(err instanceof Error ? err.message : 'No se pudo activar la licencia');
    } finally {
      setLicenseSaving(false);
    }
  }

  async function onActivateCloud(e: FormEvent) {
    e.preventDefault();
    setCloudError(null);
    setCloudSuccess(null);
    const token = cloudToken.trim();
    if (!token) {
      setCloudError('Token requerido');
      return;
    }
    setCloudSaving(true);
    try {
      const res: any = await Api.cloudActivate({
        token,
        endpoint: cloudEndpoint.trim() || null,
      });
      setCloudStatus(res?.cloud || res);
      setCloudSuccess('Vinculacion cloud guardada');
      setCloudToken('');
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'No se pudo vincular cloud');
    } finally {
      setCloudSaving(false);
    }
  }

  async function onSnapshotCloud() {
    setCloudSnapshotError(null);
    setCloudSnapshotSuccess(null);
    setCloudSnapshotLoading(true);
    try {
      await Api.cloudSnapshot();
      setCloudSnapshotSuccess('Snapshot encolado para sincronizar catalogo completo');
      await refreshCloudQueueStatus();
    } catch (err) {
      setCloudSnapshotError(err instanceof Error ? err.message : 'No se pudo generar snapshot');
    } finally {
      setCloudSnapshotLoading(false);
    }
  }

  async function refreshCloudQueueStatus() {
    setCloudQueueError(null);
    setCloudQueueLoading(true);
    try {
      const data = await Api.cloudQueueStatus();
      setCloudQueueStatus(data);
    } catch (err) {
      setCloudQueueError(err instanceof Error ? err.message : 'No se pudo obtener estado de sync');
    } finally {
      setCloudQueueLoading(false);
    }
  }

  function toggleUsuarioDeposito(depositoId: number) {
    setUsuarioDepositoIds((prev) =>
      prev.includes(depositoId)
        ? prev.filter((id) => id !== depositoId)
        : [...prev, depositoId],
    );
  }

  async function onGuardarPermisos(e: FormEvent) {
    e.preventDefault();
    if (!selectedUsuarioId) return;
    setPermisosError(null);
    setPermisosSuccess(null);
    setPermisosSaving(true);
    try {
      const payload = {
        depositos: usuarioDepositoIds.map((id) => ({ deposito_id: id })),
      };
      await apiFetch(`/api/usuarios/${selectedUsuarioId}/depositos`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setPermisosSuccess('Permisos de depЗsitos actualizados correctamente');
    } catch (e) {
      setPermisosError(
        e instanceof Error
          ? e.message
          : 'No se pudieron guardar los permisos de depЗsitos',
      );
    } finally {
      setPermisosSaving(false);
    }
  }

  async function onSaveNetwork(e: FormEvent) {
    e.preventDefault();
    setNetworkError(null);
    setNetworkSuccess(null);
    if (networkPolicy === 'subnet' && !networkSubnet.trim()) {
      setNetworkError('Ingresa una subred valida. Ej: 192.168.0.0/24');
      return;
    }
    setNetworkSaving(true);
    try {
      await Api.setNetworkPolicy({
        policy: networkPolicy,
        subnet: networkPolicy === 'subnet' ? networkSubnet.trim() : null,
      });
      setNetworkSuccess('Politica de red actualizada');
    } catch (err) {
      setNetworkError(err instanceof Error ? err.message : 'No se pudo guardar la politica de red');
    } finally {
      setNetworkSaving(false);
    }
  }

  async function onCreateBackup() {
    setBackupError(null);
    setBackupSuccess(null);
    setBackupLoading(true);
    try {
      const res = await Api.createBackup();
      const data = await Api.listBackups();
      setBackups(Array.isArray(data) ? data : []);
      if (res?.backup?.mirror_error) {
        setBackupSuccess(`Backup creado. Aviso: ${res.backup.mirror_error}`);
      } else {
        setBackupSuccess('Backup creado');
      }
      await refreshBackupStatus();
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'No se pudo crear el backup');
    } finally {
      setBackupLoading(false);
    }
  }

  async function onDownloadBackup(filename: string) {
    setBackupError(null);
    setBackupSuccess(null);
    setBackupLoading(true);
    try {
      const blob = await Api.descargarBackup(filename);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setBackupSuccess('Backup descargado');
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'No se pudo descargar el backup');
    } finally {
      setBackupLoading(false);
    }
  }

  async function onRestoreBackup(filename: string) {
    const ok = window.confirm(`¿Restaurar el backup ${filename}? Esto reemplaza la base actual.`);
    if (!ok) return;
    setBackupError(null);
    setBackupSuccess(null);
    setBackupLoading(true);
    try {
      await Api.restoreBackup(filename);
      setBackupSuccess('Backup restaurado');
      await refreshBackupStatus();
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'No se pudo restaurar el backup');
    } finally {
      setBackupLoading(false);
    }
  }

  async function onSaveBackupSettings(e: FormEvent) {
    e.preventDefault();
    setBackupError(null);
    setBackupSuccess(null);
    const interval = Number(backupSettings.interval_hours);
    if (!Number.isFinite(interval) || interval < 0) {
      setBackupError('Intervalo invalido (debe ser mayor o igual a 0)');
      return;
    }
    const retention = Number(backupSettings.retention_days);
    if (!Number.isFinite(retention) || retention < 0) {
      setBackupError('Retencion invalida (debe ser mayor o igual a 0)');
      return;
    }
    setBackupSettingsSaving(true);
    try {
      await Api.saveBackupSettings({
        enabled: Boolean(backupSettings.enabled),
        interval_hours: interval,
        retention_days: retention,
        external_dir: backupSettings.external_dir?.trim() || '',
      });
      setBackupSuccess('Configuracion de backups guardada');
      await refreshBackupStatus({ updateSettings: true });
    } catch (err) {
      setBackupError(
        err instanceof Error ? err.message : 'No se pudo guardar la configuracion'
      );
    } finally {
      setBackupSettingsSaving(false);
    }
  }

  async function onFactoryReset() {
    setResetError(null);
    setResetSuccess(null);

    // Doble confirmación
    const c1 = window.confirm('ATENCION: Esto BORRARA TODA LA BASE DE DATOS. Se perderan todos los productos, ventas, clientes y usuarios. ¿Estas seguro?');
    if (!c1) return;

    const c2 = window.confirm('ULTIMA ADVERTENCIA: Esta accion NO se puede deshacer. ¿Borrar todo y reiniciar el sistema?');
    if (!c2) return;

    setFactoryResetting(true);
    try {
      await Api.factoryReset();
      alert('Sistema reiniciado. Se recargara la pagina.');
      window.location.href = '/';
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Fallo el reinicio de fabrica');
      setFactoryResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="app-title">Configuracion</div>
        <div className="app-subtitle">Panel de administracion y licencias</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">Datos del negocio</div>
          <div className="space-y-3">
            <input
              className="input-modern w-full text-sm"
              placeholder="Nombre del comercio (opcional)"
            />
            <input
              className="input-modern w-full text-sm"
              placeholder="Email de contacto (opcional)"
            />
            <input
              className="input-modern w-full text-sm"
              placeholder="Moneda de facturación (ej: ARS)"
            />
          </div>
        </div>

        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">
            Umbral de deuda (rojo, ARS)
          </div>
          <div className="space-y-3">
            {deudaError && <Alert kind="error" message={deudaError} />}
            {deudaSuccess && <Alert kind="info" message={deudaSuccess} />}
            <form onSubmit={onSubmitDeudaUmbral} className="space-y-2">
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
                <input
                  className="input-modern flex-1 text-sm"
                  placeholder="Ej: 1000000"
                  type="number"
                  step="1"
                  min="1"
                  value={deudaUmbral}
                  onChange={(e) => setDeudaUmbral(e.target.value)}
                  disabled={loading || deudaSaving}
                />
                <button
                  type="submit"
                  className="h-11 rounded-lg bg-amber-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={loading || deudaSaving}
                >
                  {deudaSaving ? 'Guardando...' : 'Guardar umbral'}
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Montos en ARS. Verde = 0, amarillo entre 1 y este umbral, rojo por encima.
              </p>
            </form>
          </div>
        </div>

        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">Branding</div>
          <div className="space-y-3">
            <input
              className="input-modern w-full text-sm"
              placeholder="URL del logo (opcional)"
            />
            <input
              className="input-modern w-full text-sm"
              placeholder="Subtítulo o lema (opcional)"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">Nombres de precios</div>
          <div className="space-y-3 text-sm">
            {priceLabelsError && <Alert kind="error" message={priceLabelsError} />}
            {priceLabelsSuccess && <Alert kind="info" message={priceLabelsSuccess} />}
            {priceLabelsLoading && (
              <div className="text-xs text-slate-400">Cargando nombres...</div>
            )}
            <form onSubmit={onSavePriceLabels} className="space-y-2">
              <label className="block">
                <div className="text-xs text-slate-400 mb-1">Etiqueta para precio 1</div>
                <input
                  className="input-modern w-full text-sm"
                  value={priceLabels.local}
                  onChange={(e) =>
                    setPriceLabels((prev) => ({ ...prev, local: e.target.value }))
                  }
                  placeholder="Precio Distribuidor"
                  disabled={priceLabelsSaving}
                />
              </label>
              <label className="block">
                <div className="text-xs text-slate-400 mb-1">Etiqueta para precio 2</div>
                <input
                  className="input-modern w-full text-sm"
                  value={priceLabels.distribuidor}
                  onChange={(e) =>
                    setPriceLabels((prev) => ({ ...prev, distribuidor: e.target.value }))
                  }
                  placeholder="Precio Mayorista"
                  disabled={priceLabelsSaving}
                />
              </label>
              <label className="block">
                <div className="text-xs text-slate-400 mb-1">Etiqueta para precio 3</div>
                <input
                  className="input-modern w-full text-sm"
                  value={priceLabels.final}
                  onChange={(e) =>
                    setPriceLabels((prev) => ({ ...prev, final: e.target.value }))
                  }
                  placeholder="Precio Final"
                  disabled={priceLabelsSaving}
                />
              </label>
              <button
                type="submit"
                className="h-9 rounded-lg bg-indigo-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={priceLabelsSaving}
              >
                {priceLabelsSaving ? 'Guardando...' : 'Guardar nombres'}
              </button>
            </form>
            <p className="text-xs text-slate-400">
              Se usan en catalogos, exportaciones y PDFs del sistema.
            </p>
          </div>
        </div>

        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">Metodos de pago</div>
          <div className="space-y-3 text-sm">
            {metodosError && <Alert kind="error" message={metodosError} />}
            {metodosSuccess && <Alert kind="info" message={metodosSuccess} />}
            {metodosLoading && (
              <div className="text-xs text-slate-400">Cargando metodos...</div>
            )}
            <form onSubmit={onCreateMetodoPago} className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input
                  className="input-modern w-full text-sm"
                  placeholder="Nombre (ej: Transferencia)"
                  value={metodoForm.nombre}
                  onChange={(e) => setMetodoForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  disabled={metodoSaving}
                />
                <input
                  className="input-modern w-full text-sm"
                  placeholder="Moneda (ARS, USD)"
                  value={metodoForm.moneda}
                  onChange={(e) => setMetodoForm((prev) => ({ ...prev, moneda: e.target.value }))}
                  disabled={metodoSaving}
                />
                <input
                  className="input-modern w-full text-sm"
                  placeholder="Orden"
                  type="number"
                  value={metodoForm.orden}
                  onChange={(e) => setMetodoForm((prev) => ({ ...prev, orden: e.target.value }))}
                  disabled={metodoSaving}
                />
              </div>
              <button
                type="submit"
                className="h-9 rounded-lg bg-emerald-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={metodoSaving}
              >
                {metodoSaving ? 'Creando...' : 'Crear metodo'}
              </button>
            </form>

            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                className="rounded border-slate-500"
                checked={showMetodosInactivos}
                onChange={(e) => setShowMetodosInactivos(e.target.checked)}
              />
              Mostrar inactivos
            </label>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {metodosPago.map((m) => {
                const isEditing = editMetodoId === Number(m.id);
                return (
                  <div
                    key={m.id}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs"
                  >
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input
                            className="input-modern w-full text-sm"
                            value={editMetodoForm.nombre}
                            onChange={(e) =>
                              setEditMetodoForm((prev) => ({ ...prev, nombre: e.target.value }))
                            }
                          />
                          <input
                            className="input-modern w-full text-sm"
                            value={editMetodoForm.moneda}
                            onChange={(e) =>
                              setEditMetodoForm((prev) => ({ ...prev, moneda: e.target.value }))
                            }
                            placeholder="Moneda"
                          />
                          <input
                            className="input-modern w-full text-sm"
                            type="number"
                            value={editMetodoForm.orden}
                            onChange={(e) =>
                              setEditMetodoForm((prev) => ({ ...prev, orden: e.target.value }))
                            }
                            placeholder="Orden"
                          />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-slate-300">
                          <input
                            type="checkbox"
                            className="rounded border-slate-500"
                            checked={editMetodoForm.activo}
                            onChange={(e) =>
                              setEditMetodoForm((prev) => ({ ...prev, activo: e.target.checked }))
                            }
                          />
                          Metodo activo
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="px-2 py-1 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-xs"
                            onClick={() => saveEditMetodo(Number(m.id))}
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs"
                            onClick={cancelEditMetodo}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-100 truncate">
                            {m.nombre}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {m.moneda ? `Moneda: ${m.moneda}` : 'Moneda: -'} · Orden{' '}
                            {m.orden ?? 0} · {m.activo ? 'Activo' : 'Inactivo'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs"
                            onClick={() => startEditMetodo(m)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="px-2 py-1 rounded bg-slate-700 text-xs"
                            onClick={() => toggleMetodoActivo(m)}
                          >
                            {m.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!metodosPago.length && !metodosLoading && (
                <div className="text-xs text-slate-500">No hay metodos cargados.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">Ranking de vendedores</div>
          <div className="space-y-3 text-sm">
            {rankingError && <Alert kind="error" message={rankingError} />}
            {rankingSuccess && <Alert kind="info" message={rankingSuccess} />}
            {rankingLoading && (
              <div className="text-xs text-slate-400">Cargando metrica...</div>
            )}
            <form onSubmit={onSaveRankingMetric} className="space-y-2">
              <label className="block">
                <div className="text-xs text-slate-400 mb-1">Metrica principal</div>
                <select
                  className="input-modern w-full text-sm"
                  value={rankingMetric}
                  onChange={(e) => setRankingMetric(e.target.value as any)}
                  disabled={rankingLoading || rankingSaving}
                >
                  <option value="cantidad_ventas">Cantidad de ventas</option>
                  <option value="margen_venta">Margen de venta</option>
                </select>
              </label>
              <button
                type="submit"
                className="h-9 rounded-lg bg-indigo-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={rankingSaving || rankingLoading}
              >
                {rankingSaving ? 'Guardando...' : 'Guardar metrica'}
              </button>
            </form>
            <p className="text-xs text-slate-400">
              Define como se ordena el ranking en Sueldos a vendedores.
            </p>
          </div>
        </div>

        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">Zonas de clientes</div>
          <div className="space-y-3 text-sm">
            {zonasError && <Alert kind="error" message={zonasError} />}
            {zonasSuccess && <Alert kind="info" message={zonasSuccess} />}
            {zonasLoading && (
              <div className="text-xs text-slate-400">Cargando zonas...</div>
            )}
            <form onSubmit={onCreateZona} className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.6fr_auto] gap-2 items-center">
                <input
                  className="input-modern w-full text-sm"
                  placeholder="Nombre de zona"
                  value={zonaForm.nombre}
                  onChange={(e) => setZonaForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  disabled={zonaSaving}
                />
                <input
                  type="color"
                  className="h-9 w-full rounded-lg border border-white/10 bg-slate-900"
                  value={zonaForm.color_hex}
                  onChange={(e) => setZonaForm((prev) => ({ ...prev, color_hex: e.target.value }))}
                  disabled={zonaSaving}
                />
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-emerald-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={zonaSaving}
                >
                  {zonaSaving ? 'Creando...' : 'Crear zona'}
                </button>
              </div>
            </form>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {zonas.map((z) => (
                <div
                  key={z.id}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-xs"
                >
                  <div className="grid grid-cols-1 md:grid-cols-[1.2fr_0.9fr_auto] gap-2 items-center">
                    <input
                      className="input-modern w-full text-sm"
                      value={z.nombre || ''}
                      onChange={(e) => updateZonaField(Number(z.id), { nombre: e.target.value })}
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        className="h-9 w-14 rounded-lg border border-white/10 bg-slate-900"
                        value={z.color_hex || '#64748B'}
                        onChange={(e) => updateZonaField(Number(z.id), { color_hex: e.target.value })}
                      />
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          className="rounded border-slate-500"
                          checked={Boolean(z.activo)}
                          onChange={(e) => updateZonaField(Number(z.id), { activo: e.target.checked })}
                        />
                        Activo
                      </label>
                    </div>
                    <button
                      type="button"
                      className="px-2 py-1 rounded bg-indigo-500/20 border border-indigo-500/30 text-indigo-200 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      onClick={() => saveZona(Number(z.id))}
                      disabled={zonaSaving}
                    >
                      {zonaSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              ))}
              {!zonasLoading && !zonas.length && (
                <div className="text-xs text-slate-500">No hay zonas cargadas.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">Licencia de usuarios</div>
          <div className="space-y-3 text-sm text-slate-300">
            {licenseLoading && <div className="text-xs text-slate-400">Cargando licencia...</div>}
            {!licenseLoading && licenseStatus && (
              <div className="space-y-1 text-xs text-slate-400">
                <div>
                  Estado: {licenseStatus.licensed ? 'Activa' : 'No activa'}
                </div>
                {licenseStatus.install_id && (
                  <div className="flex items-center gap-2">
                    <span className="truncate">ID instalacion: {licenseStatus.install_id}</span>
                    <button
                      type="button"
                      className="text-xs text-slate-400 hover:text-slate-200"
                      onClick={() => navigator.clipboard?.writeText(licenseStatus.install_id || '')}
                    >
                      Copiar
                    </button>
                  </div>
                )}
                {licenseStatus.licensed && (
                  <>
                    <div>Usuarios max: {licenseStatus.max_users ?? 'Sin limite'}</div>
                    <div>Vence: {licenseStatus.expires_at ? new Date(licenseStatus.expires_at).toLocaleDateString() : 'Sin vencimiento'}</div>
                  </>
                )}
                {licenseStatus.license_type === 'demo' && (
                  <div className="text-amber-300">
                    Demo activa{licenseStatus.demo_days_left != null ? ` (${licenseStatus.demo_days_left} dÃ­as restantes)` : ''}.
                  </div>
                )}
                {!licenseStatus.licensed && (
                  <div>Motivo: {formatLicenseReason(licenseStatus.reason) || 'No disponible'}</div>
                )}
              </div>
            )}
            {!licenseLoading && licenseStatus && (
              <div className="mt-3">
                <div className="text-xs text-slate-400 mb-2">Modulos habilitados</div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {FEATURE_LIST.map((f) => {
                    const enabled = hasFeature(licenseStatus, f.key);
                    return (
                      <div
                        key={f.key}
                        className={[
                          'rounded-md border px-2 py-1',
                          enabled
                            ? 'border-emerald-500/30 text-emerald-200 bg-emerald-500/10'
                            : 'border-white/10 text-slate-400 bg-white/5',
                        ].join(' ')}
                      >
                        {f.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {licenseError && <Alert kind="error" message={licenseError} />}
            {licenseSuccess && <Alert kind="info" message={licenseSuccess} />}

            <form onSubmit={onActivateLicense} className="space-y-2">
              <label className="block text-xs text-slate-400">
                Codigo de licencia
              </label>
              <textarea
                className="input-modern w-full text-xs min-h-[120px]"
                placeholder="Pega aqui­ el codigo de licencia (sin archivo)"
                value={licenseCode}
                onChange={(e) => setLicenseCode(e.target.value)}
              />
              <button
                type="submit"
                className="h-9 rounded-lg bg-indigo-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={licenseSaving}
              >
                {licenseSaving ? 'Activando...' : 'Activar licencia'}
              </button>
            </form>
          </div>
        </div>
        {showCloudLinking && (
          <div className="app-card p-4">
            <div className="text-sm text-slate-300 mb-2">Vinculacion cloud</div>
            <div className="space-y-3 text-sm text-slate-300">
              {cloudLoading && <div className="text-xs text-slate-400">Cargando estado cloud...</div>}
              {!cloudLoading && cloudStatus && (
                <div className="space-y-1 text-xs text-slate-400">
                  <div>Estado: {cloudStatus.linked ? 'Vinculado' : 'Sin vincular'}</div>
                  {cloudStatus.device_id && (
                    <div className="flex items-center gap-2">
                      <span className="truncate">Device ID: {cloudStatus.device_id}</span>
                      <button
                        type="button"
                        className="text-xs text-slate-400 hover:text-slate-200"
                        onClick={() => navigator.clipboard?.writeText(cloudStatus.device_id || '')}
                      >
                        Copiar
                      </button>
                    </div>
                  )}
                  {cloudStatus.endpoint && (
                    <div className="truncate">Endpoint sync: {cloudStatus.endpoint}</div>
                  )}
                  {cloudStatus.slug && cloudStatus.endpoint && (
                    <div className="truncate">
                      URL publica:{' '}
                      {`${cloudStatus.endpoint.replace(/\/api\/?$/, '').replace(/\/$/, '')}/${cloudStatus.slug}`}
                    </div>
                  )}
                </div>
              )}

              {cloudError && <Alert kind="error" message={cloudError} />}
              {cloudSuccess && <Alert kind="info" message={cloudSuccess} />}
              {cloudSnapshotError && <Alert kind="error" message={cloudSnapshotError} />}
              {cloudSnapshotSuccess && <Alert kind="info" message={cloudSnapshotSuccess} />}
              {cloudQueueError && <Alert kind="error" message={cloudQueueError} />}

              <form onSubmit={onActivateCloud} className="space-y-2">
                <label className="block text-xs text-slate-400">Token de vinculacion</label>
                <input
                  className="input-modern w-full text-xs"
                  placeholder="Pegue aqui el token cloud"
                  value={cloudToken}
                  onChange={(e) => setCloudToken(e.target.value)}
                />
                <label className="block text-xs text-slate-400">Endpoint cloud (opcional)</label>
                <input
                  className="input-modern w-full text-xs"
                  placeholder="https://mi-nube.com"
                  value={cloudEndpoint}
                  onChange={(e) => setCloudEndpoint(e.target.value)}
                />
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-emerald-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={cloudSaving}
                >
                  {cloudSaving ? 'Guardando...' : 'Vincular cloud'}
                </button>
              </form>
              <button
                type="button"
                className="h-9 rounded-lg bg-slate-700 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={cloudSnapshotLoading}
                onClick={onSnapshotCloud}
              >
                {cloudSnapshotLoading ? 'Encolando...' : 'Reenviar catalogo completo'}
              </button>
              <button
                type="button"
                className="h-9 rounded-lg bg-slate-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={cloudQueueLoading}
                onClick={refreshCloudQueueStatus}
              >
                {cloudQueueLoading ? 'Actualizando...' : 'Ver estado de sync'}
              </button>
              {cloudQueueStatus && (
                <div className="text-xs text-slate-400 space-y-1">
                  <div>
                    Pendientes: {cloudQueueStatus.summary?.pending || 0} | Procesando:{' '}
                    {cloudQueueStatus.summary?.processing || 0} | Enviados:{' '}
                    {cloudQueueStatus.summary?.sent || 0} | Error:{' '}
                    {cloudQueueStatus.summary?.error || 0}
                  </div>
                  {cloudQueueStatus.last_sent_at && (
                    <div>Ultimo envio: {new Date(cloudQueueStatus.last_sent_at).toLocaleString()}</div>
                  )}
                  {Array.isArray(cloudQueueStatus.recent_errors) &&
                    cloudQueueStatus.recent_errors.length > 0 && (
                      <div>
                        Errores recientes:
                        <ul className="list-disc pl-4">
                          {cloudQueueStatus.recent_errors.map((e: any) => (
                            <li key={e.id}>{e.last_error || 'error'}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">Red permitida</div>
          <div className="space-y-3 text-sm">
            {networkError && <Alert kind="error" message={networkError} />}
            {networkSuccess && <Alert kind="info" message={networkSuccess} />}
            <form onSubmit={onSaveNetwork} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Politica</label>
                <select
                  className="input-modern w-full text-sm"
                  value={networkPolicy}
                  onChange={(e) => setNetworkPolicy(e.target.value as any)}
                  disabled={networkSaving}
                >
                  <option value="off">Sin restriccion</option>
                  <option value="private">Solo IPs privadas (LAN)</option>
                  <option value="subnet">Subred especifica</option>
                </select>
              </div>
              {networkPolicy === 'subnet' && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Subred</label>
                  <input
                    className="input-modern w-full text-sm"
                    placeholder="192.168.0.0/24"
                    value={networkSubnet}
                    onChange={(e) => setNetworkSubnet(e.target.value)}
                    disabled={networkSaving}
                  />
                </div>
              )}
              <button
                type="submit"
                className="h-9 rounded-lg bg-indigo-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={networkSaving}
              >
                {networkSaving ? 'Guardando...' : 'Guardar red'}
              </button>
            </form>
            <p className="text-xs text-slate-400">
              Si activas la restriccion, solo las PCs dentro de la red podran iniciar sesion.
            </p>
          </div>
        </div>

        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">Backups</div>
          <div className="space-y-3 text-sm">
            {backupError && <Alert kind="error" message={backupError} />}
            {backupSuccess && <Alert kind="info" message={backupSuccess} />}
            {backupStatusLoading && (
              <div className="text-xs text-slate-500">Cargando estado de backups...</div>
            )}
            {backupStatus && (
              <div className="text-xs text-slate-400 space-y-1">
                <div>Ultimo intento: {formatBackupDate(backupStatus.last_run_at)}</div>
                <div>Ultimo exito: {formatBackupDate(backupStatus.last_success_at)}</div>
                {backupStatus.last_filename && (
                  <div className="truncate">Archivo: {backupStatus.last_filename}</div>
                )}
                <div>
                  Proximo:{" "}
                  {backupStatus.scheduler_active && backupStatus.next_run_at
                    ? formatBackupDate(backupStatus.next_run_at)
                    : "Desactivado"}
                </div>
                {backupStatus.last_error && (
                  <div className="text-amber-300">Ultimo error: {backupStatus.last_error}</div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onCreateBackup}
              className="h-9 rounded-lg bg-emerald-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={backupLoading}
            >
              {backupLoading ? 'Creando...' : 'Crear backup'}
            </button>
            <div className="text-xs text-slate-400">Backups disponibles:</div>
            {backupLoading && !backups.length && (
              <div className="text-xs text-slate-500">Cargando backups...</div>
            )}
            {!backups.length && !backupLoading && (
              <div className="text-xs text-slate-500">Sin backups.</div>
            )}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {backups.map((b: any) => (
                <div
                  key={b.filename}
                  className="flex items-center justify-between gap-2 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-lg px-2 py-2"
                >
                  <div className="flex flex-col">
                    <span className="truncate">{b.filename}</span>
                    <span className="text-[11px] text-slate-500">
                      {b.created_at ? new Date(b.created_at).toLocaleString() : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs text-slate-300 hover:text-white"
                      onClick={() => onDownloadBackup(b.filename)}
                      disabled={backupLoading}
                    >
                      Descargar
                    </button>
                    <button
                      type="button"
                      className="text-xs text-amber-300 hover:text-amber-100"
                      onClick={() => onRestoreBackup(b.filename)}
                      disabled={backupLoading}
                    >
                      Restaurar
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-3 mt-3 border-t border-white/10">
              <form onSubmit={onSaveBackupSettings} className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    className="rounded border-slate-500"
                    checked={backupSettings.enabled}
                    onChange={(e) =>
                      setBackupSettings((prev) => ({ ...prev, enabled: e.target.checked }))
                    }
                    disabled={backupSettingsSaving}
                  />
                  Backups automaticos
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Intervalo (horas)
                    </label>
                    <input
                      className="input-modern w-full text-sm"
                      type="number"
                      min="0"
                      step="1"
                      value={backupSettings.interval_hours}
                      onChange={(e) =>
                        setBackupSettings((prev) => ({
                          ...prev,
                          interval_hours: e.target.value,
                        }))
                      }
                      disabled={backupSettingsSaving}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Retencion (dias)
                    </label>
                    <input
                      className="input-modern w-full text-sm"
                      type="number"
                      min="0"
                      step="1"
                      value={backupSettings.retention_days}
                      onChange={(e) =>
                        setBackupSettings((prev) => ({
                          ...prev,
                          retention_days: e.target.value,
                        }))
                      }
                      disabled={backupSettingsSaving}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Carpeta externa (OneDrive/NAS)
                  </label>
                  <input
                    className="input-modern w-full text-sm"
                    placeholder="C:\\Users\\...\\OneDrive\\Backups o \\\\NAS\\Backups"
                    value={backupSettings.external_dir}
                    onChange={(e) =>
                      setBackupSettings((prev) => ({
                        ...prev,
                        external_dir: e.target.value,
                      }))
                    }
                    disabled={backupSettingsSaving}
                  />
                </div>
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-indigo-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={backupSettingsSaving}
                >
                  {backupSettingsSaving ? 'Guardando...' : 'Guardar configuracion'}
                </button>
                <p className="text-xs text-slate-400">
                  Sugerencia: usa una carpeta sincronizada (OneDrive/Google Drive) o una ruta de red.
                  Intervalo 0 o desactivar = sin backups automaticos.
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">
            Dólar blue para precios
          </div>
          <div className="space-y-3">
            {error && <Alert kind="error" message={error} />}
            {success && <Alert kind="info" message={success} />}
            <form onSubmit={onSubmitDolar} className="space-y-2">
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
                <input
                  className="input-modern flex-1 text-sm"
                  placeholder="Ej: 1500"
                  type="number"
                  step="0.01"
                  value={dolarBlue}
                  onChange={(e) => setDolarBlue(e.target.value)}
                  disabled={loading || saving}
                />
                <button
                  type="submit"
                  className="h-11 rounded-lg bg-emerald-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={loading || saving}
                >
                  {saving ? 'Guardando...' : 'Guardar dólar'}
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Este valor se usará como tipo de cambio base (dólar blue) para
                los cálculos de precios de todos los productos en USD.
              </p>
            </form>
          </div>
        </div>

        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">Herramientas avanzadas</div>
          <div className="space-y-3">
            {resetError && <Alert kind="error" message={resetError} />}
            {resetSuccess && <Alert kind="info" message={resetSuccess} />}
            <button
              type="button"
              onClick={onResetPanel}
              className="h-11 w-full rounded-lg bg-red-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={resetting}
            >
              {resetting ? 'Limpiando datos...' : 'Limpiar datos del panel'}
            </button>
            <p className="text-xs text-slate-400">
              Borra clientes, productos, ventas, compras, CRM, tickets y logs cargados desde el panel.
              No toca usuarios ni datos de login.
            </p>

            <div className="pt-4 border-t border-white/10 mt-4">
              <button
                type="button"
                onClick={onFactoryReset}
                className="h-11 w-full rounded-lg bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700/50 px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed uppercase tracking-wider"
                disabled={resetting || factoryResetting}
              >
                {factoryResetting ? 'RESTABLECIENDO...' : 'RESTABLECIMIENTO DE FABRICA'}
              </button>
              <p className="text-xs text-red-400/70 mt-2">
                PELIGRO: Borra TODO y deja el sistema como recien instalado.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="app-card p-4">
          <div className="text-sm text-slate-300 mb-2">
            Permisos de depИsitos por usuario
          </div>
          <div className="space-y-3 text-sm">
            {usuariosError && <Alert kind="error" message={usuariosError} />}
            {permisosError && <Alert kind="error" message={permisosError} />}
            {permisosSuccess && <Alert kind="info" message={permisosSuccess} />}
            <form onSubmit={onGuardarPermisos} className="space-y-3">
              <div className="flex flex-col md:flex-row gap-2 md:items-center">
                <div className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">
                    Usuario
                  </label>
                  <select
                    className="input-modern w-full text-sm"
                    value={selectedUsuarioId === '' ? '' : String(selectedUsuarioId)}
                    onChange={(e) =>
                      setSelectedUsuarioId(
                        e.target.value ? Number(e.target.value) : '',
                      )
                    }
                    disabled={usuariosLoading}
                  >
                    <option value="">
                      {usuariosLoading ? 'Cargando usuarios...' : 'Selecciona un usuario'}
                    </option>
                    {usuarios.map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre || u.email} {u.rol ? `(${u.rol})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedUsuarioId && (
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">
                    Selecciona los depИsitos a los que el usuario puede acceder.
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {depositos.map((d: any) => {
                      const checked = usuarioDepositoIds.includes(Number(d.id));
                      return (
                        <label
                          key={d.id}
                          className="flex items-center gap-2 text-xs text-slate-200 bg-white/5 border border-white/10 rounded-lg px-2 py-1"
                        >
                          <input
                            type="checkbox"
                            className="rounded border-slate-500"
                            checked={checked}
                            onChange={() => toggleUsuarioDeposito(Number(d.id))}
                          />
                          <span>
                            {d.nombre}
                            {d.codigo ? ` (${d.codigo})` : ''}
                          </span>
                        </label>
                      );
                    })}
                    {!depositos.length && (
                      <div className="text-xs text-slate-500">
                        No hay depИsitos configurados.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  className="h-9 rounded-lg bg-indigo-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={permisosSaving || !selectedUsuarioId}
                >
                  {permisosSaving ? 'Guardando...' : 'Guardar permisos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
