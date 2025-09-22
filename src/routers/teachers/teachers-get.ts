import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { and, asc, count, eq, ilike, type SQL } from 'drizzle-orm'
import { db } from '../../db/client.ts';
import { courses, classes, enrollments, teachers } from '../../db/schema.ts';

export const coursesRouteGet: FastifyPluginAsyncZod = async (server) => {
  server.get('/teachers', {
    schema: {
      tags: ['teachers'],
      summary: 'List all courses',
      description: 'Retrieve a paginated list of all available Teacher with optional search and ordering',
      querystring: z.object({
        search: z.string().optional().describe('Optional search term for filtering Teacher by name'),
        orderBy: z.enum(['name', 'id'])
          .optional()
          .default('name')
          .describe('Field to order the Teacher by'),
        page: z.coerce.number().min(1).optional().default(1).describe('Page number for pagination, starting from 1'),
        limit: z.coerce.number().min(1).max(100).optional().default(10).describe('Number of Teacher per page')
      }),
      response: {
        200: z.object({
          teachers: z.array(z.object({
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
        conditions.push(ilike(teachers.name, `%${search}%`));
      }

      const [result, totalTeachers] = await Promise.all([
        db.select({
          id: teachers.id,
          name: teachers.name,
          email: teachers.email,
          role: teachers.role,
        })
          .from(teachers)
          .where(and(...conditions))
          .orderBy(asc(teachers[orderBy]))
          .limit(limit)
          .offset(offset),

        db.select({ count: count() })
          .from(teachers)
          .where(and(...conditions))
          .then((res) => res[0]?.count || 0)
      ]);

      const totalPages = Math.ceil(totalTeachers / limit);

      return reply.code(200).send({
        teachers: result,
        pagination: {
          page,
          limit,
          total: totalTeachers,
          pages: totalPages
        }
      });

    } catch (error) {
      request.log.error(`Error fetching Teacher: ${error}`);

      return reply.code(500).send({
        error: 'Internal server error while fetching Teacher',
        code: 'TEACHER_FETCH_FAILED'
      });
    }
  });

  // server.get('/teachers/:id', {
  //   schema: {
  //     tags: ['teachers'],
  //     summary: 'Get Teacher by ID',
  //     description: 'Retrieve a specific Teacher using its unique ID',
  //     params: z.object({
  //       id: z.uuid().describe('Unique identifier for the Teacher'),
  //     }),
  //     response: {
  //       200: z.object({
  //         teacher: z.object({
  //           id: z.uuid(),
  //         name: z.string(),
  //         email: z.string(),
  //         role: z.string(),
  //         courses: z.array(z.object({
  //           id: z.uuid(),
  //           title: z.string(),
  //           classes: z.array(z.object({
  //             id: z.uuid(),
  //             name: z.string(),
  //             semester: z.string(),
  //             schedule: z.string(),
  //             enrolledStudents: z.number()
  //           }))
  //         }))
  //         })
  //       }),
  //       404: z.object({
  //         error: z.string(),
  //         details: z.string()
  //       }),
  //       500: z.object({
  //         error: z.string(),
  //         code: z.string()
  //       })
  //     }
  //   }
  // }, async (request, reply) => {
  //   try {
  //     const { id } = request.params;

  //     const teacher = await db.query.teachers.findFirst({
  //       where: eq(teachers.id, id),
  //       with: {
  //         courses: {
  //           with: {
  //             classes: {
  //               with: {
  //                 enrollments: {
  //                   where: eq(enrollments.isActive, true),
  //                   columns: { enrollmentId: true }
  //                 }
  //               }
  //             }
  //           }
  //         }
  //       }
  //     });

  //     if (!teacher) {
  //       return reply.code(404).send({
  //         error: 'Teacher not found',
  //         details: `No teacher found with ID: ${id}`
  //       });
  //     }

  //     const formattedTeacher = {
  //       id: teacher.id,
  //       name: teacher.name,
  //       email: teacher.email,
  //       role: teacher.role,
  //       courses: teacher.courses.map(course => ({
  //         id: course.id,
  //         title: course.title,
  //         classes: course.classes.map(classItem => ({
  //           id: classItem.id,
  //           name: classItem.name,
  //           semester: classItem.semester,
  //           schedule: classItem.schedule,
  //           enrolledStudents: classItem.enrollments.length
  //         }))
  //       }))
  //     };

  //     return reply.code(200).send({ teacher: formattedTeacher });

  //   } catch (error) {
  //     request.log.error(`Error fetching teacher: ${error}`);
  //     return reply.code(500).send({
  //       error: 'Internal server error while fetching teacher',
  //       code: 'TEACHER_FETCH_FAILED'
  //     });
  //   }
  // });


  server.get('/teachers/:id', {
    schema: {
      tags: ['teachers'],
      summary: 'Get Teacher by ID',
      description: 'Retrieve a specific Teacher using its unique ID',
      params: z.object({
        id: z.uuid().describe('Unique identifier for the Teacher'),
      }),
      response: {
        200: z.object({
          teacher: z.object({
            id: z.uuid(),
            name: z.string(),
            email: z.string(),
            role: z.string(),
            courses: z.array(z.object({
              id: z.uuid(),
              title: z.string(),
              classes: z.array(z.object({
                id: z.uuid(),
                name: z.string(),
                semester: z.string(),
                schedule: z.string(),
                enrolledStudents: z.number()
              }))
            }))
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

      // First, get the teacher details
      const teacherResult = await db.select()
        .from(teachers)
        .where(eq(teachers.id, id));

      if (teacherResult.length === 0) {
        return reply.code(404).send({
          error: 'Teacher not found',
          details: `No teacher found with ID: ${id}`
        });
      }

      const teacher = teacherResult[0];

      // Get courses taught by this teacher
      const coursesResult = await db.select()
        .from(courses)
        .where(eq(courses.teachersId, id));

      // Get classes for each course with enrollment counts
      const coursesWithClasses = await Promise.all(
        coursesResult.map(async (course) => {
          const classesResult = await db.select({
            class: classes,
            enrollmentCount: count(enrollments.enrollmentId)
          })
            .from(classes)
            .leftJoin(enrollments, and(
              eq(classes.id, enrollments.classId),
              eq(enrollments.isActive, true)
            ))
            .where(eq(classes.courseId, course.id))
            .groupBy(classes.id);

          return {
            id: course.id,
            title: course.title,
            classes: classesResult.map((item) => ({
              id: item.class.id,
              name: item.class.name,
              semester: item.class.semester,
              schedule: item.class.schedule,
              enrolledStudents: Number(item.enrollmentCount)
            }))
          };
        })
      );

      const formattedTeacher = {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        role: teacher.role,
        courses: coursesWithClasses
      };

      return reply.code(200).send({ teacher: formattedTeacher });

    } catch (error) {
      request.log.error(`Error fetching teacher: ${error}`);
      return reply.code(500).send({
        error: 'Internal server error while fetching teacher',
        code: 'TEACHER_FETCH_FAILED'
      });
    }
  });
};