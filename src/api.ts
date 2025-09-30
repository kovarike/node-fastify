import fastify, {type FastifyRequest, type FastifyReply} from 'fastify'
import fastifyStatic from '@fastify/static';
import cookie from "@fastify/cookie"
import fjwt from '@fastify/jwt';
import { validatorCompiler, serializerCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'

import cors from '@fastify/cors'
import helmet from '@fastify/helmet';

import { env } from './services/env.ts';

import { coursesRouteDelete } from './routers/courses/courses-delete.ts';
import { coursesRouteGet } from './routers/courses/courses-get.ts';
import { coursesRoutePost } from './routers/courses/courses-post.ts';
import { coursesRoutePut } from './routers/courses/courses-put.ts';

import { teachersRouteDelete } from './routers/teachers/teachers-delete.ts';
import { teachersRouteGet } from './routers/teachers/teachers-get.ts';
import { teachersRoutePost } from './routers/teachers/teachers-post.ts';
import { teachersRoutePut } from './routers/teachers/teachers-put.ts';

import { usersRouteDelete } from './routers/usesr/users-delete.ts';
import { usersRouteGet } from './routers/usesr/users-get.ts';
import { usersRoutePost } from './routers/usesr/users-post.ts';
import { usersRoutePut } from './routers/usesr/users-put.ts';

import { enrollmentsRoutePost } from './routers/enrollments/enrollments-post.ts';
import { enrollmentsRouteGet } from './routers/enrollments/enrollments-get.ts';
import { enrollmentsRoutePut } from './routers/enrollments/enrollments-put.ts';
import { enrollmentsRouteDelete } from './routers/enrollments/enrollments-delete.ts';

import { classesRoutePost } from './routers/classes/classes-post.ts';
import { classesRouteGet } from './routers/classes/classes-get.ts';
import { classesRoutePut } from './routers/classes/classes-put.ts';
import { classesRouteDelete } from './routers/classes/classes-delete.ts';

import { authRoute } from './routers/auth/auth.ts';

import { middleware } from './services/middleware.ts';
import { errors } from './services/errors.ts';
import { currentSecret } from './services/utils.ts';

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

  server.register(cookie, {
    secret: [
      currentSecret,
      env.CURRENT_COOKIE_SECRETET,
      env.PREVIOUS_COOKIE_SECRETET_1,
      env.PREVIOUS_COOKIE_SECRETET_2
    ],
    hook: 'onRequest', // Hook padrão para parsing automático
    algorithm: 'sha256', // Algoritmo forte para signing
    parseOptions: {     // Opções para parsing de cookies recebidos
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax'
    }
    
  });

  // Registrar o plugin JWT
  server.register(fjwt, {
    secret: env.SECRETET_JWT,
    sign: {
      expiresIn: '1h',
    },
  });

server.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
});

// Registra os middlewares e tratadores de erro
server.register(middleware);
server.register(errors);

server.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/', // serve files from the root of the server
});

// Rota para servir a página inicial, por exemplo
server.get('/', async (request, reply) => {
  return reply.sendFile('index.html'); // Envia o arquivo home.html
});

// Registra as rotas
server.register(coursesRouteDelete);
server.register(coursesRouteGet);
server.register(coursesRoutePost);
server.register(coursesRoutePut);

server.register(teachersRouteDelete);
server.register(teachersRouteGet);
server.register(teachersRoutePost);
server.register(teachersRoutePut);

server.register(usersRouteDelete);
server.register(usersRouteGet);
server.register(usersRoutePost);
server.register(usersRoutePut);

server.register(classesRoutePut);
server.register(classesRouteGet);
server.register(classesRoutePost); 
server.register(classesRouteDelete);

server.register(enrollmentsRoutePost);
server.register(enrollmentsRouteGet);
server.register(enrollmentsRoutePut);
server.register(enrollmentsRouteDelete);

server.register(authRoute);



export { server };