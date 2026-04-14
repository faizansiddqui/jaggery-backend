import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
  {
    product_id: { type: Number, required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Products" },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    size: { type: String, default: "" },
    color: { type: String, default: "" },
    product_name: { type: String, default: "" },
    product_image: { type: String, default: "" },
  },
  { _id: false }
);

export default OrderItemSchema;
