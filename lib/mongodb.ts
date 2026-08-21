import { attachDatabasePool } from "@vercel/functions";
import type { MongoClient } from "mongodb";
import mongoose from "mongoose";

const getMongoUri = () => {
  const mongoUri = process.env.MONGODB_URI ?? process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("Please define MONGO_URI or MONGODB_URI in your environment");
  }

  return mongoUri;
};

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  poolAttached: boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache || {
  conn: null,
  promise: null,
  poolAttached: false,
};

global.mongooseCache = cached;

function getNativeMongoClient(mongooseInstance: typeof mongoose): MongoClient {
  return mongooseInstance.connection.getClient();
}

export async function connectDB() {
  if (cached.conn) return cached.conn;

  const mongoUri = getMongoUri();

  if (!cached.promise) {
    cached.promise = mongoose.connect(mongoUri, {
      bufferCommands: false,
    });
  }

  cached.conn = await cached.promise;

  if (!cached.poolAttached) {
    attachDatabasePool(getNativeMongoClient(cached.conn));
    cached.poolAttached = true;
  }

  return cached.conn;
}
