
import fastify, {type FastifyRequest, type FastifyReply} from 'fastify'
import { validatorCompiler, serializerCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'

import cors from '@fastify/cors'
import helmet from '@fastify/helmet';

import { env } from './services/env.ts';

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

server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
});

server.register(middleware);
server.register(errors);

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