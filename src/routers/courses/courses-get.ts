import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { and, asc, count, eq, ilike, type SQL } from 'drizzle-orm'
import { db } from '../../db/client.ts';
import { courses, classes } from '../../db/schema.ts';

export const coursesRouteGet: FastifyPluginAsyncZod = async (server) => {
  server.get('/courses', {
    schema: {
      tags: ['courses'],
      summary: 'List all courses',
      description: 'Retrieve a paginated list of all available courses with optional search and ordering',
      querystring: z.object({
        search: z.string().optional().describe('Optional search term for filtering courses by title'),
        orderBy: z.enum(['id', 'title', 'createdAt', 'updatedAt'])
          .optional()
          .default('title')
          .describe('Field to order the courses by'),
        page: z.coerce.number().min(1).optional().default(1).describe('Page number for pagination, starting from 1'),
        limit: z.coerce.number().min(1).max(100).optional().default(10).describe('Number of courses per page')
      }),
      response: {
        200: z.object({
          courses: z.array(z.object({
            id: z.uuid(),
            title: z.string(),
            description: z.string(),
            department: z.string(),
            workload: z.string(),
            enrollments: z.number(),
            createdAt: z.date(),
            updatedAt: z.date(),
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
        500: z.object({
          error: z.string(),
          code: z.string()
        })
      }
    }
  }, async (request, reply) => {
    try {
      const { search, orderBy, page, limit } = request.query;

      const conditions: SQL[] = [];
      const offset = (page - 1) * limit;

      if (search) {
        conditions.push(ilike(courses.title, `%${search}%`));
      }

      const [result, totalCourses] = await Promise.all([
        db.select({
          id: courses.id,
          title: courses.title,
          description: courses.description,
          department: courses.department,
          workload: courses.workload,
          enrollments: count(classes.id),
          createdAt: courses.createdAt,
          updatedAt: courses.updatedAt
        })
        .from(courses)
        .leftJoin(classes, eq(classes.courseId, courses.id))
        .where(and(...conditions))
        .orderBy(asc(courses[orderBy]))
        .limit(limit)
        .offset(offset)
        .groupBy(courses.id),

        db.$count(courses, and(...conditions)),
      ]);

      const totalPages = Math.ceil(totalCourses / limit);

      return reply.code(200).send({
        courses: result,
        pagination: {
          page,
          limit,
          total: totalCourses,
          pages: totalPages
        }
      });

    } catch (error) {
      request.log.error(`Error fetching courses: ${error}`);
      
      return reply.code(500).send({
        error: 'Internal server error while fetching courses',
        code: 'COURSES_FETCH_FAILED'
      });
    }
  });

  server.get('/courses/:id', {
    schema: {
      tags: ['courses'],
      summary: 'Get course by ID',
      description: 'Retrieve a specific course using its unique ID',
      params: z.object({
        id: z.uuid().describe('Unique identifier for the course'),
      }),
      response: {
        200: z.object({
          course: z.object({
            id: z.uuid(),
            title: z.string(),
            description: z.string(),
            department: z.string(),
            workload: z.string(),
            enrollments: z.number(),
            createdAt: z.date(),
            updatedAt: z.date(),
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
    }
  }, async (request, reply) => {
    try {
      const { id } = request.params;

      const result = await db.select({
        id: courses.id,
        title: courses.title,
        description: courses.description,
        department: courses.department,
        workload: courses.workload,
        enrollments: count(classes.id),
        createdAt: courses.createdAt,
        updatedAt: courses.updatedAt,
      })
      .from(courses)
      .leftJoin(classes, eq(classes.courseId, courses.id))
      .where(eq(courses.id, id))
      .groupBy(courses.id);

      if (result.length === 0) {
        return reply.code(404).send({
          error: 'Course not found',
          details: `No course found with ID: ${id}`
        });
      }

      return reply.code(200).send({ course: result[0] });

    } catch (error) {
      request.log.error(`Error fetching course: ${error}`);
      
      return reply.code(500).send({
        error: 'Internal server error while fetching course',
        code: 'COURSE_FETCH_FAILED'
      });
    }
  });
};