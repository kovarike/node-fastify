import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { courses } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { extractRole } from '../../services/utils.ts';
import { checkUserRole } from '../hook/check-user-role.ts';

export const coursesRoutePost: FastifyPluginAsyncZod = async (server) => {
  server.post('/courses', {
    schema: {
      tags: ['courses'],
      summary: 'Create a new course',
      description: 'Endpoint to create a new course with required fields. Requires authentication and instructor role.',
      security: [{ bearerAuth: [] }],
      body: z.object({
        title: z.string()
          .describe('Title of the course'),
        description: z.string()
          .describe('Detailed description of the course'),
        department: z.string()
          .describe('Academic department offering the course'),
        workload: z.string()
          .describe('Expected workload and hours required')
      }).describe('Request body for creating a new course'),
      response: {
        201: z.object({
          courseID: z.uuid(),
          title: z.string(),
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
    // preValidation: [server.authenticate],
  }, async (request, reply) => {
    try {
      // Verificar se o usuário tem permissão de instrutor
      // if (checkUserRole(request.user.role)) {
      //   return reply.code(403).send({
      //     error: 'Forbidden',
      //     message: 'Only instructors or admins can create courses'
      //   });
      // }

      const { title, description, department, workload } = request.body;

      // Verificação de duplicidade
      const [existingCourse] = await db.select()
        .from(courses)
        .where(eq(courses.title, title)).limit(1);

      if (existingCourse) {
        return reply.code(409).send({
          error: 'Course with this title already exists',
          suggestedAction: 'Use a different title or update the existing course'
        });
      }

      // Inserção no banco de dados
      const result = await db.insert(courses).values({
        title,
        description ,
        department,
        workload,
        teachersId: request.user.id,
        updatedAt: new Date()
      }).returning();

      // Log de auditoria
      request.log.info(`Course created: ${result[0].id}`);

      return reply.code(201).send({
        courseID: result[0].id,
        title: result[0].title,
        message: 'Course successfully created'
      });

    } catch (error) {
      // Tratamento específico para erros de validação do Zod
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation failed',
          details: error.message
        });
      }

      request.log.error(`Error creating course: ${error}`);

      return reply.code(500).send({
        error: 'Internal server error while creating course',
        code: 'COURSE_CREATION_FAILED'
      });
    }
  });
};