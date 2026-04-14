import mongoose from 'mongoose';

const SiteSettingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    siteName: { type: String, default: 'Amila Gold' },
    navbarTitle: { type: String, default: 'Amila Gold' },
    footerTitle: { type: String, default: 'Amila Gold' },
    footerDescription: { type: String, default: '' },
    companyAddress: { type: String, default: '' },
    companyEmail: { type: String, default: '' },
    companyPhone: { type: String, default: '' },
    emailFooterDescription: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    logoPublicId: { type: String, default: '' },
    currencySymbol: { type: String, default: '₹' },
    instagramUrl: { type: String, default: '' },
    instagramHandle: { type: String, default: 'amina_gold' },
    instagramGallery: [{
        id: String,
        imageUrl: String,
        imagePublicId: String,
        username: String,
        sortOrder: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true }
    }],
    twitterUrl: { type: String, default: '' },
    youtubeUrl: { type: String, default: '' },
    facebookUrl: { type: String, default: '' },
    updatedBy: { type: String, default: 'system' },
}, { timestamps: true });

const SiteSettings = mongoose.model('SiteSettings', SiteSettingsSchema);
export default SiteSettings;
