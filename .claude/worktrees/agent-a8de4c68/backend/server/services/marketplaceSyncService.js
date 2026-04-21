const { withTransaction } = require('../db/pg');
const repo = require('../db/repositories/marketplaceRepository');
const configRepo = require('../db/repositories/configRepository');

const INSTANCE_KEY = 'marketplace_instance_id';

function generateInstanceId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = (n) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `MP-${rand(4)}${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

async function getInstanceId(usuarioId) {
  let id = await configRepo.getTextParam(INSTANCE_KEY);
  if (!id) {
    id = generateInstanceId();
    await configRepo.setTextParam(INSTANCE_KEY, id, usuarioId);
  }
  return id;
}

async function exportSnapshot(usuarioId) {
  const instanceId = await getInstanceId(usuarioId);
  const data = await withTransaction(async (client) => {
    await repo.ensureExternalIds(instanceId, client);
    return repo.exportSnapshot(client);
  });
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    instance_id: instanceId,
    data,
  };
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

async function importSnapshot(payload, usuarioId) {
  const data = payload?.data || payload || {};
  const pymes = ensureArray(data.pymes);
  const alianzas = ensureArray(data.alianzas);
  const ofertas = ensureArray(data.ofertas);
  const referidos = ensureArray(data.referidos);

  return withTransaction(async (client) => {
    const warnings = [];
    const stats = {
      pymes: { inserted: 0, updated: 0 },
      alianzas: { inserted: 0, updated: 0 },
      ofertas: { inserted: 0, updated: 0 },
      referidos: { inserted: 0, updated: 0 },
    };

    const { rows: pymeRows } = await client.query(
      'SELECT id, external_id FROM pymes_aliadas WHERE external_id IS NOT NULL'
    );
    const pymesByExternal = new Map(pymeRows.map((r) => [r.external_id, Number(r.id)]));

    for (const pyme of pymes) {
      const externalId = pyme?.external_id;
      if (!externalId) {
        warnings.push({ type: 'pyme', message: 'Pyme sin external_id, omitida' });
        continue;
      }
      const existingId = pymesByExternal.get(externalId);
      const payloadPyme = {
        nombre: String(pyme.nombre || '').trim(),
        rubro: pyme.rubro || null,
        contacto: pyme.contacto || null,
        telefono: pyme.telefono || null,
        email: pyme.email || null,
        direccion: pyme.direccion || null,
        localidad: pyme.localidad || null,
        provincia: pyme.provincia || null,
        notas: pyme.notas || null,
        activo: pyme.activo != null ? Boolean(pyme.activo) : true,
      };
      if (!payloadPyme.nombre) {
        warnings.push({ type: 'pyme', message: `Pyme ${externalId} sin nombre, omitida` });
        continue;
      }
      if (existingId) {
        await client.query(
          `UPDATE pymes_aliadas
              SET nombre = $2,
                  rubro = $3,
                  contacto = $4,
                  telefono = $5,
                  email = $6,
                  direccion = $7,
                  localidad = $8,
                  provincia = $9,
                  notas = $10,
                  activo = $11,
                  actualizado_en = CURRENT_TIMESTAMP
            WHERE id = $1`,
          [
            existingId,
            payloadPyme.nombre,
            payloadPyme.rubro,
            payloadPyme.contacto,
            payloadPyme.telefono,
            payloadPyme.email,
            payloadPyme.direccion,
            payloadPyme.localidad,
            payloadPyme.provincia,
            payloadPyme.notas,
            payloadPyme.activo ? 1 : 0,
          ]
        );
        stats.pymes.updated += 1;
      } else {
        const ins = await client.query(
          `INSERT INTO pymes_aliadas(
             nombre, rubro, contacto, telefono, email, direccion, localidad, provincia, notas, activo, external_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id`,
          [
            payloadPyme.nombre,
            payloadPyme.rubro,
            payloadPyme.contacto,
            payloadPyme.telefono,
            payloadPyme.email,
            payloadPyme.direccion,
            payloadPyme.localidad,
            payloadPyme.provincia,
            payloadPyme.notas,
            payloadPyme.activo ? 1 : 0,
            externalId,
          ]
        );
        const newId = Number(ins.rows?.[0]?.id || ins.lastID);
        pymesByExternal.set(externalId, newId);
        stats.pymes.inserted += 1;
      }
    }

    const { rows: alianzaRows } = await client.query(
      'SELECT id, external_id FROM alianzas WHERE external_id IS NOT NULL'
    );
    const alianzasByExternal = new Map(alianzaRows.map((r) => [r.external_id, Number(r.id)]));

    for (const alianza of alianzas) {
      const externalId = alianza?.external_id;
      const pymeExternal = alianza?.pyme_external_id;
      if (!externalId || !pymeExternal) {
        warnings.push({ type: 'alianza', message: 'Alianza sin external_id o pyme_external_id, omitida' });
        continue;
      }
      const pymeId = pymesByExternal.get(pymeExternal);
      if (!pymeId) {
        warnings.push({ type: 'alianza', message: `Pyme no encontrada para alianza ${externalId}` });
        continue;
      }
      const payloadAlianza = {
        pyme_id: pymeId,
        nombre: alianza.nombre || null,
        estado: alianza.estado || 'activa',
        vigencia_desde: alianza.vigencia_desde || null,
        vigencia_hasta: alianza.vigencia_hasta || null,
        comision_tipo: alianza.comision_tipo || 'porcentaje',
        comision_valor: Number(alianza.comision_valor || 0),
        beneficio_tipo: alianza.beneficio_tipo || 'porcentaje',
        beneficio_valor: Number(alianza.beneficio_valor || 0),
        limite_usos: Number(alianza.limite_usos || 0),
        notas: alianza.notas || null,
        activo: alianza.activo != null ? Boolean(alianza.activo) : true,
      };
      const existingId = alianzasByExternal.get(externalId);
      if (existingId) {
        await client.query(
          `UPDATE alianzas
              SET pyme_id = $2,
                  nombre = $3,
                  estado = $4,
                  vigencia_desde = $5,
                  vigencia_hasta = $6,
                  comision_tipo = $7,
                  comision_valor = $8,
                  beneficio_tipo = $9,
                  beneficio_valor = $10,
                  limite_usos = $11,
                  notas = $12,
                  activo = $13,
                  actualizado_en = CURRENT_TIMESTAMP
            WHERE id = $1`,
          [
            existingId,
            payloadAlianza.pyme_id,
            payloadAlianza.nombre,
            payloadAlianza.estado,
            payloadAlianza.vigencia_desde,
            payloadAlianza.vigencia_hasta,
            payloadAlianza.comision_tipo,
            payloadAlianza.comision_valor,
            payloadAlianza.beneficio_tipo,
            payloadAlianza.beneficio_valor,
            payloadAlianza.limite_usos,
            payloadAlianza.notas,
            payloadAlianza.activo ? 1 : 0,
          ]
        );
        stats.alianzas.updated += 1;
      } else {
        const ins = await client.query(
          `INSERT INTO alianzas(
             pyme_id, nombre, estado, vigencia_desde, vigencia_hasta, comision_tipo, comision_valor,
             beneficio_tipo, beneficio_valor, limite_usos, notas, activo, external_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING id`,
          [
            payloadAlianza.pyme_id,
            payloadAlianza.nombre,
            payloadAlianza.estado,
            payloadAlianza.vigencia_desde,
            payloadAlianza.vigencia_hasta,
            payloadAlianza.comision_tipo,
            payloadAlianza.comision_valor,
            payloadAlianza.beneficio_tipo,
            payloadAlianza.beneficio_valor,
            payloadAlianza.limite_usos,
            payloadAlianza.notas,
            payloadAlianza.activo ? 1 : 0,
            externalId,
          ]
        );
        const newId = Number(ins.rows?.[0]?.id || ins.lastID);
        alianzasByExternal.set(externalId, newId);
        stats.alianzas.inserted += 1;
      }
    }

    const { rows: ofertaRows } = await client.query(
      'SELECT id, external_id FROM alianzas_ofertas WHERE external_id IS NOT NULL'
    );
    const ofertasByExternal = new Map(ofertaRows.map((r) => [r.external_id, Number(r.id)]));

    for (const oferta of ofertas) {
      const externalId = oferta?.external_id;
      const alianzaExternal = oferta?.alianza_external_id;
      if (!externalId || !alianzaExternal) {
        warnings.push({ type: 'oferta', message: 'Oferta sin external_id o alianza_external_id, omitida' });
        continue;
      }
      const alianzaId = alianzasByExternal.get(alianzaExternal);
      if (!alianzaId) {
        warnings.push({ type: 'oferta', message: `Alianza no encontrada para oferta ${externalId}` });
        continue;
      }
      const payloadOferta = {
        alianza_id: alianzaId,
        nombre: oferta.nombre || null,
        descripcion: oferta.descripcion || null,
        precio_fijo: oferta.precio_fijo != null ? Number(oferta.precio_fijo) : null,
        activo: oferta.activo != null ? Boolean(oferta.activo) : true,
      };
      if (!payloadOferta.nombre) {
        warnings.push({ type: 'oferta', message: `Oferta ${externalId} sin nombre, omitida` });
        continue;
      }
      const existingId = ofertasByExternal.get(externalId);
      if (existingId) {
        await client.query(
          `UPDATE alianzas_ofertas
              SET alianza_id = $2,
                  nombre = $3,
                  descripcion = $4,
                  precio_fijo = $5,
                  activo = $6,
                  actualizado_en = CURRENT_TIMESTAMP
            WHERE id = $1`,
          [
            existingId,
            payloadOferta.alianza_id,
            payloadOferta.nombre,
            payloadOferta.descripcion,
            payloadOferta.precio_fijo,
            payloadOferta.activo ? 1 : 0,
          ]
        );
        stats.ofertas.updated += 1;
      } else {
        const ins = await client.query(
          `INSERT INTO alianzas_ofertas(
             alianza_id, nombre, descripcion, precio_fijo, activo, external_id
           ) VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id`,
          [
            payloadOferta.alianza_id,
            payloadOferta.nombre,
            payloadOferta.descripcion,
            payloadOferta.precio_fijo,
            payloadOferta.activo ? 1 : 0,
            externalId,
          ]
        );
        const newId = Number(ins.rows?.[0]?.id || ins.lastID);
        ofertasByExternal.set(externalId, newId);
        stats.ofertas.inserted += 1;
      }
    }

    const { rows: referidoRows } = await client.query(
      'SELECT id, external_id, codigo FROM referidos'
    );
    const referidosByExternal = new Map(
      referidoRows.filter((r) => r.external_id).map((r) => [r.external_id, Number(r.id)])
    );
    const codigosEnUso = new Set(referidoRows.map((r) => String(r.codigo || '').toUpperCase()));

    for (const referido of referidos) {
      const externalId = referido?.external_id;
      const alianzaExternal = referido?.alianza_external_id;
      if (!externalId || !alianzaExternal) {
        warnings.push({ type: 'referido', message: 'Referido sin external_id o alianza_external_id, omitido' });
        continue;
      }
      const alianzaId = alianzasByExternal.get(alianzaExternal);
      if (!alianzaId) {
        warnings.push({ type: 'referido', message: `Alianza no encontrada para referido ${externalId}` });
        continue;
      }
      const codigoNormalizado = repo.normalizeCodigo(referido.codigo);
      const payloadReferido = {
        alianza_id: alianzaId,
        codigo: codigoNormalizado || null,
        estado: referido.estado || 'activo',
        max_usos: Number(referido.max_usos || 0),
        usos_actuales: Number(referido.usos_actuales || 0),
        vigencia_desde: referido.vigencia_desde || null,
        vigencia_hasta: referido.vigencia_hasta || null,
        beneficio_tipo: referido.beneficio_tipo || null,
        beneficio_valor: referido.beneficio_valor != null ? Number(referido.beneficio_valor) : null,
        notas: referido.notas || null,
      };
      const existingId = referidosByExternal.get(externalId);
      if (existingId) {
        await client.query(
          `UPDATE referidos
              SET alianza_id = $2,
                  estado = $3,
                  max_usos = $4,
                  usos_actuales = $5,
                  vigencia_desde = $6,
                  vigencia_hasta = $7,
                  beneficio_tipo = $8,
                  beneficio_valor = $9,
                  notas = $10,
                  actualizado_en = CURRENT_TIMESTAMP
            WHERE id = $1`,
          [
            existingId,
            payloadReferido.alianza_id,
            payloadReferido.estado,
            payloadReferido.max_usos,
            payloadReferido.usos_actuales,
            payloadReferido.vigencia_desde,
            payloadReferido.vigencia_hasta,
            payloadReferido.beneficio_tipo,
            payloadReferido.beneficio_valor,
            payloadReferido.notas,
          ]
        );
        if (payloadReferido.codigo) {
          try {
            await client.query(
              `UPDATE referidos SET codigo = $2, actualizado_en = CURRENT_TIMESTAMP WHERE id = $1`,
              [existingId, payloadReferido.codigo]
            );
          } catch (err) {
            warnings.push({ type: 'referido', message: `Codigo en conflicto para referido ${externalId}, se mantiene el actual` });
          }
        }
        stats.referidos.updated += 1;
      } else {
        let codigoToUse = payloadReferido.codigo;
        if (codigoToUse && codigosEnUso.has(codigoToUse)) {
          warnings.push({ type: 'referido', message: `Codigo ${codigoToUse} ya existe, se generara uno nuevo` });
          codigoToUse = null;
        }
        let creado;
        try {
          if (codigoToUse) {
            const ins = await client.query(
              `INSERT INTO referidos(
                 alianza_id, codigo, estado, max_usos, usos_actuales, vigencia_desde, vigencia_hasta,
                 beneficio_tipo, beneficio_valor, notas, external_id
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
               RETURNING id, codigo`,
              [
                payloadReferido.alianza_id,
                codigoToUse,
                payloadReferido.estado,
                payloadReferido.max_usos,
                payloadReferido.usos_actuales,
                payloadReferido.vigencia_desde,
                payloadReferido.vigencia_hasta,
                payloadReferido.beneficio_tipo,
                payloadReferido.beneficio_valor,
                payloadReferido.notas,
                externalId,
              ]
            );
            creado = ins.rows?.[0];
          } else {
            creado = await repo.createReferido(
              {
                alianza_id: payloadReferido.alianza_id,
                codigo: null,
                estado: payloadReferido.estado,
                max_usos: payloadReferido.max_usos,
                vigencia_desde: payloadReferido.vigencia_desde,
                vigencia_hasta: payloadReferido.vigencia_hasta,
                beneficio_tipo: payloadReferido.beneficio_tipo,
                beneficio_valor: payloadReferido.beneficio_valor,
                notas: payloadReferido.notas,
                external_id: externalId,
              },
              client
            );
            if (payloadReferido.usos_actuales) {
              await client.query(
                `UPDATE referidos SET usos_actuales = $2 WHERE id = $1`,
                [creado.id, payloadReferido.usos_actuales]
              );
            }
          }
        } catch (err) {
          warnings.push({ type: 'referido', message: `No se pudo importar referido ${externalId}` });
          continue;
        }
        const newId = Number(creado?.id);
        if (creado?.codigo) codigosEnUso.add(String(creado.codigo).toUpperCase());
        referidosByExternal.set(externalId, newId);
        stats.referidos.inserted += 1;
      }
    }

    return { ok: true, stats, warnings };
  });
}

module.exports = {
  getInstanceId,
  exportSnapshot,
  importSnapshot,
};
