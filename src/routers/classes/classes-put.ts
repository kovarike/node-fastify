import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { classes, courses, teachers } from '../../db/schema.ts';
import { and, eq, ne } from 'drizzle-orm';

export const classesRoutePut: FastifyPluginAsyncZod = async (server) => {
  server.put('/classes/:id', {
    schema: {
      tags: ['classes'],
      summary: 'Update a class',
      description: 'Update class information.',
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: z.uuid().describe('Class ID')
      }),
      body: z.object({
        courseId: z.uuid().optional(),
        teacherId: z.uuid().optional(),
        name: z.string().min(1).optional(),
        semester: z.string().min(1).optional(),
        schedule: z.string().min(1).optional()
      }).partial(),
      response: {
        200: z.object({
          message: z.string(),
          class: z.object({
            id: z.uuid(),
            courseId: z.uuid(),
            teacherId: z.uuid(),
            name: z.string(),
            semester: z.string(),
            schedule: z.string(),
            createdAt: z.string()
          })
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
      const { id } = request.params;
      const updateData = request.body;

      const [existingClass] = await db.select()
        .from(classes)
        .where(eq(classes.id, id));

      if (!existingClass) {
        return reply.code(404).send({
          error: 'Class not found',
          details: `No class found with ID: ${id}`
        });
      }

      // Verificar se o curso existe (se estiver sendo atualizado)
      if (updateData.courseId && updateData.courseId !== existingClass.courseId) {
        const [course] = await db.select()
          .from(courses)
          .where(eq(courses.id, updateData.courseId))
          .limit(1);

        if (!course) {
          return reply.code(404).send({
            error: 'Course not found',
            details: `No course found with ID: ${updateData.courseId}`
          });
        }
      }

      // Verificar se o professor existe (se estiver sendo atualizado)
      if (updateData.teacherId && updateData.teacherId !== existingClass.teacherId) {
        const [teacher] = await db.select()
          .from(teachers)
          .where(eq(teachers.id, updateData.teacherId))
          .limit(1);

        if (!teacher) {
          return reply.code(404).send({
            error: 'Teacher not found',
            details: `No teacher found with ID: ${updateData.teacherId}`
          });
        }
      }

      // Verificar conflitos de nome/semestre/curso
      if (updateData.name || updateData.semester || updateData.courseId) {
        const name = updateData.name ?? existingClass.name;
        const semester = updateData.semester ?? existingClass.semester;
        const courseId = updateData.courseId ?? existingClass.courseId;

        const [conflictingClass] = await db.select()
          .from(classes)
          .where(and(
            eq(classes.courseId, courseId),
            eq(classes.name, name),
            eq(classes.semester, semester),
            ne(classes.id, id)
          ))
          .limit(1);

        if (conflictingClass) {
          return reply.code(409).send({
            error: 'Class conflict',
            suggestedAction: 'A class with this name already exists for the same course and semester'
          });
        }
      }

      const [updatedClass] = await db.update(classes)
        .set(updateData)
        .where(eq(classes.id, id))
        .returning({
          id: classes.id,
          courseId: classes.courseId,
          teacherId: classes.teacherId,
          name: classes.name,
          semester: classes.semester,
          schedule: classes.schedule,
          createdAt: classes.createdAt
        });

      return reply.code(200).send({
        message: 'Class successfully updated',
        class: {
          ...updatedClass,
          createdAt: updatedClass.createdAt.toISOString()
        }
      });

    } catch (error) {
      request.log.error(`Error updating class: ${error}`);
      return reply.code(500).send({
        error: 'Internal server error while updating class',
        code: 'CLASS_UPDATE_FAILED'
      });
    }
  });
};