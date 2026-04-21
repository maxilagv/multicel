const ERROR_MAP: Record<string, string> = {
  STOCK_INSUFICIENTE: 'No hay suficiente stock disponible para completar esta venta.',
  PRECIO_INVALIDO: 'El precio ingresado no es valido. Debe ser un numero mayor a 0.',
  CLIENTE_NO_ENCONTRADO: 'No encontramos ese cliente. Podes buscarlo por nombre o crear uno nuevo.',
  CLIENTE_INACTIVO: 'Ese cliente esta inactivo. Reactivalo antes de continuar.',
  VENTA_YA_CANCELADA: 'Esta venta ya fue cancelada y no puede modificarse.',
  NETWORK_ERROR: 'No hay conexion con el servidor. Verifica tu red e intenta de nuevo.',
  SESSION_EXPIRED: 'Tu sesion expiro. Ingresa nuevamente.',
  MFA_REQUIRED: 'Ingresa el codigo de tu app autenticadora para continuar.',
  MFA_INVALID_CODE: 'El codigo de autenticacion no es valido. Intenta nuevamente.',
  MFA_INVALID_BACKUP_CODE: 'El codigo de respaldo no es valido o ya fue usado.',
  VALIDATION_ERROR: 'Faltan datos o hay campos invalidos. Revisa lo marcado en pantalla.',
  AUTH_INVALID_CREDENTIALS: 'Email o contrasena incorrectos.',
  FORBIDDEN: 'No tienes permisos para realizar esta accion.',
  DEFAULT: 'Ocurrio un problema inesperado. Si persiste, contacta soporte.',
};

export function getHumanError(code?: string | null, fallback?: string | null) {
  const normalized = String(code || '').trim().toUpperCase();
  if (normalized && ERROR_MAP[normalized]) return ERROR_MAP[normalized];
  if (fallback) return fallback;
  return ERROR_MAP.DEFAULT;
}
