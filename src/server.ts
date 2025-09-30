import { server } from "./api.ts";

server.listen({ port: 3000, }, (err, address) => {
  if (err) {
    console.error(err);
    server.close()
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
})