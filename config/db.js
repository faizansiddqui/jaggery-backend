import mongoose from "mongoose";
import { loadEnv } from "./env.js";
import { stripDatabasePathFromMongoUri } from "./mongoUri.js";

loadEnv();

const DEFAULT_DB = "Jaggery";

/**
 * Resolve DB name. Production envs often still have MONGO_DB_NAME=ecommerce from an old template.
 */
function resolveDatabaseName() {
  const raw = (process.env.MONGO_DB_NAME || "").trim();
  if (!raw) return DEFAULT_DB;
  const lower = raw.toLowerCase();
  if (lower === "ecommerce" || lower === "admin") {
    console.warn(
      `[config/db] MONGO_DB_NAME="${raw}" is not the Jaggery catalog — using "${DEFAULT_DB}". Set MONGO_DB_NAME=${DEFAULT_DB} or remove it.`
    );
    return DEFAULT_DB;
  }
  return raw;
}

export const connectDB = async () => {
  const uriRaw = process.env.MONGO_URI;
  if (!uriRaw) {
    throw new Error("MONGO_URI not set in environment");
  }
  const dbName = resolveDatabaseName();
  const uri = stripDatabasePathFromMongoUri(uriRaw.trim());

  try {
    await mongoose.connect(uri, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });

    const actual = mongoose.connection?.db?.databaseName;
    console.log(`✅ MongoDB connected (dbName option: ${dbName}, actual: ${actual ?? "?"})`);
    if (actual && actual !== dbName) {
      console.error(
        `[config/db] FATAL: Driver reports database "${actual}" but "${dbName}" was requested. Check MONGO_URI / deployment.`
      );
      await mongoose.disconnect();
      throw new Error(`MongoDB connected to wrong database: ${actual} (expected ${dbName})`);
    }
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    throw err;
  }
};

export default mongoose;
