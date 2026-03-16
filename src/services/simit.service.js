const axios = require('axios');

const VERIFIK_TOKEN = process.env.VERIFIK_TOKEN;
const VERIFIK_BASE = 'https://api.verifik.co/v2/co/simit';

const TIPOS_DOCUMENTO = {
  CC:  'Cédula de Ciudadanía',
  CE:  'Cédula de Extranjería',
  PA:  'Pasaporte',
  NIT: 'NIT (Persona Jurídica)',
  PPT: 'Permiso por Protección Temporal',
};

function createError(message, status = 500, code = 'ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

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

function parsearValor(val) {
  if (!val) return 0;
  return parseFloat(val.toString().replace(/[^0-9.]/g, '')) || 0;
}

function parsearFecha(fechaStr) {
  if (!fechaStr) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(fechaStr)) return fechaStr.substring(0, 10);
  const partes = fechaStr.split('/');
  if (partes.length === 3) return `${partes[2]}-${partes[1]}-${partes[0]}`;
  return fechaStr;
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

  try {
    const resp = await axios.get(`${VERIFIK_BASE}/consultar`, {
      params: { documentType: tipoDoc, documentNumber: numero.trim() },
      headers: {
        Accept: 'application/json',
        Authorization: `jwt ${VERIFIK_TOKEN}`,
      },
      timeout: 20000,
    });

    return _normalizarRespuesta(resp.data, { tipoDoc, documento: numero.trim() });
  } catch (err) {
    if (err.response?.status === 404) {
      return _respuestaSinResultados({ tipoDoc, documento: numero.trim() });
    }
    throw createError('Error al consultar Verifik: ' + err.message, 503, 'VERIFIK_ERROR');
  }
}

async function consultarPorPlaca(placa, documento = null) {
  placa = placa.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z]{3}[0-9]{2}[A-Z0-9]$/.test(placa)) {
    throw createError('Formato de placa inválido. Ejemplo: ABC123 o ABC12D', 400, 'INVALID_PLATE');
  }

  try {
    const resp = await axios.get(`${VERIFIK_BASE}/consultar/placa`, {
      params: { plate: placa },
      headers: {
        Accept: 'application/json',
        Authorization: `jwt ${VERIFIK_TOKEN}`,
      },
      timeout: 20000,
    });

    return _normalizarRespuesta(resp.data, { placa, documento });
  } catch (err) {
    if (err.response?.status === 404) {
      return _respuestaSinResultados({ placa, documento });
    }
    throw createError('Error al consultar Verifik: ' + err.message, 503, 'VERIFIK_ERROR');
  }
}

function _normalizarRespuesta(data, params) {
  const raw = data?.value?.value?.data || data?.data || data;
  const multas = Array.isArray(raw?.multas) ? raw.multas : [];
  const acuerdos = Array.isArray(raw?.acuerdosPago) ? raw.acuerdosPago : [];
  const cursos = Array.isArray(raw?.cursos) ? raw.cursos : [];

  const comparendos = multas.map(m => ({
    numero: m.comparendo || m.numeroComparendo || null,
    estado: normalizarEstado(m.estadoComparendo || m.estado),
    infraccion: m.infracciones?.[0]?.codigoInfraccion || null,
    descripcionInfraccion: m.infracciones?.[0]?.descripcionInfraccion || null,
    secretaria: m.secretaria || null,
    fechaComparendo: parsearFecha(m.fechaComparendo || m.fecha),
    nombreInfractor: m.infractor ? `${m.infractor.nombre || ''} ${m.infractor.apellido || ''}`.trim() : null,
    valorMulta: parsearValor(m.valor),
    valorTotal: parsearValor(m.valorPagar || m.valor),
    placa: m.placa || params.placa || null,
    fotomulta: false,
  }));

  const pendientes = comparendos.filter(c => c.estado === 'pendiente' || c.estado === 'cobroCoactivo');
  const totalPendiente = pendientes.reduce((sum, c) => sum + (c.valorTotal || 0), 0);

  return {
    success: true,
    consultadoEn: new Date().toISOString(),
    fuente: 'SIMIT – Federación Colombiana de Municipios (vía Verifik)',
    parametros: {
      tipoDocumento: params.tipoDoc || null,
      documento: params.documento || null,
      placa: params.placa || null,
    },
    resumen: {
      deudorNeto: pendientes.length > 0,
      totalComparendos: comparendos.length,
      comparendosPendientes: pendientes.length,
      totalDeudaPendienteCOP: totalPendiente,
      acuerdosDePago: acuerdos.length,
      cursos: cursos.length,
      pazYSalvo: pendientes.length === 0,
    },
    comparendos,
    acuerdosDePago: acuerdos,
    cursos,
  };
}

function _respuestaSinResultados(params) {
  return {
    success: true,
    consultadoEn: new Date().toISOString(),
    fuente: 'SIMIT – Federación Colombiana de Municipios (vía Verifik)',
    parametros: {
      tipoDocumento: params.tipoDoc || null,
      documento: params.documento || null,
      placa: params.placa || null,
    },
    resumen: {
      deudorNeto: false,
      totalComparendos: 0,
      comparendosPendientes: 0,
      totalDeudaPendienteCOP: 0,
      acuerdosDePago: 0,
      cursos: 0,
      pazYSalvo: true,
    },
    comparendos: [],
    acuerdosDePago: [],
    cursos: [],
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