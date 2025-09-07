import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import z from 'zod';
import { eq } from 'drizzle-orm'
import { db } from '../db/client.ts';
import { courses } from '../db/schema.ts';

export const coursesRoute: FastifyPluginAsyncZod = async (server) => {

  server.post('/courses', {
    schema: {
      tags: ['courses'],
      summary: 'Create a new course',
      description: 'Endpoint to create a new course with title and optional description',
      body: z.object({
        title: z.string()
          .min(3, { message: 'Title must be at least 3 characters long' })
          .max(100, { message: 'Title must be at most 100 characters long' }).describe('Title of the course'),

        description: z.string().optional().describe('Optional description of the course'),
      }),
      response: {
        201: z.object({
          courseID: z.uuid().describe('Unique identifier for the newly created course'),
        }).describe('Response containing the ID of the newly created course'),
      },
    }
  }, async (request, reply) => {
    const { title, description } = request.body;

    const result = await db.insert(courses).values({
      title,
      description,
    }).returning();
    return reply.code(201).send({ courseID: result[0].id });
  })

  server.get('/courses', {
    schema: {
      tags: ['courses'],
      summary: 'List all courses',
      description: 'Retrieve a list of all available courses',
      response: {
        200: z.object({
          courses: z.array(z.object({
            id: z.uuid().describe('Unique identifier for the course'),
            title: z.string().describe('Title of the course'),
            description: z.string().nullable().describe('Description of the course, can be null'),
          })),
        }).describe('An array of course objects'),
      },
    }
  }, async (request, reply) => {
    const result = await db.select().from(courses);
    return reply.code(200).send({ courses: result });
  })

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
            description: z.string().nullable().describe('Description of the course, can be null'),
          }).describe('The course object corresponding to the provided ID'),
        }),
        404: z.null().describe('Error message indicating the course was not found'),

      },
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const result = await db.select().from(courses).where(eq(courses.id, id));

    if (result.length > 0) {
      return reply.code(200).send({ course: result[0] });
    }

    return reply.code(404).send();
  })
}