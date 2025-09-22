import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema.ts';
import { isValidHashPassword } from '../../services/utils.ts';
import { env } from '../../services/env.ts';

export const authRouteUser: FastifyPluginAsyncZod = async (server) => {
  server.post('/auth/user', {
    schema: {
      body: z.object({
        email: z.email(),
        password: z.string().min(6)
      })
    }
  }, async (request, reply) => {
    const { email, password } = request.body;

    const [user] = await db.select()
      .from(users)
      .where(eq(users.email, email));

    if (!user || !await isValidHashPassword(password, user.password)) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    } 
    
    const token = server.jwt.sign({
      id: user.id,
      email: user.email,
      role: `${"student:"}${user.id}`
    });

    // Configure cookie seguro
    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 // 1 hora
    });

    return { message: 'Login successful' };
  });
}