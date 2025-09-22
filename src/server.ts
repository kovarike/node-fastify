<<<<<<< HEAD
import fastify, {type FastifyRequest, type FastifyReply} from 'fastify'
import { validatorCompiler, serializerCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
=======
import fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
>>>>>>> main
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors'
import helmet from '@fastify/helmet';

import path from 'path';
import { fileURLToPath } from 'url';

import { env } from './services/env.ts';

<<<<<<< HEAD
import { coursesRouteDelete } from './routers/courses/courses-delete.ts';
import { coursesRouteGet } from './routers/courses/courses-get.ts';
import { coursesRoutePost } from './routers/courses/courses-post.ts';
import { coursesRoutePut } from './routers/courses/courses-put.ts';

import { middleware } from './services/middleware.ts';
import { errors } from './services/errors.ts';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string;
      email: string;
      role: string;
      iat?: number;
      exp?: number;
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    user: import('@fastify/jwt').FastifyJWT['payload'];
  }
  
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
=======
import { coursesRoute } from './routers/couses-route';
import { ZodError } from 'zod';
>>>>>>> main

import path from 'path';
import { fileURLToPath } from 'url';

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
  trustProxy: true,  // Habilita o reconhecimento de proxies reversos
}).withTypeProvider<ZodTypeProvider>();

const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : [];

server.register(cors, {
  origin: (origin, cb) => {
    // Permitir requisições sem origin (ex: curl, Postman)
    if (!origin) return cb(null, true);

    if (allowedOrigins.includes(origin)) {
      // Permite origem confiável
      cb(null, true);
    } else {
      // Bloqueia outras origens
      cb(new Error('Not allowed by CORS'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // métodos permitidos
  allowedHeaders: ['Content-Type', 'Authorization'],    // headers permitidos
  credentials: true,                                    // se você usa cookies/autenticação
  maxAge: 86400,                                        // cache da preflight request (1 dia)
});

server.register(helmet, { contentSecurityPolicy: false });

server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

await server.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
  index: false, // desabilita o index automático
  decorateReply: false, // para evitar conflito de tipos com outros plugins
  
});

// Rota para servir a página inicial, por exemplo
server.get('/', async (request, reply) => {
  return reply.sendFile('home.html'); // Envia o arquivo home.html
});

server.get('/login', async (request, reply) => {
  return reply.sendFile('login.html'); // Envia o arquivo login.html
});

<<<<<<< HEAD
server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
});

await server.register(middleware);
await server.register(errors);
=======
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
>>>>>>> main

// Registra as rotas
server.register(coursesRouteDelete);
server.register(coursesRouteGet);
server.register(coursesRoutePost);
server.register(coursesRoutePut);

server.listen({ port: 3000, }, (err, address) => {
  if (err) {
    console.error(err);
    server.close()
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
})