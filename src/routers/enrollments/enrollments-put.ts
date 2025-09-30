import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { enrollments, users, classes } from '../../db/schema.ts';
import { and, eq } from 'drizzle-orm';

export const enrollmentsRoutePut: FastifyPluginAsyncZod = async (server) => {
  server.put('/enrollments/:id', {
    schema: {
      tags: ['enrollments'],
      summary: 'Update an enrollment',
      description: 'Update enrollment status or other fields.',
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: z.uuid().describe('Enrollment ID')
      }),
      body: z.object({
        isActive: z.boolean().optional().describe('Active status of the enrollment')
      }).partial(),
      response: {
        200: z.object({
          message: z.string(),
          enrollment: z.object({
            enrollmentId: z.uuid(),
            userId: z.uuid(),
            classId: z.uuid(),
            enrolledAt: z.string(),
            enrollment: z.string(),
            isActive: z.boolean()
          })
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
      const { isActive } = request.body;

      const [existingEnrollment] = await db.select()
        .from(enrollments)
        .where(eq(enrollments.enrollmentId, id));

      if (!existingEnrollment) {
        return reply.code(404).send({
          error: 'Enrollment not found',
          details: `No enrollment found with ID: ${id}`
        });
      }

      const [updatedEnrollment] = await db.update(enrollments)
        .set({ isActive })
        .where(eq(enrollments.enrollmentId, id))
        .returning({
          enrollmentId: enrollments.enrollmentId,
          userId: enrollments.userId,
          classId: enrollments.classId,
          enrolledAt: enrollments.enrolledAt,
          enrollment: enrollments.enrollment,
          isActive: enrollments.isActive
        });

      return reply.code(200).send({
        message: 'Enrollment successfully updated',
        enrollment: {
          ...updatedEnrollment,
          enrolledAt: updatedEnrollment.enrolledAt.toISOString()
        }
      });

    } catch (error) {
      request.log.error(`Error updating enrollment: ${error}`);
      return reply.code(500).send({
        error: 'Internal server error while updating enrollment',
        code: 'ENROLLMENT_UPDATE_FAILED'
      });
    }
  });
};