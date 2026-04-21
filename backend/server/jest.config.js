/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  testTimeout: 15000,

  // Limpiar mocks entre tests automáticamente
  clearMocks: true,
  restoreMocks: true,

  // Setup global (variables de entorno para tests)
  setupFiles: ['<rootDir>/__tests__/helpers/env.js'],

  // Cobertura
  collectCoverageFrom: [
    'controllers/**/*.js',
    'services/**/*.js',
    'db/repositories/**/*.js',
    'middlewares/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/scripts/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'html', 'lcov'],

  // Umbrales realistas para el estado actual (subir gradualmente)
  coverageThreshold: {
    global: {
      branches: 25,
      functions: 30,
      lines: 30,
      statements: 30,
    },
    // Módulos nuevos con mayor exigencia
    './services/licenseService.js': {
      branches: 80,
      functions: 90,
      lines: 85,
    },
  },

  // Silenciar logs de consola en tests (ruido innecesario)
  silent: false,
  verbose: true,
};
