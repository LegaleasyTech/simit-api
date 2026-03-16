const express = require('express');
const router = express.Router();
const { consultarPorDocumento, consultarPorPlaca, TIPOS_DOCUMENTO } = require('../services/simit.service');

// ─── Validaciones ─────────────────────────────────────────────────────────────
function validarPlaca(placa) {
  return /^[A-Za-z]{3}[0-9]{2}[A-Za-z0-9]$/i.test(placa.replace(/[\s-]/g, ''));
}

// ─── GET /api/v1/simit/documento/:tipoDoc/:numero ─────────────────────────────
/**
 * Consulta multas por documento de identidad.
 * Ej: GET /api/v1/simit/documento/CC/12345678
 */
router.get('/documento/:tipoDoc/:numero', async (req, res, next) => {
  try {
    const { tipoDoc, numero } = req.params;
    const resultado = await consultarPorDocumento(tipoDoc, numero);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/simit/placa/:placa ──────────────────────────────────────────
/**
 * Consulta multas por placa vehicular.
 * Ej: GET /api/v1/simit/placa/ABC123
 */
router.get('/placa/:placa', async (req, res, next) => {
  try {
    const placa = req.params.placa;
    if (!validarPlaca(placa)) {
      return res.status(400).json({
        success: false,
        error: 'Formato de placa inválido. Ejemplos válidos: ABC123, ABC12D',
        code: 'INVALID_PLATE',
      });
    }
    const resultado = await consultarPorPlaca(placa);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/simit/placa/:placa/documento/:numero ─────────────────────────
/**
 * Consulta multas cruzando placa y documento.
 * Ej: GET /api/v1/simit/placa/ABC123/documento/12345678
 */
router.get('/placa/:placa/documento/:numero', async (req, res, next) => {
  try {
    const { placa, numero } = req.params;
    if (!validarPlaca(placa)) {
      return res.status(400).json({
        success: false,
        error: 'Formato de placa inválido. Ejemplos válidos: ABC123, ABC12D',
        code: 'INVALID_PLATE',
      });
    }
    const resultado = await consultarPorPlaca(placa, numero);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/simit/tipos-documento ───────────────────────────────────────
/**
 * Devuelve los tipos de documento admitidos.
 */
router.get('/tipos-documento', (req, res) => {
  res.json({
    success: true,
    tiposDocumento: Object.entries(TIPOS_DOCUMENTO).map(([codigo, nombre]) => ({
      codigo,
      nombre,
    })),
  });
});

// ─── GET /api/v1/simit/estado ─────────────────────────────────────────────────
/**
 * Comprueba la disponibilidad del portal SIMIT.
 */
router.get('/estado', async (req, res) => {
  const axios = require('axios');
  try {
    const start = Date.now();
    const resp = await axios.get('https://www.fcm.org.co/simit/', {
      timeout: 8000,
      validateStatus: (s) => s < 600,
    });
    const latencia = Date.now() - start;
    res.json({
      success: true,
      simitDisponible: resp.status < 400,
      httpStatus: resp.status,
      latenciaMs: latencia,
      verificadoEn: new Date().toISOString(),
    });
  } catch (e) {
    res.status(503).json({
      success: false,
      simitDisponible: false,
      error: e.message,
      verificadoEn: new Date().toISOString(),
    });
  }
});

module.exports = router;
