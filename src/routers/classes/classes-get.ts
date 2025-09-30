import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { classes, courses, teachers } from '../../db/schema.ts';
import { and, count, eq } from 'drizzle-orm';

export const classesRouteGet: FastifyPluginAsyncZod = async (server) => {
  server.get('/classes', {
    schema: {
      tags: ['classes'],
      summary: 'List all classes',
      description: 'Retrieve a paginated list of all classes with optional filtering.',
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        courseId: z.uuid().optional().describe('Filter by course ID'),
        teacherId: z.uuid().optional().describe('Filter by teacher ID'),
        semester: z.string().optional().describe('Filter by semester'),
        page: z.coerce.number().min(1).optional().default(1),
        limit: z.coerce.number().min(1).max(100).optional().default(10)
      }),
      response: {
        200: z.object({
          classes: z.array(z.object({
            id: z.uuid(),
            courseId: z.uuid(),
            teacherId: z.uuid(),
            name: z.string(),
            semester: z.string(),
            schedule: z.string(),
            createdAt: z.string(),
            course: z.object({
              title: z.string(),
              description: z.string()
            }),
            teacher: z.object({
              name: z.string(),
              email: z.string()
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
      const { courseId, teacherId, semester, page, limit } = request.query;
      const offset = (page - 1) * limit;

      const conditions = [];
      if (courseId) conditions.push(eq(classes.courseId, courseId));
      if (teacherId) conditions.push(eq(classes.teacherId, teacherId));
      if (semester) conditions.push(eq(classes.semester, semester));

      const [classesList, totalResult] = await Promise.all([
        db.select({
          id: classes.id,
          courseId: classes.courseId,
          teacherId: classes.teacherId,
          name: classes.name,
          semester: classes.semester,
          schedule: classes.schedule,
          createdAt: classes.createdAt,
          course: {
            title: courses.title,
            description: courses.description
          },
          teacher: {
            name: teachers.name,
            email: teachers.email
          }
        })
          .from(classes)
          .innerJoin(courses, eq(classes.courseId, courses.id))
          .innerJoin(teachers, eq(classes.teacherId, teachers.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .limit(limit)
          .offset(offset)
          .orderBy(classes.createdAt),

        db.select({ count: count() })
          .from(classes)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .then((res) => res[0]?.count || 0)
      ]);

      const totalPages = Math.ceil(totalResult / limit);

      return reply.code(200).send({
        classes: classesList.map(c => ({
          ...c,
          createdAt: c.createdAt.toISOString()
        })),
        pagination: {
          page,
          limit,
          total: totalResult,
          pages: totalPages
        }
      });

    } catch (error) {
      request.log.error(`Error fetching classes: ${error}`);
      return reply.code(500).send({
        error: 'Internal server error while fetching classes',
        code: 'CLASSES_FETCH_FAILED'
      });
    }
  });

  // Rota GET para obter uma turma específica
  server.get('/classes/:id', {
    schema: {
      tags: ['classes'],
      summary: 'Get class by ID',
      description: 'Retrieve a specific class with complete details.',
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: z.uuid().describe('Class ID')
      }),
      response: {
        200: z.object({
          class: z.object({
            id: z.uuid(),
            courseId: z.uuid(),
            teacherId: z.uuid(),
            name: z.string(),
            semester: z.string(),
            schedule: z.string(),
            createdAt: z.string(),
            course: z.object({
              id: z.uuid(),
              title: z.string(),
              description: z.string(),
              workload: z.string(),
              department: z.string()
            }),
            teacher: z.object({
              id: z.uuid(),
              name: z.string(),
              email: z.string()
            })
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

      const [classItem] = await db.select({
        id: classes.id,
        courseId: classes.courseId,
        teacherId: classes.teacherId,
        name: classes.name,
        semester: classes.semester,
        schedule: classes.schedule,
        createdAt: classes.createdAt,
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
        .from(classes)
        .innerJoin(courses, eq(classes.courseId, courses.id))
        .innerJoin(teachers, eq(classes.teacherId, teachers.id))
        .where(eq(classes.id, id));

      if (!classItem) {
        return reply.code(404).send({
          error: 'Class not found',
          details: `No class found with ID: ${id}`
        });
      }

      return reply.code(200).send({
        class: {
          ...classItem,
          createdAt: classItem.createdAt.toISOString()
        }
      });

    } catch (error) {
      request.log.error(`Error fetching class: ${error}`);
      return reply.code(500).send({
        error: 'Internal server error while fetching class',
        code: 'CLASS_FETCH_FAILED'
      });
    }
  });
};