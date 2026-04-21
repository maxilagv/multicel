import { getHumanError } from './errorMessages';

const FIELD_LABELS: Record<string, string> = {
  cliente_id: 'el cliente',
  deposito_id: 'el deposito',
  items: 'los productos',
  'items.*.producto_id': 'el producto',
  'items.*.cantidad': 'la cantidad',
  'items.*.precio_unitario': 'el precio',
  nombre: 'el nombre',
  email: 'el email',
  password: 'la contrasena',
  q: 'la busqueda',
};

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

export function toFriendlyErrorMessage(
  rawMessage: unknown,
  status?: number | null,
  code?: string | null
) {
  const original = normalizeText(rawMessage);
  const lower = original.toLowerCase();

  if (code) {
    return getHumanError(code, original || undefined);
  }

  if (!original) {
    return 'Hubo un problema inesperado. Intenta nuevamente en unos segundos.';
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('error de red')
  ) {
    return 'No pudimos comunicarnos con el servidor. Revisa tu conexion e intenta de nuevo.';
  }

  if (
    lower.includes('cannot read properties') ||
    lower.includes('cannot read property') ||
    lower.includes('undefined')
  ) {
    return 'Hubo un problema al cargar esta pantalla. Intenta de nuevo o vuelve al inicio.';
  }

  if (status === 401 || lower.includes('token')) {
    return 'Tu sesion vencio. Vuelve a ingresar para continuar.';
  }

  if (status === 403 || lower.includes('forbidden')) {
    return 'No tienes permisos para realizar esta accion.';
  }

  if (status === 404 || lower.includes('no encontrada') || lower.includes('not found')) {
    return 'No encontramos la informacion solicitada.';
  }

  if (status === 409 || lower.includes('stock insuficiente')) {
    return 'No hay stock suficiente para completar esta operacion.';
  }

  if (status === 422 || lower.includes('unprocessable')) {
    return 'Faltan datos o hay campos invalidos. Revisa lo marcado e intenta de nuevo.';
  }

  if (lower.includes('cliente_id requerido')) {
    return 'Elegi un cliente antes de continuar con la venta.';
  }

  if (lower.includes('debe enviar items') || lower.includes('debe incluir items')) {
    return 'Agrega al menos un producto para registrar la venta.';
  }

  if (lower.includes('sin precio valido')) {
    return 'Uno de los productos no tiene un precio valido para esta lista.';
  }

  if (lower.includes('no se pudieron cargar')) {
    return 'No pudimos cargar la informacion de esta pantalla. Intenta nuevamente.';
  }

  if (lower.includes(':')) {
    const [field, detail] = original.split(/:(.+)/).map((chunk) => chunk.trim());
    if (field && detail) {
      const label = FIELD_LABELS[field] || `el campo ${field}`;
      return `Revisa ${label}: ${detail}.`;
    }
  }

  return original;
}

export function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const technical =
      typeof (error as Error & { technicalMessage?: string }).technicalMessage === 'string'
        ? (error as Error & { technicalMessage?: string }).technicalMessage
        : error.message;
    return {
      message: toFriendlyErrorMessage(error.message, (error as Error & { status?: number }).status),
      messageCode: typeof (error as Error & { code?: string }).code === 'string'
        ? (error as Error & { code?: string }).code
        : null,
      technicalMessage: technical,
    };
  }
  return {
    message: toFriendlyErrorMessage(error),
    messageCode: null,
    technicalMessage: normalizeText(error),
  };
}
