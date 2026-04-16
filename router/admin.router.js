import { Router } from "express";
import {
  addCatagory,
  uploadProduct,
  getProducts,
  updateProduct,
  getOrders,
  updateOrderStatus,
  login,
  deleteProduct,
  getCategories,
  renameCategory,
  deleteCategory,
  getPublicSiteSettings,
  getCustomersOverview,
  getSiteSettings,
  getCategoryTree,
  getAllReviews,
  getAnalyticsOverview,
  deleteReview,
  getCustomerActivity,
  updateCustomerStatus,
  updateSiteSettings,
  uploadSiteLogo,
  createInstagramGalleryItem,
  updateInstagramGalleryItem,
  deleteInstagramGalleryItem,
  createBanner,
  getBannersAdmin,
  getBannersPublic,
  updateBanner,
  deleteBanner,
  getTestimonialsAdmin,
  getTestimonialsPublic,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
  getNewsletterSubscribers,
  getContactSubmissions,
  markContactSolved,
} from "../controller/admin.controller.js";
import { upload, uploadProductFiles } from '../middleware/multer.middleware.js';

const router = Router();

// Settings endpoint
router.get('/admin/settings', getSiteSettings);
router.patch('/admin/settings', updateSiteSettings);
router.post('/admin/settings/logo', upload.single('logo'), uploadSiteLogo);
router.post('/admin/settings/instagram', upload.single('image'), createInstagramGalleryItem);
router.patch('/admin/settings/instagram/:id', upload.single('image'), updateInstagramGalleryItem);
router.delete('/admin/settings/instagram/:id', deleteInstagramGalleryItem);

// Categories tree endpoint
router.get('/admin/categories/tree', getCategoryTree);

// Reviews endpoint
router.get('/admin/reviews', getAllReviews);
router.delete('/admin/reviews/:id', deleteReview);

// Analytics overview endpoint
router.get('/admin/analytics/overview', getAnalyticsOverview);
router.get('/admin/banners/public', getBannersPublic);
router.get('/admin/banners', getBannersAdmin);
router.post('/admin/banners', upload.single('image'), createBanner);
router.patch('/admin/banners/:id', upload.single('image'), updateBanner);
router.delete('/admin/banners/:id', deleteBanner);

router.get('/admin/testimonials/public', getTestimonialsPublic);
router.get('/admin/testimonials', getTestimonialsAdmin);
router.post('/admin/testimonials', createTestimonial);
router.patch('/admin/testimonials/:id', updateTestimonial);
router.delete('/admin/testimonials/:id', deleteTestimonial);

router.get('/admin/communications/subscribers', getNewsletterSubscribers);
router.get('/admin/communications/contacts', getContactSubmissions);
router.patch('/admin/communications/contacts/:id/solve', markContactSolved);


router.post('/admin/add-catagory', addCatagory);
router.patch('/admin/update-catagory/:id', renameCategory);
router.patch('/admin/update-category/:id', renameCategory);
router.delete('/admin/delete-catagory/:id', deleteCategory);
router.delete('/admin/delete-category/:id', deleteCategory);
router.post('/admin/login', login)

// Product routes with file upload support
router.post('/admin/upload-product', uploadProductFiles, uploadProduct);
router.get('/admin/get-products', getProducts);
router.get('/admin/get-categories', getCategories);
router.patch('/admin/update-product/:product_id', uploadProductFiles, updateProduct);
router.get('/admin/get-orders', getOrders);
router.patch('/admin/update-order-status', updateOrderStatus);
router.delete('/admin/delete-product', deleteProduct)

// Added missing admin routes
router.get('/admin/settings/public', getPublicSiteSettings);
router.get('/admin/customers/overview', getCustomersOverview);
router.get('/admin/customers/:email/activity', getCustomerActivity);
router.patch('/admin/customers/:email/status', updateCustomerStatus);


export { router };
export default router;
