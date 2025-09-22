import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { and, ne, eq, } from 'drizzle-orm'
import { db } from '../../db/client.ts';
import { courses } from '../../db/schema.ts';
import { extractRole } from '../../services/utils.ts';

export const coursesRoutePut: FastifyPluginAsyncZod = async (server) => {
  server.put('/courses/:id', {
    schema: {
      tags: ['courses'],
      summary: 'Update a course',
      description: 'Endpoint to update a course with required and optional fields. Requires authentication and instructor role.',
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: z.uuid().describe('Unique identifier for the course'),
      }),
      body: z.object({
        title: z.string()
          .min(3, { message: 'Title must be at least 3 characters long' })
          .max(100, { message: 'Title must be at most 100 characters long' })
          .describe('Title of the course'),
        description: z.string()
          .max(500, { message: 'Description must be at most 500 characters long' })
          .describe('Detailed description of the course'),
        department: z.string()
          .min(2, { message: 'Department must be at least 2 characters long' })
          .max(50, { message: 'Department must be at most 50 characters long' })
          .describe('Academic department offering the course'),
        workload: z.string()
          .max(100, { message: 'Workload must be at most 100 characters long' })
          .describe('Expected workload and hours required')
      }).partial().describe('Request body for updating a course'),
      response: {
        200: z.object({
          courseID: z.uuid(),
          message: z.string(),
          updatedFields: z.array(z.string())
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
        404: z.object({
          error: z.string(),
          details: z.string()
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
          message: 'Only instructors or admins can update courses'
        });
      }

      const { id } = request.params;
      const updateData = request.body;

      // Verificar se o curso existe
      const [existingCourse] = await db.select()
        .from(courses)
        .where(eq(courses.id, id));

      if (!existingCourse) {
        return reply.code(404).send({
          error: 'Course not found',
          details: `No course found with ID: ${id}`
        });
      }

      // Verificar se o usuário é o criador do curso (a menos que seja admin)
      if (extractRole(request.user.role, existingCourse.teachersId, request)) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'You can only update courses that you created'
        });
      }

      // Verificar duplicidade de título se o título está sendo atualizado
      if (updateData.title && updateData.title !== existingCourse.title) {
        const [duplicateCourse] = await db.select()
          .from(courses)
          .where(and(
            eq(courses.title, updateData.title),
            ne(courses.id, id)
          ))
          .limit(1);

        if (duplicateCourse) {
          return reply.code(409).send({
            error: 'Course with this title already exists',
            suggestedAction: 'Use a different title or update the existing course'
          });
        }
      }

      // Preparar dados para atualização
      const updatePayload = {
        ...updateData,
        updatedAt: new Date(),
        // updatedBy: request.user.id
      };

      // Executar a atualização
      const result = await db.update(courses)
        .set(updatePayload)
        .where(eq(courses.id, id))
        .returning({ id: courses.id });

      // Log de auditoria
      request.log.info(`Course updated: ${id}`);

      // Determinar quais campos foram atualizados
      const updatedFields = Object.keys(updateData);

      return reply.code(200).send({
        courseID: result[0].id,
        message: 'Course successfully updated',
        updatedFields
      });

    } catch (error) {
      // Tratamento específico para erros de validação do Zod
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation failed',
          details: error.message
        });
      }

      request.log.error(`Error updating course: ${error}`);

      return reply.code(500).send({
        error: 'Internal server error while updating course',
        code: 'COURSE_UPDATE_FAILED'
      });
    }
  });
};