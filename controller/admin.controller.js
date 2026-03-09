import { Catagories } from "../model/catagory.model.js";
import Products from "../model/product.model.js";
import Orders from "../model/orders.model.js";
import Addresses from "../model/addresses.model.js";
import { getNextSequence } from "../model/counter.model.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
} from "../config/cloudinary.js";

const addCatagory = async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ err: "Category name required" });
  try {
    const trimmed = name.trim();
    const existing = await Catagories.findOne({ name: trimmed });
    if (existing) {
      return res.status(200).json({ status: true, category: existing, message: "Category already exists" });
    }
    const result = await Catagories.create({ name: trimmed });
    res.status(201).json({ status: true, category: result });
  } catch (error) {
    console.error("addCatagory error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const uploadProduct = async (req, res) => {
  const files = req.files || [];
  const {
    name,
    title,
    price,
    quantity,
    sku,
    description,
    catagory,
    specification,
    selling_price,
    selling_price_link,
  } = req.body;

  try {
    if (!files.length) {
      return res
        .status(400)
        .json({ message: "At least one image is required." });
    }
    if (files.length > 5) {
      return res.status(400).json({ message: "Maximum 5 images allowed." });
    }

    const catName = (catagory || "").trim();
    let cat = await Catagories.findOne({ name: catName });
    if (!cat) {
      // auto-create category if it doesn't exist
      cat = await Catagories.create({ name: catName });
    }

    let specsArr = [];
    if (specification) {
      try {
        const parsed = JSON.parse(specification);
        specsArr = Object.entries(parsed).map(([key, value]) => ({
          key,
          value,
        }));
      } catch {
        return res.status(400).json({ message: "Invalid specification JSON" });
      }
    }

    const productId = await getNextSequence("product_id");

    const imageUrls = [];
    const publicIds = [];
    for (const file of files) {
      const uploadRes = await uploadToCloudinary(
        file.buffer,
        `${productId}-${file.originalname}`,
        file.mimetype
      );
      imageUrls.push(uploadRes.secure_url);
      publicIds.push(uploadRes.public_id);
    }

    const newProduct = await Products.create({
      product_id: productId,
      title,
      name,
      price: Number(price),
      selling_price: Number(selling_price),
      description,
      selling_price_link,
      product_image: imageUrls,
      image_public_ids: publicIds,
      quantity: Number(quantity),
      sku,
      catagory_id: cat._id,
      specifications: specsArr,
    });

    res.status(201).json({
      message: "Product uploaded successfully!",
      product: newProduct,
      images: imageUrls,
    });
  } catch (error) {
    console.error("uploadProduct error:", error);
    res
      .status(500)
      .json({ message: "Server error", error: error.message || error });
  }
};

const updateProduct = async (req, res) => {
  const { product_id } = req.params;
  const files = req.files || [];
  const {
    name,
    title,
    price,
    quantity,
    sku,
    description,
    catagory,
    specification,
    selling_price,
    selling_price_link,
  } = req.body;

  try {
    const product = await Products.findOne({ product_id: Number(product_id) });
    if (!product) {
      return res
        .status(404)
        .json({ status: false, message: "Product not found" });
    }

    const catName = (catagory || "").trim();
    let categoryData = await Catagories.findOne({ name: catName });
    if (!categoryData) {
      categoryData = await Catagories.create({ name: catName });
    }

    let specsArr = product.specifications || [];
    if (specification) {
      try {
        const parsed = JSON.parse(specification);
        specsArr = Object.entries(parsed).map(([key, value]) => ({
          key,
          value,
        }));
      } catch {
        return res.status(400).json({ message: "Invalid specification JSON" });
      }
    }

    let imageUrls = product.product_image;
    let publicIds = product.image_public_ids || [];

    if (files.length > 0) {
      if (files.length > 5) {
        return res.status(400).json({ message: "Maximum 5 images allowed." });
      }
      // delete old images
      for (const pid of publicIds) {
        try {
          await deleteFromCloudinary(pid);
        } catch (err) {
          console.warn("Failed to delete old image:", pid, err.message);
        }
      }
      imageUrls = [];
      publicIds = [];
      for (const file of files) {
        const uploadRes = await uploadToCloudinary(
          file.buffer,
          `${product.product_id}-${file.originalname}`,
          file.mimetype
        );
        imageUrls.push(uploadRes.secure_url);
        publicIds.push(uploadRes.public_id);
      }
    }

    product.title = title ?? product.title;
    product.name = name ?? product.name;
    if (price !== undefined) product.price = Number(price);
    if (selling_price !== undefined) product.selling_price = Number(selling_price);
    if (quantity !== undefined) product.quantity = Number(quantity);
    product.sku = sku ?? product.sku;
    product.description = description ?? product.description;
    product.selling_price_link = selling_price_link ?? product.selling_price_link;
    product.catagory_id = categoryData._id;
    product.product_image = imageUrls;
    product.image_public_ids = publicIds;
    product.specifications = specsArr;

    await product.save();

    res
      .status(200)
      .json({ status: true, message: "Product updated successfully", product });
  } catch (error) {
    console.error("updateProduct error:", error);
    res
      .status(500)
      .json({ status: false, message: "Server error", error: error.message });
  }
};

const getProducts = async (_req, res) => {
  try {
    const products = await Products.find({})
      .populate({ path: "catagory_id", select: "name" })
      .sort({ product_id: -1 });
    res.status(200).json({ status: true, products });
  } catch (error) {
    console.error("getProducts error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch products", error: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId)
      return res
        .status(404)
        .json({ status: false, Message: "Cannot remove product." });

    const product = await Products.findOne({ product_id: Number(productId) });
    if (!product) {
      return res
        .status(404)
        .json({ status: false, Message: "Product not found" });
    }

    const publicIds = product.image_public_ids?.length
      ? product.image_public_ids
      : product.product_image
          .map((url) => extractPublicId(url))
          .filter(Boolean);

    for (const pid of publicIds) {
      try {
        await deleteFromCloudinary(pid);
      } catch (err) {
        console.warn("Error removing image:", pid, err.message);
      }
    }

    await product.deleteOne();

    res
      .status(200)
      .json({ status: true, Message: "Product Deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: false, Message: "Something went wrong" });
  }
};

const getOrders = async (_req, res) => {
  try {
    const data = await Orders.find({})
      .populate({ path: "items.product", select: "name title product_image price selling_price" })
      .populate({ path: "address" })
      .sort({ createdAt: -1 });

    // return empty list instead of 404 to satisfy frontend
    const ordersWithPayment = data.map((order) => ({
      ...order.toObject(),
      payment_method: order.payment_method || "Razorpay",
    }));

    res.status(200).json({
      status: true,
      orders: ordersWithPayment,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({
      message: "Something went wrong",
      error: error.message,
    });
  }
};

const updateOrderStatus = async (req, res) => {
  const { status, order_id, product_id } = req.body;
  if (!status || !order_id) {
    return res
      .status(400)
      .json({ message: "Required fields missing: status or order_id." });
  }

  try {
    const order = await Orders.findOne({ order_id: Number(order_id) });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (status === "confirm") {
      if (!product_id) {
        return res
          .status(400)
          .json({ message: "product_id is required for status 'confirm'." });
      }
      const item = order.items.find(
        (i) => Number(i.product_id) === Number(product_id)
      );
      if (!item) {
        return res
          .status(404)
          .json({ message: "Product not found in this order." });
      }
      const product = await Products.findOne({
        product_id: Number(product_id),
      });
      if (!product || product.quantity < item.quantity) {
        return res
          .status(400)
          .json({ status: false, message: "Insufficient stock." });
      }
      product.quantity = product.quantity - item.quantity;
      await product.save();
      order.payment_status = "paid";
    }

    order.status = status;
    await order.save();

    return res.status(200).json({ message: "Order status updated successfully" });
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const login = (req, res) => {
  const { userName, password } = req.body;
  if (!userName || !password) {
    return res.status(400).json({ msg: "userName and Password required" });
  }

  const checkUserName = process.env.ADMIN_USERNAME;
  const checkPassword = process.env.PASSWORD;
  if (checkUserName === userName && checkPassword === password) {
    return res.status(200).json({ status: true, msg: "Login successfull" });
  } else {
    return res.status(401).json({ status: false, msg: "Can't login" });
  }
};

const getCategories = async (_req, res) => {
  try {
    const categories = await Catagories.find({}).sort({ name: 1 });
    res.status(200).json({ status: true, categories });
  } catch (error) {
    console.error("getCategories error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

export {
  getProducts,
  updateProduct,
  addCatagory,
  uploadProduct,
  login,
  getOrders,
  updateOrderStatus,
  deleteProduct,
  getCategories,
};
