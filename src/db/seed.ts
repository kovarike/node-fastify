import { db } from './client';
import { users, courses, enrollments } from './schema';
import { fakerPT_BR as faker } from '@faker-js/faker';

export async function seed() {
  // Seed users
  const userData = Array.from({ length: 10 }).map(() => ({
    name: faker.person.fullName(),
    email: faker.internet.email(),
  }));
  await db.insert(users).values(userData).returning();

  // Seed courses
  const courseData = Array.from({ length: 5 }).map(() => ({
    title: faker.lorem.words(10),
    description: faker.lorem.sentence(),
  }));
  await db.insert(courses).values(courseData).returning();

  // Fetch inserted users and courses
  const insertedUsers = await db.select().from(users);
  const insertedCourses = await db.select().from(courses);

  // Seed enrollments
  const enrollmentData: { userId: string; courseId: string; }[] = [];

  for (const course of insertedCourses) {
    // Quantidade de usuários nesse curso (1 até todos os usuários possíveis)
    const numEnrollments = faker.number.int({ min: 1, max: insertedUsers.length });

    // Escolhe usuários aleatórios (sem repetição por curso)
    const selectedUsers = faker.helpers.arrayElements(insertedUsers, numEnrollments);

    for (const user of selectedUsers) {
      enrollmentData.push({
        userId: user.id,
        courseId: course.id,
      });
    }
  }

  await db.insert(enrollments).values(enrollmentData).returning();

  console.log('Database seeded!');
}
seed();