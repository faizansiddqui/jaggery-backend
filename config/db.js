import mongoose from "mongoose";
import { loadEnv } from "./env.js";

loadEnv();

const uri = process.env.MONGO_URI;
/** Default must match this app’s Atlas database (see Data Explorer → Jaggery). */
const dbName = process.env.MONGO_DB_NAME || "Jaggery";

export const connectDB = async () => {
  if (!uri) {
    throw new Error("MONGO_URI not set in environment");
  }
  try {
    await mongoose.connect(uri, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`✅ MongoDB connected (database: ${dbName})`);
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    throw err;
  }
};

export default mongoose;
