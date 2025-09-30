import type { FastifyRequest, FastifyReply } from 'fastify'
// import jwt from 'jsonwebtoken'
import jwt from '@fastify/jwt';
import { env } from '../../services/env.ts';
import { server } from '../../api.ts';

type JWTPayload =  {
      id: string;
      email: string;
      role: 'student' | 'admin' | 'teacher' | string;
      type: 'user' | 'teacher'; // Adicione esta linha
      iat?: number;
      exp?: number;
  };

export async function checkRequestJWT(request: FastifyRequest, reply: FastifyReply) {
  const token = request.headers.authorization

  if (!token) {
    return reply.status(401).send()
  }

  if (!env.SECRETET_JWT) {
    throw new Error('JWT_SECRET must be set.')
  }

  try {
    const payload = server.jwt.verify(token) as JWTPayload

    

    request.user = payload
  } catch {
    return reply.status(401).send()
  }
}