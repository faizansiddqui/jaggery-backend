import mongoose from "mongoose";

const NewsletterSubscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    source: { type: String, default: "website", trim: true },
    isActive: { type: Boolean, default: true },
    subscribedAt: { type: Date, default: Date.now },
    lastNotifiedAt: { type: Date, default: null },
    lastNotifiedType: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

const NewsletterSubscriber = mongoose.model("NewsletterSubscriber", NewsletterSubscriberSchema);
export default NewsletterSubscriber;
