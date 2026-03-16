const axios = require('axios');

const BASE_URL = 'https://www.fcm.org.co/simit';
const API_BASE = 'https://www.fcm.org.co/simit/ws';

const TIPOS_DOCUMENTO = {
  CC:  'Cédula de Ciudadanía',
  CE:  'Cédula de Extranjería',
  PA:  'Pasaporte',
  NIT: 'NIT (Persona Jurídica)',
  PPT: 'Permiso por Protección Temporal',
};

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*;q=0.9',
  'Accept-Language': 'es-CO,es;q=0.9',
  'Referer': BASE_URL,
};

const httpClient = axios.create({
  timeout: 20000,
  headers: HEADERS,
  validateStatus: (status) => status < 500,
});

function normalizarEstado(estadoRaw) {
  if (!estadoRaw) return 'desconocido';
  const upper = estadoRaw.toUpperCase().trim();
  if (upper.includes('COBRO COACTIVO')) return 'cobroCoactivo';
  if (upper.includes('PENDIENTE')) return 'pendiente';
  if (upper.includes('PAGADO')) return 'pagado';
  if (upper.includes('ACUERDO')) return 'acuerdoPago';
  if (upper.includes('PROCESO')) return 'enProceso';
  return estadoRaw.trim().toLowerCase();
}

function parsearValor(valorStr) {
  if (!valorStr) return 0;
  const limpio = valorStr.toString().replace(/[^0-9,\.]/g, '').replace(',', '.');
  return parseFloat(limpio) || 0;
}

function parsearFecha(fechaStr) {
  if (!fechaStr) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(fechaStr)) return fechaStr.substring(0, 10);
  const partes = fechaStr.split('/');
  if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
  return fechaStr;
}

function createError(message, status = 500, code = 'ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function consultarPorDocumento(tipoDoc, numero) {
  tipoDoc = tipoDoc.toUpperCase();
  if (!TIPOS_DOCUMENTO[tipoDoc]) {
    throw createError(
      `Tipo de documento inválido. Valores permitidos: ${Object.keys(TIPOS_DOCUMENTO).join(', ')}`,
      400, 'INVALID_DOC_TYPE'
    );
  }
  if (!numero || !/^[0-9A-Za-z]{4,20}$/.test(numero.trim())) {
    throw createError('Número de documento inválido.', 400, 'INVALID_DOC_NUMBER');
  }
  return await _consultarSIMIT({ tipoDoc, documento: numero.trim() });
}

async function consultarPorPlaca(placa, documento = null) {
  placa = placa.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z]{3}[0-9]{2}[A-Z0-9]$/.test(placa)) {
    throw createError('Formato de placa inválido. Ejemplo: ABC123 o ABC12D', 400, 'INVALID_PLATE');
  }
  return await _consultarSIMIT({ placa, documento });
}

async function _consultarSIMIT(params) {
  const endpoints = [
    `${API_BASE}/estados-cuenta/consultar`,
    `${API_BASE}/infracciones/consultar`,
  ];

  const payload = {
    tipoDocumento: params.tipoDoc || null,
    numeroDocumento: params.documento || null,
    placa: params.placa || null,
  };

  for (const url of endpoints) {
    try {
      const resp = await httpClient.post(url, payload, {
        headers: { ...HEADERS, 'Content-Type': 'application/json' },
      });
      if (resp.status === 200 && resp.data) {
        return _normalizarRespuesta(resp.data, params);
      }
    } catch (_) {
      continue;
    }
  }

  return _respuestaVacia(params);
}

function _normalizarRespuesta(data, params) {
  const raw = data.data || data.result?.data || data.resultado || data;
  const comparendos = _extraerComparendos(raw);
  const resoluciones = _extraerResoluciones(raw);
  const acuerdos = _extraerAcuerdos(raw);
  const todos = [...comparendos, ...resoluciones];
  const pendientes = todos.filter(c => c.estado === 'pendiente' || c.estado === 'cobroCoactivo');
  const totalPendiente = pendientes.reduce((sum, c) => sum + (c.valorTotal || 0), 0);

  return {
    success: true,
    consultadoEn: new Date().toISOString(),
    fuente: 'SIMIT – Federación Colombiana de Municipios',
    parametros: {
      tipoDocumento: params.tipoDoc || null,
      documento: params.documento || null,
      placa: params.placa || null,
    },
    resumen: {
      eudadorNeto: pendientes.length > 0,
      totalComparendos: todos.length,
      comparendosPendientes: pendientes.length,
      totalDeudaPendienteCOP: totalPendiente,
      acuerdosDePago: acuerdos.length,
      pazYSalvo: pendientes.length === 0,
    },
    comparendos,
    resoluciones,
    acuerdosDePago: acuerdos,
    mensaje: raw.record || raw.mensaje || null,
  };
}

function _extraerComparendos(raw) {
  const lista = raw.comparendos || raw.infracciones || raw.multas || [];
  if (!Array.isArray(lista)) return [];
  return lista.map(c => ({
    numero: c.comparendo || c.numero || null,
    estado: normalizarEstado(c.estado),
    infraccion: c.infraccion || c.codigoInfraccion || null,
    descripcionInfraccion: c.descripcion || c.nombreInfraccion || null,
    secretaria: c.secretaria || c.organismoTransito || null,
    fechaComparendo: parsearFecha(c.fechaComparendo || c.fecha),
    nombreInfractor: c.nombreInfractor || null,
    valorMulta: parsearValor(c.valorMulta || c.valor_multa),
    interesMora: parsearValor(c.interesMora || c.interes_mora),
    valorAdicional: parsearValor(c.valorAdicional || c.valor_adicional),
    valorTotal: parsearValor(c.valorTotal || c.valor_total),
    placa: c.placa || null,
    fotomulta: !!(c.tipo && c.tipo.toString().toUpperCase().includes('FOTO')),
  }));
}

function _extraerResoluciones(raw) {
  const lista = raw.resoluciones || [];
  if (!Array.isArray(lista)) return [];
  return lista.map(r => ({
    numero: r.resolucion || r.numeroResolucion || null,
    estado: normalizarEstado(r.estado),
    secretaria: r.secretaria || null,
    fechaResolucion: parsearFecha(r.fechaResolucion),
    nombreInfractor: r.nombreInfractor || null,
    valorTotal: parsearValor(r.valorTotal),
  }));
}

function _extraerAcuerdos(raw) {
  const lista = raw.acuerdosDePago || raw.acuerdos || [];
  if (!Array.isArray(lista)) return [];
  return lista.map(a => ({
    numero: a.numero || null,
    estado: normalizarEstado(a.estado),
    fechaAcuerdo: parsearFecha(a.fechaAcuerdo),
    valorTotal: parsearValor(a.valorTotal),
    secretaria: a.secretaria || null,
  }));
}

function _respuestaVacia(params) {
  return {
    success: false,
    consultadoEn: new Date().toISOString(),
    fuente: 'SIMIT – Federación Colombiana de Municipios',
    parametros: {
      tipoDocumento: params.tipoDoc || null,
      documento: params.documento || null,
      placa: params.placa || null,
    },
    error: 'No fue posible obtener datos del portal SIMIT. El portal puede estar no disponible o requiere verificación humana (CAPTCHA).',
    code: 'SIMIT_UNAVAILABLE',
    nota: 'Consulte directamente en: https://www.fcm.org.co/simit/#/home-public',
  };
}

module.exports = {
  consultarPorDocumento,
  consultarPorPlaca,
  TIPOS_DOCUMENTO,
  normalizarEstado,
  parsearValor,
  parsearFecha,
};