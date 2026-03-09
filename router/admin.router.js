import { Router } from "express";
import { addCatagory, uploadProduct, getProducts, updateProduct, getOrders, updateOrderStatus, login, deleteProduct, getCategories } from "../controller/admin.controller.js";
import { upload } from '../middleware/multer.middleware.js';

const router = Router();



router.post('/add-catagory', addCatagory);
router.post('/login', login)


router.post('/upload-product', upload.array('images', 5), uploadProduct);
router.get('/get-products', getProducts);
router.get('/get-categories', getCategories);
router.patch('/update-product/:product_id', upload.array('images', 5), updateProduct);
router.get('/get-orders', getOrders);
router.patch('/update-order-status', updateOrderStatus);
router.delete('/delete-product', deleteProduct)


export { router };
export default router;
