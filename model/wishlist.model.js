import mongoose from "mongoose";

const WishlistSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, index: true, trim: true },
    product_id: { type: Number, required: true, index: true },
  },
  { timestamps: true }
);

WishlistSchema.index({ email: 1, product_id: 1 }, { unique: true });

const Wishlist = mongoose.model("Wishlist", WishlistSchema);
export default Wishlist;
