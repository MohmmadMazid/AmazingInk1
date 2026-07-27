import mongoose from 'mongoose';
import { env } from './env.js';

import dns from "dns";


dns.setServers(["1.1.1.1", "8.8.8.8"]);/** Connect to MongoDB. Mongoose manages the connection pool. */
export async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri);
  console.log(`[db] connected to ${env.mongoUri.replace(/\/\/.*@/, '//***@')}`);
}
