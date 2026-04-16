import mongoose from "mongoose";

const CatagorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Legacy/active field used by controllers.
    parent: { type: mongoose.Schema.Types.ObjectId, ref: "Catagories", default: null },
    // Backward-compatible field retained for old documents.
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Catagories", default: null },
    ancestors: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId, ref: "Catagories", required: true },
        name: { type: String, required: true, trim: true },
      },
    ],
  },
  { timestamps: true }
);

// Keep parent references in sync across both fields.
CatagorySchema.pre("save", function syncParentRefs(next) {
  if (this.parent && !this.parentId) this.parentId = this.parent;
  if (this.parentId && !this.parent) this.parent = this.parentId;
  next();
});

// Create compound indexes for unique name per parent level.
CatagorySchema.index({ name: 1, parent: 1 }, { unique: true });
CatagorySchema.index({ name: 1, parentId: 1 }, { unique: true });

export const Catagories = mongoose.model("Catagories", CatagorySchema);
export default Catagories;
