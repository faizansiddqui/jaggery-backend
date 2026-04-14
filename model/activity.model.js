import mongoose from 'mongoose';

const ActivitySchema = new mongoose.Schema({
    activity_id: { type: String, required: true },
    // Add other fields as needed by your app, or leave as placeholder
}, { timestamps: true });

const UserActivity = mongoose.model('UserActivity', ActivitySchema);
export default UserActivity;
