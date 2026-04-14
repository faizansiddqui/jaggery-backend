import mongoose from "mongoose";

const ContactSubmissionSchema = new mongoose.Schema(
  {
    ticketCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    department: { type: String, default: "GENERAL INQUIRY", trim: true },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ["open", "solved"], default: "open" },
    solvedAt: { type: Date, default: null },
    solvedBy: { type: String, default: "", trim: true },
    resolutionMessage: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

const ContactSubmission = mongoose.model("ContactSubmission", ContactSubmissionSchema);
export default ContactSubmission;
