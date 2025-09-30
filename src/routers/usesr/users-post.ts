import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { db } from '../../db/client.ts';
import { users } from '../../db/schema.ts'; // Changed from teachers to users
import { eq } from 'drizzle-orm';
import { hashPassword } from '../../services/utils.ts';

export const usersRoutePost: FastifyPluginAsyncZod = async (server) => {
  server.post('/users', {
    schema: {
      tags: ['users'],
      summary: 'Create a new User',
      description: 'Endpoint to create a new User with required fields. Can be public for user registration or admin-only for creating admin users.',
      body: z.object({
        name: z.string()
          .min(2, { message: 'Name must be at least 2 characters long' })
          .max(100, { message: 'Name must be at most 100 characters long' })
          .describe('Name of the user'),
        email: z.string()
          .email({ message: 'Invalid email format' })
          .describe('Email of the user'),
        password: z.string()
          .min(6, { message: 'Password must be at least 6 characters long' })
          .describe('Password of the user'),
        role: z.enum(['student', 'admin'])
          .optional()
          .default('student')
          .describe('Role of the user - defaults to student'),
      }).describe('Request body for creating a new user'),
      response: {
        201: z.object({
          message: z.string(),
          user: z.object({
            id: z.uuid(),
            name: z.string(),
            email: z.string(),
            role: z.string()
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
        500: z.object({
          error: z.string(),
          code: z.string()
        })
      }
    },
    // Optional: Add authentication if you want to restrict user creation to admins
    // preValidation: [server.authenticate],
  }, async (request, reply) => {
    try {
      const { email, name, password, role } = request.body;

      // Check for duplicate email
      const [existingUser] = await db.select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser) {
        return reply.code(409).send({
          error: 'User with this email already exists',
          suggestedAction: 'Use a different email or login with existing account'
        });
      }

      // Hash the password
      const passwordHash = await hashPassword(password);
      
      // Create the user
      const result = await db.insert(users).values({
        name,
        email,
        password: passwordHash,
        role: role || 'student' // Default to 'student' if not provided
      }).returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role
      });

      const newUser = result[0];

      request.log.info(`User created: ${newUser.id}`);

      return reply.code(201).send({
        message: 'User successfully created',
        user: newUser
      });

    } catch (error) {
      request.log.error(`Error creating user: ${error}`);

      return reply.code(500).send({
        error: 'Internal server error while creating user',
        code: 'USER_CREATION_FAILED'
      });
    }
  });
};