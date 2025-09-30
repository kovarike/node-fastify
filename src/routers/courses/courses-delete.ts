import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { count, eq} from 'drizzle-orm'
import { db } from '../../db/client.ts';
import { courses, classes} from '../../db/schema.ts';
import { extractRole } from '../../services/utils.ts';
import { checkUserRole } from '../hook/check-user-role.ts';

export const coursesRouteDelete: FastifyPluginAsyncZod = async (server) => {
  server.delete('/courses/:id', {
    schema: {
      tags: ['courses'],
      summary: 'Delete course by ID',
      description: 'Delete a specific course using its unique ID. Requires authentication and instructor role.',
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: z.uuid().describe('Unique identifier for the course'),
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
          enrollmentCount: z.number()
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
      //     message: 'Only instructors or admins can delete courses'
      //   });
      // }

      const { id } = request.params;

      // Verificar se o curso existe antes de tentar excluir
      const [course] = await db.select()
        .from(courses)
        .where(eq(courses.id, id));

      if (!course) {
        return reply.code(404).send({
          error: 'Course not found',
          details: `No course found with ID: ${id}`
        });
      }

      // Verificar se o usuário é o criador do curso (a menos que seja admin)
      // if (checkUserRole(request.user.role)) {
      //   return reply.code(403).send({
      //     error: 'Forbidden',
      //     message: 'You can only delete courses that you created'
      //   });
      // }

      // Verificar se há matrículas no curso antes de excluir
      const [enrollmentCount] = await db.select({ count: count() })
        .from(classes)
        .where(eq(classes.courseId, id));

      if (enrollmentCount.count > 0) {
        return reply.code(409).send({
          error: 'Course has enrollments',
          message: 'Cannot delete a course that has active enrollments',
          enrollmentCount: enrollmentCount.count
        });
      }

      // Executar a exclusão
      await db.delete(courses)
        .where(eq(courses.id, id));

      // Registrar a ação
      request.log.info(`Course deleted: ${id}`);

      return reply.code(200).send({
        message: 'Course successfully deleted',
        deletedId: id
      });

    } catch (error) {
      request.log.error(`Error deleting course: ${error}`);
      
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'COURSE_DELETION_FAILED'
      });
    }
  });
};