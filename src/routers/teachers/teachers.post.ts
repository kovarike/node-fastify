import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { teachers } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { extractRole, hashPassword } from '../../services/utils.ts';

export const coursesRoutePost: FastifyPluginAsyncZod = async (server) => {
  server.post('/teachers', {
    schema: {
      tags: ['teachers'],
      summary: 'Create a new Teacher',
      description: 'Endpoint to create a new Teacher with required fields. Requires authentication and instructor role.',
      security: [{ bearerAuth: [] }],
      body: z.object({
        name: z.string()
          .describe('Name of the Teacher'),
        email: z.string()
          .describe('Email of the Teacher'),
        password: z.string()
          .describe('password of the Teacher'),
      }).describe('Request body for creating a new Teacher'),
      response: {
        201: z.object({
          message: z.string()
        }),
        400: z.object({
          error: z.string(),
          details: z.string()
        }),
        401: z.object({
          error: z.string(),
          message: z.string()
        }),
        403: z.object({
          error: z.string(),
          message: z.string()
        }),
        409: z.object({
          error: z.string(),
          suggestedAction: z.string()
        }),
        500: z.object({
          error: z.string(),
          code: z.string()
        })
      }
    },
    preValidation: [server.authenticate],
  }, async (request, reply) => {
    try {
      // Verificar se o usuário tem permissão de instrutor
      if (extractRole(request.user.role, request.user.id, request)) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Only instructors or admins can create Teacher'
        });
      }

      const { email, name, password } = request.body;

      // Verificação de duplicidade
      const [existingTeacher] = await db.select()
        .from(teachers)
        .where(eq(teachers.email, email)).limit(1);

      if (existingTeacher) {
        return reply.code(409).send({
          error: 'Teacher with this title already exists',
          suggestedAction: 'Use a different email or update the existing Teacher'
        });
      }

      const passwordHash = await hashPassword(password);
      const result = await db.insert(teachers).values({
        name,
        email,
        password: passwordHash
      }).returning();

      request.log.info(`Teacher created: ${result[0].id}`);

      return reply.code(201).send({
        message: 'Teacher successfully created'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation failed',
          details: error.message
        });
      }

      request.log.error(`Error creating teacher: ${error}`);

      return reply.code(500).send({
        error: 'Internal server error while creating teacher',
        code: 'TEACHER_CREATION_FAILED'
      });
    }
  });
};