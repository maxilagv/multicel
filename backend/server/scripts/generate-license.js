#!/usr/bin/env node
/**
 * Generador de licencias para nuevos clientes
 *
 * Uso:
 *   node scripts/generate-license.js \
 *     --client "almacen-garcia" \
 *     --company "Almacén García e Hijos" \
 *     --modules basico,whatsapp,ia \
 *     --expires 2027-03-01
 *
 * Requiere: LICENSE_MASTER_KEY en .env o como variable de entorno
 */

require('dotenv').config();
const { generateLicense, VALID_MODULES } = require('../services/licenseService');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const val = argv[i + 1];
    if (key && val !== undefined) args[key] = val;
  }
  return args;
}

const args = parseArgs(process.argv);

if (!args.client || !args.company || !args.expires) {
  console.error('Uso: node scripts/generate-license.js --client <id> --company <nombre> --expires <YYYY-MM-DD> [--modules mod1,mod2]');
  console.error('');
  console.error('Módulos disponibles:', VALID_MODULES.join(', '));
  console.error('');
  console.error('Ejemplo:');
  console.error('  node scripts/generate-license.js --client "garcia-001" --company "Almacén García" --expires 2027-01-01 --modules basico,whatsapp');
  process.exit(1);
}

const modules = args.modules
  ? args.modules.split(',').map((m) => m.trim())
  : ['basico'];

try {
  const license = generateLicense({
    clientId: args.client,
    companyName: args.company,
    modules,
    expiresAt: new Date(args.expires),
  });

  console.log('');
  console.log('✅ Licencia generada:');
  console.log('');
  console.log(license);
  console.log('');
  console.log('📋 Detalles:');
  console.log(`   Cliente:  ${args.client}`);
  console.log(`   Empresa:  ${args.company}`);
  console.log(`   Módulos:  ${modules.join(', ')}`);
  console.log(`   Vence:    ${new Date(args.expires).toLocaleDateString('es-AR')}`);
  console.log('');
  console.log('📝 Agregar al .env del cliente:');
  console.log(`   LICENSE_KEY=${license}`);
  console.log('');
} catch (err) {
  console.error('❌ Error generando licencia:', err.message);
  process.exit(1);
}
