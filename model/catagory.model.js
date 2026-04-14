import mongoose from "mongoose";

const CatagorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Catagories", default: null },
  },
  { timestamps: true }
);

// Create compound index for unique name per parent level
CatagorySchema.index({ name: 1, parentId: 1 }, { unique: true });

export const Catagories = mongoose.model("Catagories", CatagorySchema);
export default Catagories;
