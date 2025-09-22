import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../services/env.ts";

export const db = drizzle(env.DATABSE_URL);