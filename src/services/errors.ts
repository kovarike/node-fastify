import { type FastifyReply, type FastifyRequest } from 'fastify'
import { type FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { ZodError } from 'zod';
import crypto from 'crypto';

export const errors: FastifyPluginAsyncZod = async (server) => {
  // Error handler: retorno padronizado, sem vazar stack em produção, logs estruturados
  server.setErrorHandler((error: any, request: FastifyRequest, reply: FastifyReply) => {
    const isProd = process.env.NODE_ENV === 'production';
    const requestId = (request as any).requestId || request.headers['x-request-id'] || crypto.randomUUID();
    const statusCode = error.statusCode ?? 500;

    // Log estruturado: inclui requestId, method, url, e stack (se dev)
    server.log.error({
      msg: error.message,
      name: error.name,
      statusCode,
      requestId,
      method: request.method,
      url: request.url,
      stack: isProd ? undefined : error.stack,
      // opcional: attach extra de erro (por ex, sql)
      ...(error.cause ? { cause: error.cause } : {})
    });

    // Payload público/consistente
    const base = {
      statusCode,
      error: error.name || 'InternalServerError',
      message: isProd && statusCode === 500 ? 'Internal Server Error' : (error.message || 'Something went wrong'),
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId,
    };

    // Caso de erro de validação (Zod)
    if (error instanceof ZodError) {
      const issues = error.issues.map(i => ({
        path: i.path.join('.') || '(root)',
        message: i.message,
        code: i.code,
      }));
      return reply.status(400).type('application/json').send({
        ...base,
        statusCode: 400,
        error: 'ValidationError',
        message: 'Validation failed',
        details: issues,
      });
    }

    // Caso de validação do Fastify (FST_ERR_VALIDATION)
    if (error.validation && Array.isArray(error.validation)) {
      return reply.status(400).type('application/json').send({
        ...base,
        statusCode: 400,
        error: 'BadRequest',
        message: error.message || 'Request validation failed',
        details: error.validation,
      });
    }

    // Caso de erro de banco (ex.: Drizzle)
    // Detecta alguns nomes/padrões comuns, adapte conforme seu ORM/driver
    if (error.name === 'DrizzleQueryError' || /violates not-null constraint|duplicate key/i.test(error.message || '')) {
      return reply.status(400).type('application/json').send({
        ...base,
        statusCode: 400,
        error: 'DatabaseError',
        message: error.message,
      });
    }

    // Default
    return reply.status(statusCode).type('application/json').send(base);
  });
}