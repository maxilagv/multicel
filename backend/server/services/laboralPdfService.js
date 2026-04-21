const PDFDocument = require('pdfkit');

function bufferFromDoc(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

async function buildCarpetaPdf(carpeta) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const bufferPromise = bufferFromDoc(doc);

  doc.fontSize(20).text('Historia clinica laboral', { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#4b5563').text(`Carpeta: ${carpeta.numero_carpeta}`);
  doc.text(`Empleado: ${carpeta.empleado_nombre}`);
  doc.text(`Pagador: ${carpeta.cliente_pagador_nombre || '-'}`);
  doc.text(`Tipo: ${carpeta.tipo_carpeta}`);
  doc.text(`Estado: ${carpeta.estado}`);
  doc.moveDown();

  if (carpeta.resumen_clinico) {
    doc.fillColor('#111827').fontSize(12).text('Resumen general', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).text(carpeta.resumen_clinico);
    doc.moveDown();
  }

  doc.fontSize(12).text('Informes por sector', { underline: true });
  doc.moveDown(0.5);

  for (const informe of carpeta.informes || []) {
    doc.fontSize(11).fillColor('#111827').text(`${informe.sector_nombre} - ${informe.estado}`);
    doc.fontSize(9).fillColor('#4b5563');
    if (informe.fecha_realizacion) {
      doc.text(`Fecha realizado: ${new Date(informe.fecha_realizacion).toLocaleString('es-AR')}`);
    }
    if (informe.aptitud_laboral) {
      doc.text(`Aptitud: ${informe.aptitud_laboral}`);
    }
    if (informe.resumen) {
      doc.moveDown(0.2).fillColor('#111827').text(informe.resumen);
    }
    if (informe.hallazgos) {
      doc.moveDown(0.2).fillColor('#374151').text(informe.hallazgos);
    }
    doc.moveDown();
  }

  doc.end();
  return bufferPromise;
}

module.exports = {
  buildCarpetaPdf,
};
