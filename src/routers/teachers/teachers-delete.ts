import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { count, eq } from 'drizzle-orm'
import { db } from '../../db/client.ts';
import { teachers, courses, classes} from '../../db/schema.ts';
import { extractRole } from '../../services/utils.ts';
import { checkUserRole } from '../hook/check-user-role.ts';

export const teachersRouteDelete: FastifyPluginAsyncZod = async (server) => {
  server.delete('/teachers/:id', {
    schema: {
      tags: ['teachers'],
      summary: 'Delete teacher by ID',
      description: 'Delete a specific teacher using its unique ID. Requires authentication and appropriate role.',
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: z.uuid().describe('Unique identifier for the teacher'),
      }),
      response: {
        200: z.object({
          message: z.string(),
          deletedId: z.uuid()
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
          message: z.string(),
          courseCount: z.number().optional(),
          classCount: z.number().optional()
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
      // Check if user has permission to delete teachers
      // This should probably be restricted to admins only
      // if (checkUserRole(request.user.role)) {
      //   return reply.code(403).send({
      //     error: 'Forbidden',
      //     message: 'Only admins can delete teachers'
      //   });
      // }

      const { id } = request.params;

      // Verify if the teacher exists
      const [teacher] = await db.select()
        .from(teachers)
        .where(eq(teachers.id, id));

      if (!teacher) {
        return reply.code(404).send({
          error: 'Teacher not found',
          details: `No teacher found with ID: ${id}`
        });
      }

      // Check if teacher has any courses
      const [courseCountResult] = await db.select({ count: count() })
        .from(courses)
        .where(eq(courses.teachersId, id));

      // Check if teacher has any classes
      const [classCountResult] = await db.select({ count: count() })
        .from(classes)
        .where(eq(classes.teacherId, id));

      if (courseCountResult.count > 0 || classCountResult.count > 0) {
        return reply.code(409).send({
          error: 'Teacher has associated courses or classes',
          message: 'Cannot delete a teacher that has associated courses or classes',
          courseCount: courseCountResult.count,
          classCount: classCountResult.count
        });
      }

      // Execute deletion
      await db.delete(teachers)
        .where(eq(teachers.id, id));

      // Log the action
      request.log.info(`Teacher deleted: ${id}`);

      return reply.code(200).send({
        message: 'Teacher successfully deleted',
        deletedId: id
      });

    } catch (error) {
      request.log.error(`Error deleting teacher: ${error}`);
      
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'TEACHER_DELETION_FAILED'
      });
    }
  });
};