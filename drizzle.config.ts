import { defineConfig } from "drizzle-kit";
import { env } from "./src/services/env"

export default defineConfig({
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABSE_URL || env.NODE_ENV_DATABASE,
  },  
  out: "./drizzle",
  schema: "./src/db/schema.ts",

});