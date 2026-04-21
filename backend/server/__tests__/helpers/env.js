/**
 * Variables de entorno para tests
 * Se cargan ANTES del framework de testing (setupFiles)
 * Evita que los módulos fallen al requerir secretos faltantes
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long-for-hs256';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-at-least-32-chars-long';
process.env.JWT_ALG = 'HS256';
process.env.BCRYPT_ROUNDS = '4'; // Rápido en tests, no importa la seguridad acá
process.env.LICENSE_MASTER_KEY = 'test-license-master-key-32-chars';
process.env.REDIS_URL = ''; // Sin Redis en tests (usa memoria)
process.env.MYSQL_HOST = '127.0.0.1';
process.env.MYSQL_DATABASE = 'kaisen_test';
process.env.MYSQL_USER = 'test';
process.env.MYSQL_PASSWORD = 'test';
process.env.PORT = '3001';
process.env.WHATSAPP_ENABLED = 'false';
process.env.AI_LLM_ENABLED = 'false';
