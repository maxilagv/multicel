/**
 * Tests de integración — Autenticación
 *
 * Estrategia: mini-app con solo authroutes + repositorios mockeados.
 * Se testea comportamiento HTTP real (Zod, bcrypt, JWT) sin DB.
 */

jest.mock('../../db/repositories/userRepository');
jest.mock('../../db/repositories/tokenRepository');
jest.mock('../../services/otpStore');
jest.mock('../../services/mfaService', () => ({
  createSetupChallenge: jest.fn(),
  confirmSetup: jest.fn(),
  verifyTotpToken: jest.fn().mockResolvedValue(false),
  consumeBackupCode: jest.fn().mockResolvedValue(false),
  parseBackupCodeRows: jest.fn().mockReturnValue([]),
}));
jest.mock('../../utils/mailer', () => ({ sendVerificationEmail: jest.fn() }));
jest.mock('../../middlewares/security.js', () =>
  require('../helpers/mockSecurity')
);

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createTestApp } = require('../helpers/createTestApp');
const userRepo = require('../../db/repositories/userRepository');
const tokenRepo = require('../../db/repositories/tokenRepository');

const app = createTestApp({ routes: ['auth'] });

// ── Fixtures ────────────────────────────────────────────────
const TEST_PASSWORD = 'Test1234!';
let hashedPassword;

beforeAll(async () => {
  hashedPassword = await bcrypt.hash(TEST_PASSWORD, 4);
});

function makeUser(overrides = {}) {
  return {
    id: 1,
    email: 'admin@test.com',
    password_hash: hashedPassword,
    rol: 'admin',
    activo: true,
    totp_enabled: false,
    totp_secret: null,
    nombre: 'Admin Test',
    ...overrides,
  };
}

// ── POST /api/login ──────────────────────────────────────────
describe('POST /api/login', () => {
  beforeEach(() => {
    tokenRepo.saveRefreshToken = jest.fn().mockResolvedValue(undefined);
  });

  it('rechaza body vacío con 400', async () => {
    const res = await request(app).post('/api/login').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
  });

  it('rechaza email inválido con 400 y detalla el campo', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'no-es-email', password: TEST_PASSWORD });
    expect(res.status).toBe(400);
    const errParam = res.body.errors?.[0]?.param;
    expect(errParam).toBe('email');
  });

  it('rechaza password muy corta con 400', async () => {
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'admin@test.com', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.errors?.[0]?.param).toBe('password');
  });

  it('devuelve 401 para usuario inexistente', async () => {
    userRepo.findByEmail = jest.fn().mockResolvedValue(null);
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'noexiste@test.com', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('devuelve 401 para contraseña incorrecta', async () => {
    userRepo.findByEmail = jest.fn().mockResolvedValue(makeUser());
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'admin@test.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('devuelve 401 para usuario inactivo', async () => {
    userRepo.findByEmail = jest.fn().mockResolvedValue(makeUser({ activo: false }));
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('devuelve 200 con accessToken y refreshToken para credenciales válidas', async () => {
    userRepo.findByEmail = jest.fn().mockResolvedValue(makeUser());
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(typeof res.body.accessToken).toBe('string');
    expect(tokenRepo.saveRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('el accessToken contiene rol y email correctos', async () => {
    userRepo.findByEmail = jest.fn().mockResolvedValue(makeUser({ rol: 'vendedor' }));
    const res = await request(app)
      .post('/api/login')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(res.body.accessToken);
    expect(decoded.role).toBe('vendedor');
    expect(decoded.email).toBe('admin@test.com');
    expect(decoded.sub).toBeDefined();
  });

  it('llama a saveRefreshToken con los datos del usuario', async () => {
    userRepo.findByEmail = jest.fn().mockResolvedValue(makeUser());
    await request(app)
      .post('/api/login')
      .set('User-Agent', 'Jest/Test')
      .send({ email: 'admin@test.com', password: TEST_PASSWORD });

    expect(tokenRepo.saveRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 1,
        token: expect.any(String),
        jti: expect.any(String),
        expires_at: expect.any(Date),
      })
    );
  });
});

// ── POST /api/logout ─────────────────────────────────────────
describe('POST /api/logout', () => {
  it('sin token devuelve 401', async () => {
    const res = await request(app).post('/api/logout').send({});
    expect(res.status).toBe(401);
  });
});
