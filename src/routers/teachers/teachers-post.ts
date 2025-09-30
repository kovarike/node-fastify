import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { teachers } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../../services/utils.ts';

export const teachersRoutePost: FastifyPluginAsyncZod = async (server) => {
  server.post('/teachers', {
    schema: {
      tags: ['teachers'],
      summary: 'Create a new Teacher',
      description: 'Endpoint to create a new Teacher with required fields. Requires authentication and admin role.',
      security: [{ bearerAuth: [] }],
      body: z.object({
        name: z.string()
          .min(2, { message: 'Name must be at least 2 characters long' })
          .max(100, { message: 'Name must be at most 100 characters long' })
          .describe('Name of the Teacher'),
        email: z.email({ message: 'Invalid email format' })
          .describe('Email of the Teacher'),
        password: z.string()
          .min(6, { message: 'Password must be at least 6 characters long' })
          .describe('Password of the Teacher'),
      }).describe('Request body for creating a new Teacher'),
      response: {
        201: z.object({
          message: z.string(),
          teacher: z.object({
            id: z.uuid(),
            name: z.string(),
            email: z.string(),
            role: z.string()
          })
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
  }, async (request, reply) => {
    try {

      const { email, name, password } = request.body;

      // Check for duplicate email
      const [existingTeacher] = await db.select()
        .from(teachers)
        .where(eq(teachers.email, email))
        .limit(1);

      if (existingTeacher) {
        return reply.code(409).send({
          error: 'Teacher with this email already exists',
          suggestedAction: 'Use a different email or update the existing teacher'
        });
      }

      // Hash the password
      const passwordHash = await hashPassword(password);
      
      // Create the teacher
      const result = await db.insert(teachers).values({
        name,
        email,
        password: passwordHash
      }).returning({
        id: teachers.id,
        name: teachers.name,
        email: teachers.email,
        role: teachers.role
      });

      const newTeacher = result[0];

      request.log.info(`Teacher created: ${newTeacher.id}`);

      return reply.code(201).send({
        message: 'Teacher successfully created',
        teacher: newTeacher
      });

    } catch (error) {
      request.log.error(`Error creating teacher: ${error}`);

      return reply.code(500).send({
        error: 'Internal server error while creating teacher',
        code: 'TEACHER_CREATION_FAILED'
      });
    }
  });
};