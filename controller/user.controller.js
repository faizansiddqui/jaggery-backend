import Products from "../model/product.model.js";
import { Catagories } from "../model/catagory.model.js";
import Reviews from "../model/review.model.js";
import Addresses from "../model/addresses.model.js";
import { getNextSequence } from "../model/counter.model.js";
import { uploadToCloudinary } from "../config/cloudinary.js";
import Profile from "../model/profile.model.js";
import Wishlist from "../model/wishlist.model.js";
import Orders from "../model/orders.model.js";

const parsePageLimit = (req) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.max(Math.min(parseInt(req.query.limit || "12", 10), 100), 1);
  return { page, limit };
};

export const showProducts = async (req, res) => {
  try {
    const { page, limit } = parsePageLimit(req);
    const total = await Products.countDocuments({});
    const products = await Products.find({})
      .sort({ product_id: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      status: true,
      products,
      pagination: { page, limit, total },
    });
  } catch (error) {
    console.error("showProducts error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const getProductById = async (req, res) => {
  try {
    const idParam = req.params.id;
    const product =
      (await Products.findOne({ product_id: Number(idParam) })) ||
      (await Products.findById(idParam));

    if (!product) {
      return res
        .status(200)
        .json({ status: 404, data: [], message: "Product not found" });
    }
    const cat =
      product.catagory_id &&
      (await Catagories.findById(product.catagory_id).lean());

    const shaped = {
      ...product.toObject(),
      catagory_id: 1, // legacy numeric fallback
      Catagory: cat ? { id: 1, name: cat.name } : undefined,
    };

    return res.status(200).json({ status: 200, data: [shaped] });
  } catch (error) {
    console.error("getProductById error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const getProductByCategory = async (req, res) => {
  try {
    const { page, limit } = parsePageLimit(req);
    const categoryName = req.params.category;
    const category = await Catagories.findOne({ name: categoryName });
    if (!category) {
      return res.status(200).json({ status: true, products: [], pagination: { page, limit, total: 0 } });
    }

    const filter = { catagory_id: category._id };
    const total = await Products.countDocuments(filter);
    const products = await Products.find(filter)
      .sort({ product_id: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.status(200).json({
      status: true,
      products,
      pagination: { page, limit, total },
    });
  } catch (error) {
    console.error("getProductByCategory error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const searchProducts = async (req, res) => {
  try {
    const { search = "", price, page = 1, limit = 12 } = req.body || {};
    const pageNum = Math.max(parseInt(page, 10), 1);
    const limitNum = Math.max(Math.min(parseInt(limit, 10), 100), 1);

    const q = search.trim();
    const filter = {};
    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }
    if (price) {
      filter.price = { $lte: Number(price) };
    }

    const total = await Products.countDocuments(filter);
    const products = await Products.find(filter)
      .sort({ product_id: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    return res.status(200).json({
      status: true,
      products,
      pagination: { page: pageNum, limit: limitNum, total },
    });
  } catch (error) {
    console.error("searchProducts error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const getCategories = async (_req, res) => {
  try {
    const categories = await Catagories.find({}).sort({ name: 1 });
    return res.status(200).json({ status: true, categories });
  } catch (error) {
    console.error("getCategories (user) error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

export const addProductReview = async (req, res) => {
  try {
    const {
      product_id,
      review_rate,
      review_text,
      review_title,
      user_name,
      email,
      user_email,
    } = req.body || {};

    const pid = Number(product_id);
    const ratingNum = Number(review_rate);
    if (!pid || Number.isNaN(pid)) {
      return res.status(400).json({ status: false, message: "product_id required" });
    }
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ status: false, message: "rating 1-5 required" });
    }

    // Resolve display name priority: profile.name (by email) > provided user_name > email local-part > Anonymous
    const emailVal = (email || user_email || "").trim();
    let displayName = (user_name || "").trim();
    if (!displayName && emailVal) {
      const profile = await Profile.findOne({ email: emailVal }).lean();
      displayName = profile?.name?.trim() || "";
      if (!displayName) {
        displayName = emailVal.split("@")[0] || "";
      }
    }
    if (!displayName) displayName = "Anonymous";

    let imageUrl = "";
    if (req.file && req.file.buffer) {
      try {
        const uploadRes = await uploadToCloudinary(
          req.file.buffer,
          `${pid}-${Date.now()}`,
          req.file.mimetype || "image/jpeg"
        );
        imageUrl = uploadRes.secure_url || uploadRes.url || "";
      } catch (err) {
        console.error("Cloudinary review upload failed:", err);
        return res.status(500).json({ status: false, message: "Image upload failed" });
      }
    }

    const review = await Reviews.create({
      product_id: pid,
      rating: ratingNum,
      comment: review_text || "",
      user: displayName,
      review_title: review_title || "",
      review_image: imageUrl,
    });

    const shaped = {
      id: review._id,
      review_rate: review.rating,
      review_text: review.comment,
      review_title: review.review_title,
      review_image: review.review_image,
      user_name: review.user,
      createdAt: review.createdAt,
    };

    return res.status(201).json({ status: true, review: shaped, message: "Review added" });
  } catch (error) {
    console.error("addProductReview error:", error);
    return res.status(500).json({ status: false, message: "Failed to add review" });
  }
};

export const getProductReviews = async (req, res) => {
  try {
    const pid = Number(req.params.id);
    const reviews = await Reviews.find({ product_id: pid }).sort({
      createdAt: -1,
    });
    const mapped = reviews.map((r) => ({
      id: r._id,
      review_rate: r.rating,
      review_text: r.comment,
      review_title: r.review_title,
      review_image: r.review_image,
      user_name: r.user || "Anonymous",
      createdAt: r.createdAt,
    }));
    return res.status(200).json({ status: true, reviews: mapped });
  } catch (error) {
    console.error("getProductReviews error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

// --- Minimal user/cart/address stubs to satisfy frontend ---
export const getUserCart = async (_req, res) => {
  return res.status(200).json([]);
};

export const saveUserCart = async (_req, res) => {
  return res
    .status(200)
    .json({ status: true, message: "Cart saved (stub, not persisted)" });
};

export const addToCart = async (_req, res) => {
  return res
    .status(200)
    .json({ status: true, message: "Added to cart (stub, not persisted)" });
};

export const removeCartByProduct = async (_req, res) => {
  return res.status(200).json({ status: true, message: "Removed (stub)" });
};

export const updateCartItem = async (_req, res) => {
  return res.status(200).json({ status: true, message: "Updated (stub)" });
};

export const clearCart = async (_req, res) => {
  return res.status(200).json({ status: true, message: "Cleared (stub)" });
};

export const getUserProfile = async (req, res) => {
  try {
    const email = req.body?.email || "user@example.com";
    const profile =
      (await Profile.findOne({ email }).lean()) || { email, name: "" };
    return res.status(200).json({ status: true, profile });
  } catch (error) {
    console.error("getUserProfile error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to load profile" });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const { email = "user@example.com", name = "" } = req.body || {};
    const profile = await Profile.findOneAndUpdate(
      { email },
      { email, name },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return res.status(200).json({ status: true, profile });
  } catch (error) {
    console.error("updateUserProfile error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to update profile" });
  }
};

// --- Wishlist helpers ---
const requireEmail = (req, res) => {
  const email = (req.body?.email || "").trim();
  if (!email) {
    res.status(401).json({ status: false, message: "Email required (auth)" });
    return null;
  }
  return email;
};

export const listWishlist = async (req, res) => {
  const email = requireEmail(req, res);
  if (!email) return;
  try {
    const items = await Wishlist.find({ email }).lean();
    const ids = items.map((i) => i.product_id);
    const products = await Products.find({ product_id: { $in: ids } }).lean();
    return res.status(200).json({ status: true, products });
  } catch (error) {
    console.error("listWishlist error:", error);
    return res.status(500).json({ status: false, message: "Failed to load wishlist" });
  }
};

export const addToWishlistDb = async (req, res) => {
  const email = requireEmail(req, res);
  if (!email) return;
  try {
    const pid = Number(req.body?.product_id);
    if (!pid) {
      return res.status(400).json({ status: false, message: "product_id required" });
    }
    await Wishlist.updateOne(
      { email, product_id: pid },
      { $set: { email, product_id: pid } },
      { upsert: true }
    );
    return listWishlist(req, res);
  } catch (error) {
    console.error("addToWishlist error:", error);
    return res.status(500).json({ status: false, message: "Failed to add to wishlist" });
  }
};

export const removeFromWishlistDb = async (req, res) => {
  const email = requireEmail(req, res);
  if (!email) return;
  try {
    const pid = Number(req.body?.product_id);
    if (!pid) {
      return res.status(400).json({ status: false, message: "product_id required" });
    }
    await Wishlist.deleteOne({ email, product_id: pid });
    return listWishlist(req, res);
  } catch (error) {
    console.error("removeFromWishlist error:", error);
    return res.status(500).json({ status: false, message: "Failed to remove from wishlist" });
  }
};

export const clearWishlistDb = async (req, res) => {
  const email = requireEmail(req, res);
  if (!email) return;
  try {
    await Wishlist.deleteMany({ email });
    return res.status(200).json({ status: true, products: [] });
  } catch (error) {
    console.error("clearWishlist error:", error);
    return res.status(500).json({ status: false, message: "Failed to clear wishlist" });
  }
};

// --- Orders (stub) ---
export const getUserOrders = async (req, res) => {
  try {
    const email = (req.body?.email || "").trim();
    const filter = email ? { user_email: email } : {};
    const orders = await Orders.find(filter)
      .populate({ path: "items.product", select: "name title price selling_price product_image" })
      .populate({ path: "address" })
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json({ status: true, orders });
  } catch (error) {
    console.error("getUserOrders error:", error);
    return res.status(500).json({ status: false, message: "Failed to load orders" });
  }
};

// Razorpay order creation
export const createOrder = async (req, res) => {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return res.status(500).json({ status: false, message: "Razorpay keys missing in env" });
    }

    const { items = [], address_id, email } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: false, message: "Items required" });
    }

    // fetch product prices
    const ids = items.map((i) => Number(i.product_id)).filter(Boolean);
    const products = await Products.find({ product_id: { $in: ids } }).lean();
    const productMap = new Map(products.map((p) => [p.product_id, p]));

    let amountPaise = 0;
    const orderItems = [];
    for (const it of items) {
      const prod = productMap.get(Number(it.product_id));
      const price = prod ? Number(prod.selling_price || prod.price || 0) : 0;
      const qty = Number(it.quantity) || 1;
      amountPaise += Math.max(price, 0) * qty * 100;
      orderItems.push({
        product_id: it.product_id,
        quantity: qty,
        price,
        product: prod?._id,
      });
    }
    if (!amountPaise) amountPaise = 100;

    const payload = {
      amount: Math.round(amountPaise),
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
      notes: { address_id: address_id || "" },
    };

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });

    if (!rpRes.ok) {
      const text = await rpRes.text();
      throw new Error(`Razorpay order failed: ${rpRes.status} ${text}`);
    }
    const order = await rpRes.json();

    const addressDoc = address_id
      ? await Addresses.findOne({ address_id: Number(address_id) })
      : null;

    const localOrderId = await getNextSequence("order_id");
    await Orders.create({
      order_id: localOrderId,
      status: "pending",
      payment_status: "created",
      payment_method: "Razorpay",
      amount: payload.amount,
      currency: payload.currency,
      razorpay_order_id: order.id,
      items: orderItems,
      address: addressDoc?._id,
      user_email: email || "",
      FullName: addressDoc?.FullName || addressDoc?.full_name || "",
      phone1: addressDoc?.phone1 || addressDoc?.phone || "",
      phone2: addressDoc?.phone2 || addressDoc?.alt_phone || "",
      address_line1: addressDoc?.address_line1 || addressDoc?.address || "",
      city: addressDoc?.city || "",
      state: addressDoc?.state || "",
      country: addressDoc?.country || "",
      pinCode: addressDoc?.pinCode || addressDoc?.postal_code || "",
      addressType: addressDoc?.addressType || "",
    });

    return res.status(200).json({
      status: true,
      order,
      key: keyId,
      amount: payload.amount,
      currency: payload.currency,
      local_order_id: localOrderId,
    });
  } catch (error) {
    console.error("createOrder error:", error);
    return res.status(500).json({ status: false, message: "Failed to create order" });
  }
};

export const confirmPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ status: false, message: "Missing payment params" });
    }
    const crypto = await import("crypto");
    const generatedSignature = crypto.createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ status: false, message: "Signature mismatch" });
    }

    const order = await Orders.findOne({ razorpay_order_id });
    if (order) {
      order.payment_status = "paid";
      order.status = "confirmed";
      order.razorpay_payment_id = razorpay_payment_id;
      order.razorpay_signature = razorpay_signature;
      await order.save();
    }

    return res.status(200).json({ status: true, message: "Payment verified", order_id: order?.order_id });
  } catch (error) {
    console.error("confirmPayment error:", error);
    return res.status(500).json({ status: false, message: "Failed to confirm payment" });
  }
};

