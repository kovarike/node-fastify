import type { FastifyRequest, FastifyReply } from 'fastify'
import { getAuthenticatedUserFromRequest } from '../../services/utils.ts'

export function checkUserRole(role: 'student' | 'admin' | 'teacher' | string) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const user = getAuthenticatedUserFromRequest(request)
  
    if (user.role !== role) {
      return reply.status(401).send()
    }
    return reply.status(200).send()
  }
}