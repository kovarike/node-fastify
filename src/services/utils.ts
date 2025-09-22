import bcrypt from "bcrypt"
import { env } from "./env.ts"
import { randomBytes } from "node:crypto"
import {  type FastifyRequest } from 'fastify'

export async function hashPassword(password: string){
  return await bcrypt.hash(password, env.SALT_ROUNDS);
}

export async function isValidHashPassword(password: string, hash: string) {
  return await bcrypt.compare(password, hash);
}

export const currentSecret = randomBytes(32).toString('hex');


export function extractRole(requestRole: string, Id: string | null, requestLog?: FastifyRequest): boolean {

  const regex1 = [
    /teacher:([0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i,
    /teacher:([0-9a-f-]+)/
  ]

  const regex2 = [
    /admin:([0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i,
    /admin:([0-9a-f-]+)/
  ]

  try {

    if(Id === null){
      throw new Error("Error Id has the type null")
    }

    const match1 = regex1.map(i => requestRole.match(i));
    const match2 = regex2.map(i => requestRole.match(i));

    if (match1 || match2) {
      const res1 = match1.map(i => i?.[1]);
      const [id1, id2] = res1.map(i => {
        if (!i?.[0] || !i?.[1]) {
          return { message: "Invalid id" };
        }
        return i;
      });

      const res2 = match2.map(i => i?.[1]);
      const [id3, id4] = res2.map(i => {
        if (!i?.[0] || !i?.[1]) {
          return { message: "Invalid id" };
        }
        return i;
      });

      if (id1 === id2) {
        if(id1 === Id){

          return true;
        }
      } else if(id3 === id4){
        if(id3 === Id){

          return true;
        }
      }else {
        return false;
      }
    }
  } catch (error) {
    requestLog?.log.error(`Error in the permission check: ${error}`);
  }
  
  return false;
}