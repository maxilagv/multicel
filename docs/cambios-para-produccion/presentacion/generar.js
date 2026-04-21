const PptxGenJS = require('pptxgenjs');

const pptx = new PptxGenJS();

// ─── TEMA GLOBAL ────────────────────────────────────────────────────────────
pptx.layout = 'LAYOUT_WIDE'; // 16:9

const C = {
  azul:       '1E3A5F',  // azul oscuro — fondo principal
  azulMedio:  '2563EB',  // azul medio — acentos
  azulClaro:  '3B82F6',  // azul claro — highlights
  verde:      '10B981',  // verde — OK / positivo
  rojo:       'EF4444',  // rojo — problema / riesgo
  amarillo:   'F59E0B',  // amarillo — advertencia
  blanco:     'FFFFFF',
  grisClaro:  'F1F5F9',
  grisTexto:  '94A3B8',
  oscuro:     '0F172A',
};

// ─── HELPERS ────────────────────────────────────────────────────────────────
function slideFondo(slide, color = C.azul) {
  slide.background = { color: color };
}

function titulo(slide, text, y = 0.35, opts = {}) {
  slide.addText(text, {
    x: 0.5, y, w: 12.33, h: 0.75,
    fontSize: opts.fontSize || 32,
    bold: true,
    color: opts.color || C.blanco,
    fontFace: 'Calibri',
    align: opts.align || 'left',
    ...opts,
  });
}

function subtitulo(slide, text, y = 1.05, opts = {}) {
  slide.addText(text, {
    x: 0.5, y, w: 12.33, h: 0.45,
    fontSize: opts.fontSize || 16,
    color: opts.color || C.grisTexto,
    fontFace: 'Calibri',
    align: opts.align || 'left',
    ...opts,
  });
}

function linea(slide, y = 1.0) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.5, y, w: 12.33, h: 0.04,
    fill: { color: C.azulMedio },
    line: { type: 'none' },
  });
}

function caja(slide, x, y, w, h, color = C.azulMedio, alpha = 80) {
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w, h,
    fill: { color, alpha },
    line: { type: 'none' },
    rectRadius: 0.1,
  });
}

function punto(slide, items, x, y, w, opts = {}) {
  const lines = items.map(item => ({
    text: item.text || item,
    options: {
      bullet: item.bullet !== undefined ? item.bullet : { type: 'bullet', characterCode: '25BA' },
      fontSize: opts.fontSize || 15,
      color: item.color || opts.color || C.blanco,
      bold: item.bold || false,
      breakLine: true,
      paraSpaceAfter: opts.paraSpaceAfter || 6,
    },
  }));
  slide.addText(lines, {
    x, y, w,
    h: opts.h || 4.5,
    fontFace: 'Calibri',
    valign: 'top',
  });
}

function badge(slide, text, x, y, bgColor = C.rojo) {
  slide.addShape(pptx.ShapeType.rect, {
    x, y, w: 1.6, h: 0.38,
    fill: { color: bgColor },
    line: { type: 'none' },
    rectRadius: 0.08,
  });
  slide.addText(text, {
    x, y, w: 1.6, h: 0.38,
    fontSize: 11, bold: true,
    color: C.blanco,
    align: 'center', valign: 'middle',
    fontFace: 'Calibri',
  });
}

