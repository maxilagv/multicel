import { useEffect, useState, type FormEvent } from 'react';
import { Api, apiFetch } from '../lib/api';
import Alert from '../components/Alert';
import { useTenantModules, MODULE_DEFINITIONS, MODULE_GROUPS, type ModuleGroup } from '../context/TenantModulesContext';
import { usePriceConfig } from '../context/PriceConfigContext';

type WhatsappCapabilities = {
  supportsMediaUrl?: boolean;
  supportsDocumentBuffer?: boolean;
  requiresConnection?: boolean;
};

type WhatsappStatus = {
  provider?: string;
  configured?: boolean;
  ready?: boolean;
  state?: string;
  phone?: string | null;
  qrAvailable?: boolean;
  qrUpdatedAt?: string | null;
  lastConnectedAt?: string | null;
  lastError?: string | null;
  capabilities?: WhatsappCapabilities;
};

function formatWhatsappProviderName(provider?: string | null) {
  if (provider === 'web') return 'Linea vinculada con tu celular';
  if (provider === 'twilio') return 'Linea oficial del negocio';
  if (provider === 'off') return 'Canal apagado';
  return 'Sin configurar';
}

function formatWhatsappState(state?: string | null, provider?: string | null) {
  if (state === 'connected') {
    return provider === 'twilio' ? 'Lista para usar' : 'Vinculada';
  }
  if (state === 'connecting') return 'Preparando la linea';
  if (state === 'scanning') return 'Falta escanear el codigo';
  if (state === 'reconnecting') return 'Recuperando la conexion';
  if (state === 'error') return 'Necesita revision';
  if (state === 'disabled') return provider === 'off' ? 'Canal apagado' : 'Sin configurar';
  return 'Todavia no iniciada';
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('es-AR');
}

