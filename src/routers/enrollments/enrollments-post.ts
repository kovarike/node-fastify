import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { enrollments, users, classes } from '../../db/schema.ts';
import { and, eq } from 'drizzle-orm';

export const enrollmentsRoutePost: FastifyPluginAsyncZod = async (server) => {
  server.post('/enrollments', {
    schema: {
      tags: ['enrollments'],
      summary: 'Create a new Enrollment',
      description: 'Endpoint to create a new enrollment with required fields. Requires authentication.',
      security: [{ bearerAuth: [] }],
      body: z.object({
        userId: z.uuid().describe('ID of the user'),
        classId: z.uuid().describe('ID of the class'),
      }).describe('Request body for creating a new enrollment'),
      response: {
        201: z.object({
          message: z.string(),
          enrollment: z.object({
            enrollmentId: z.uuid(),
            userId: z.uuid(),
            classId: z.uuid(),
            enrolledAt: z.string(),
            enrollment: z.string(),
            isActive: z.boolean()
          })
        }),
        400: z.object({
          error: z.string(),
          details: z.string()
        }),
        409: z.object({
          error: z.string(),
          suggestedAction: z.string()
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
      const { userId, classId } = request.body;

      // Verificar se o usuário existe
      const [user] = await db.select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.code(404).send({
          error: 'User not found',
          details: `No user found with ID: ${userId}`
        });
      }

      // Verificar se a turma existe
      const [classItem] = await db.select()
        .from(classes)
        .where(eq(classes.id, classId))
        .limit(1);

      if (!classItem) {
        return reply.code(404).send({
          error: 'Class not found',
          details: `No class found with ID: ${classId}`
        });
      }

      // Verificar se já existe uma matrícula ativa para o mesmo usuário e turma
      const [existingEnrollment] = await db.select()
        .from(enrollments)
        .where(and(
          eq(enrollments.userId, userId),
          eq(enrollments.classId, classId),
          eq(enrollments.isActive, true)
        ))
        .limit(1);

      if (existingEnrollment) {
        return reply.code(409).send({
          error: 'Enrollment already exists',
          suggestedAction: 'User is already enrolled in this class'
        });
      }

      // Criar a matrícula
      const result = await db.insert(enrollments).values({
        userId,
        classId,
        // Os outros campos são preenchidos automaticamente:
        // enrollmentId, enrolledAt, enrollment, isActive
      }).returning({
        enrollmentId: enrollments.enrollmentId,
        userId: enrollments.userId,
        classId: enrollments.classId,
        enrolledAt: enrollments.enrolledAt,
        enrollment: enrollments.enrollment,
        isActive: enrollments.isActive
      });

      const newEnrollment = result[0];

      request.log.info(`Enrollment created: ${newEnrollment.enrollmentId}`);

      return reply.code(201).send({
        message: 'Enrollment successfully created',
        enrollment: {
          ...newEnrollment,
          enrolledAt: newEnrollment.enrolledAt.toISOString() // Converter para string ISO
        }
      });

    } catch (error) {
      request.log.error(`Error creating enrollment: ${error}`);

      return reply.code(500).send({
        error: 'Internal server error while creating enrollment',
        code: 'ENROLLMENT_CREATION_FAILED'
      });
    }
  });
};