export const updateUserAddress = async (req, res) => {
  try {
    const { address_id, id, ...rest } = req.body || {};
    const addrId = Number(address_id ?? id);
    if (!addrId || Number.isNaN(addrId)) {
      return res.status(400).json({ status: false, message: "address_id required" });
    }
    const updated = await Addresses.findOneAndUpdate(
      { address_id: addrId },
      {
        full_name: rest.FullName,
        phone: rest.phone1,
        alt_phone: rest.phone2,
        address_line1: rest.address,
        city: rest.city,
        state: rest.state,
        postal_code: rest.pinCode,
        country: rest.country,
        FullName: rest.FullName,
        phone1: rest.phone1,
        phone2: rest.phone2,
        pinCode: rest.pinCode,
        address: rest.address,
        addressType: rest.addressType,
      },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ status: false, message: "Address not found" });
    }
    const shaped = {
      id: updated.address_id,
      address_id: updated.address_id,
      FullName: updated.FullName,
      phone1: updated.phone1,
      phone2: updated.phone2,
      country: updated.country,
      state: updated.state,
      city: updated.city,
      pinCode: updated.pinCode,
      address: updated.address,
      addressType: updated.addressType,
    };
    return res.status(200).json({ status: true, address: shaped, data: shaped });
  } catch (error) {
    console.error("updateUserAddress error:", error);
    return res.status(500).json({ status: false, message: "Failed to update address" });
  }
};

