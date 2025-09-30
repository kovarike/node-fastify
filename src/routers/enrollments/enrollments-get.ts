import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { enrollments, users, classes } from '../../db/schema.ts';
import { and, count, eq } from 'drizzle-orm';

export const enrollmentsRouteGet: FastifyPluginAsyncZod = async (server) => {
  server.get('/enrollments', {
    schema: {
      tags: ['enrollments'],
      summary: 'List all enrollments',
      description: 'Retrieve a paginated list of all enrollments with optional filtering.',
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        userId: z.uuid().optional().describe('Filter by user ID'),
        classId: z.uuid().optional().describe('Filter by class ID'),
        isActive: z.boolean().optional().describe('Filter by active status'),
        page: z.coerce.number().min(1).optional().default(1),
        limit: z.coerce.number().min(1).max(100).optional().default(10)
      }),
      response: {
        200: z.object({
          enrollments: z.array(z.object({
            enrollmentId: z.uuid(),
            userId: z.uuid(),
            classId: z.uuid(),
            enrolledAt: z.string(),
            enrollment: z.string(),
            isActive: z.boolean(),
            user: z.object({
              name: z.string(),
              email: z.string()
            }),
            class: z.object({
              name: z.string(),
              semester: z.string(),
              schedule: z.string()
            })
          })),
          pagination: z.object({
            page: z.number(),
            limit: z.number(),
            total: z.number(),
            pages: z.number()
          })
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
      const { userId, classId, isActive, page, limit } = request.query;
      const offset = (page - 1) * limit;

      const conditions = [];
      if (userId) conditions.push(eq(enrollments.userId, userId));
      if (classId) conditions.push(eq(enrollments.classId, classId));
      if (isActive !== undefined) conditions.push(eq(enrollments.isActive, isActive));

      const [enrollmentsList, totalResult] = await Promise.all([
        db.select({
          enrollmentId: enrollments.enrollmentId,
          userId: enrollments.userId,
          classId: enrollments.classId,
          enrolledAt: enrollments.enrolledAt,
          enrollment: enrollments.enrollment,
          isActive: enrollments.isActive,
          user: {
            name: users.name,
            email: users.email
          },
          class: {
            name: classes.name,
            semester: classes.semester,
            schedule: classes.schedule
          }
        })
          .from(enrollments)
          .innerJoin(users, eq(enrollments.userId, users.id))
          .innerJoin(classes, eq(enrollments.classId, classes.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .limit(limit)
          .offset(offset)
          .orderBy(enrollments.enrolledAt),

        db.select({ count: count() })
          .from(enrollments)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .then((res) => res[0]?.count || 0)
      ]);

      const totalPages = Math.ceil(totalResult / limit);

      return reply.code(200).send({
        enrollments: enrollmentsList.map(e => ({
          ...e,
          enrolledAt: e.enrolledAt.toISOString()
        })),
        pagination: {
          page,
          limit,
          total: totalResult,
          pages: totalPages
        }
      });

    } catch (error) {
      request.log.error(`Error fetching : ${error}`);
      return reply.code(500).send({
        error: 'Internal server error while fetching enrollments',
        code: 'ENROLLMENTS_FETCH_FAILED'
      });
    }
  });
};