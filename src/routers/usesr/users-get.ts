import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { and, asc, count, eq, ilike, type SQL } from 'drizzle-orm'
import { db } from '../../db/client.ts';
import { users, courses, classes, enrollments, teachers } from '../../db/schema.ts';

export const usersRouteGet: FastifyPluginAsyncZod = async (server) => {
  // Rota para listar todos os usuários (apenas para admins)
  server.get('/users', {
    schema: {
      tags: ['users'],
      summary: 'List all users',
      description: 'Retrieve a paginated list of all users with optional search and ordering. Admin only.',
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        search: z.string().optional().describe('Optional search term for filtering users by name'),
        orderBy: z.enum(['name', 'email', 'role'])
          .optional()
          .default('name')
          .describe('Field to order the users by'),
        page: z.coerce.number().min(1).optional().default(1).describe('Page number for pagination, starting from 1'),
        limit: z.coerce.number().min(1).max(100).optional().default(10).describe('Number of users per page')
      }),
      response: {
        200: z.object({
          users: z.array(z.object({
            id: z.uuid(),
            name: z.string(),
            email: z.string(),
            role: z.string(),
          })),
          pagination: z.object({
            page: z.number(),
            limit: z.number(),
            total: z.number(),
            pages: z.number()
          })
        }),
        400: z.object({
          error: z.string(),
          details: z.string()
        }),
        403: z.object({
          error: z.string(),
          message: z.string()
        }),
        500: z.object({
          error: z.string(),
          code: z.string()
        })
      }
    },
  }, async (request, reply) => {
    try {

      const { search, orderBy, page, limit } = request.query;

      const conditions: SQL[] = [];
      const offset = (page - 1) * limit;

      if (search) {
        conditions.push(ilike(users.name, `%${search}%`));
      }

      const [result, totalUsers] = await Promise.all([
        db.select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
        })
          .from(users)
          .where(and(...conditions))
          .orderBy(asc(users[orderBy]))
          .limit(limit)
          .offset(offset),

        db.select({ count: count() })
          .from(users)
          .where(and(...conditions))
          .then((res) => res[0]?.count || 0)
      ]);

      const totalPages = Math.ceil(totalUsers / limit);

      return reply.code(200).send({
        users: result,
        pagination: {
          page,
          limit,
          total: totalUsers,
          pages: totalPages
        }
      });

    } catch (error) {
      request.log.error(`Error fetching users: ${error}`);

      return reply.code(500).send({
        error: 'Internal server error while fetching users',
        code: 'USERS_FETCH_FAILED'
      });
    }
  });

  // Rota para obter detalhes de um usuário específico
  server.get('/users/:id', {
    schema: {
      tags: ['users'],
      summary: 'Get user by ID with enrollment details',
      description: 'Retrieve a specific user with their course enrollments and teacher information',
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: z.uuid().describe('Unique identifier for the user'),
      }),
      response: {
        200: z.object({
          user: z.object({
            id: z.uuid(),
            name: z.string(),
            email: z.string(),
            role: z.string(),
            enrollments: z.array(z.object({
              enrollmentId: z.uuid(),
              enrolledAt: z.string(),
              enrollmentNumber: z.string(),
              isActive: z.boolean(),
              class: z.object({
                id: z.uuid(),
                name: z.string(),
                semester: z.string(),
                schedule: z.string(),
                course: z.object({
                  id: z.uuid(),
                  title: z.string(),
                  description: z.string(),
                  workload: z.string(),
                  department: z.string(),
                  teacher: z.object({
                    id: z.uuid(),
                    name: z.string(),
                    email: z.string()
                  })
                })
              })
            }))
          })
        }),
        403: z.object({
          error: z.string(),
          message: z.string()
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
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const userResult = await db.select()
        .from(users)
        .where(eq(users.id, id));

      if (userResult.length === 0) {
        return reply.code(404).send({
          error: 'User not found',
          details: `No user found with ID: ${id}`
        });
      }

      const user = userResult[0];

      // Get user enrollments with class, course, and teacher information
      const userEnrollments = await db.select({
        enrollmentId: enrollments.enrollmentId,
        enrolledAt: enrollments.enrolledAt,
        enrollmentNumber: enrollments.enrollment,
        isActive: enrollments.isActive,
        class: {
          id: classes.id,
          name: classes.name,
          semester: classes.semester,
          schedule: classes.schedule
        },
        course: {
          id: courses.id,
          title: courses.title,
          description: courses.description,
          workload: courses.workload,
          department: courses.department
        },
        teacher: {
          id: teachers.id,
          name: teachers.name,
          email: teachers.email
        }
      })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .innerJoin(courses, eq(classes.courseId, courses.id))
        .innerJoin(teachers, eq(classes.teacherId, teachers.id))
        .where(and(
          eq(enrollments.userId, id),
          eq(enrollments.isActive, true)
        )).orderBy(asc(enrollments.enrolledAt));

      const formattedUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        enrollments: userEnrollments.map(enrollment => ({
          enrollmentId: enrollment.enrollmentId,
          enrolledAt: enrollment.enrolledAt.toISOString(),
          enrollmentNumber: enrollment.enrollmentNumber,
          isActive: enrollment.isActive,
          class: {
            id: enrollment.class.id,
            name: enrollment.class.name,
            semester: enrollment.class.semester,
            schedule: enrollment.class.schedule,
            course: {
              id: enrollment.course.id,
              title: enrollment.course.title,
              description: enrollment.course.description,
              workload: enrollment.course.workload,
              department: enrollment.course.department,
              teacher: {
                id: enrollment.teacher.id,
                name: enrollment.teacher.name,
                email: enrollment.teacher.email
              }
            }
          }
        }))
      };

      return reply.code(200).send({ user: formattedUser });

    } catch (error) {
      request.log.error(`Error fetching user: ${error}`);
      return reply.code(500).send({
        error: 'Internal server error while fetching user',
        code: 'USER_FETCH_FAILED'
      });
    }
  });
};