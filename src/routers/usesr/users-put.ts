import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { and, ne, eq } from 'drizzle-orm'
import { db } from '../../db/client.ts';
import { users } from '../../db/schema.ts';
import { hashPassword } from '../../services/utils.ts';

export const usersRoutePut: FastifyPluginAsyncZod = async (server) => {
  server.put('/users/:id', {
    schema: {
      tags: ['users'],
      summary: 'Update a User by ID',
      description: 'Endpoint to update a user with required and optional fields. Users can update their own profile, admins can update any user.',
      security: [{ bearerAuth: [] }],
      params: z.object({
        id: z.uuid().describe('Unique identifier for the user'),
      }),
      body: z.object({
        name: z.string()
          .min(2, { message: 'Name must be at least 2 characters long' })
          .max(100, { message: 'Name must be at most 100 characters long' })
          .optional()
          .describe('Name of the user'),
        email: z.string()
          .email({ message: 'Invalid email format' })
          .optional()
          .describe('Email of the user'),
        password: z.string()
          .min(6, { message: 'Password must be at least 6 characters long' })
          .optional()
          .describe('Password of the user'),
        role: z.enum(['student', 'admin'])
          .optional()
          .describe('Role of the user - only admins can change roles'),
      }).partial().describe('Request body for updating a user'),
      response: {
        200: z.object({
          message: z.string(),
          user: z.object({
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
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const updateData = request.body;

      // Verify if the user exists
      const [existingUser] = await db.select()
        .from(users)
        .where(eq(users.id, id));

      if (!existingUser) {
        return reply.code(404).send({
          error: 'User not found',
          details: `No user found with ID: ${id}`
        });
      }

      // Check for duplicate email if email is being updated
      if (updateData.email && updateData.email !== existingUser.email) {
        const [duplicateUser] = await db.select()
          .from(users)
          .where(and(
            eq(users.email, updateData.email),
            ne(users.id, id)
          ))
          .limit(1);

        if (duplicateUser) {
          return reply.code(409).send({
            error: 'User with this email already exists',
            suggestedAction: 'Use a different email'
          });
        }
      }

      // Prepare data for update
      const updatePayload: any = { ...updateData };
      
      // Hash password if provided
      if (updateData.password) {
        updatePayload.password = await hashPassword(updateData.password);
      }

      // Execute the update and return the updated user
      const [updatedUser] = await db.update(users)
        .set(updatePayload)
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role
        });

      // Log the action
      request.log.info(`User updated: ${id}`);

      return reply.code(200).send({
        message: 'User successfully updated',
        user: updatedUser
      });

    } catch (error) {
      request.log.error(`Error updating user: ${error}`);

      return reply.code(500).send({
        error: 'Internal server error while updating user',
        code: 'USER_UPDATE_FAILED'
      });
    }
  });
};