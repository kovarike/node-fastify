import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { classes, enrollments } from '../../db/schema.ts';
import { and, count, eq } from 'drizzle-orm';


export const classesRouteDelete: FastifyPluginAsyncZod = async (server) => {
  server.delete('/classes/:id', {
    schema: {
      tags: ['classes'],
      summary: 'Delete a class',
      description: 'Permanently delete a class.',
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: z.uuid().describe('Class ID')
      }),
      response: {
        200: z.object({
          message: z.string(),
          deletedId: z.uuid()
        }),
        404: z.object({
          error: z.string(),
          details: z.string()
        }),
        409: z.object({
          error: z.string(),
          message: z.string(),
          enrollmentCount: z.number()
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
      const { id } = request.params;

      // Verificar se a turma existe
      const [classItem] = await db.select()
        .from(classes)
        .where(eq(classes.id, id));

      if (!classItem) {
        return reply.code(404).send({
          error: 'Class not found',
          details: `No class found with ID: ${id}`
        });
      }

      // Verificar se há matrículas ativas na turma
      const [enrollmentCountResult] = await db.select({ count: count() })
        .from(enrollments)
        .where(and(
          eq(enrollments.classId, id),
          eq(enrollments.isActive, true)
        ));

      if (enrollmentCountResult.count > 0) {
        return reply.code(409).send({
          error: 'Class has active enrollments',
          message: 'Cannot delete a class that has active enrollments',
          enrollmentCount: enrollmentCountResult.count
        });
      }

      // Executar a exclusão
      await db.delete(classes)
        .where(eq(classes.id, id));

      request.log.info(`Class deleted: ${id}`);

      return reply.code(200).send({
        message: 'Class successfully deleted',
        deletedId: id
      });

    } catch (error) {
      request.log.error(`Error deleting class: ${error}`);
      return reply.code(500).send({
        error: 'Internal server error while deleting class',
        code: 'CLASS_DELETION_FAILED'
      });
    }
  });
};