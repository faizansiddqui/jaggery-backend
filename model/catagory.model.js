import mongoose from "mongoose";

const CatagorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);

export const Catagories = mongoose.model("Catagories", CatagorySchema);
export default Catagories;