export const getUserAddresses = async (_req, res) => {
  const addresses = await Addresses.find({}).sort({ createdAt: -1 });
  const mapped = addresses.map((a) => ({
    id: a.address_id || a._id?.toString(),
    address_id: a.address_id,
    FullName: a.FullName || a.full_name || "",
    phone1: a.phone1 || a.phone || "",
    phone2: a.phone2 || a.alt_phone || "",
    country: a.country || "",
    state: a.state || "",
    city: a.city || "",
    pinCode: a.pinCode || a.postal_code || "",
    address: a.address || a.address_line1 || "",
    addressType: a.addressType || "",
  }));
  return res
    .status(200)
    .json({ status: true, addresses: mapped, data: mapped, message: "ok" });
};

export const createNewAddress = async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.address_id) {
      payload.address_id = await getNextSequence("address_id");
    }
    const addr = await Addresses.create({
      address_id: payload.address_id,
      full_name: payload.FullName,
      email: payload.email,
      phone: payload.phone1,
      alt_phone: payload.phone2,
      address_line1: payload.address || "",
      address_line2: payload.address_line2 || "",
      city: payload.city,
      state: payload.state,
      postal_code: payload.pinCode,
      country: payload.country || "India",
      FullName: payload.FullName,
      phone1: payload.phone1,
      phone2: payload.phone2,
      pinCode: payload.pinCode,
      address: payload.address,
      addressType: payload.addressType,
    });
    const shaped = {
      id: addr.address_id,
      address_id: addr.address_id,
      FullName: addr.FullName,
      phone1: addr.phone1,
      phone2: addr.phone2,
      country: addr.country,
      state: addr.state,
      city: addr.city,
      pinCode: addr.pinCode,
      address: addr.address,
      addressType: addr.addressType,
    };
    return res
      .status(201)
      .json({ status: true, address: shaped, data: shaped, message: "Address created" });
  } catch (error) {
    console.error("createNewAddress error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to create address" });
  }
};

// ---- Orders: cancel order ----
export const cancelOrder = async (req, res) => {
  try {
    const { order_id, id } = req.body || {};
    const idStr = order_id || id;
    if (!idStr) {
      return res.status(400).json({ status: false, message: "order_id required" });
    }

    // Match either numeric order_id or Mongo _id
    const query =
      !Number.isNaN(Number(idStr)) && Number.isFinite(Number(idStr))
        ? { order_id: Number(idStr) }
        : { _id: idStr };

    const order = await Orders.findOne(query);
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }

    const finalStatuses = ["cancelled", "rejected", "delivered", "rto"];
    if (finalStatuses.includes((order.status || "").toLowerCase())) {
      return res
        .status(400)
        .json({ status: false, message: `Order already ${order.status}` });
    }

    order.status = "cancelled";
    order.payment_status = order.payment_status === "paid" ? "refund_pending" : "cancelled";
    await order.save();

    return res.status(200).json({
      status: true,
      message: "Order cancelled",
      order,
    });
  } catch (error) {
    console.error("cancelOrder error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Failed to cancel order" });
  }
};
