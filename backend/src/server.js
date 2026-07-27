import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(env.port, () => console.log(`[api] MCCMS backend listening on :${env.port}`));
}
main().catch((err) => { console.error('fatal', err); process.exit(1); });
