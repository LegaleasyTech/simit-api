const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'SIMIT API',
    version: '1.0.0',
    description: 'API REST para consultar multas e infracciones de tránsito en Colombia.',
  },
  servers: [
    { url: '/api/v1/simit', description: 'Servidor actual' },
  ],
  paths: {
    '/documento/{tipoDoc}/{numero}': {
      get: {
        summary: 'Consultar por documento de identidad',
        parameters: [
          { name: 'tipoDoc', in: 'path', required: true, schema: { type: 'string', enum: ['CC','CE','PA','NIT','PPT'] } },
          { name: 'numero', in: 'path', required: true, schema: { type: 'string', example: '12345678' } },
        ],
        responses: { 200: { description: 'Consulta exitosa' } },
      },
    },
    '/placa/{placa}': {
      get: {
        summary: 'Consultar por placa vehicular',
        parameters: [
          { name: 'placa', in: 'path', required: true, schema: { type: 'string', example: 'ABC123' } },
        ],
        responses: { 200: { description: 'Consulta exitosa' } },
      },
    },
    '/placa/{placa}/documento/{numero}': {
      get: {
        summary: 'Consultar por placa y documento',
        parameters: [
          { name: 'placa', in: 'path', required: true, schema: { type: 'string', example: 'ABC123' } },
          { name: 'numero', in: 'path', required: true, schema: { type: 'string', example: '12345678' } },
        ],
        responses: { 200: { description: 'Consulta exitosa' } },
      },
    },
    '/tipos-documento': {
      get: {
        summary: 'Obtener tipos de documento válidos',
        responses: { 200: { description: 'Lista de tipos de documento' } },
      },
    },
    '/estado': {
      get: {
        summary: 'Verificar disponibilidad del portal SIMIT',
        responses: { 200: { description: 'Estado del portal' } },
      },
    },
  },
};

module.exports = swaggerSpec;