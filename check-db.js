import mongoose from 'mongoose';
import { connectDB } from './config/db.js';

const checkDatabase = async () => {
    try {
        await connectDB();
        console.log('Checking SiteSettings collection...');

        const db = mongoose.connection.db;
        const doc = await db.collection('sitesettings').findOne({ key: 'primary' });

        if (doc) {
            console.log('\n✅ Found SiteSettings document:');
            console.log('siteName:', doc.siteName);
            console.log('navbarTitle:', doc.navbarTitle);
            console.log('footerTitle:', doc.footerTitle);
            console.log('companyEmail:', doc.companyEmail);
            console.log('currencySymbol:', doc.currencySymbol);
            console.log('\nFull document:');
            console.log(JSON.stringify(doc, null, 2));
        } else {
            console.log('❌ No SiteSettings document found with key="primary"');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

checkDatabase();