function numCard(slide, num, label, x, y, color = C.azulMedio) {
  caja(slide, x, y, 2.9, 1.3, color, 90);
  slide.addText(num, {
    x, y: y + 0.05, w: 2.9, h: 0.7,
    fontSize: 34, bold: true, color: C.blanco,
    align: 'center', fontFace: 'Calibri',
  });
  slide.addText(label, {
    x, y: y + 0.72, w: 2.9, h: 0.45,
    fontSize: 12, color: C.grisClaro,
    align: 'center', fontFace: 'Calibri',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — PORTADA
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideFondo(s, C.oscuro);

  // Franja de color lateral
  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.25, h: 7.5,
    fill: { color: C.azulMedio },
    line: { type: 'none' },
  });

  // Bloque central
  s.addText('CRM + WHATSAPP OFICIAL', {
    x: 0.6, y: 1.8, w: 11, h: 1,
    fontSize: 42, bold: true,
    color: C.blanco, fontFace: 'Calibri',
  });

  s.addText('Automatización y Fidelización de Clientes', {
    x: 0.6, y: 2.85, w: 11, h: 0.6,
    fontSize: 22, color: C.azulClaro, fontFace: 'Calibri',
  });

  s.addText('Propuesta de solución para transformar la operación comercial\nen una distribuidora de alto volumen', {
    x: 0.6, y: 3.55, w: 10, h: 0.9,
    fontSize: 15, color: C.grisTexto, fontFace: 'Calibri',
  });

  // Línea decorativa
  s.addShape(pptx.ShapeType.rect, {
    x: 0.6, y: 4.6, w: 4, h: 0.06,
    fill: { color: C.azulMedio },
    line: { type: 'none' },
  });

  s.addText('Multicell  ·  ' + new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long' }), {
    x: 0.6, y: 4.85, w: 6, h: 0.4,
    fontSize: 13, color: C.grisTexto, fontFace: 'Calibri',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — ÍNDICE
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideFondo(s, C.azul);
  titulo(s, 'Lo que vamos a ver hoy');
  linea(s, 1.05);

  const items = [
    { n: '01', t: 'El problema actual con WhatsApp',       color: C.rojo },
    { n: '02', t: 'La solución: WhatsApp Business API oficial', color: C.verde },
    { n: '03', t: 'El modelo para una cartera grande de clientes', color: C.azulClaro },
    { n: '04', t: 'CRM real: qué cambia y por qué importa', color: C.azulClaro },
    { n: '05', t: 'Automatizaciones que mueven el negocio', color: C.azulClaro },
    { n: '06', t: 'Costos y retorno de inversión',         color: C.amarillo },
    { n: '07', t: 'Plan de implementación',                color: C.azulClaro },
  ];

  items.forEach((item, i) => {
    const y = 1.3 + i * 0.77;
    caja(s, 0.5, y, 0.65, 0.55, item.color, 90);
    s.addText(item.n, {
      x: 0.5, y: y + 0.02, w: 0.65, h: 0.55,
      fontSize: 16, bold: true, color: C.blanco,
      align: 'center', valign: 'middle', fontFace: 'Calibri',
    });
    s.addText(item.t, {
      x: 1.35, y: y + 0.1, w: 11.5, h: 0.4,
      fontSize: 16, color: C.blanco, fontFace: 'Calibri',
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — EL PROBLEMA: WHATSAPP NO OFICIAL
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideFondo(s, C.oscuro);
  badge(s, '! RIESGO CRÍTICO', 0.5, 0.28, C.rojo);
  titulo(s, 'El WhatsApp actual no es oficial', 0.28, { fontSize: 28, x: 2.3, w: 11 });
  linea(s, 1.0);

  subtitulo(s, 'El sistema hoy usa Baileys — una librería que simula WhatsApp Web desde el servidor', 1.1, { fontSize: 14 });

  // Columna izquierda: qué es
  caja(s, 0.5, 1.65, 5.7, 4.9, C.rojo, 12);
  s.addText('QUÉ PASA HOY', {
    x: 0.7, y: 1.75, w: 5.3, h: 0.4,
    fontSize: 13, bold: true, color: C.rojo, fontFace: 'Calibri',
  });

  punto(s, [
    { text: 'El número escanea un QR igual que un celular', bold: false },
    { text: 'Meta NO autorizó este uso — viola los Términos de Servicio' },
    { text: 'Pueden banear el número en cualquier momento, sin aviso previo' },
    { text: 'Sin posibilidad de recuperar el número baneado' },
    { text: 'No hay soporte ni recurso si falla' },
    { text: 'Los mensajes masivos aceleran la detección' },
    { text: 'No se puede usar en un número propio de empresa' },
  ], 0.7, 2.2, 5.2, { fontSize: 13, h: 4.2 });

  // Columna derecha: consecuencia
  caja(s, 6.6, 1.65, 6.3, 4.9, C.rojo, 18);
  s.addText('QUÉ SIGNIFICA PARA EL NEGOCIO', {
    x: 6.8, y: 1.75, w: 5.8, h: 0.4,
    fontSize: 13, bold: true, color: C.rojo, fontFace: 'Calibri',
  });

  punto(s, [
    { text: 'Si banean el número → se pierden TODOS los contactos de WhatsApp de todos los vendedores', bold: true },
    { text: 'No hay backup ni recuperación posible' },
    { text: 'La cartera de clientes construida durante años desaparece' },
    { text: 'No se puede apelar ni pedir el desbloqueo a Meta' },
    { text: 'Mientras más grande la cartera, mayor el riesgo' },
  ], 6.8, 2.2, 5.8, { fontSize: 13, h: 4.2, color: C.blanco });

  // Nota al pie
  s.addText('Con una cartera de clientes grande, este riesgo es inaceptable en producción.', {
    x: 0.5, y: 6.85, w: 12.33, h: 0.4,
    fontSize: 12, bold: true, color: C.amarillo,
    align: 'center', fontFace: 'Calibri',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 4 — LA SOLUCIÓN: WHATSAPP BUSINESS API
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideFondo(s, C.azul);
  badge(s, 'SOLUCIÓN', 0.5, 0.28, C.verde);
  titulo(s, 'WhatsApp Business API Oficial', 0.28, { fontSize: 28, x: 2.3, w: 11 });
  linea(s, 1.0);

  subtitulo(s, 'La API oficial de Meta — el mismo WhatsApp, pero con contrato, soporte y escala empresarial', 1.1, { fontSize: 14 });

  // 4 cards de beneficios
  const cards = [
    { icon: '✅', title: 'Número verificado', body: 'Cuenta oficial de empresa aprobada por Meta. Sin riesgo de ban.' },
    { icon: '📋', title: 'Plantillas aprobadas', body: 'Mensajes prediseñados y aprobados para confirmaciones, cobros, promos.' },
    { icon: '↩️', title: 'Mensajes entrantes', body: 'El sistema recibe y procesa las respuestas de los clientes automáticamente.' },
    { icon: '📊', title: 'Métricas reales', body: 'Entregado, leído, respondido. Tasa de apertura por campaña.' },
  ];

  cards.forEach((c, i) => {
    const x = 0.5 + i * 3.2;
    caja(s, x, 1.65, 3.0, 2.5, C.azulMedio, 30);
    s.addText(c.icon, { x, y: 1.8, w: 3.0, h: 0.6, fontSize: 26, align: 'center', fontFace: 'Calibri' });
    s.addText(c.title, { x, y: 2.45, w: 3.0, h: 0.4, fontSize: 14, bold: true, color: C.blanco, align: 'center', fontFace: 'Calibri' });
    s.addText(c.body, { x: x + 0.1, y: 2.9, w: 2.8, h: 1.1, fontSize: 12, color: C.grisClaro, align: 'center', fontFace: 'Calibri' });
  });

  // Comparativa
  s.addText('Comparativa directa', {
    x: 0.5, y: 4.35, w: 12.33, h: 0.4,
    fontSize: 14, bold: true, color: C.grisTexto, fontFace: 'Calibri',
  });

  const cols = ['', 'Baileys (actual)', 'WhatsApp Business API'];
  const rows = [
    ['Autorizado por Meta',    '❌ No',   '✅ Sí'],
    ['Riesgo de ban',          '🔴 Alto', '🟢 Ninguno'],
    ['Plantillas verificadas', '❌ No',   '✅ Sí'],
    ['Mensajes entrantes',     '⚠️  Parcial', '✅ Completo'],
    ['Métricas de entrega',    '❌ No',   '✅ Sí'],
    ['Automatizaciones',       '⚠️  Básico', '✅ Completo'],
    ['Escala para 10.000+ contactos', '❌ No', '✅ Sí'],
  ];

  const tw = [3.2, 4.0, 5.2];
  const tx = [0.5, 3.7, 7.7];

  // Cabecera
  cols.forEach((c, i) => {
    if (i > 0) caja(s, tx[i], 4.78, tw[i], 0.38, i === 2 ? C.verde : C.rojo, 70);
    s.addText(c, { x: tx[i], y: 4.78, w: tw[i], h: 0.38, fontSize: 12, bold: true, color: C.blanco, align: 'center', valign: 'middle', fontFace: 'Calibri' });
  });

  rows.forEach((row, ri) => {
    const ry = 5.2 + ri * 0.26;
    if (ri % 2 === 0) {
      caja(s, 0.5, ry, 12.33, 0.26, C.azulMedio, 10);
    }
    row.forEach((cell, ci) => {
      s.addText(cell, {
        x: tx[ci], y: ry, w: tw[ci], h: 0.26,
        fontSize: 11, color: ci === 0 ? C.grisClaro : C.blanco,
        bold: ci === 0, align: ci === 0 ? 'left' : 'center',
        valign: 'middle', fontFace: 'Calibri',
      });
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 5 — MODELO PARA CARTERA GRANDE: CHATWOOT
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideFondo(s, C.azul);
  titulo(s, 'El modelo correcto para una cartera enorme');
  linea(s, 1.05);

  subtitulo(s, 'Con cientos o miles de clientes, el modelo "un número por vendedor" tiene límites. La solución profesional es diferente.', 1.12, { fontSize: 13 });

  // Problema del modelo actual (izquierda)
  s.addText('Modelo actual', {
    x: 0.5, y: 1.75, w: 5.7, h: 0.4,
    fontSize: 14, bold: true, color: C.rojo, fontFace: 'Calibri',
  });
  caja(s, 0.5, 2.15, 5.7, 3.4, C.rojo, 12);
  punto(s, [
    { text: 'Cada vendedor usa su número personal' },
    { text: 'Si un vendedor se va → los chats se pierden' },
    { text: 'El dueño no ve nada de lo que hablan' },
    { text: 'Cada número necesita verificación de Meta' },
    { text: 'Imposible automatizar a escala' },
    { text: 'Costo se multiplica por cantidad de vendedores' },
  ], 0.7, 2.2, 5.2, { fontSize: 13, h: 3.2 });

  // Flecha
  s.addText('→', {
    x: 6.25, y: 3.3, w: 0.8, h: 0.8,
    fontSize: 40, color: C.azulClaro,
    align: 'center', fontFace: 'Calibri',
  });

  // Solución (derecha)
  s.addText('Modelo propuesto (Chatwoot)', {
    x: 7.1, y: 1.75, w: 5.8, h: 0.4,
    fontSize: 14, bold: true, color: C.verde, fontFace: 'Calibri',
  });
  caja(s, 7.1, 2.15, 5.8, 3.4, C.verde, 12);
  punto(s, [
    { text: 'UN número central verificado de la empresa' },
    { text: 'Cada vendedor ve solo sus conversaciones asignadas' },
    { text: 'El dueño tiene visión 360° de todo' },
    { text: 'Si un vendedor se va → los chats quedan en el sistema' },
    { text: 'Automatizaciones en todos los clientes desde un solo lugar' },
    { text: 'Costo fijo sin importar cuántos vendedores haya' },
  ], 7.3, 2.2, 5.4, { fontSize: 13, h: 3.2 });

  // Diagrama simplificado
  s.addText('Cómo funciona para el vendedor', {
    x: 0.5, y: 5.65, w: 12.33, h: 0.4,
    fontSize: 13, bold: true, color: C.grisTexto,
    align: 'center', fontFace: 'Calibri',
  });

  const bloques = [
    { t: 'Cliente escribe\nal número de\nla empresa', c: C.azulClaro },
    { t: '→', c: null },
    { t: 'Sistema asigna\nautomáticamente\nal vendedor', c: C.azulMedio },
    { t: '→', c: null },
    { t: 'Vendedor\nresponde desde\nsu panel', c: C.verde },
    { t: '→', c: null },
    { t: 'Todo queda\nregistrado en\nel CRM', c: C.amarillo },
  ];

  let bx = 0.3;
  bloques.forEach(b => {
    if (b.c === null) {
      s.addText(b.t, { x: bx, y: 6.05, w: 0.5, h: 1.1, fontSize: 22, color: C.blanco, align: 'center', valign: 'middle', fontFace: 'Calibri' });
      bx += 0.5;
    } else {
      caja(s, bx, 6.05, 2.6, 1.1, b.c, 70);
      s.addText(b.t, { x: bx, y: 6.05, w: 2.6, h: 1.1, fontSize: 12, color: C.blanco, align: 'center', valign: 'middle', fontFace: 'Calibri' });
      bx += 2.7;
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 6 — ARQUITECTURA TÉCNICA
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideFondo(s, C.oscuro);
  titulo(s, 'Arquitectura de la solución');
  linea(s, 1.05);

  // Stack visual
  const stack = [
    { label: 'Meta WhatsApp\nBusiness API', sub: 'Infraestructura oficial de mensajería', color: C.verde, x: 4.6, y: 1.3, w: 4.1 },
    { label: 'Twilio', sub: 'Proveedor certificado (BSP)', color: C.azulMedio, x: 4.6, y: 2.55, w: 4.1 },
    { label: 'Chatwoot', sub: 'Bandeja compartida · Asignación de conversaciones · Historial', color: C.azulClaro, x: 2.5, y: 3.8, w: 8.3 },
    { label: 'n8n', sub: 'Motor de automatizaciones · Flujos de trabajo · Integraciones', color: C.amarillo, x: 2.5, y: 5.05, w: 8.3 },
    { label: 'Sistema Multicell', sub: 'CRM · Ventas · Clientes · Reportes', color: C.azul, x: 2.5, y: 6.3, w: 8.3 },
  ];

  // Flechas entre capas
  for (let i = 0; i < 4; i++) {
    const sy = stack[i].y + 0.72;
    s.addShape(pptx.ShapeType.line, {
      x: 6.6, y: sy, w: 0, h: 0.38,
      line: { color: C.grisTexto, width: 1.5, dashType: 'dash' },
    });
  }

  stack.forEach(b => {
    caja(s, b.x, b.y, b.w, 0.72, b.color, 80);
    s.addText(b.label, {
      x: b.x + 0.15, y: b.y + 0.04, w: b.w - 0.3, h: 0.3,
      fontSize: 14, bold: true, color: C.blanco, fontFace: 'Calibri',
    });
    s.addText(b.sub, {
      x: b.x + 0.15, y: b.y + 0.36, w: b.w - 0.3, h: 0.3,
      fontSize: 11, color: C.grisClaro, fontFace: 'Calibri',
    });
  });

  // Nota al costado
  s.addText('Todo corre\nen tu servidor.\nSin dependencia\nde SaaS externos.\nDatos 100% tuyos.', {
    x: 11.5, y: 2.0, w: 1.6, h: 3.5,
    fontSize: 11, color: C.grisTexto,
    align: 'center', fontFace: 'Calibri',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 7 — CRM REAL: QUÉ CAMBIA
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideFondo(s, C.azul);
  titulo(s, 'CRM real — lo que cambia');
  linea(s, 1.05);

  // Antes / Después
  s.addText('Antes', { x: 0.5, y: 1.2, w: 5.9, h: 0.4, fontSize: 16, bold: true, color: C.rojo, fontFace: 'Calibri' });
  s.addText('Después', { x: 7.1, y: 1.2, w: 5.9, h: 0.4, fontSize: 16, bold: true, color: C.verde, fontFace: 'Calibri' });

  caja(s, 0.5, 1.6, 5.9, 5.0, C.rojo, 10);
  caja(s, 7.1, 1.6, 5.9, 5.0, C.verde, 10);

  const antes = [
    'Lista de oportunidades sin vista Kanban',
    'No hay pipeline visual de ventas',
    'Sin scoring de clientes',
    'Clientes clasificados a mano con tags de texto',
    'Historial de WhatsApp separado del CRM',
    'Sin alertas ni recordatorios automáticos',
    'Sin forecast de ventas',
    'El vendedor no sabe a quién llamar primero',
  ];

  const despues = [
    'Pipeline Kanban con drag & drop por fase',
    'Forecast de ventas ponderado por probabilidad',
    'Lead scoring automático: VIP, Frecuente, Dormido, Perdido',
    'Segmentación automática y dinámica de clientes',
    'Ficha 360°: ventas + mensajes + actividades en un solo lugar',
    'Alertas cuando un lead lleva días sin movimiento',
    'Notificaciones al vendedor cuando el cliente responde',
    'El vendedor sabe exactamente quién está listo para comprar',
  ];

  antes.forEach((t, i) => {
    s.addText('✗  ' + t, {
      x: 0.65, y: 1.75 + i * 0.56, w: 5.55, h: 0.48,
      fontSize: 12, color: C.blanco, fontFace: 'Calibri',
    });
  });

  despues.forEach((t, i) => {
    s.addText('✓  ' + t, {
      x: 7.25, y: 1.75 + i * 0.56, w: 5.55, h: 0.48,
      fontSize: 12, color: C.blanco, fontFace: 'Calibri',
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 8 — AUTOMATIZACIONES CLAVE
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideFondo(s, C.azul);
  titulo(s, 'Automatizaciones que mueven el negocio');
  linea(s, 1.05);
  subtitulo(s, 'Todo esto funciona solo, sin que nadie lo dispare manualmente', 1.12, { fontSize: 13 });

  const autos = [
    { emoji: '🛒', title: 'Confirmación de venta',          desc: 'Al registrar la venta → WhatsApp automático con detalle del pedido' },
    { emoji: '📦', title: 'Pedido entregado + NPS',         desc: '48hs post-entrega → encuesta de satisfacción. Si responde 1-2: alerta urgente al vendedor.' },
    { emoji: '💳', title: 'Recordatorio de pago',           desc: 'Días 1, 4 y 8 de mora → escalando de tono. Día 8 notifica al dueño.' },
    { emoji: '🎂', title: 'Felicitación de cumpleaños',      desc: 'Cron diario → mensaje personalizado + cupón de descuento para clientes VIP' },
    { emoji: '😴', title: 'Reactivación de inactivos',       desc: 'Lunes por la mañana → contacta clientes sin compras en 90/120/180 días' },
    { emoji: '⭐', title: 'Ascenso a cliente VIP',           desc: 'Al alcanzar el score VIP → bienvenida exclusiva + beneficios automáticos' },
    { emoji: '📊', title: 'Reporte diario al dueño',         desc: '8:30 AM → resumen de ventas, nuevos clientes, mejor vendedor, deudas nuevas' },
    { emoji: '🔔', title: 'Alerta de venta grande',          desc: 'Instantáneo → notifica al dueño cuando se registra una venta sobre el umbral configurado' },
    { emoji: '📋', title: 'Recordatorio de garantía',        desc: '30 días antes del vencimiento → aviso al cliente para que gestione cualquier problema' },
  ];

  const cols = 3;
  autos.forEach((a, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 0.5 + col * 4.3;
    const y = 1.55 + row * 1.7;

    caja(s, x, y, 4.1, 1.55, C.azulMedio, 30);
    s.addText(a.emoji + '  ' + a.title, {
      x: x + 0.15, y: y + 0.1, w: 3.8, h: 0.4,
      fontSize: 13, bold: true, color: C.blanco, fontFace: 'Calibri',
    });
    s.addText(a.desc, {
      x: x + 0.15, y: y + 0.52, w: 3.8, h: 0.85,
      fontSize: 11, color: C.grisClaro, fontFace: 'Calibri',
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 9 — CHATBOT BÁSICO
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideFondo(s, C.oscuro);
  titulo(s, 'Chatbot de respuesta automática');
  linea(s, 1.05);
  subtitulo(s, 'Responde al instante, 24/7. Si no puede resolver la consulta, escala al vendedor.', 1.12, { fontSize: 13 });

  // Árbol de respuestas visual
  const keywords = [
    { kw: '"CATÁLOGO"',    resp: 'Envía el PDF del catálogo actualizado',       color: C.azulClaro },
    { kw: '"PRECIO"',      resp: 'Busca el producto y responde el precio',      color: C.azulClaro },
    { kw: '"GARANTÍA"',    resp: 'Consulta la venta y responde el estado',      color: C.azulClaro },
    { kw: '"HORARIO"',     resp: 'Responde horarios y dirección automáticamente', color: C.azulClaro },
    { kw: '"ASESOR"',      resp: 'Crea lead en CRM y notifica al vendedor',     color: C.verde },
    { kw: '"STOP / BAJA"', resp: 'Da de baja el opt-in automáticamente',        color: C.amarillo },
    { kw: 'Otro mensaje',  resp: 'Avisa al vendedor si es horario laboral',     color: C.grisTexto },
  ];

  // Caja central "Cliente escribe"
  caja(s, 0.5, 1.6, 2.8, 5.5, C.azulMedio, 40);
  s.addText('Cliente\nescribe a\nWhatsApp', {
    x: 0.5, y: 2.9, w: 2.8, h: 1.2,
    fontSize: 16, bold: true, color: C.blanco,
    align: 'center', valign: 'middle', fontFace: 'Calibri',
  });

  keywords.forEach((k, i) => {
    const y = 1.65 + i * 0.72;
    // Línea conectora
    s.addShape(pptx.ShapeType.line, {
      x: 3.3, y: y + 0.2, w: 0.7, h: 0,
      line: { color: C.grisTexto, width: 0.8, dashType: 'dash' },
    });

    // Badge keyword
    caja(s, 4.0, y, 2.2, 0.4, k.color, 70);
    s.addText(k.kw, {
      x: 4.0, y, w: 2.2, h: 0.4,
      fontSize: 11, bold: true, color: C.blanco,
      align: 'center', valign: 'middle', fontFace: 'Calibri',
    });

    // Flecha
    s.addText('→', {
      x: 6.25, y, w: 0.4, h: 0.4,
      fontSize: 14, color: C.grisTexto,
      align: 'center', fontFace: 'Calibri',
    });

    // Respuesta
    s.addText(k.resp, {
      x: 6.7, y: y + 0.05, w: 6.3, h: 0.35,
      fontSize: 12, color: C.blanco, fontFace: 'Calibri',
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 10 — SEGMENTACIÓN AUTOMÁTICA DE CLIENTES
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideFondo(s, C.azul);
  titulo(s, 'Segmentación inteligente de clientes');
  linea(s, 1.05);
  subtitulo(s, 'El sistema clasifica automáticamente a cada cliente. El vendedor sabe exactamente dónde poner el foco.', 1.12, { fontSize: 13 });

  const segs = [
    { emoji: '🟡', seg: 'VIP',        crit: 'Score alto · compras frecuentes · volumen alto',     accion: 'Atención prioritaria · Acceso anticipado a nuevas líneas · Precios exclusivos',  color: C.amarillo },
    { emoji: '🟢', seg: 'Frecuente',  crit: 'Compró en los últimos 60 días · 5+ compras',         accion: 'Contacto regular · Oferta de fidelización cada 30 días',                         color: C.verde },
    { emoji: '🔵', seg: 'Activo',     crit: 'Compró entre 30-90 días atrás',                      accion: 'Seguimiento estándar · Catálogo actualizado',                                    color: C.azulClaro },
    { emoji: '🟠', seg: 'Dormido',    crit: 'Sin compras entre 91-180 días',                      accion: 'Campaña de reactivación automática · 3 mensajes escalonados',                    color: C.amarillo },
    { emoji: '🔴', seg: 'Inactivo',   crit: 'Sin compras hace más de 180 días',                   accion: 'Campaign win-back con descuento · Si no responde, archivar',                     color: C.rojo },
  ];

  segs.forEach((g, i) => {
    const y = 1.55 + i * 1.03;
    caja(s, 0.5, y, 12.33, 0.95, C.azulMedio, 20);

    // Emoji + Segmento
    s.addText(g.emoji + '  ' + g.seg, {
      x: 0.65, y: y + 0.1, w: 2.2, h: 0.6,
      fontSize: 15, bold: true, color: C.blanco, fontFace: 'Calibri',
    });

    // Separador
    s.addShape(pptx.ShapeType.line, {
      x: 3.0, y: y + 0.15, w: 0, h: 0.65,
      line: { color: C.grisTexto, width: 0.5 },
    });

    // Criterio
    s.addText('Criterio: ' + g.crit, {
      x: 3.15, y: y + 0.08, w: 4.3, h: 0.38,
      fontSize: 11, color: C.grisClaro, fontFace: 'Calibri',
    });
    s.addText('Acción: ' + g.accion, {
      x: 3.15, y: y + 0.5, w: 4.3, h: 0.38,
      fontSize: 11, color: C.blanco, fontFace: 'Calibri',
    });

    // Separador 2
    s.addShape(pptx.ShapeType.line, {
      x: 7.6, y: y + 0.15, w: 0, h: 0.65,
      line: { color: C.grisTexto, width: 0.5 },
    });
  });

  s.addText('El score se recalcula todos los días automáticamente. Sin trabajo manual.', {
    x: 0.5, y: 6.9, w: 12.33, h: 0.35,
    fontSize: 12, color: C.grisTexto,
    align: 'center', fontFace: 'Calibri',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 11 — COSTOS
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideFondo(s, C.oscuro);
  titulo(s, 'Costos mensuales estimados');
  linea(s, 1.05);

  // Cards de componentes
  numCard(s, 'USD 0',   'n8n (self-hosted)\nMotor de automatizaciones',    0.5,  1.5, C.verde);
  numCard(s, 'USD 0',   'Chatwoot (self-hosted)\nBandeja compartida',       3.5,  1.5, C.verde);
  numCard(s, 'USD ~36', 'Twilio + Meta\n~1.000 mensajes/mes',              6.5,  1.5, C.azulMedio);
  numCard(s, 'USD 0',   'Servidor existente\nNo requiere más infraestructura', 9.5, 1.5, C.verde);

  // Total
  caja(s, 0.5, 3.1, 12.33, 1.1, C.azulMedio, 40);
  s.addText('TOTAL MENSUAL ESTIMADO: ~USD 36 / mes', {
    x: 0.5, y: 3.1, w: 12.33, h: 1.1,
    fontSize: 26, bold: true, color: C.blanco,
    align: 'center', valign: 'middle', fontFace: 'Calibri',
  });

  // Nota
  s.addText('Los costos de Meta (conversaciones) escalan con el uso real. A mayor volumen, mayor posible retorno.', {
    x: 0.5, y: 4.3, w: 12.33, h: 0.4,
    fontSize: 12, color: C.grisTexto,
    align: 'center', fontFace: 'Calibri',
  });

  // ROI
  s.addText('Retorno esperado', {
    x: 0.5, y: 4.85, w: 12.33, h: 0.45,
    fontSize: 16, bold: true, color: C.blanco,
    align: 'center', fontFace: 'Calibri',
  });

  const roi = [
    { metric: 'Clientes reactivados', value: '10-15%', note: 'de clientes dormidos vuelven a comprar con la campaña correcta' },
    { metric: 'Tiempo de respuesta',  value: '−80%',   note: 'el chatbot responde al instante sin intervención del equipo' },
    { metric: 'Conversión post-venta', value: '+20%',  note: 'el seguimiento automático genera compras repetidas' },
    { metric: 'Clientes baneados',    value: '0',      note: 'sin riesgo de perder la cartera de WhatsApp' },
  ];

  roi.forEach((r, i) => {
    const x = 0.5 + i * 3.2;
    caja(s, x, 5.4, 3.0, 1.75, C.azulMedio, 25);
    s.addText(r.value, { x, y: 5.48, w: 3.0, h: 0.65, fontSize: 28, bold: true, color: C.blanco, align: 'center', fontFace: 'Calibri' });
    s.addText(r.metric, { x, y: 6.15, w: 3.0, h: 0.3, fontSize: 11, bold: true, color: C.blanco, align: 'center', fontFace: 'Calibri' });
    s.addText(r.note, { x: x + 0.1, y: 6.48, w: 2.8, h: 0.55, fontSize: 10, color: C.grisClaro, align: 'center', fontFace: 'Calibri' });
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 12 — PLAN DE IMPLEMENTACIÓN
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideFondo(s, C.azul);
  titulo(s, 'Plan de implementación');
  linea(s, 1.05);

  const fases = [
    {
      n: '01', label: 'Semana 1-2', title: 'WhatsApp Oficial',
      items: ['Crear cuenta Twilio + verificar negocio', 'Registrar número oficial', 'Enviar 16 plantillas a aprobación Meta', 'Migrar sistema — apagar Baileys'],
      color: C.rojo, urgente: true,
    },
    {
      n: '02', label: 'Semana 2-3', title: 'Chatwoot + n8n',
      items: ['Instalar Chatwoot en servidor', 'Conectar con WhatsApp API', 'Instalar n8n', 'Configurar integración con el sistema'],
      color: C.azulMedio, urgente: false,
    },
    {
      n: '03', label: 'Semana 3-4', title: 'Automatizaciones básicas',
      items: ['Bienvenida, confirmación de venta', 'Confirmación de entrega + NPS', 'Recordatorio de pago', 'Reporte diario al dueño'],
      color: C.azulClaro, urgente: false,
    },
    {
      n: '04', label: 'Mes 2', title: 'CRM + Segmentación',
      items: ['Pipeline Kanban', 'Lead scoring automático', 'Ficha 360° del cliente', 'Notificaciones internas'],
      color: C.verde, urgente: false,
    },
  ];

  fases.forEach((f, i) => {
    const x = 0.4 + i * 3.2;
    caja(s, x, 1.6, 3.0, 5.4, f.color, 20);

    // Número
    caja(s, x + 0.1, 1.72, 0.6, 0.6, f.color, 80);
    s.addText(f.n, { x: x + 0.1, y: 1.72, w: 0.6, h: 0.6, fontSize: 16, bold: true, color: C.blanco, align: 'center', valign: 'middle', fontFace: 'Calibri' });

    // Título y periodo
    s.addText(f.label, { x: x + 0.8, y: 1.78, w: 2.1, h: 0.3, fontSize: 11, color: C.grisClaro, fontFace: 'Calibri' });
    s.addText(f.title, { x: x + 0.1, y: 2.4, w: 2.75, h: 0.45, fontSize: 14, bold: true, color: C.blanco, fontFace: 'Calibri' });

    // Items
    f.items.forEach((item, j) => {
      s.addText('• ' + item, {
        x: x + 0.15, y: 2.95 + j * 0.6, w: 2.7, h: 0.55,
        fontSize: 12, color: C.grisClaro, fontFace: 'Calibri',
      });
    });

    if (f.urgente) {
      badge(s, 'URGENTE', x + 0.5, 6.6, C.rojo);
    }
  });

  s.addText('Cada fase es independiente y funcional por sí sola.', {
    x: 0.5, y: 7.1, w: 12.33, h: 0.35,
    fontSize: 12, color: C.grisTexto,
    align: 'center', fontFace: 'Calibri',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// SLIDE 13 — CIERRE
// ════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  slideFondo(s, C.oscuro);

  s.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.25, h: 7.5,
    fill: { color: C.verde },
    line: { type: 'none' },
  });

  s.addText('Resumen ejecutivo', {
    x: 0.6, y: 0.7, w: 12, h: 0.5,
    fontSize: 18, color: C.grisTexto, fontFace: 'Calibri',
  });

  const puntos = [
    { icon: '🔴', text: 'El sistema actual de WhatsApp es no oficial y representa un riesgo real e inmediato de pérdida total de la cartera de clientes.' },
    { icon: '✅', text: 'La solución propuesta usa la API oficial de Meta a través de Twilio — el mismo WhatsApp, con contrato y respaldo.' },
    { icon: '🏢', text: 'Para una cartera grande, el modelo correcto es bandeja compartida con Chatwoot: un número, todos los vendedores, visión total del dueño.' },
    { icon: '🤖', text: 'n8n automatiza los procesos de ventas, fidelización y cobros — sin trabajo manual adicional del equipo.' },
    { icon: '💰', text: 'Costo estimado: USD 36/mes. Retorno en clientes reactivados, conversión repetida y horas de trabajo ahorradas.' },
  ];

  puntos.forEach((p, i) => {
    s.addText(p.icon + '  ' + p.text, {
      x: 0.6, y: 1.4 + i * 0.98, w: 12.2, h: 0.85,
      fontSize: 14, color: C.blanco, fontFace: 'Calibri',
    });
  });

  s.addShape(pptx.ShapeType.rect, {
    x: 0.6, y: 6.45, w: 12.2, h: 0.06,
    fill: { color: C.verde },
    line: { type: 'none' },
  });

  s.addText('Multicell  ·  ' + new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long' }), {
    x: 0.6, y: 6.65, w: 6, h: 0.4,
    fontSize: 13, color: C.grisTexto, fontFace: 'Calibri',
  });
  s.addText('Propuesta confidencial', {
    x: 7.0, y: 6.65, w: 5.8, h: 0.4,
    fontSize: 13, color: C.grisTexto,
    align: 'right', fontFace: 'Calibri',
  });
}

// ─── GUARDAR ────────────────────────────────────────────────────────────────
const outputPath = 'C:/Users/User/OneDrive/Desktop/multicell/docs/cambios-para-produccion/presentacion/CRM_WhatsApp_Propuesta.pptx';

pptx.writeFile({ fileName: outputPath })
  .then(() => console.log('✅ Presentación generada: ' + outputPath))
  .catch(err => console.error('❌ Error:', err));
