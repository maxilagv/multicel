#!/usr/bin/env node
/**
 * Generador de certificado X.509 autofirmado para testing de ARCA/AFIP
 *
 * Este script genera un par clave privada + certificado que puede usarse:
 *   1. En modo SANDBOX (ARCA_SANDBOX=true) — para probar el flujo completo sin AFIP
 *   2. En AFIP Homologación — AFIP acepta certificados autofirmados en el ambiente de pruebas
 *
 * Requiere: OpenSSL instalado y en el PATH
 *
 * Uso:
 *   node scripts/generate-arca-test-cert.js
 *   node scripts/generate-arca-test-cert.js --cuit 20111111112 --razon "Mi Empresa Test" --out ./certs
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i]?.replace(/^--/, '');
    const val = argv[i + 1];
    if (key && val && !val.startsWith('--')) { args[key] = val; i++; }
    else if (key) args[key] = true;
  }
  return args;
}

const args = parseArgs(process.argv);
const CUIT = args.cuit || '20111111112';
const RAZON_SOCIAL = args.razon || 'EMPRESA TEST ARCA';
const DAYS = parseInt(args.days || '365', 10);
const OUT_DIR = args.out || path.join(process.cwd(), 'certs-test');

// Verificar OpenSSL
const check = spawnSync('openssl', ['version'], { encoding: 'utf8' });
if (check.error || check.status !== 0) {
  console.error('❌ OpenSSL no disponible. Instalalo desde: https://slproweb.com/products/Win32OpenSSL.html');
  process.exit(1);
}
console.log(`ℹ️  OpenSSL: ${check.stdout.trim()}`);

// Crear directorio de salida
fs.mkdirSync(OUT_DIR, { recursive: true });

const keyPath = path.join(OUT_DIR, 'private.key');
const certPath = path.join(OUT_DIR, 'certificado.crt');
const p12Path = path.join(OUT_DIR, 'certificado.p12');
const subjectPath = path.join(OUT_DIR, 'subject.txt');

// Subject del certificado (AFIP requiere SERIALNUMBER con el CUIT)
const subject = `/C=AR/ST=Buenos Aires/O=${RAZON_SOCIAL}/CN=${CUIT}/SERIALNUMBER=CUIT ${CUIT}`;
fs.writeFileSync(subjectPath, subject, 'utf8');

console.log('');
console.log('🔑 Generando clave privada RSA 2048...');
const keyRes = spawnSync('openssl', [
  'genrsa', '-out', keyPath, '2048'
], { encoding: 'utf8' });
if (keyRes.status !== 0) {
  console.error('❌ Error generando clave:', keyRes.stderr);
  process.exit(1);
}

console.log('📄 Generando certificado autofirmado...');
const certRes = spawnSync('openssl', [
  'req', '-new', '-x509',
  '-key', keyPath,
  '-out', certPath,
  '-days', String(DAYS),
  '-subj', subject,
], { encoding: 'utf8' });
if (certRes.status !== 0) {
  console.error('❌ Error generando certificado:', certRes.stderr || certRes.stdout);
  process.exit(1);
}

console.log('📦 Empaquetando en formato P12 (sin passphrase)...');
const p12Res = spawnSync('openssl', [
  'pkcs12', '-export',
  '-inkey', keyPath,
  '-in', certPath,
  '-out', p12Path,
  '-passout', 'pass:',   // sin passphrase
  '-name', `CUIT ${CUIT}`,
], { encoding: 'utf8' });
if (p12Res.status !== 0) {
  console.error('❌ Error generando P12:', p12Res.stderr);
  process.exit(1);
}

// Mostrar info del certificado
const infoRes = spawnSync('openssl', [
  'x509', '-in', certPath, '-noout', '-text', '-subject', '-dates',
], { encoding: 'utf8' });

console.log('');
console.log('✅ Certificado generado exitosamente');
console.log('');
console.log('📁 Archivos generados:');
console.log(`   Clave privada:  ${keyPath}`);
console.log(`   Certificado:    ${certPath}`);
console.log(`   P12 (para API): ${p12Path}`);
console.log('');
console.log('🔍 Info del certificado:');
const lines = infoRes.stdout.split('\n').filter(l =>
  l.includes('Subject:') || l.includes('Not Before') || l.includes('Not After')
);
lines.forEach(l => console.log('   ', l.trim()));
console.log('');

// Verificar que el par coincide
const verifyRes = spawnSync('openssl', [
  'verify', '-CAfile', certPath, certPath,
], { encoding: 'utf8' });
const keyMd5Res = spawnSync('openssl', [
  'rsa', '-in', keyPath, '-pubout', '-outform', 'DER',
], { encoding: 'buffer' });
const certMd5Res = spawnSync('openssl', [
  'x509', '-in', certPath, '-pubkey', '-noout', '-outform', 'DER',
], { encoding: 'buffer' });
const keyHash = require('crypto').createHash('sha256').update(keyMd5Res.stdout).digest('hex').slice(0, 16);
const certHash = require('crypto').createHash('sha256').update(certMd5Res.stdout).digest('hex').slice(0, 16);
if (keyHash === certHash) {
  console.log('✅ Verificación: clave privada y certificado coinciden');
} else {
  console.warn('⚠️  Advertencia: no se pudo verificar el par');
}

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('PRÓXIMOS PASOS:');
console.log('');
console.log('OPCIÓN A — Probar en SANDBOX (inmediato, sin AFIP):');
console.log('  1. Agregar al .env:  ARCA_SANDBOX=true');
console.log('  2. El sistema simulará CAEs sin conectarse a AFIP');
console.log('');
console.log('OPCIÓN B — Probar en AFIP Homologación (requiere clave fiscal nivel 2):');
console.log('  1. Ingresar a https://afip.gob.ar con clave fiscal nivel 2');
console.log('  2. Ir a: Administración de Certificados Digitales');
console.log('  3. Crear nuevo certificado → subir el archivo:');
console.log(`     ${certPath}`);
console.log('  4. AFIP aprobará el certificado en pocos segundos');
console.log('  5. En el sistema ARCA → Configuración → subir el archivo:');
console.log(`     ${p12Path}  (passphrase: vacía)`);
console.log('  6. CUIT de prueba: 20111111112 (ambiente homologación)');
console.log('');
console.log('OPCIÓN C — Para producción real:');
console.log('  El cliente necesita: CUIT registrado en AFIP + clave fiscal nivel 2');
console.log('  + punto de venta habilitado + este mismo proceso con su CUIT real');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
