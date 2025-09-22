import fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { fastifySwagger } from '@fastify/swagger';
import scalar from '@scalar/fastify-api-reference';
import { jsonSchemaTransform, validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod';
import crypto from 'crypto';
import { coursesRoute } from './routers/couses-route.mjs';
import { ZodError } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';
import 'drizzle-orm';
import './db/client.mjs';
import 'pg';
import './table-BslGtHFL.mjs';
import './db/schema.mjs';
import 'uuidv7';
import './services/enrollments.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const server = fastify({
    logger: {
        transport: {
            target: 'pino-pretty',
            options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
                colorize: true
            },
        },
    },
    bodyLimit: 10 * 1024 * 1024, // 10MB
    trustProxy: true, // Habilita o reconhecimento de proxies reversos
}).withTypeProvider();
if (process.env.NODE_ENV !== 'production') {
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
                { url: process.env.API_URL || 'http://127.0.0.1:8080', description: 'Local / Dev' },
                // { url: 'https://api.meusite.com', description: 'Production' }
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
    });
}
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
server.register(cors, {
    origin: (origin, cb) => {
        // Permitir requisições sem origin (ex: curl, Postman)
        if (!origin)
            return cb(null, true);
        if (allowedOrigins.includes(origin)) {
            // Permite origem confiável
            cb(null, true);
        }
        else {
            // Bloqueia outras origens
            cb(new Error('Not allowed by CORS'), false);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // métodos permitidos
    allowedHeaders: ['Content-Type', 'Authorization'], // headers permitidos
    credentials: true, // se você usa cookies/autenticação
    maxAge: 86400, // cache da preflight request (1 dia)
});
server.register(rateLimit, {
    max: 100, // 100 requisições por IP
    timeWindow: '1 minute',
    allowList: ['127.0.0.1'], // ips confiáveis, como testes internos
    ban: 10, // banir IPs que excederem limites repetidamente
    keyGenerator: (req) => {
        const xForwardedFor = req.headers['x-forwarded-for'];
        if (typeof xForwardedFor === 'string')
            return xForwardedFor.split(',')[0].trim();
        if (Array.isArray(xForwardedFor))
            return xForwardedFor[0];
        return req.ip; // fallback
    }
});
server.register(helmet, { contentSecurityPolicy: false });
server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);
// Middleware para verificar Content-Type e outros headers
// onRequest: garantir e expor X-Request-Id (correlation id)
server.addHook('onRequest', (request, reply, done) => {
    const incoming = request.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && incoming.trim() !== '' ? incoming : crypto.randomUUID();
    // expõe no header de resposta para rastreio
    reply.header('X-Request-Id', requestId);
    // anexa ao request para uso posterior (logs / error handler)
    request.requestId = requestId;
    done();
});
// preHandler: aceitar somente JSON quando houver corpo real
server.addHook('preHandler', (request, reply, done) => {
    const method = request.method?.toUpperCase?.() ?? '';
    // rotas preflight/devem passar
    if (method === 'OPTIONS' || method === 'GET' || method === 'HEAD')
        return done();
    // verificar se existe corpo a ser validado (Content-Length > 0 ou transfer-encoding presente)
    const contentLengthHeader = request.headers['content-length'];
    const hasBody = (typeof contentLengthHeader === 'string' && parseInt(contentLengthHeader, 10) > 0)
        || request.headers['transfer-encoding'];
    if (!hasBody)
        return done(); // sem body => não precisamos validar Content-Type
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
            requestId: request.requestId,
        };
        return reply.status(415).type('application/json').send(payload);
    }
    return done();
});
// Error handler: retorno padronizado, sem vazar stack em produção, logs estruturados
server.setErrorHandler((error, request, reply) => {
    const isProd = process.env.NODE_ENV === 'production';
    const requestId = request.requestId || request.headers['x-request-id'] || crypto.randomUUID();
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
await server.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/', // serve files from the root of the server
});
// Rota para servir a página inicial, por exemplo
server.get('/', async (request, reply) => {
    return reply.sendFile('home.html'); // Envia o arquivo home.html
});
server.get('/login', async (request, reply) => {
    return reply.sendFile('login.html'); // Envia o arquivo login.html
});
// Registra as rotas
server.register(coursesRoute);
server.listen({ port: 8080, }, (err, address) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server listening at ${address}`);
});
//# sourceMappingURL=server.mjs.map
