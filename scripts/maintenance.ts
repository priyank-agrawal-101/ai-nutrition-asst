import { bootstrap } from "../src/server/bootstrap";
const app = bootstrap(process.env);
try {
  await app.maintain();
} finally {
  await app.database.close();
}
