import mongoose from "mongoose";

const SpecificationSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    product_id: { type: Number, unique: true, index: true },
    title: String,
    sku: { type: String, trim: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    selling_price: { type: Number, required: true },
    description: String,
    selling_price_link: { type: String },
    product_image: { type: [String], default: [] }, // array of URLs
    image_public_ids: { type: [String], default: [] },
    quantity: { type: Number, required: true, default: 0 },
    catagory_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Catagories",
      required: true,
    },
    specifications: { type: [SpecificationSchema], default: [] },
  },
  { timestamps: true }
);

export const Products = mongoose.model("Products", ProductSchema);
export default Products;
