import mongoose from "mongoose";

const IngredientSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false }
);

const NutritionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false }
);

const HighlightSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false }
);

const VariantSchema = new mongoose.Schema(
  {
    label: { type: String, required: true }, // e.g., '250g', '1kg'
    stock: { type: Number, default: 0 },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    image: { type: String }, // single image per variant
    imagePublicId: { type: String },
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    product_id: { type: Number, unique: true, index: true },
    product_code: { type: String, unique: true, sparse: true, index: true },
    title: String,
    sku: { type: String, trim: true },
    name: { type: String, required: true },
    description: String,
    key_highlights: { type: [HighlightSchema], default: [] },
    catagory_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Catagories",
      required: true,
    },
    ingredients: { type: [IngredientSchema], default: [] },
    nutritions: { type: [NutritionSchema], default: [] },
    variants: { type: [VariantSchema], default: [] },
    status: {
      type: String,
      enum: ["draft", "published", "unpublished", "cancelled"],
      default: "draft",
    },
    draft_stage: {
      type: String,
      enum: ["category", "details", "media", "pricing", "variants", "complete"],
      default: "details",
    },
  },
  { timestamps: true }
);

export const Products = mongoose.model("Products", ProductSchema);
export default Products;
