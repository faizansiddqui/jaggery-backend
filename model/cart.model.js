import mongoose from "mongoose";

const CartItemSchema = new mongoose.Schema(
  {
    product_id: { type: Number, required: true },
    color: { type: String, default: "" },
    size: { type: String, default: "" },
    qty: { type: Number, required: true, min: 1, default: 1 },
    price: { type: Number, default: 0 },
    mrp: { type: Number, default: 0 },
    title: { type: String, default: "Product" },
    image: { type: String, default: "" },
  },
  { _id: false }
);

const CartSchema = new mongoose.Schema(
  {
    cart_id: { type: String, required: true, unique: true, index: true, trim: true },
    email: { type: String, default: "", index: true, trim: true },
    items: { type: [CartItemSchema], default: [] },
  },
  { timestamps: true }
);

const Cart = mongoose.model("Cart", CartSchema);
export default Cart;
