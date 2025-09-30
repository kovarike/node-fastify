import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { classes, courses, teachers } from '../../db/schema.ts';
import { and, eq } from 'drizzle-orm';

export const classesRoutePost: FastifyPluginAsyncZod = async (server) => {
  server.post('/classes', {
    schema: {
      tags: ['classes'],
      summary: 'Create a new Class',
      description: 'Endpoint to create a new class with required fields. Requires authentication and appropriate role.',
      security: [{ bearerAuth: [] }],
      body: z.object({
        courseId: z.uuid().describe('ID of the course'),
        teacherId: z.uuid().describe('ID of the teacher'),
        name: z.string().min(1).describe('Name of the class (e.g., "Turma A")'),
        semester: z.string().min(1).describe('Semester (e.g., "2025.1")'),
        schedule: z.string().min(1).describe('Schedule (e.g., "Seg e Qua - 19h às 21h")'),
      }).describe('Request body for creating a new class'),
      response: {
        201: z.object({
          message: z.string(),
          class: z.object({
            id: z.uuid(),
            courseId: z.uuid(),
            teacherId: z.uuid(),
            name: z.string(),
            semester: z.string(),
            schedule: z.string(),
            createdAt: z.string(),
          })
        }),
        400: z.object({
          error: z.string(),
          details: z.string()
        }),
        404: z.object({
          error: z.string(),
          details: z.string()
        }),
        409: z.object({
          error: z.string(),
          suggestedAction: z.string()
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
      const { courseId, teacherId, name, semester, schedule } = request.body;

      // Verificar se o curso existe
      const [course] = await db.select()
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1);

      if (!course) {
        return reply.code(404).send({
          error: 'Course not found',
          details: `No course found with ID: ${courseId}`
        });
      }

      // Verificar se o professor existe
      const [teacher] = await db.select()
        .from(teachers)
        .where(eq(teachers.id, teacherId))
        .limit(1);

      if (!teacher) {
        return reply.code(404).send({
          error: 'Teacher not found',
          details: `No teacher found with ID: ${teacherId}`
        });
      }

      // Verificar se já existe uma turma com o mesmo nome, curso e semestre
      const [existingClass] = await db.select()
        .from(classes)
        .where(and(
          eq(classes.courseId, courseId),
          eq(classes.name, name),
          eq(classes.semester, semester)
        ))
        .limit(1);

      if (existingClass) {
        return reply.code(409).send({
          error: 'Class already exists',
          suggestedAction: 'Use a different name or semester for this course'
        });
      }

      // Criar a turma
      const result = await db.insert(classes).values({
        courseId,
        teacherId,
        name,
        semester,
        schedule,
        // createdAt é preenchido automaticamente
      }).returning({
        id: classes.id,
        courseId: classes.courseId,
        teacherId: classes.teacherId,
        name: classes.name,
        semester: classes.semester,
        schedule: classes.schedule,
        createdAt: classes.createdAt
      });

      const newClass = result[0];

      request.log.info(`Class created: ${newClass.id}`);

      return reply.code(201).send({
        message: 'Class successfully created',
        class: {
          ...newClass,
          createdAt: newClass.createdAt.toISOString()
        }
      });

    } catch (error) {
      request.log.error(`Error creating class: ${error}`);

      return reply.code(500).send({
        error: 'Internal server error while creating class',
        code: 'CLASS_CREATION_FAILED'
      });
    }
  });
};