import fastify from 'fastify'
// declare module '@fastify/jwt' {
//   interface FastifyJWT {
//     payload: {
//       id: string;
//       email: string;
//       role: 'student' | 'admin' | 'teacher' | string;
//       iat?: number;
//       exp?: number;
//     };
//   }
// }

// declare module 'fastify' {
//   interface FastifyRequest {
//     user: import('@fastify/jwt').FastifyJWT['payload'];
//   }
  
//   interface FastifyInstance {
//     authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
//   }
// }

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      id: string;
      email: string;
      role: 'student' | 'admin' | 'teacher' | string;
      type: 'user' | 'teacher'; // Adicione esta linha
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