export default function ConfiguracionAdmin() {
  const { modules: modulesState, setModuleEnabled } = useTenantModules();
  const { tiers: priceTiers, lists: priceLists, refresh: refreshPriceConfig } = usePriceConfig();
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
  const [usuarioDepositoPrincipalId, setUsuarioDepositoPrincipalId] = useState<number | ''>('');
  const [permisosSuccess, setPermisosSuccess] = useState<string | null>(null);
  const [permisosError, setPermisosError] = useState<string | null>(null);
  const [factoryResetting, setFactoryResetting] = useState(false);
  const [priceLabels, setPriceLabels] = useState({ local: '', distribuidor: '', final: '' });
  const [priceLabelsLoading, setPriceLabelsLoading] = useState(false);
  const [priceLabelsSaving, setPriceLabelsSaving] = useState(false);
  const [priceLabelsError, setPriceLabelsError] = useState<string | null>(null);
  const [priceLabelsSuccess, setPriceLabelsSuccess] = useState<string | null>(null);

  // Estado local para toggles de mÃ³dulos
  const [modulesTogglingKey, setModulesTogglingKey] = useState<string | null>(null);
  const [modulesError, setModulesError] = useState<string | null>(null);
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
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsappStatus | null>(null);
  const [whatsappQr, setWhatsappQr] = useState<string | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappActionLoading, setWhatsappActionLoading] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappSuccess, setWhatsappSuccess] = useState<string | null>(null);
  const [roundingStep, setRoundingStep] = useState<number>(1);
  const [roundingOpcs, setRoundingOpcs] = useState<number[]>([1, 5, 10, 50, 100, 500, 1000]);
  const [roundingSaving, setRoundingSaving] = useState(false);
  const [roundingError, setRoundingError] = useState<string | null>(null);
  const [roundingSuccess, setRoundingSuccess] = useState<string | null>(null);
  const [priceListsSaving, setPriceListsSaving] = useState(false);
  const [priceListsError, setPriceListsError] = useState<string | null>(null);
  const [priceListsSuccess, setPriceListsSuccess] = useState<string | null>(null);
  const [priceListForm, setPriceListForm] = useState({
    id: null as number | null,
    nombre: '',
    slug: '',
    descripcion: '',
    margen_ratio: '0',
    activo: true,
  });
  const [selectedRulesListId, setSelectedRulesListId] = useState<number | ''>('');
  const [quantityRules, setQuantityRules] = useState<any[]>([]);
  const [quantityRulesLoading, setQuantityRulesLoading] = useState(false);
  const [quantityRulesSaving, setQuantityRulesSaving] = useState(false);
  const [quantityRulesError, setQuantityRulesError] = useState<string | null>(null);
  const [quantityRulesSuccess, setQuantityRulesSuccess] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [quantityRuleForm, setQuantityRuleForm] = useState({
    cantidad_desde: '1',
    cantidad_hasta: '',
    modo: 'lista',
    lista_precio_alternativa_id: '',
    descuento_pct: '',
    precio_fijo: '',
    prioridad: '0',
    activo: true,
  });

  // â”€â”€ Recargos por mÃ©todo de pago â”€â”€
  const [surcharges, setSurcharges] = useState<any[]>([]);
  const [surchargesLoading, setSurchargesLoading] = useState(false);
  const [surchargesSaving, setSurchargesSaving] = useState(false);
  const [surchargesError, setSurchargesError] = useState<string | null>(null);
  const [surchargesSuccess, setSurchargesSuccess] = useState<string | null>(null);
  const [editingSurchargeId, setEditingSurchargeId] = useState<number | null>(null);
  const [surchargeForm, setSurchargeForm] = useState({
    metodo_pago_id: '',
    lista_precio_id: '',
    tipo: 'recargo' as 'recargo' | 'descuento',
    valor_pct: '',
    activo: true,
  });

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
            : 'No se pudo cargar el dÃ³lar blue'
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

  // Sincronizar inputs de nombre con el contexto global de precios
  useEffect(() => {
    const localTier  = priceTiers.find((t) => t.key === 'local');
    const distTier   = priceTiers.find((t) => t.key === 'distribuidor');
    const finalTier  = priceTiers.find((t) => t.key === 'final');
    if (localTier || distTier || finalTier) {
      setPriceLabels({
        local: localTier?.label ?? '',
        distribuidor: distTier?.label ?? '',
        final: finalTier?.label ?? '',
      });
    }
  }, [priceTiers]);

  useEffect(() => {
    let active = true;
    (async () => {
      setPriceLabelsLoading(true);
      setPriceLabelsError(null);
      try {
        const data = await Api.getPriceLabels();
        if (!active) return;
        setPriceLabels({
          local: data?.local || 'Precio Local',
          distribuidor: data?.distribuidor || 'Precio Distribuidor',
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

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await Api.getPriceRounding();
        if (!active) return;
        if (typeof data?.valor === 'number') setRoundingStep(data.valor);
        if (Array.isArray(data?.opciones)) setRoundingOpcs(data.opciones);
      } catch { /* silencioso, usa default */ }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (selectedRulesListId) return;
    const firstActive = priceLists.find((item) => item.enabled) || priceLists[0] || null;
    if (firstActive?.id) {
      setSelectedRulesListId(firstActive.id);
    }
  }, [priceLists, selectedRulesListId]);

  useEffect(() => {
    if (!selectedRulesListId) {
      setQuantityRules([]);
      return;
    }
    let active = true;
    (async () => {
      setQuantityRulesLoading(true);
      setQuantityRulesError(null);
      try {
        const rows = await Api.reglasCantidadPrecio(Number(selectedRulesListId));
        if (!active) return;
        setQuantityRules(Array.isArray(rows) ? rows : []);
      } catch (e) {
        if (!active) return;
        setQuantityRules([]);
        setQuantityRulesError(
          e instanceof Error ? e.message : 'No se pudieron cargar las reglas por cantidad'
        );
      } finally {
        if (active) setQuantityRulesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedRulesListId]);

  // Carga de recargos por mÃ©todo de pago
  useEffect(() => {
    let active = true;
    (async () => {
      setSurchargesLoading(true);
      setSurchargesError(null);
      try {
        const rows = await Api.recargoPago({ inactivos: true });
        if (!active) return;
        setSurcharges(Array.isArray(rows) ? rows : []);
      } catch (e) {
        if (!active) return;
        setSurchargesError(e instanceof Error ? e.message : 'No se pudieron cargar los recargos');
      } finally {
        if (active) setSurchargesLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  function resetSurchargeForm() {
    setEditingSurchargeId(null);
    setSurchargeForm({ metodo_pago_id: '', lista_precio_id: '', tipo: 'recargo', valor_pct: '', activo: true });
  }

  function editSurcharge(s: any) {
    setEditingSurchargeId(Number(s.id));
    setSurchargeForm({
      metodo_pago_id: String(s.metodo_pago_id || ''),
      lista_precio_id: s.lista_precio_id != null ? String(s.lista_precio_id) : '',
      tipo: s.tipo === 'descuento' ? 'descuento' : 'recargo',
      valor_pct: String(s.valor_pct || ''),
      activo: s.activo !== false,
    });
    setSurchargesError(null);
    setSurchargesSuccess(null);
  }

  async function onSaveSurcharge(e: React.FormEvent) {
    e.preventDefault();
    setSurchargesError(null);
    setSurchargesSuccess(null);
    if (!surchargeForm.metodo_pago_id) {
      setSurchargesError('SeleccionÃ¡ un mÃ©todo de pago');
      return;
    }
    const pct = Number(surchargeForm.valor_pct);
    if (!pct || pct <= 0 || pct > 100) {
      setSurchargesError('El porcentaje debe ser entre 0.01 y 100');
      return;
    }
    setSurchargesSaving(true);
    try {
      const payload = {
        metodo_pago_id: Number(surchargeForm.metodo_pago_id),
        lista_precio_id: surchargeForm.lista_precio_id ? Number(surchargeForm.lista_precio_id) : null,
        tipo: surchargeForm.tipo,
        valor_pct: pct,
        activo: surchargeForm.activo,
      };
      if (editingSurchargeId) {
        await Api.actualizarRecargoPago(editingSurchargeId, payload);
        setSurchargesSuccess('Recargo actualizado');
      } else {
        await Api.crearRecargoPago(payload);
        setSurchargesSuccess('Recargo creado');
      }
      resetSurchargeForm();
      const rows = await Api.recargoPago({ inactivos: true });
      setSurcharges(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setSurchargesError(e instanceof Error ? e.message : 'No se pudo guardar el recargo');
    } finally {
      setSurchargesSaving(false);
    }
  }

  async function onDeleteSurcharge(id: number) {
    if (!window.confirm('Â¿Eliminar este recargo?')) return;
    setSurchargesSaving(true);
    setSurchargesError(null);
    try {
      await Api.eliminarRecargoPago(id);
      setSurchargesSuccess('Recargo eliminado');
      const rows = await Api.recargoPago({ inactivos: true });
      setSurcharges(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setSurchargesError(e instanceof Error ? e.message : 'No se pudo eliminar el recargo');
    } finally {
      setSurchargesSaving(false);
    }
  }

  function resetPriceListForm() {
    setPriceListForm({
      id: null,
      nombre: '',
      slug: '',
      descripcion: '',
      margen_ratio: '0',
      activo: true,
    });
  }

  function editPriceList(list: any) {
    setPriceListForm({
      id: Number(list.id),
      nombre: String(list.nombre || ''),
      slug: String(list.slug || ''),
      descripcion: String(list.descripcion || ''),
      margen_ratio: String(list.margen_ratio ?? 0),
      activo: list.enabled !== false,
    });
    setPriceListsError(null);
    setPriceListsSuccess(null);
  }

  async function onSavePriceList(e: FormEvent) {
    e.preventDefault();
    setPriceListsError(null);
    setPriceListsSuccess(null);
    if (!priceListForm.nombre.trim()) {
      setPriceListsError('IngresÃ¡ un nombre para la lista');
      return;
    }
    setPriceListsSaving(true);
    try {
      const payload = {
        nombre: priceListForm.nombre.trim(),
        slug: priceListForm.slug.trim() || undefined,
        descripcion: priceListForm.descripcion.trim() || undefined,
        margen_ratio: Number(priceListForm.margen_ratio || 0),
        activo: priceListForm.activo,
      };
      if (priceListForm.id) {
        await Api.actualizarListaPrecio(priceListForm.id, payload);
        setPriceListsSuccess('Lista actualizada');
      } else {
        await Api.crearListaPrecio(payload);
        setPriceListsSuccess('Lista creada');
      }
      resetPriceListForm();
      await refreshPriceConfig();
    } catch (e) {
      setPriceListsError(e instanceof Error ? e.message : 'No se pudo guardar la lista');
    } finally {
      setPriceListsSaving(false);
    }
  }

  async function onTogglePriceList(list: any) {
    setPriceListsError(null);
    setPriceListsSuccess(null);
    setPriceListsSaving(true);
    try {
      await Api.actualizarListaPrecio(Number(list.id), { activo: !(list.enabled !== false) });
      setPriceListsSuccess('Estado de lista actualizado');
      await refreshPriceConfig();
    } catch (e) {
      setPriceListsError(
        e instanceof Error ? e.message : 'No se pudo actualizar el estado de la lista'
      );
    } finally {
      setPriceListsSaving(false);
    }
  }

  function resetQuantityRuleForm() {
    setEditingRuleId(null);
    setQuantityRuleForm({
      cantidad_desde: '1',
      cantidad_hasta: '',
      modo: 'lista',
      lista_precio_alternativa_id: '',
      descuento_pct: '',
      precio_fijo: '',
      prioridad: '0',
      activo: true,
    });
  }

  function editQuantityRule(rule: any) {
    setEditingRuleId(Number(rule.id));
    setQuantityRuleForm({
      cantidad_desde: String(rule.cantidad_desde || 1),
      cantidad_hasta:
        rule.cantidad_hasta === null || typeof rule.cantidad_hasta === 'undefined'
          ? ''
          : String(rule.cantidad_hasta),
      modo: String(rule.modo || 'lista'),
      lista_precio_alternativa_id: rule.lista_precio_alternativa_id
        ? String(rule.lista_precio_alternativa_id)
        : '',
      descuento_pct: rule.descuento_pct != null ? String(rule.descuento_pct) : '',
      precio_fijo: rule.precio_fijo != null ? String(rule.precio_fijo) : '',
      prioridad: String(rule.prioridad || 0),
      activo: rule.activo !== false && rule.activo !== 0,
    });
    setQuantityRulesError(null);
    setQuantityRulesSuccess(null);
  }

  async function reloadSelectedQuantityRules() {
    if (!selectedRulesListId) return;
    const rows = await Api.reglasCantidadPrecio(Number(selectedRulesListId));
    setQuantityRules(Array.isArray(rows) ? rows : []);
  }

  async function onSaveQuantityRule(e: FormEvent) {
    e.preventDefault();
    setQuantityRulesError(null);
    setQuantityRulesSuccess(null);
    if (!selectedRulesListId) {
      setQuantityRulesError('SeleccionÃ¡ una lista');
      return;
    }
    setQuantityRulesSaving(true);
    try {
      const payload: any = {
        cantidad_desde: Number(quantityRuleForm.cantidad_desde || 1),
        cantidad_hasta: quantityRuleForm.cantidad_hasta.trim()
          ? Number(quantityRuleForm.cantidad_hasta)
          : null,
        modo: quantityRuleForm.modo,
        prioridad: Number(quantityRuleForm.prioridad || 0),
        activo: quantityRuleForm.activo,
      };
      if (quantityRuleForm.modo === 'lista_alternativa') {
        payload.lista_precio_alternativa_id = Number(quantityRuleForm.lista_precio_alternativa_id || 0);
      }
      if (quantityRuleForm.modo === 'descuento_pct') {
        payload.descuento_pct = Number(quantityRuleForm.descuento_pct || 0);
      }
      if (quantityRuleForm.modo === 'precio_fijo') {
        payload.precio_fijo = Number(quantityRuleForm.precio_fijo || 0);
      }

      if (editingRuleId) {
        await Api.actualizarReglaCantidadPrecio(editingRuleId, payload);
        setQuantityRulesSuccess('Regla actualizada');
      } else {
        await Api.crearReglaCantidadPrecio(Number(selectedRulesListId), payload);
        setQuantityRulesSuccess('Regla creada');
      }
      resetQuantityRuleForm();
      await reloadSelectedQuantityRules();
    } catch (e) {
      setQuantityRulesError(
        e instanceof Error ? e.message : 'No se pudo guardar la regla por cantidad'
      );
    } finally {
      setQuantityRulesSaving(false);
    }
  }

  async function onDeleteQuantityRule(ruleId: number) {
    if (!window.confirm(`Eliminar la regla #${ruleId}?`)) return;
    setQuantityRulesError(null);
    setQuantityRulesSuccess(null);
    setQuantityRulesSaving(true);
    try {
      await Api.eliminarReglaCantidadPrecio(ruleId);
      setQuantityRulesSuccess('Regla eliminada');
      if (editingRuleId === ruleId) resetQuantityRuleForm();
      await reloadSelectedQuantityRules();
    } catch (e) {
      setQuantityRulesError(
        e instanceof Error ? e.message : 'No se pudo eliminar la regla por cantidad'
      );
    } finally {
      setQuantityRulesSaving(false);
    }
  }

  async function onSaveRounding() {
    setRoundingError(null);
    setRoundingSuccess(null);
    setRoundingSaving(true);
    try {
      await Api.setPriceRounding(roundingStep);
      setRoundingSuccess('Redondeo actualizado. Los nuevos precios calculados usarÃ¡n este valor.');
    } catch (e) {
      setRoundingError(e instanceof Error ? e.message : 'No se pudo guardar el redondeo');
    } finally {
      setRoundingSaving(false);
    }
  }

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
            : 'No se pudieron cargar usuarios o depÐ—sitos',
        );
      } finally {
        setUsuariosLoading(false);
      }
    })();
  }, []);


  async function refreshWhatsappStatus(opts: { silent?: boolean; withQr?: boolean } = {}) {
    if (!opts.silent) setWhatsappLoading(true);
    setWhatsappError(null);
    try {
      const status = (await Api.whatsappStatus()) as WhatsappStatus;
      setWhatsappStatus(status);

      const shouldLoadQr =
        Boolean(opts.withQr) &&
        status?.provider === 'web' &&
        status?.qrAvailable &&
        status?.state === 'scanning';

      if (shouldLoadQr) {
        const qrData = await Api.whatsappQr().catch(() => null);
        setWhatsappQr(qrData?.qr || null);
      } else if (status?.provider !== 'web' || status?.state !== 'scanning') {
        setWhatsappQr(null);
      }
    } catch (err) {
      setWhatsappError(
        err instanceof Error ? err.message : 'No se pudo cargar el estado de WhatsApp'
      );
      setWhatsappQr(null);
    } finally {
      if (!opts.silent) setWhatsappLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    const load = async (withQr = false) => {
      if (!active) return;
      await refreshWhatsappStatus({ silent: !withQr, withQr });
    };

    load(true);
    const timer = window.setInterval(() => {
      load(true);
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);


  useEffect(() => {
    async function loadPermisos() {
      if (!selectedUsuarioId) {
        setUsuarioDepositoIds([]);
        setUsuarioDepositoPrincipalId('');
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
        const principalId =
          Array.isArray(data)
            ? Number(
                data.find((d: any) => Boolean(d.es_principal))?.deposito_id ??
                  data.find((d: any) => Boolean(d.es_principal))?.id ??
                  0
              )
            : 0;
        const selectedUser = usuarios.find((u: any) => Number(u.id) === Number(selectedUsuarioId));
        setUsuarioDepositoIds(ids);
        if (Number.isInteger(principalId) && principalId > 0) {
          setUsuarioDepositoPrincipalId(principalId);
        } else if (
          Number.isInteger(Number(selectedUser?.deposito_principal_id)) &&
          Number(selectedUser?.deposito_principal_id) > 0 &&
          ids.includes(Number(selectedUser.deposito_principal_id))
        ) {
          setUsuarioDepositoPrincipalId(Number(selectedUser.deposito_principal_id));
        } else {
          setUsuarioDepositoPrincipalId(ids[0] || '');
        }
      } catch (e) {
        setPermisosError(
          e instanceof Error
            ? e.message
            : 'No se pudieron cargar los depÐ—sitos del usuario',
        );
        setUsuarioDepositoIds([]);
        setUsuarioDepositoPrincipalId('');
      }
    }
    loadPermisos();
  }, [selectedUsuarioId, usuarios]);

  async function onSubmitDolar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const valorNum = Number(dolarBlue);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      setError('IngresÃ¡ un valor de dÃ³lar vÃ¡lido mayor a 0');
      return;
    }
    setSaving(true);
    try {
      await Api.setDolarBlue(valorNum);
      setSuccess('DÃ³lar blue actualizado correctamente');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudo guardar el valor de dÃ³lar'
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


  async function onSavePriceLabels(e: FormEvent) {
    e.preventDefault();
    setPriceLabelsError(null);
    setPriceLabelsSuccess(null);
    if (!priceLabels.local.trim() || !priceLabels.distribuidor.trim() || !priceLabels.final.trim()) {
      setPriceLabelsError('CompletÃ¡ los tres nombres de precios');
      return;
    }
    setPriceLabelsSaving(true);
    try {
      await Api.setPriceLabels({
        local: priceLabels.local.trim(),
        distribuidor: priceLabels.distribuidor.trim(),
        final: priceLabels.final.trim(),
      });
      await refreshPriceConfig();
      setPriceLabelsSuccess('Nombres de precios actualizados');
    } catch (e) {
      setPriceLabelsError(
        e instanceof Error ? e.message : 'No se pudieron guardar los nombres de precios'
      );
    } finally {
      setPriceLabelsSaving(false);
    }
  }

  async function onTogglePriceTier(key: 'local' | 'distribuidor', enabled: boolean) {
    setPriceLabelsError(null);
    setPriceLabelsSuccess(null);
    try {
      await Api.setPriceLabels({ [`${key}_enabled`]: enabled } as any);
      await refreshPriceConfig();
    } catch (e) {
      setPriceLabelsError(
        e instanceof Error ? e.message : 'No se pudo actualizar el nivel de precio'
      );
    }
  }

  async function onToggleModule(key: string, enabled: boolean) {
    setModulesError(null);
    setModulesTogglingKey(key);
    try {
      await setModuleEnabled(key, enabled);
    } catch (e) {
      setModulesError(
        e instanceof Error ? e.message : 'No se pudo guardar el cambio del mÃ³dulo'
      );
    } finally {
      setModulesTogglingKey(null);
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
      'Â¿Seguro que querÃ©s borrar todos los datos del panel (clientes, productos, ventas, compras, etc.)? Esta acciÃ³n no se puede deshacer.'
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


  function toggleUsuarioDeposito(depositoId: number) {
    setUsuarioDepositoIds((prev) => {
      const next = prev.includes(depositoId)
        ? prev.filter((id) => id !== depositoId)
        : [...prev, depositoId];
      setUsuarioDepositoPrincipalId((current) => {
        const currentId = Number(current);
        if (Number.isInteger(currentId) && next.includes(currentId)) {
          return currentId;
        }
        return next[0] || '';
      });
      return next;
    });
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
        deposito_principal_id:
          usuarioDepositoPrincipalId &&
          usuarioDepositoIds.includes(Number(usuarioDepositoPrincipalId))
            ? Number(usuarioDepositoPrincipalId)
            : null,
      };
      await apiFetch(`/api/usuarios/${selectedUsuarioId}/depositos`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setPermisosSuccess('Permisos de depÐ—sitos actualizados correctamente');
    } catch (e) {
      setPermisosError(
        e instanceof Error
          ? e.message
          : 'No se pudieron guardar los permisos de depÐ—sitos',
      );
    } finally {
      setPermisosSaving(false);
    }
  }


  async function onFactoryReset() {
    setResetError(null);
    setResetSuccess(null);

    // Doble confirmaciÃ³n
    const c1 = window.confirm('ATENCION: Esto BORRARA TODA LA BASE DE DATOS. Se perderan todos los productos, ventas, clientes y usuarios. Â¿Estas seguro?');
    if (!c1) return;

    const c2 = window.confirm('ULTIMA ADVERTENCIA: Esta accion NO se puede deshacer. Â¿Borrar todo y reiniciar el sistema?');
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

  async function onWhatsappConnect(force = false) {
    setWhatsappActionLoading(true);
    setWhatsappError(null);
    setWhatsappSuccess(null);
    try {
      const status = (await Api.whatsappConnect({ force })) as WhatsappStatus;
      setWhatsappStatus(status);
      setWhatsappSuccess(
        status?.state === 'scanning'
          ? 'La linea esta lista para que escanees el codigo desde tu telefono.'
          : 'La linea quedo preparada.'
      );
      await refreshWhatsappStatus({ silent: true, withQr: true });
    } catch (err) {
      setWhatsappError(
        err instanceof Error ? err.message : 'No se pudo iniciar WhatsApp'
      );
    } finally {
      setWhatsappActionLoading(false);
    }
  }

  async function onWhatsappDisconnect() {
    setWhatsappActionLoading(true);
    setWhatsappError(null);
    setWhatsappSuccess(null);
    try {
      const status = (await Api.whatsappDisconnect()) as WhatsappStatus;
      setWhatsappStatus(status);
      setWhatsappQr(null);
      setWhatsappSuccess('La linea quedo desvinculada.');
    } catch (err) {
      setWhatsappError(
        err instanceof Error ? err.message : 'No se pudo desconectar WhatsApp'
      );
    } finally {
      setWhatsappActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="app-title">Configuracion</div>
        <div className="app-subtitle">Panel de administraciÃ³n del sistema</div>
      </div>

      <div className="app-card p-4 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm text-slate-300 mb-1">Linea de WhatsApp</div>
            <div className="text-xs text-slate-400">
              Modo actual: {formatWhatsappProviderName(whatsappStatus?.provider)}
            </div>
          </div>
          {whatsappStatus?.provider === 'web' ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="h-9 rounded-lg bg-emerald-600 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={() =>
                  onWhatsappConnect(
                    whatsappStatus?.state === 'reconnecting' ||
                      whatsappStatus?.state === 'scanning'
                  )
                }
                disabled={whatsappActionLoading}
              >
                {whatsappActionLoading ? 'Procesando...' : 'Vincular telefono'}
              </button>
              <button
                type="button"
                className="h-9 rounded-lg bg-slate-700 text-white px-4 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={onWhatsappDisconnect}
                disabled={
                  whatsappActionLoading ||
                  whatsappStatus?.state === 'disconnected'
                }
              >
                Quitar vinculacion
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
              {whatsappStatus?.provider === 'twilio'
                ? 'La linea oficial se administra desde el servicio del negocio. Aca solo ves el estado.'
                : 'Este canal esta apagado por ahora.'}
            </div>
          )}
        </div>

        {whatsappError && <Alert kind="error" message={whatsappError} />}
        {whatsappSuccess && <Alert kind="info" message={whatsappSuccess} />}

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Estado</div>
              <div className="mt-1 text-slate-100">
                {whatsappLoading ? 'Cargando...' : formatWhatsappState(whatsappStatus?.state, whatsappStatus?.provider)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Linea</div>
              <div className="mt-1 text-slate-100">{whatsappStatus?.phone || '-'}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Ultima conexion</div>
              <div className="mt-1 text-slate-100">
                {formatDateTime(whatsappStatus?.lastConnectedAt)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Codigo actualizado</div>
              <div className="mt-1 text-slate-100">
                {formatDateTime(whatsappStatus?.qrUpdatedAt)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 sm:col-span-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">Resumen rapido</div>
              <div className="mt-1 text-slate-300 space-y-1">
                <div>
                  Necesita mantener una app abierta: {whatsappStatus?.capabilities?.requiresConnection ? 'si' : 'no'}
                </div>
                <div>
                  Puede adjuntar archivos desde el sistema: {whatsappStatus?.capabilities?.supportsDocumentBuffer ? 'si' : 'no'}
                </div>
                <div>
                  Usa mensajes aprobados y seguimiento oficial: {whatsappStatus?.provider === 'twilio' ? 'si' : 'no'}
                </div>
                {whatsappStatus?.lastError ? (
                  <div className="text-amber-300">Hay algo para revisar: {whatsappStatus.lastError}</div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <div className="text-sm text-slate-200 mb-2">
              {whatsappStatus?.provider === 'web' ? 'Vincular telefono' : 'Estado del canal'}
            </div>
            {whatsappStatus?.provider === 'twilio' ? (
              <p className="text-xs text-slate-400">
                Esta linea funciona con el canal oficial de WhatsApp. No hace falta escanear ningun codigo desde esta pantalla.
              </p>
            ) : whatsappStatus?.provider !== 'web' ? (
              <p className="text-xs text-slate-400">
                Cuando vuelvas a activar este canal, desde aca vas a poder revisar su estado.
              </p>
            ) : whatsappQr ? (
              <div className="space-y-3">
                <img
                  src={whatsappQr}
                  alt="QR de WhatsApp"
                  className="mx-auto w-52 h-52 rounded-xl bg-white p-3"
                />
                <p className="text-xs text-slate-400">
                  Abri WhatsApp en tu celular, entra en dispositivos vinculados y escanea este codigo.
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                {whatsappStatus?.state === 'connected'
                  ? 'Tu telefono ya quedo vinculado.'
                  : 'Inicia la vinculacion para generar un codigo nuevo.'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* â”€â”€ MÃ³dulos del sistema â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="app-card p-5">
        <div className="mb-4">
          <div className="text-sm font-semibold text-slate-200">MÃ³dulos del sistema</div>
          <div className="text-xs text-slate-400 mt-0.5">
            ActivÃ¡ o desactivÃ¡ mÃ³dulos para mantener el sistema simple y adaptado a tu negocio.
            Los cambios se aplican al instante para todos los usuarios.
          </div>
          {modulesError && (
            <div className="mt-2">
              <Alert kind="error" message={modulesError} />
            </div>
          )}
        </div>

        <div className="space-y-5">
          {MODULE_GROUPS.map((group: ModuleGroup) => {
            const groupModules = MODULE_DEFINITIONS.filter((m) => m.group === group);
            return (
              <div key={group}>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2 px-0.5">
                  {group}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {groupModules.map((mod) => {
                    const isEnabled = modulesState[mod.key] !== false;
                    const isToggling = modulesTogglingKey === mod.key;
                    return (
                      <div
                        key={mod.key}
                        className={[
                          'flex items-start gap-3 rounded-xl border p-3 transition-colors',
                          isEnabled
                            ? 'border-white/10 bg-white/[0.03]'
                            : 'border-white/5 bg-transparent opacity-60',
                        ].join(' ')}
                      >
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isEnabled}
                          aria-label={`${isEnabled ? 'Desactivar' : 'Activar'} ${mod.label}`}
                          onClick={() => !isToggling && onToggleModule(mod.key, !isEnabled)}
                          disabled={isToggling}
                          className={[
                            'relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                            'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-slate-900',
                            isToggling ? 'opacity-50 cursor-wait' : '',
                            isEnabled ? 'bg-indigo-500' : 'bg-white/10',
                          ].join(' ')}
                        >
                          <span
                            className={[
                              'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow',
                              'transition-transform duration-200',
                              isEnabled ? 'translate-x-4' : 'translate-x-0',
                            ].join(' ')}
                          />
                        </button>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-200 leading-tight">
                            {mod.label}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            {mod.description}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
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
              placeholder="Moneda de facturaciÃ³n (ej: ARS)"
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
              placeholder="SubtÃ­tulo o lema (opcional)"
            />
          </div>
        </div>
      </div>

      {/* â”€â”€ Niveles de precio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="app-card p-5">
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="text-sm font-semibold text-slate-200">Niveles de precio</div>
            <div className="text-xs text-slate-400 mt-0.5">
              PersonalizÃ¡ el nombre de cada nivel y activÃ¡ solo los que usÃ¡s en tu negocio.
            </div>
          </div>
        </div>

        {priceLabelsError && <Alert kind="error" message={priceLabelsError} />}
        {priceLabelsSuccess && <Alert kind="info" message={priceLabelsSuccess} />}

        <form onSubmit={onSavePriceLabels} className="mt-4 space-y-3">
          {/* Tier: local */}
          {(() => {
            const tier = priceTiers.find((t) => t.key === 'local');
            const isEnabled = tier?.enabled !== false;
            return (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    onClick={() => onTogglePriceTier('local', !isEnabled)}
                    disabled={priceLabelsSaving}
                    className={[
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                      'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-slate-900',
                      isEnabled ? 'bg-indigo-500' : 'bg-white/10',
                    ].join(' ')}
                  >
                    <span className={[
                      'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow',
                      'transition-transform duration-200',
                      isEnabled ? 'translate-x-4' : 'translate-x-0',
                    ].join(' ')} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <input
                      className="input-modern w-full text-sm"
                      value={priceLabels.local}
                      onChange={(e) => setPriceLabels((p) => ({ ...p, local: e.target.value }))}
                      placeholder="Ej: Precio Local, Precio A, Precio Mostrador"
                      disabled={priceLabelsSaving || !isEnabled}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap hidden sm:block">Nivel 1</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 pl-12">
                  Precio estÃ¡ndar para ventas al mostrador o clientes habituales.
                </p>
              </div>
            );
          })()}

          {/* Tier: distribuidor */}
          {(() => {
            const tier = priceTiers.find((t) => t.key === 'distribuidor');
            const isEnabled = tier?.enabled !== false;
            return (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    onClick={() => onTogglePriceTier('distribuidor', !isEnabled)}
                    disabled={priceLabelsSaving}
                    className={[
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                      'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 focus:ring-offset-slate-900',
                      isEnabled ? 'bg-indigo-500' : 'bg-white/10',
                    ].join(' ')}
                  >
                    <span className={[
                      'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow',
                      'transition-transform duration-200',
                      isEnabled ? 'translate-x-4' : 'translate-x-0',
                    ].join(' ')} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <input
                      className="input-modern w-full text-sm"
                      value={priceLabels.distribuidor}
                      onChange={(e) => setPriceLabels((p) => ({ ...p, distribuidor: e.target.value }))}
                      placeholder="Ej: Precio Distribuidor, Precio B, Precio Mayorista"
                      disabled={priceLabelsSaving || !isEnabled}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap hidden sm:block">Nivel 2</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 pl-12">
                  Precio para distribuidores, revendedores o clientes con volumen de compra.
                </p>
              </div>
            );
          })()}

          {/* Tier: final (siempre activo) */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-3">
              <div className="relative inline-flex h-5 w-9 shrink-0 rounded-full bg-indigo-500/40 border-2 border-transparent opacity-60 cursor-not-allowed">
                <span className="pointer-events-none inline-block h-4 w-4 rounded-full bg-white/60 shadow translate-x-4" />
              </div>
              <div className="flex-1 min-w-0">
                <input
                  className="input-modern w-full text-sm"
                  value={priceLabels.final}
                  onChange={(e) => setPriceLabels((p) => ({ ...p, final: e.target.value }))}
                  placeholder="Ej: Precio Final, Precio PÃºblico"
                  disabled={priceLabelsSaving}
                />
              </div>
              <span className="text-[10px] text-slate-500 whitespace-nowrap hidden sm:block">Precio final</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 pl-12">
              Precio de lista o sugerido al pÃºblico. Siempre activo y visible en el sistema.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              className="h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={priceLabelsSaving}
            >
              {priceLabelsSaving ? 'Guardando...' : 'Guardar nombres'}
            </button>
            {priceLabelsLoading && (
              <span className="text-xs text-slate-500">Cargando...</span>
            )}
          </div>
        </form>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="app-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-200">Listas de precios</div>
              <div className="text-xs text-slate-400 mt-1">
                Cada lista tiene un nombre y un margen de ganancia. Los precios de los productos se calculan usando ese margen sobre el costo.
              </div>
            </div>
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-white"
              onClick={resetPriceListForm}
              disabled={priceListsSaving}
            >
              Nueva lista
            </button>
          </div>

          {priceListsError && <Alert kind="error" message={priceListsError} />}
          {priceListsSuccess && <Alert kind="info" message={priceListsSuccess} />}

          <div className="mt-4 space-y-2">
            {priceLists.map((list) => (
              <div
                key={list.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="text-sm text-slate-200 font-medium">
                    {list.label}
                    {list.is_system ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-cyan-300">
                        Sistema
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Ganancia: {(Number(list.margen_ratio || 0) * 100).toFixed(0)}%
                    {list.descripcion ? ` Â· ${list.descripcion}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="h-8 px-3 rounded-lg border border-white/10 text-xs text-slate-200 hover:bg-white/10"
                    onClick={() => editPriceList(list)}
                    disabled={priceListsSaving}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="h-8 px-3 rounded-lg border border-white/10 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                    onClick={() => onTogglePriceList(list)}
                    disabled={priceListsSaving || list.can_disable === false}
                  >
                    {list.enabled ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={onSavePriceList} className="mt-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {priceListForm.id ? `Editar lista #${priceListForm.id}` : 'Crear lista'}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                className="input-modern text-sm"
                placeholder="Nombre"
                value={priceListForm.nombre}
                onChange={(e) => setPriceListForm((prev) => ({ ...prev, nombre: e.target.value }))}
                disabled={priceListsSaving}
              />
              <input
                className="input-modern text-sm"
                placeholder="Slug (identificador Ãºnico, sin espacios)"
                value={priceListForm.slug}
                onChange={(e) => setPriceListForm((prev) => ({ ...prev, slug: e.target.value }))}
                disabled={priceListsSaving}
              />
              <input
                className="input-modern text-sm md:col-span-2"
                placeholder="Descripcion breve"
                value={priceListForm.descripcion}
                onChange={(e) => setPriceListForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                disabled={priceListsSaving}
              />
              <input
                className="input-modern text-sm"
                type="number"
                step="0.01"
                min="0"
                placeholder="Margen de ganancia (ej: 0.30 = 30%)"
                value={priceListForm.margen_ratio}
                onChange={(e) => setPriceListForm((prev) => ({ ...prev, margen_ratio: e.target.value }))}
                disabled={priceListsSaving}
              />
              <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={priceListForm.activo}
                  onChange={(e) => setPriceListForm((prev) => ({ ...prev, activo: e.target.checked }))}
                  disabled={priceListsSaving}
                />
                Activa
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 text-sm font-medium disabled:opacity-50"
                disabled={priceListsSaving}
              >
                {priceListsSaving ? 'Guardando...' : priceListForm.id ? 'Guardar lista' : 'Crear lista'}
              </button>
              {priceListForm.id ? (
                <button
                  type="button"
                  className="h-9 rounded-lg border border-white/10 px-4 text-sm text-slate-200 hover:bg-white/10"
                  onClick={resetPriceListForm}
                  disabled={priceListsSaving}
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <div className="app-card p-5">
          <div className="text-sm font-semibold text-slate-200">Descuentos por cantidad</div>
          <div className="text-xs text-slate-400 mt-1">
            Si el cliente compra mÃ¡s de cierta cantidad, podÃ©s bajar el precio automÃ¡ticamente. ElegÃ­ la lista, definÃ­ el rango y que hacer.
          </div>

          {quantityRulesError && <Alert kind="error" message={quantityRulesError} />}
          {quantityRulesSuccess && <Alert kind="info" message={quantityRulesSuccess} />}

          <div className="mt-4">
            <select
              className="input-modern w-full text-sm"
              value={selectedRulesListId}
              onChange={(e) => {
                setSelectedRulesListId(e.target.value ? Number(e.target.value) : '');
                resetQuantityRuleForm();
              }}
              disabled={quantityRulesSaving}
            >
              <option value="">Seleccionar lista</option>
              {priceLists.filter((item) => item.enabled).map((list) => (
                <option key={list.id} value={list.id}>
                  {list.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 space-y-2 max-h-64 overflow-auto pr-1">
            {quantityRulesLoading ? (
              <div className="text-xs text-slate-400">Cargando reglas...</div>
            ) : quantityRules.length ? (
              quantityRules.map((rule) => (
                <div
                  key={rule.id}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-200">
                      {rule.cantidad_desde}
                      {rule.cantidad_hasta ? ` a ${rule.cantidad_hasta}` : ' o mÃ¡s'} unidades
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {rule.modo === 'lista_alternativa' ? 'Cambia de lista'
                        : rule.modo === 'descuento_pct' ? 'Descuento %'
                        : rule.modo === 'precio_fijo' ? 'Precio fijo'
                        : 'Sin cambio'}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {rule.modo === 'lista_alternativa'
                      ? `Usa lista: ${rule.lista_precio_alternativa_nombre || 'â€”'}`
                      : rule.modo === 'descuento_pct'
                      ? `Baja el precio un ${Number(rule.descuento_pct || 0).toFixed(2)}%`
                      : rule.modo === 'precio_fijo'
                      ? `Precio fijo: $${Number(rule.precio_fijo || 0).toFixed(2)}`
                      : 'Mantiene el precio normal'}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="h-8 px-3 rounded-lg border border-white/10 text-xs text-slate-200 hover:bg-white/10"
                      onClick={() => editQuantityRule(rule)}
                      disabled={quantityRulesSaving}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="h-8 px-3 rounded-lg border border-white/10 text-xs text-slate-200 hover:bg-white/10"
                      onClick={() => onDeleteQuantityRule(Number(rule.id))}
                      disabled={quantityRulesSaving}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs text-slate-500">No hay reglas cargadas para esta lista.</div>
            )}
          </div>

          <form onSubmit={onSaveQuantityRule} className="mt-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {editingRuleId ? `Editar regla #${editingRuleId}` : 'Nueva regla'}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                className="input-modern text-sm"
                type="number"
                min="1"
                value={quantityRuleForm.cantidad_desde}
                onChange={(e) => setQuantityRuleForm((prev) => ({ ...prev, cantidad_desde: e.target.value }))}
                placeholder="Cantidad mÃ­nima (ej: 5)"
                disabled={quantityRulesSaving}
              />
              <input
                className="input-modern text-sm"
                type="number"
                min="1"
                value={quantityRuleForm.cantidad_hasta}
                onChange={(e) => setQuantityRuleForm((prev) => ({ ...prev, cantidad_hasta: e.target.value }))}
                placeholder="Cantidad mÃ¡xima (vacÃ­o = sin lÃ­mite)"
                disabled={quantityRulesSaving}
              />
              <select
                className="input-modern text-sm"
                value={quantityRuleForm.modo}
                onChange={(e) => setQuantityRuleForm((prev) => ({ ...prev, modo: e.target.value }))}
                disabled={quantityRulesSaving}
              >
                <option value="lista">Sin cambio de precio</option>
                <option value="lista_alternativa">Usar otra lista de precios</option>
                <option value="descuento_pct">Aplicar descuento %</option>
                <option value="precio_fijo">Poner precio fijo</option>
              </select>
              <input
                className="input-modern text-sm"
                type="number"
                value={quantityRuleForm.prioridad}
                onChange={(e) => setQuantityRuleForm((prev) => ({ ...prev, prioridad: e.target.value }))}
                placeholder="Orden (1 = primera en aplicar)"
                disabled={quantityRulesSaving}
              />
              {quantityRuleForm.modo === 'lista_alternativa' ? (
                <select
                  className="input-modern text-sm md:col-span-2"
                  value={quantityRuleForm.lista_precio_alternativa_id}
                  onChange={(e) =>
                    setQuantityRuleForm((prev) => ({
                      ...prev,
                      lista_precio_alternativa_id: e.target.value,
                    }))
                  }
                  disabled={quantityRulesSaving}
                >
                  <option value="">Seleccionar lista alternativa</option>
                  {priceLists
                    .filter((item) => item.enabled && Number(item.id) !== Number(selectedRulesListId))
                    .map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.label}
                      </option>
                    ))}
                </select>
              ) : null}
              {quantityRuleForm.modo === 'descuento_pct' ? (
                <input
                  className="input-modern text-sm md:col-span-2"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={quantityRuleForm.descuento_pct}
                  onChange={(e) => setQuantityRuleForm((prev) => ({ ...prev, descuento_pct: e.target.value }))}
                  placeholder="Descuento %"
                  disabled={quantityRulesSaving}
                />
              ) : null}
              {quantityRuleForm.modo === 'precio_fijo' ? (
                <input
                  className="input-modern text-sm md:col-span-2"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={quantityRuleForm.precio_fijo}
                  onChange={(e) => setQuantityRuleForm((prev) => ({ ...prev, precio_fijo: e.target.value }))}
                  placeholder="Precio fijo"
                  disabled={quantityRulesSaving}
                />
              ) : null}
              <label className="inline-flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
                <input
                  type="checkbox"
                  checked={quantityRuleForm.activo}
                  onChange={(e) => setQuantityRuleForm((prev) => ({ ...prev, activo: e.target.checked }))}
                  disabled={quantityRulesSaving}
                />
                Regla activa
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 text-sm font-medium disabled:opacity-50"
                disabled={quantityRulesSaving || !selectedRulesListId}
              >
                {quantityRulesSaving ? 'Guardando...' : editingRuleId ? 'Guardar regla' : 'Crear regla'}
              </button>
              {editingRuleId ? (
                <button
                  type="button"
                  className="h-9 rounded-lg border border-white/10 px-4 text-sm text-slate-200 hover:bg-white/10"
                  onClick={resetQuantityRuleForm}
                  disabled={quantityRulesSaving}
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </div>

        {/* â”€â”€ Recargos por mÃ©todo de pago â”€â”€ */}
        <div className="app-card p-5 xl:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-200">Ajustes por forma de pago</div>
              <div className="text-xs text-slate-400 mt-1">
                Cuando el cliente paga con tarjeta u otro medio, el precio sube o baja automÃ¡ticamente. Por ejemplo: tarjeta +15%, efectivo -5%.
              </div>
            </div>
            <button type="button" className="text-xs text-slate-400 hover:text-white" onClick={resetSurchargeForm} disabled={surchargesSaving}>
              Nuevo recargo
            </button>
          </div>

          {surchargesError && <Alert kind="error" message={surchargesError} />}
          {surchargesSuccess && <Alert kind="info" message={surchargesSuccess} />}

          <div className="mt-4 overflow-x-auto">
            {surchargesLoading ? (
              <div className="text-xs text-slate-400">Cargando...</div>
            ) : surcharges.length ? (
              <table className="min-w-full text-xs text-slate-300">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left py-1 pr-3">MÃ©todo de pago</th>
                    <th className="text-left py-1 pr-3">Lista</th>
                    <th className="text-left py-1 pr-3">Tipo</th>
                    <th className="text-left py-1 pr-3">%</th>
                    <th className="text-left py-1 pr-3">Activo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {surcharges.map((s) => (
                    <tr key={s.id} className="border-t border-white/10">
                      <td className="py-1.5 pr-3">{s.metodo_pago_nombre}</td>
                      <td className="py-1.5 pr-3">{s.lista_precio_nombre ?? <span className="text-slate-500">Todas</span>}</td>
                      <td className="py-1.5 pr-3">
                        <span className={s.tipo === 'recargo' ? 'text-amber-300' : 'text-emerald-300'}>
                          {s.tipo === 'recargo' ? 'Sube el precio' : 'Baja el precio'}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3">{Number(s.valor_pct || 0).toFixed(2)}%</td>
                      <td className="py-1.5 pr-3">{s.activo ? 'SÃ­' : 'No'}</td>
                      <td className="py-1.5 flex gap-2">
                        <button type="button" className="h-7 px-2 rounded border border-white/10 text-slate-200 hover:bg-white/10" onClick={() => editSurcharge(s)} disabled={surchargesSaving}>Editar</button>
                        <button type="button" className="h-7 px-2 rounded border border-white/10 text-slate-200 hover:bg-white/10" onClick={() => onDeleteSurcharge(Number(s.id))} disabled={surchargesSaving}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-xs text-slate-500">No hay recargos configurados.</div>
            )}
          </div>

          <form onSubmit={onSaveSurcharge} className="mt-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {editingSurchargeId ? `Editar recargo #${editingSurchargeId}` : 'Nuevo recargo'}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <select
                className="input-modern text-sm"
                value={surchargeForm.metodo_pago_id}
                onChange={(e) => setSurchargeForm((prev) => ({ ...prev, metodo_pago_id: e.target.value }))}
                disabled={surchargesSaving}
              >
                <option value="">Seleccionar mÃ©todo de pago</option>
                {metodosPago.filter((m) => m.activo !== false).map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
              <select
                className="input-modern text-sm"
                value={surchargeForm.lista_precio_id}
                onChange={(e) => setSurchargeForm((prev) => ({ ...prev, lista_precio_id: e.target.value }))}
                disabled={surchargesSaving}
              >
                <option value="">Para todas las listas</option>
                {priceLists.filter((l) => l.enabled).map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
              <select
                className="input-modern text-sm"
                value={surchargeForm.tipo}
                onChange={(e) => setSurchargeForm((prev) => ({ ...prev, tipo: e.target.value as 'recargo' | 'descuento' }))}
                disabled={surchargesSaving}
              >
                <option value="recargo">Sube el precio (+%)</option>
                <option value="descuento">Baja el precio (-%)</option>
              </select>
              <input
                className="input-modern text-sm"
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                placeholder="Â¿CuÃ¡nto % sube o baja? (ej: 15)"
                value={surchargeForm.valor_pct}
                onChange={(e) => setSurchargeForm((prev) => ({ ...prev, valor_pct: e.target.value }))}
                disabled={surchargesSaving}
              />
              <label className="inline-flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
                <input
                  type="checkbox"
                  checked={surchargeForm.activo}
                  onChange={(e) => setSurchargeForm((prev) => ({ ...prev, activo: e.target.checked }))}
                  disabled={surchargesSaving}
                />
                Activo
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 text-sm font-medium disabled:opacity-50" disabled={surchargesSaving}>
                {surchargesSaving ? 'Guardando...' : editingSurchargeId ? 'Guardar recargo' : 'Crear recargo'}
              </button>
              {editingSurchargeId ? (
                <button type="button" className="h-9 rounded-lg border border-white/10 px-4 text-sm text-slate-200 hover:bg-white/10" onClick={resetSurchargeForm} disabled={surchargesSaving}>
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </div>

      <div className="app-card p-4">
        <div className="text-sm text-slate-300 mb-1">Redondeo de precios</div>
        <p className="text-xs text-slate-500 mb-4">
          Define a que mÃºltiplo se redondean los precios calculados automÃ¡ticamente.
          El cambio aplica a productos nuevos, compras y actualizaciones de dÃ³lar blue.
          Los precios ya guardados no cambian hasta el prÃ³ximo recÃ¡lculo.
        </p>
        {roundingError && <Alert kind="error" message={roundingError} />}
        {roundingSuccess && <Alert kind="info" message={roundingSuccess} />}
        <div className="flex flex-wrap gap-2 mb-4">
          {roundingOpcs.map((opc) => (
            <button
              key={opc}
              type="button"
              onClick={() => setRoundingStep(opc)}
              className={[
                'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                roundingStep === opc
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-transparent border-slate-600 text-slate-300 hover:border-indigo-400 hover:text-white',
              ].join(' ')}
            >
              {opc === 1 ? 'Sin decimales ($47)' : `$${opc} ($${opc * Math.round(47 / opc)})`}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500 mb-3">
          Ejemplo con $47,30: â†’{' '}
          <span className="font-semibold text-slate-300">
            ${roundingStep === 1
              ? '47'
              : String(Math.round(47.3 / roundingStep) * roundingStep)}
          </span>
        </div>
        <button
          type="button"
          onClick={onSaveRounding}
          disabled={roundingSaving}
          className="h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {roundingSaving ? 'Guardando...' : 'Guardar redondeo'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

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
                            {m.moneda ? `Moneda: ${m.moneda}` : 'Moneda: -'} Â· Orden{' '}
                            {m.orden ?? 0} Â· {m.activo ? 'Activo' : 'Inactivo'}
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
          <div className="text-sm text-slate-300 mb-2">
            DÃ³lar blue para precios
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
                  {saving ? 'Guardando...' : 'Guardar dÃ³lar'}
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Este valor se usarÃ¡ como tipo de cambio base (dÃ³lar blue) para
                los cÃ¡lculos de precios de todos los productos en USD.
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
            Permisos de depositos por usuario
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
                        {u.nombre || u.email}
                        {u.rol ? ` (${u.rol})` : ''}
                        {u.deposito_principal_nombre ? ` - base: ${u.deposito_principal_nombre}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedUsuarioId && (
                <div className="space-y-2">
                  <div className="text-xs text-slate-400">
                    Selecciona los depositos a los que el usuario puede acceder.
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
                        No hay depositos configurados.
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs text-slate-400">
                      Deposito principal
                    </label>
                    <select
                      className="input-modern w-full text-sm"
                      value={
                        usuarioDepositoPrincipalId === ''
                          ? ''
                          : String(usuarioDepositoPrincipalId)
                      }
                      onChange={(e) =>
                        setUsuarioDepositoPrincipalId(
                          e.target.value ? Number(e.target.value) : '',
                        )
                      }
                      disabled={!usuarioDepositoIds.length}
                    >
                      <option value="">
                        {usuarioDepositoIds.length
                          ? 'Selecciona el deposito principal'
                          : 'Primero asigna un deposito'}
                      </option>
                      {depositos
                        .filter((d: any) => usuarioDepositoIds.includes(Number(d.id)))
                        .map((d: any) => (
                          <option key={d.id} value={d.id}>
                            {d.nombre}
                            {d.codigo ? ` (${d.codigo})` : ''}
                          </option>
                        ))}
                    </select>
                    <div className="text-[11px] text-slate-500">
                      Marca la sucursal base del usuario para identificar donde trabaja y que
                      deposito usar como principal.
                    </div>
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


