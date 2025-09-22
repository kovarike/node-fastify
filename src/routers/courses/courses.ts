import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { and, asc, count, eq, ilike, type SQL } from 'drizzle-orm'
import { db } from '../db/client.ts';
import { courses, enrollments, users } from '../db/schema.ts'; // Adicione a tabela users
import { env } from '../services/env.ts';

export const coursesRoute: FastifyPluginAsyncZod = async (server) => {
  // Rota para criar um novo curso (PROTEGIDA)
  server.post('/courses', {
    schema: {
      tags: ['courses'],
      summary: 'Create a new course',
      description: 'Endpoint to create a new course. Requires authentication and instructor role.',
      security: [{ bearerAuth: [] }],
      body: z.object({
        title: z.string()
          .min(3, { message: 'Title must be at least 3 characters long' })
          .max(100, { message: 'Title must be at most 100 characters long' })
          .describe('Title of the course'),
        description: z.string()
          .max(500, { message: 'Description must be at most 500 characters long' })
          .optional()
          .describe('Detailed description of the course'),
        department: z.string()
          .min(2, { message: 'Department must be at least 2 characters long' })
          .max(50, { message: 'Department must be at most 50 characters long' })
          .describe('Academic department offering the course'),
        classes: z.string()
          .max(200, { message: 'Classes information must be at most 200 characters long' })
          .optional()
          .describe('Class schedule and meeting times'),
        workload: z.string()
          .max(100, { message: 'Workload must be at most 100 characters long' })
          .optional()
          .describe('Expected workload and hours required')
      }).describe('Request body for creating a new course'),
      response: {
        201: z.object({
          courseID: z.uuid().describe('Unique identifier for the newly created course'),
          title: z.string().describe('Title of the created course')
        }).describe('Response containing details of the newly created course'),
        400: z.object({
          error: z.string().describe('Error message describing the validation failure'),
          details: z.array(z.object({
            field: z.string().optional(),
            message: z.string()
          })).optional()
        }),
        401: z.object({
          error: z.string().describe('Authentication error message')
        }),
        403: z.object({
          error: z.string().describe('Authorization error message')
        }),
        409: z.object({
          error: z.string().describe('Conflict error message'),
          suggestedAction: z.string().optional()
        }),
        500: z.object({
          error: z.string().describe('Server error message'),
          code: z.string().optional()
        })
      }
    },
    preValidation: [server.authenticate],
    validatorCompiler: ({ schema }) => {
      return (data) => schema.parse(data)
    }
  }, async (request, reply) => {
    try {
      // Verificar se o usuário tem permissão de instrutor
      if (request.user.role !== 'instructor') {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Only instructors can create courses'
        });
      }

      const { title, description, department, classes, workload } = request.body;

      // Verificação de duplicidade
      const existingCourse = await db.select()
        .from(courses)
        .where(eq(courses.title, title))
        .limit(1);

      if (existingCourse.length > 0) {
        return reply.code(409).send({
          error: 'Course with this title already exists',
          suggestedAction: 'Use a different title or update the existing course'
        });
      }

      // Inserção no banco de dados
      const result = await db.insert(courses).values({
        title,
        description: description || null,
        department,
        classes: classes || null,
        workload: workload || null,
        createdBy: request.user.id, // Usar ID do usuário autenticado
        createdAt: new Date(),
        updatedAt: new Date()
      }).returning({
        id: courses.id,
        title: courses.title
      });

      // Log de auditoria
      request.log.info(`Course created: ${result[0].id} by user ${request.user.id}`);

      return reply.code(201).send({
        courseID: result[0].id,
        title: result[0].title
      });

    } catch (error) {
      // Tratamento específico para erros de validação do Zod
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation failed',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }

      request.log.error(`Error creating course: ${error}`);

      return reply.code(500).send({
        error: 'Internal server error while creating course',
        code: 'COURSE_CREATION_FAILED'
      });
    }
  });

  // Rota para listar todos os cursos (PÚBLICA)
  server.get('/courses', {
    schema: {
      tags: ['courses'],
      summary: 'List all courses',
      description: 'Retrieve a list of all available courses',
      querystring: z.object({
        search: z.string().optional().describe('Optional search term for filtering courses'),
        orderBy: z.enum(['id', 'title']).optional().default('title').describe('Field to order the courses by'),
        page: z.coerce.number().optional().default(1).describe('Page number for pagination, starting from 1'),
      }),
      response: {
        200: z.object({
          courses: z.array(z.object({
            id: z.uuid().describe('Unique identifier for the course'),
            title: z.string().describe('Title of the course'),
            description: z.string().nullable().describe('Description of the course'),
            department: z.string().describe('Department of the course'),
            classes: z.string().nullable().describe('Class schedule'),
            workload: z.string().nullable().describe('Course workload'),
            enrollments: z.number().describe('Number of enrollments in the course'),
          })),
          total: z.number().describe('Total number of courses available'),
        }).describe('An array of course objects'),
      },
    }
  }, async (request, reply) => {
    const { search, orderBy, page } = request.query;

    const conditions: SQL[] = []; 

    if (search) {
      conditions.push(ilike(courses.title, `%${search}%`));
    }

    const [result, totalCourses] = await Promise.all([
      db.select({
        id: courses.id,
        title: courses.title,
        description: courses.description,
        department: courses.department,
        classes: courses.classes,
        workload: courses.workload,
        enrollments: count(enrollments.enrollmentId),
      })
      .from(courses)
      .leftJoin(enrollments, eq(enrollments.courseId, courses.id))
      .where(and(...conditions))
      .orderBy(asc(courses[orderBy]))
      .limit(10)
      .offset((page - 1) * 10)
      .groupBy(courses.id),

      db.$count(courses, and(...conditions)),
    ]);

    return reply.code(200).send({ courses: result, total: totalCourses });
  });

  // Rota para obter um curso por ID (PÚBLICA)
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
            id: z.uuid().describe('Unique identifier for the course'),
            title: z.string().describe('Title of the course'),
            description: z.string().nullable().describe('Description of the course'),
            department: z.string().describe('Department of the course'),
            classes: z.string().nullable().describe('Class schedule'),
            workload: z.string().nullable().describe('Course workload'),
            enrollments: z.number().describe('Number of enrollments in the course'),
          }).describe('The course object corresponding to the provided ID'),
        }),
        404: z.object({
          error: z.string().describe('Error message indicating the course was not found'),
          details: z.string().optional()
        })
      },
    }
  }, async (request, reply) => {
    const { id } = request.params;
    
    const result = await db.select({
      id: courses.id,
      title: courses.title,
      description: courses.description,
      department: courses.department,
      classes: courses.classes,
      workload: courses.workload,
      enrollments: count(enrollments.enrollmentId),
    })
    .from(courses)
    .leftJoin(enrollments, eq(enrollments.courseId, courses.id))
    .where(eq(courses.id, id))
    .groupBy(courses.id);

    if (result.length > 0) {
      return reply.code(200).send({ course: result[0] });
    }

    return reply.code(404).send({
      error: 'Course not found',
      details: `No course found with ID: ${id}`
    });
  });

  // Rota para deletar um curso (PROTEGIDA)
  server.delete('/courses/:id', {
    schema: {
      tags: ['courses'],
      summary: 'Delete course by ID',
      description: 'Delete a specific course using its unique ID. Requires authentication and instructor role.',
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
          details: z.string().optional()
        }),
        403: z.object({
          error: z.string(),
          details: z.string().optional()
        }),
        404: z.object({
          error: z.string(),
          details: z.string().optional()
        }),
        500: z.object({
          error: z.string(),
          details: z.string()
        })
      },
      security: [{ bearerAuth: [] }]
    },
    preValidation: [server.authenticate]
  }, async (request, reply) => {
    try {
      // Verificar se o usuário tem permissão de instrutor
      if (request.user.role !== 'instructor') {
        return reply.code(403).send({
          error: 'Forbidden',
          details: 'Only instructors can delete courses'
        });
      }

      const { id } = request.params;

      // Verificar se o curso existe antes de tentar excluir
      const [course] = await db.select().from(courses).where(eq(courses.id, id));

      if (!course) {
        return reply.code(404).send({
          error: 'Course not found',
          details: `No course found with ID: ${id}`
        });
      }

      // Verificar se o usuário é o criador do curso (opcional)
      if (course.createdBy !== request.user.id && request.user.role !== 'admin') {
        return reply.code(403).send({
          error: 'Forbidden',
          details: 'You can only delete courses that you created'
        });
      }

      // Executar a exclusão
      await db.delete(courses).where(eq(courses.id, id));

      // Registrar a ação
      request.log.info(`Course deleted: ${id} by user ${request.user.id}`);

      return reply.code(200).send({
        message: 'Course successfully deleted',
        deletedId: id
      });

    } catch (error) {
      request.log.error(`Error deleting course: ${error}`);
      
      return reply.code(500).send({
        error: 'Internal server error',
        details: "Internal server error"
      });
    }
  });
};