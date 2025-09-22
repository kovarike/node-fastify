import z from 'zod';
import { ilike, count, eq, and, asc } from 'drizzle-orm';
import { db } from '../db/client.mjs';
import { courses, enrollments } from '../db/schema.mjs';
import 'pg';
import '../table-BslGtHFL.mjs';
import 'uuidv7';
import '../services/enrollments.mjs';

const coursesRoute = async (server) => {
    //route to create a new course
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
    });
    //route to list all courses with optional search and ordering
    server.get('/courses', {
        schema: {
            tags: ['courses'],
            summary: 'List all courses',
            description: 'Retrieve a list of all available courses',
            querystring: z.object({
                search: z.string().optional().describe('Optional server identifier for filtering courses'),
                orderBy: z.enum(['id', 'title']).optional().default('title').describe('Field to order the courses by, either title or creation date'),
                page: z.coerce.number().optional().default(1).describe('Page number for pagination, starting from 1'),
            }),
            response: {
                200: z.object({
                    courses: z.array(z.object({
                        id: z.uuid().describe('Unique identifier for the course'),
                        title: z.string().describe('Title of the course'),
                        description: z.string().nullable().describe('Description of the course, can be null'),
                        enrollments: z.number().describe('Number of enrollments in the course'),
                    })),
                    total: z.number().describe('Total number of courses available'),
                }).describe('An array of course objects'),
            },
        }
    }, async (request, reply) => {
        const { search, orderBy, page } = request.query;
        const conditions = [];
        if (search) {
            conditions.push(ilike(courses.title, `%${search}%`));
        }
        const [result, totalCourses] = await Promise.all([
            db.select({
                id: courses.id,
                title: courses.title,
                description: courses.description,
                enrollments: count(enrollments.enrollmentId),
            }).from(courses).leftJoin(enrollments, eq(enrollments.courseId, courses.id))
                .where(and(...conditions)).orderBy(asc(courses[orderBy])).limit(5).offset((page - 1) * 2).groupBy(courses.id),
            db.$count(courses, and(...conditions)),
        ]);
        return reply.code(200).send({ courses: result, total: totalCourses });
    });
    //route to get a course by id
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
    });
};

export { coursesRoute };
//# sourceMappingURL=couses-route.mjs.map
