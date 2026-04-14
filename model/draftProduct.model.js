import mongoose from 'mongoose';

const DraftProductSchema = new mongoose.Schema({
    draft_id: { type: Number, required: true },
    // Add other fields as needed by your app, or leave as placeholder
}, { timestamps: true });

const DraftProducts = mongoose.model('DraftProducts', DraftProductSchema);
export default DraftProducts;
