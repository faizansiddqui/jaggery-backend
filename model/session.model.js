import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
    session_id: { type: String, required: true },
    email: { type: String, default: "", trim: true, index: true },
    expiresAt: { type: Date, default: null, index: true },
}, { timestamps: true });

const UserSession = mongoose.model('UserSession', SessionSchema);
export default UserSession;
