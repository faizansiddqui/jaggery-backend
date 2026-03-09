import mongoose from "mongoose";
import OrderItemSchema from "./orderItem.model.js";

const OrdersSchema = new mongoose.Schema(
  {
    order_id: { type: Number, unique: true, index: true },
    status: { type: String, default: "pending" },
    payment_status: { type: String, default: "pending" },
    payment_method: { type: String, default: "Payoneer" },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    razorpay_order_id: { type: String },
    razorpay_payment_id: { type: String },
    razorpay_signature: { type: String },
    payu_payment_id: { type: String },
    items: { type: [OrderItemSchema], default: [] },
    address: { type: mongoose.Schema.Types.ObjectId, ref: "Addresses" },
    user_email: { type: String },
    FullName: { type: String },
    phone1: { type: String },
    phone2: { type: String },
    address_line1: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    pinCode: { type: String },
    addressType: { type: String },
  },
  { timestamps: true }
);

const Orders = mongoose.model("Orders", OrdersSchema);
export default Orders;
