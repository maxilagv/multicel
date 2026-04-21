/**
 * Genera los iconos PNG necesarios para el manifest de la PWA.
 * Requiere: sharp (npm install --save-dev sharp)
 *
 * Uso: node scripts/generate-pwa-icons.js
 */

const fs = require('fs');
const path = require('path');

// Intentar usar sharp si está disponible
async function generateWithSharp() {
  const sharp = require('sharp');
  const svgPath = path.join(__dirname, '../public/icon.svg');
  const publicDir = path.join(__dirname, '../public');

  const sizes = [
    { size: 192, name: 'icon-192.png' },
    { size: 512, name: 'icon-512.png' },
    { size: 180, name: 'apple-touch-icon.png' },
    { size: 32, name: 'favicon-32x32.png' },
    { size: 16, name: 'favicon-16x16.png' },
  ];

  for (const { size, name } of sizes) {
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(path.join(publicDir, name));
    console.log(`✅ Generado: ${name} (${size}x${size})`);
  }
}

generateWithSharp().catch((err) => {
  console.error('sharp no disponible:', err.message);
  console.log('');
  console.log('Para generar los iconos, ejecutá:');
  console.log('  npm install --save-dev sharp');
  console.log('  node scripts/generate-pwa-icons.js');
  console.log('');
  console.log('O convertí manualmente public/icon.svg a:');
  console.log('  - public/icon-192.png (192x192)');
  console.log('  - public/icon-512.png (512x512)');
  console.log('  - public/apple-touch-icon.png (180x180)');
  process.exit(0);
});
