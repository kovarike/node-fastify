import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { enrollments, users, classes } from '../../db/schema.ts';
import { and, eq } from 'drizzle-orm';

export const enrollmentsRouteDelete: FastifyPluginAsyncZod = async (server) => {
  server.delete('/enrollments/:id', {
    schema: {
      tags: ['enrollments'],
      summary: 'Delete an enrollment',
      description: 'Permanently delete an enrollment record.',
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: z.uuid().describe('Enrollment ID')
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
        500: z.object({
          error: z.string(),
          code: z.string()
        })
      }
    },
    // preValidation: [server.authenticate],
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const [existingEnrollment] = await db.select()
        .from(enrollments)
        .where(eq(enrollments.enrollmentId, id));

      if (!existingEnrollment) {
        return reply.code(404).send({
          error: 'Enrollment not found',
          details: `No enrollment found with ID: ${id}`
        });
      }

      await db.delete(enrollments)
        .where(eq(enrollments.enrollmentId, id));

      request.log.info(`Enrollment deleted: ${id}`);

      return reply.code(200).send({
        message: 'Enrollment successfully deleted',
        deletedId: id
      });

    } catch (error) {
      request.log.error(`Error deleting enrollment: ${error}`);
      return reply.code(500).send({
        error: 'Internal server error while deleting enrollment',
        code: 'ENROLLMENT_DELETION_FAILED'
      });
    }
  });
};