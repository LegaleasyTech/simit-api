const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const dotenv = require('dotenv');

dotenv.config();

const simitRoutes = require('./routes/simit.routes');
const swaggerSpec = require('./docs/swagger');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Rate limiting: max 30 peticiones por minuto por IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: 'Demasiadas peticiones. Por favor espere 1 minuto.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ─── Docs ────────────────────────────────────────────────────────────────────
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'SIMIT API – Documentación',
}));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/v1/simit', simitRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SIMIT API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    service: 'SIMIT API – Sistema Integrado de Multas e Infracciones de Tránsito',
    version: '1.0.0',
    docs: '/docs',
    health: '/health',
    endpoints: {
      porDocumento: 'GET /api/v1/simit/documento/:tipoDoc/:numero',
      porPlaca: 'GET /api/v1/simit/placa/:placa',
      porPlacaYDocumento: 'GET /api/v1/simit/placa/:placa/documento/:numero',
    },
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Ruta no encontrada', code: 'NOT_FOUND' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Error interno del servidor',
    code: err.code || 'INTERNAL_ERROR',
  });
});

app.listen(PORT, () => {
  console.log(`\n🚦 SIMIT API corriendo en http://localhost:${PORT}`);
  console.log(`📚 Documentación en http://localhost:${PORT}/docs\n`);
});

module.exports = app;
