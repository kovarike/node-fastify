import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { and, ne, eq, } from 'drizzle-orm'
import { db } from '../../db/client.ts';
import { teachers } from '../../db/schema.ts';
import { extractRole, hashPassword } from '../../services/utils.ts';
import { checkUserRole } from '../hook/check-user-role.ts';

export const teachersRoutePut: FastifyPluginAsyncZod = async (server) => {
  server.put('/teachers/:id', {
    schema: {
      tags: ['teachers'],
      summary: 'Update a Teacher',
      description: 'Endpoint to update a Teacher with required and optional fields. Requires authentication and appropriate role.',
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: z.uuid().describe('Unique identifier for the Teacher'),
      }),
      body: z.object({
        name: z.string()
          .describe('Name of the Teacher'),
        email: z.email({ message: 'Invalid email format' })
          .describe('Email of the Teacher'),
        password: z.string()
          .optional()
          .describe('Password of the Teacher'),
        role: z.enum(['teacher', 'admin'])
          .optional()
          .describe('Role of the user - only admins can change roles'),
      }).partial().describe('Request body for updating a Teacher'),
      response: {
        200: z.object({
          message: z.string(),
          teacher: z.object({
            id: z.uuid(),
            name: z.string(),
            email: z.string(),
            role: z.string(),
          })
        }),
        400: z.object({
          error: z.string(),
          details: z.string()
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
      // Check if user has permission to update teachers
      // Only admins should be able to update teachers
      // if (checkUserRole(request.user.role)) {
      //   return reply.code(403).send({
      //     error: 'Forbidden',
      //     message: 'Only admins can update teachers'
      //   });
      // }

      const { id } = request.params;
      const updateData = request.body;

      // Verify if the teacher exists
      const [existingTeacher] = await db.select()
        .from(teachers)
        .where(eq(teachers.id, id));

      if (!existingTeacher) {
        return reply.code(404).send({
          error: 'Teacher not found',
          details: `No Teacher found with ID: ${id}`
        });
      }

      // Check for duplicate email if email is being updated
      if (updateData.email && updateData.email !== existingTeacher.email) {
        const [duplicateTeacher] = await db.select()
          .from(teachers)
          .where(and(
            eq(teachers.email, updateData.email),
            ne(teachers.id, id)
          ))
          .limit(1);

        if (duplicateTeacher) {
          return reply.code(409).send({
            error: 'Teacher with this email already exists',
            suggestedAction: 'Use a different email or update the existing teacher'
          });
        }
      }

      // Prepare data for update
      const updatePayload = { ...updateData };
      
      // Hash password if provided
      if (updateData.password) {
        updatePayload.password = await hashPassword(updateData.password);
      }

      // Execute the update and return the updated teacher
      const [updatedTeacher] = await db.update(teachers)
        .set(updatePayload)
        .where(eq(teachers.id, id))
        .returning({
          id: teachers.id,
          name: teachers.name,
          email: teachers.email,
          role: teachers.role
        });

      // Log the action
      request.log.info(`Teacher updated: ${id}`);

      return reply.code(200).send({
        message: 'Teacher successfully updated',
        teacher: updatedTeacher
      });

    } catch (error) {
      // Handle specific validation errors from Zod
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'Validation failed',
          details: error.message
        });
      }

      request.log.error(`Error updating Teacher: ${error}`);

      return reply.code(500).send({
        error: 'Internal server error while updating Teacher',
        code: 'TEACHER_UPDATE_FAILED'
      });
    }
  });
};