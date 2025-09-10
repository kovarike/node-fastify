import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { uuidv7 as uuidTimestamp } from "uuidv7";
import { generateEnrollmentNumber } from "../services/enrollments";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidTimestamp()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
});

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidTimestamp()),
  title: text("title").notNull().unique(),
  description: text("description"),
});

export const enrollments = pgTable("enrollments", {
  enrollmentId: uuid("enrollmentId").notNull().primaryKey().$defaultFn(() => uuidTimestamp()),
  userId: uuid("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  courseId: uuid("courseId").notNull().references(() => courses.id, { onDelete: "cascade"}),
  enrolledAt: timestamp("enrolledAt", {withTimezone: true}).notNull().defaultNow(),
  enrollment: text("enrollment").notNull().unique().$defaultFn(() => generateEnrollmentNumber()),
}, table =>[
  uniqueIndex().on(table.userId, table.courseId),
]);