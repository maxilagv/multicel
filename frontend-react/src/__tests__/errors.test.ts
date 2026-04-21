/**
 * Tests unitarios — Manejo de errores
 *
 * Esta capa transforma errores técnicos en mensajes humanos.
 * Es crítica: un mensaje malo confunde al usuario y genera llamadas de soporte.
 */

import { describe, it, expect } from 'vitest';
import { toFriendlyErrorMessage, getErrorDetails } from '../lib/errors';

describe('toFriendlyErrorMessage()', () => {
  describe('por código de error (code)', () => {
    it('SESSION_EXPIRED → mensaje de sesión vencida', () => {
      const msg = toFriendlyErrorMessage('Token invalido', 401, 'SESSION_EXPIRED');
      expect(msg).toMatch(/sesion/i);
    });

    it('STOCK_INSUFICIENTE → mensaje de stock', () => {
      const msg = toFriendlyErrorMessage('stock error', null, 'STOCK_INSUFICIENTE');
      expect(msg).toMatch(/stock/i);
    });

    it('código desconocido → usa el mensaje original', () => {
      const msg = toFriendlyErrorMessage('Error personalizado del backend', null, 'CODIGO_RARO');
      expect(msg).toBe('Error personalizado del backend');
    });
  });

  describe('por status HTTP', () => {
    it('401 sin code → sesión vencida', () => {
      const msg = toFriendlyErrorMessage('Unauthorized', 401);
      expect(msg).toMatch(/sesion/i);
    });

    it('403 → sin permisos', () => {
      const msg = toFriendlyErrorMessage('Forbidden', 403);
      expect(msg).toMatch(/permisos/i);
    });

    it('404 → no encontrado', () => {
      const msg = toFriendlyErrorMessage('Not Found', 404);
      expect(msg).toMatch(/encontra/i);
    });

    it('409 → stock insuficiente', () => {
      const msg = toFriendlyErrorMessage('stock insuficiente para el producto', 409);
      expect(msg).toMatch(/stock/i);
    });

    it('422 → campos inválidos', () => {
      const msg = toFriendlyErrorMessage('Unprocessable Entity', 422);
      expect(msg).toMatch(/campos invalidos/i);
    });
  });

  describe('por contenido del mensaje', () => {
    it('failed to fetch → problema de conexión', () => {
      const msg = toFriendlyErrorMessage('Failed to fetch');
      expect(msg).toMatch(/servidor/i);
    });

    it('mensaje vacío → mensaje genérico', () => {
      const msg = toFriendlyErrorMessage('');
      expect(msg.length).toBeGreaterThan(5);
      expect(msg).not.toBe('');
    });

    it('mensaje null/undefined → mensaje genérico', () => {
      const msg1 = toFriendlyErrorMessage(null);
      const msg2 = toFriendlyErrorMessage(undefined);
      expect(msg1.length).toBeGreaterThan(5);
      expect(msg2.length).toBeGreaterThan(5);
    });
  });
});

describe('getErrorDetails()', () => {
  it('extrae message de un Error estándar', () => {
    const err = new Error('algo falló');
    const result = getErrorDetails(err);
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('technicalMessage');
    expect(result.messageCode).toBeNull();
  });

  it('usa el code del error para mensaje amigable', () => {
    const err = new Error('Token invalido') as Error & { code?: string; status?: number };
    err.code = 'SESSION_EXPIRED';
    err.status = 401;
    const result = getErrorDetails(err);
    expect(result.message).toMatch(/sesion/i);
    expect(result.messageCode).toBe('SESSION_EXPIRED');
  });

  it('maneja strings (no Error objects)', () => {
    const result = getErrorDetails('error como string');
    expect(result.message).toBeDefined();
    expect(result.messageCode).toBeNull();
  });

  it('maneja objetos no-Error', () => {
    const result = getErrorDetails({ random: 'object' });
    expect(result.message).toBeDefined();
  });
});
