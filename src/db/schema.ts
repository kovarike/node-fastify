import { pgTable, text, timestamp, uniqueIndex, uuid,  boolean, } from "drizzle-orm/pg-core";
import { uuidv7 as uuidTimestamp } from "uuidv7";
<<<<<<< HEAD
import { generateEnrollmentNumber } from "../services/enrollments.ts";
import { relations } from "drizzle-orm";
=======
import { generateEnrollmentNumber } from "../services/enrollments";
>>>>>>> main

export const users = pgTable("users", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidTimestamp()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("student")

});

export const teachers = pgTable("teachers", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidTimestamp()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("teacher")
});

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidTimestamp()),
  title: text("title").notNull(),
  description: text("description").notNull(),
  workload: text("workload").notNull(),
  department: text("department").notNull(),
  createdAt: timestamp("createdAt", {withTimezone: true}).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", {withTimezone: true}).notNull().defaultNow(),
  teachersId: uuid("teachersId").references(() => teachers.id, {onDelete: "cascade"}).notNull()
}, table => [
  uniqueIndex('ux_courses_title_teacher').on(table.title, table.teachersId)
]);


export const coursesRelations = relations(courses, ({ one }) => ({
  teacher: one(teachers, {
    fields: [courses.teachersId],
    references: [teachers.id]
  })
}));

export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidTimestamp()),
  courseId: uuid("courseId")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  teacherId: uuid("teacherId")
    .notNull()
    .references(() => teachers.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // ex.: "Turma A", "Turma B"
  semester: text("semester").notNull(), // ex.: "2025.1"
  schedule: text("schedule").notNull(), // ex.: "Seg e Qua - 19h às 21h"
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow()
});


export const enrollments = pgTable("enrollments", {
  enrollmentId: uuid("enrollmentId").notNull().primaryKey().$defaultFn(() => uuidTimestamp()),
  userId: uuid("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  classId: uuid("classId").notNull().references(() => classes.id, { onDelete: "cascade" }),
  enrolledAt: timestamp("enrolledAt", {withTimezone: true}).notNull().defaultNow(),
  enrollment: text("enrollment").notNull().unique().$defaultFn(() => generateEnrollmentNumber()),
  isActive: boolean("isActive").notNull().default(true)
}, table =>[
  uniqueIndex("ux_enrollments_userId_classId").on(table.userId, table.classId),
]);


export const classesRelations = relations(classes, ({ one, many }) => ({
  course: one(courses, {
    fields: [classes.courseId],
    references: [courses.id],
  }),
  teacher: one(teachers, {
    fields: [classes.teacherId],
    references: [teachers.id],
  }),
  enrollments: many(enrollments),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  user: one(users, {
    fields: [enrollments.userId],
    references: [users.id],
  }),
  class: one(classes, {
    fields: [enrollments.classId],
    references: [classes.id],
  }),
}));

