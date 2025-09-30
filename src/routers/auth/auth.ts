import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { sql } from 'drizzle-orm';
import { isValidHashPassword } from '../../services/utils.ts';
import { env } from '../../services/env.ts';

export const authRoute: FastifyPluginAsyncZod = async (server) => {
  server.post('/auth', {
    schema: {
      tags: ['auth'],
      summary: 'Authenticate user or teacher',
      description: 'Authenticate a user or teacher with email and password',
      body: z.object({
        email: z.email(), // Corrigido: z.email() → z.string().email()
        password: z.string()
      }),
      response: {
        200: z.object({
          token: z.string(),
          user: z.object({
            id: z.uuid(),
            email: z.string(),
            name: z.string(),
            role: z.string(),
            type: z.enum(['user', 'teacher']) // Corrigido: especifiquei os valores do enum
          })
        }),
        401: z.object({
          error: z.string()
        }),
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body;

    // Buscar em ambas as tabelas com uma única query usando UNION
    const result = await db.execute(sql`
      SELECT id, email, name, password, role, 'user' as type 
      FROM users 
      WHERE email = ${email}
      UNION ALL
      SELECT id, email, name, password, role, 'teacher' as type 
      FROM teachers 
      WHERE email = ${email}
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const account = result.rows[0] as any;

    if (!await isValidHashPassword(password, account.password)) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    // Gerar token JWT
    const token = server.jwt.sign({
      id: account.id,
      email: account.email,
      role: account.role,
      type: account.type
    });

    // Configurar cookie seguro
    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 // 1 hora
    });

    return reply.send({ 
      token,
      user: {
        id: account.id,
        email: account.email,
        name: account.name,
        role: account.role,
        type: account.type
      }
    });
  });
}