# API Diagrams (Mermaid)

This file contains the main Mermaid diagrams referenced in the README.

## Login Sequence

```mermaid
sequenceDiagram
  participant Client
  participant API
  participant DB
  Client->>API: POST /auth/login (email,password)
  API->>API: Validate payload (Zod)
  API->>DB: SELECT user by email
  DB-->>API: user row
  API->>API: verify password
  API->>API: sign JWT
  API-->>Client: 200 OK + Set-Cookie / body { token }
```

## Auth Flow (flowchart)

```mermaid
flowchart TD
  U[User] --> A[POST /auth/login]
  A --> B[Validate payload (Zod)]
  B --> C[DB: verify user & password]
  C --> D{Valid?}
  D -- yes --> E[sign JWT & set cookie]
  D -- no --> F[401 Unauthorized]
  E --> U
```

## Component Diagram

```mermaid
graph LR
  Client[Client/browser] --> API[Fastify server]
  API --> Plugins["@fastify/jwt, @fastify/cookie, helmet, cors, rate-limit"]
  API --> Routers["src/routers/* (routes)"]
  Routers --> Services["src/services/* (utils, errors, middleware)"]
  Services --> DB[Postgres (Drizzle ORM)]
  Plugins --> AuthService["JWT handling"]
```

## CRUD Flow Example (POST /courses)

```mermaid
flowchart LR
  Client --> POST_COURSES[POST /courses]
  POST_COURSES --> Auth[authenticate middleware]
  Auth --> Validate[Zod validation]
  Validate --> Service["courses service"]
  Service --> DB[courses table insert]
  DB --> Service
  Service --> Response[201 Created]
  Response --> Client
```