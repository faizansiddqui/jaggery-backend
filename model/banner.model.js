import mongoose from "mongoose";

const BannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, required: true, trim: true },
    imageUrl: { type: String, required: true, trim: true },
    imagePublicId: { type: String, default: "" },
    targetUrl: { type: String, required: true, trim: true },
    width: { type: Number, default: 1200 },
    height: { type: Number, default: 675 },
    order: { type: Number, default: 0, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

const Banner = mongoose.model("Banner", BannerSchema);
export default Banner;
