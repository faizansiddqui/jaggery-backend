import mongoose from "mongoose";

const ProfileSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true },
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    gender: { type: String, enum: ["male", "female", "others"] },
    isBlocked: { type: Boolean, default: false },
    blockedReason: { type: String, default: "" },
    blockedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Profile = mongoose.model("Profile", ProfileSchema);
export default Profile;
