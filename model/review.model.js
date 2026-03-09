import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema(
  {
    product_id: { type: Number, required: true, index: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, default: "" },
    user: { type: String, default: "Anonymous" },
    review_title: { type: String, default: "" },
    review_image: { type: String, default: "" },
  },
  { timestamps: true }
);

const Reviews = mongoose.model("Reviews", ReviewSchema);
export default Reviews;
