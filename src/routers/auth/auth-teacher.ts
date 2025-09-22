import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { eq } from 'drizzle-orm';
import { users, teachers} from '../../db/schema.ts';
import { isValidHashPassword } from '../../services/utils.ts';
import { env } from '../../services/env.ts';

export const authRouteTeacher: FastifyPluginAsyncZod = async (server) => {
  server.post('/auth/teacher', {
    schema: {
      body: z.object({
        email: z.email(),
        password: z.string().min(6)
      })
    }
  }, async (request, reply) => {
    const { email, password } = request.body;

    const [teacher] = await db.select()
      .from(teachers)
      .where(eq(teachers.email, email));

    if (!teacher || !await isValidHashPassword(password, teacher.password)) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    } 
    
    const token = server.jwt.sign({
      id: teacher.id,
      email: teacher.email,
      role: `${"teacher:"}${teacher.id}`
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