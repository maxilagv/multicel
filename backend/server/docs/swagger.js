const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Kaisen API',
      version: '1.0.0',
      description: 'Documentacion operativa de endpoints criticos del ERP.',
    },
    servers: [
      {
        url: process.env.PUBLIC_ORIGIN || 'http://localhost:3000',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        NuevaVenta: {
          type: 'object',
          required: ['cliente_id', 'items'],
          properties: {
            cliente_id: { type: 'integer', example: 12 },
            fecha: { type: 'string', format: 'date-time' },
            descuento: { type: 'number', example: 0 },
            impuestos: { type: 'number', example: 0 },
            deposito_id: { type: 'integer', nullable: true, example: 1 },
            es_reserva: { type: 'boolean', example: false },
            caja_tipo: {
              type: 'string',
              enum: ['home_office', 'sucursal'],
              example: 'sucursal',
            },
            price_list_type: {
              type: 'string',
              enum: ['local', 'distribuidor', 'final'],
              example: 'final',
            },
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['producto_id', 'cantidad'],
                properties: {
                  producto_id: { type: 'integer', example: 44 },
                  cantidad: { type: 'integer', example: 2 },
                  precio_unitario: { type: 'number', example: 1850 },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, '../routes/*.js')],
});

module.exports = {
  swaggerUi,
  swaggerSpec,
};
