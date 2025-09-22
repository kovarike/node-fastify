import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string(),
  DATABSE_URL: z.url(),
  NODE_ENV_DATABASE: z.url(),
  NODE_ENV_JWT: z.string(),
  SALT_ROUNDS: z.string().transform(val => Number(val)),
  SECRETET_JWT: z.string(),
  CURRENT_COOKIE_SECRETET: z.string(),
  PREVIOUS_COOKIE_SECRETET_1: z.string(),
  PREVIOUS_COOKIE_SECRETET_2: z.string(),  
  ALLOWED_ORIGINS: z.url(),
  ALLOWED_IP: z.string()
});

export const env = envSchema.parse(process.env);