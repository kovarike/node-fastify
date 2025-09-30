import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { count, eq, and } from 'drizzle-orm'
import { db } from '../../db/client.ts';
import { users, enrollments } from '../../db/schema.ts';
import { extractRole } from '../../services/utils.ts';
import { checkUserRole } from '../hook/check-user-role.ts';

export const usersRouteDelete: FastifyPluginAsyncZod = async (server) => {
  server.delete('/users/:id', {
    schema: {
      tags: ['users'],
      summary: 'Delete user by ID',
      description: 'Delete a specific user using its unique ID. Requires authentication and admin role.',
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: z.uuid().describe('Unique identifier for the user'),
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
      // Check if user has permission to delete users
      // Only admins should be able to delete users
      // if (checkUserRole(request.user.role)) {
      //   return reply.code(403).send({
      //     error: 'Forbidden',
      //     message: 'Only admins can delete users'
      //   });
      // }

      const { id } = request.params;

      // Prevent users from deleting themselves
      // if (checkUserRole(request.user.role)) {
      //   return reply.code(403).send({
      //     error: 'Forbidden',
      //     message: 'You cannot delete your own account'
      //   });
      // }

      // Verify if the user exists
      const [user] = await db.select()
        .from(users)
        .where(eq(users.id, id));

      if (!user) {
        return reply.code(404).send({
          error: 'User not found',
          details: `No user found with ID: ${id}`
        });
      }

      // Check if user has any active enrollments
      const [enrollmentCountResult] = await db.select({ count: count() })
        .from(enrollments)
        .where(and(
          eq(enrollments.userId, id),
          eq(enrollments.isActive, true)
        ));

      if (enrollmentCountResult.count > 0) {
        return reply.code(409).send({
          error: 'User has active enrollments',
          message: 'Cannot delete a user that has active course enrollments',
          enrollmentCount: enrollmentCountResult.count
        });
      }

      // Execute deletion
      await db.delete(users)
        .where(eq(users.id, id));

      // Log the action
      request.log.info(`User deleted: ${id}`);

      return reply.code(200).send({
        message: 'User successfully deleted',
        deletedId: id
      });

    } catch (error) {
      request.log.error(`Error deleting user: ${error}`);
      
      return reply.code(500).send({
        error: 'Internal server error',
        code: 'USER_DELETION_FAILED'
      });
    }
  });
};