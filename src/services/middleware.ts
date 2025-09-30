import { type FastifyReply, type FastifyRequest } from 'fastify'
import { type FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { jsonSchemaTransform } from 'fastify-type-provider-zod'
import rateLimit from '@fastify/rate-limit'
import { fastifySwagger } from '@fastify/swagger'
import scalar from '@scalar/fastify-api-reference'

import crypto from 'crypto';

import { env } from './env.ts';

export const middleware: FastifyPluginAsyncZod = async (server) => {
  // Middleware para verificar Content-Type e outros headers
  // onRequest: garantir e expor X-Request-Id (correlation id)
  server.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done) => {
    const incoming = request.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.trim() !== '' ? incoming : crypto.randomUUID();
    // expõe no header de resposta para rastreio
    reply.header('X-Request-Id', requestId);
    // anexa ao request para uso posterior (logs / error handler)
    (request as any).requestId = requestId;
    done();
  });

  // preHandler: aceitar somente JSON quando houver corpo real
  server.addHook('preHandler', (request: FastifyRequest, reply: FastifyReply, done) => {
    const method = request.method?.toUpperCase?.() ?? '';
    // rotas preflight/devem passar
    if (method === 'OPTIONS' || method === 'GET' || method === 'HEAD') return done();

    // verificar se existe corpo a ser validado (Content-Length > 0 ou transfer-encoding presente)
    const contentLengthHeader = request.headers['content-length'];
    const hasBody = (typeof contentLengthHeader === 'string' && parseInt(contentLengthHeader, 10) > 0)
      || request.headers['transfer-encoding'];

    if (!hasBody) return done(); // sem body => não precisamos validar Content-Type

    const contentType = (request.headers['content-type'] || '').toString();

    // aceita application/json e application/*+json (ex: application/vnd.api+json)
    const jsonRegex = /^application\/(.+\+)?json(?:;.*)?$/i;

    if (!jsonRegex.test(contentType)) {
      const payload = {
        statusCode: 415,
        error: 'Unsupported Media Type',
        message: 'Content-Type must be application/json',
        timestamp: new Date().toISOString(),
        path: request.url,
        requestId: (request as any).requestId,
      };
      return reply.status(415).type('application/json').send(payload);
    }

    return done();
  });

  server.register(rateLimit, {
    max: 100,       // 100 requisições por IP
    timeWindow: '1 minute',
    allowList: [env.ALLOWED_IP], // ips confiáveis, como testes internos
    ban: 10,           // banir IPs que excederem limites repetidamente
    keyGenerator: (req: FastifyRequest) => {
      const xForwardedFor = req.headers['x-forwarded-for'];

      if (typeof xForwardedFor === 'string') return xForwardedFor.split(',')[0].trim();
      if (Array.isArray(xForwardedFor)) return xForwardedFor[0];

      return req.ip; // fallback
    }
  });


  if (env.NODE_ENV !== 'production') {
    server.register(fastifySwagger, {
      openapi: {
        info: {
          title: 'Enrollment Management API',
          version: '1.0.0',
          description: 'API for managing courses and enrollments',
          contact: { name: 'Danilo', email: 'danilokovarike@gmail.com' },
          license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
        },
        servers: [
          { url: env.ALLOWED_ORIGINS },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT'
            }
          },
          // você pode colocar schemas padrão aqui (se quiser)
          schemas: {}
        },
        tags: [
          { name: 'courses', description: 'Operations about courses' },
          { name: 'enrollments', description: 'Operations about enrollments' }
        ]
      },
      transform: jsonSchemaTransform,
    });

    server.register(scalar, {
      routePrefix: '/docs',
    })
  }
}