import { describe, expect, it } from 'vitest';
import { normalizeApiBase } from './storage';

describe('normalizeApiBase', () => {
  it('normaliza host sin esquema a origin http', () => {
    expect(normalizeApiBase('127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });

  it('rechaza valores invalidos', () => {
    expect(normalizeApiBase('not a url@@')).toBeNull();
  });
});
