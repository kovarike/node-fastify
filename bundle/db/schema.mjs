import { uuidv7 } from 'uuidv7';
import { generateEnrollmentNumber } from '../services/enrollments.mjs';
import { e as entityKind, i as is, S as SQL, I as IndexedColumn, p as pgTable, t as text, u as uuid, a as timestamp } from '../table-BslGtHFL.mjs';

class IndexBuilderOn {
  constructor(unique, name) {
    this.unique = unique;
    this.name = name;
  }
  static [entityKind] = "PgIndexBuilderOn";
  on(...columns) {
    return new IndexBuilder(
      columns.map((it) => {
        if (is(it, SQL)) {
          return it;
        }
        it = it;
        const clonedIndexedColumn = new IndexedColumn(it.name, !!it.keyAsName, it.columnType, it.indexConfig);
        it.indexConfig = JSON.parse(JSON.stringify(it.defaultConfig));
        return clonedIndexedColumn;
      }),
      this.unique,
      false,
      this.name
    );
  }
  onOnly(...columns) {
    return new IndexBuilder(
      columns.map((it) => {
        if (is(it, SQL)) {
          return it;
        }
        it = it;
        const clonedIndexedColumn = new IndexedColumn(it.name, !!it.keyAsName, it.columnType, it.indexConfig);
        it.indexConfig = it.defaultConfig;
        return clonedIndexedColumn;
      }),
      this.unique,
      true,
      this.name
    );
  }
  /**
   * Specify what index method to use. Choices are `btree`, `hash`, `gist`, `spgist`, `gin`, `brin`, or user-installed access methods like `bloom`. The default method is `btree.
   *
   * If you have the `pg_vector` extension installed in your database, you can use the `hnsw` and `ivfflat` options, which are predefined types.
   *
   * **You can always specify any string you want in the method, in case Drizzle doesn't have it natively in its types**
   *
   * @param method The name of the index method to be used
   * @param columns
   * @returns
   */
  using(method, ...columns) {
    return new IndexBuilder(
      columns.map((it) => {
        if (is(it, SQL)) {
          return it;
        }
        it = it;
        const clonedIndexedColumn = new IndexedColumn(it.name, !!it.keyAsName, it.columnType, it.indexConfig);
        it.indexConfig = JSON.parse(JSON.stringify(it.defaultConfig));
        return clonedIndexedColumn;
      }),
      this.unique,
      true,
      this.name,
      method
    );
  }
}
class IndexBuilder {
  static [entityKind] = "PgIndexBuilder";
  /** @internal */
  config;
  constructor(columns, unique, only, name, method = "btree") {
    this.config = {
      name,
      columns,
      unique,
      only,
      method
    };
  }
  concurrently() {
    this.config.concurrently = true;
    return this;
  }
  with(obj) {
    this.config.with = obj;
    return this;
  }
  where(condition) {
    this.config.where = condition;
    return this;
  }
  /** @internal */
  build(table) {
    return new Index(this.config, table);
  }
}
class Index {
  static [entityKind] = "PgIndex";
  config;
  constructor(config, table) {
    this.config = { ...config, table };
  }
}
function uniqueIndex(name) {
  return new IndexBuilderOn(true, name);
}

const users = pgTable("users", {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
});
const courses = pgTable("courses", {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    title: text("title").notNull().unique(),
    description: text("description"),
});
const enrollments = pgTable("enrollments", {
    enrollmentId: uuid("enrollmentId").notNull().primaryKey().$defaultFn(() => uuidv7()),
    userId: uuid("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("courseId").notNull().references(() => courses.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolledAt", { withTimezone: true }).notNull().defaultNow(),
    enrollment: text("enrollment").notNull().unique().$defaultFn(() => generateEnrollmentNumber()),
}, table => [
    uniqueIndex().on(table.userId, table.courseId),
]);

export { courses, enrollments, users };
//# sourceMappingURL=schema.mjs.map
