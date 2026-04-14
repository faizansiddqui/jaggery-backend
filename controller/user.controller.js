import Products from "../model/product.model.js";
import { Catagories } from "../model/catagory.model.js";
import Reviews from "../model/review.model.js";
import Addresses from "../model/addresses.model.js";
import { getNextSequence } from "../model/counter.model.js";
import { uploadToCloudinary } from "../config/cloudinary.js";
import Profile from "../model/profile.model.js";
import Wishlist from "../model/wishlist.model.js";
import Orders from "../model/orders.model.js";
import Cart from "../model/cart.model.js";
import NewsletterSubscriber from "../model/newsletterSubscriber.model.js";
import ContactSubmission from "../model/contactSubmission.model.js";

const parsePageLimit = (req) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.max(Math.min(parseInt(req.query.limit || "12", 10), 100), 1);
  return { page, limit };
};

const BLOCKED_MESSAGE = "You are blocked. Please contact support.";

const ensureActiveCustomer = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return { ok: false, code: 401, message: "Email required (auth)" };
  const profile = await Profile.findOne({ email: normalizedEmail })
    .select("isBlocked blockedReason")
    .lean();
  if (profile?.isBlocked) {
    return {
      ok: false,
      code: 403,
      message: profile.blockedReason
        ? `You are blocked: ${String(profile.blockedReason).trim()}`
        : BLOCKED_MESSAGE,
    };
  }
  return { ok: true, email: normalizedEmail };
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
    const productByNumber = Number.isFinite(Number(idParam))
      ? await Products.findOne({ product_id: Number(idParam) })
      : null;
    const productByCode = productByNumber
      ? null
      : await Products.findOne({ product_code: String(idParam || "").trim() });
    const productByMongoId = productByNumber || productByCode
      ? null
      : await Products.findById(idParam);
    const product = productByNumber || productByCode || productByMongoId;

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
      review_images: Array.isArray(r.review_images)
        ? r.review_images.map((entry) => String(entry || "")).filter(Boolean)
        : r.review_image
          ? [String(r.review_image)]
          : [],
      user_name: r.user || "Anonymous",
      createdAt: r.createdAt,
    }));
    return res.status(200).json({ status: true, reviews: mapped });
  } catch (error) {
    console.error("getProductReviews error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

// --- Cart helpers ---
const normalizeCartId = (value) => String(value || "").trim();
const normalizeEmail = (value) => String(value || "").trim();
const normalizeVariant = (value) => String(value || "").trim();
const toPositiveInt = (value, fallback = 1) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const toNonNegativeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const buildCartId = () => `cart_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
const sameCartItem = (item, productId, size, color) =>
  Number(item?.product_id) === Number(productId) &&
  normalizeVariant(item?.size) === normalizeVariant(size) &&
  normalizeVariant(item?.color) === normalizeVariant(color);
const mapCartItems = (items = []) =>
  items.map((item) => ({
    product_id: Number(item.product_id) || 0,
    color: normalizeVariant(item.color),
    size: normalizeVariant(item.size),
    qty: toPositiveInt(item.qty, 1),
    price: toNonNegativeNumber(item.price, 0),
    mrp: toNonNegativeNumber(item.mrp, 0),
    title: String(item.title || "Product"),
    image: String(item.image || ""),
  }));
const cartResponse = (cart) => ({
  status: true,
  cart_id: cart?.cart_id || "",
  items: mapCartItems(cart?.items || []),
});
const resolveCart = async ({ cartId, email, create = false }) => {
  const cleanCartId = normalizeCartId(cartId);
  const cleanEmail = normalizeEmail(email);

  let cart = null;
  if (cleanCartId) {
    cart = await Cart.findOne({ cart_id: cleanCartId });
  }

  if (!cart && cleanEmail) {
    cart = await Cart.findOne({ email: cleanEmail }).sort({ updatedAt: -1 });
  }

  if (!cart && create) {
    cart = await Cart.create({
      cart_id: cleanCartId || buildCartId(),
      email: cleanEmail,
      items: [],
    });
  }

  if (cart && cleanEmail && !cart.email) {
    cart.email = cleanEmail;
    await cart.save();
  }

  return cart;
};

export const getUserCart = async (req, res) => {
  try {
    const cart = await resolveCart({
      cartId: req.body?.cart_id,
      email: req.body?.email,
      create: false,
    });
    if (!cart) {
      return res.status(200).json({ status: true, cart_id: "", items: [] });
    }
    return res.status(200).json(cartResponse(cart));
  } catch (error) {
    console.error("getUserCart error:", error);
    return res.status(500).json({ status: false, message: "Failed to load cart" });
  }
};

export const saveUserCart = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const incomingItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const cart = await resolveCart({
      cartId: req.body?.cart_id,
      email,
      create: true,
    });

    cart.items = mapCartItems(incomingItems);
    if (email && !cart.email) cart.email = email;
    await cart.save();

    return res.status(200).json(cartResponse(cart));
  } catch (error) {
    console.error("saveUserCart error:", error);
    return res.status(500).json({ status: false, message: "Failed to save cart" });
  }
};

export const addToCart = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const pid = Number(req.body?.product_id);
    if (!pid) {
      return res.status(400).json({ status: false, message: "product_id required" });
    }

    const color = normalizeVariant(req.body?.color);
    const size = normalizeVariant(req.body?.size);
    const qtyToAdd = toPositiveInt(req.body?.qty, 1);
    const cart = await resolveCart({
      cartId: req.body?.cart_id,
      email,
      create: true,
    });

    const idx = cart.items.findIndex((item) => sameCartItem(item, pid, size, color));
    if (idx >= 0) {
      cart.items[idx].qty = toPositiveInt(cart.items[idx].qty, 1) + qtyToAdd;
      if (req.body?.price != null) cart.items[idx].price = toNonNegativeNumber(req.body.price, 0);
      if (req.body?.mrp != null) cart.items[idx].mrp = toNonNegativeNumber(req.body.mrp, 0);
      if (req.body?.title) cart.items[idx].title = String(req.body.title);
      if (req.body?.image) cart.items[idx].image = String(req.body.image);
    } else {
      cart.items.push({
        product_id: pid,
        color,
        size,
        qty: qtyToAdd,
        price: toNonNegativeNumber(req.body?.price, 0),
        mrp: toNonNegativeNumber(req.body?.mrp, toNonNegativeNumber(req.body?.price, 0)),
        title: String(req.body?.title || "Product"),
        image: String(req.body?.image || ""),
      });
    }

    if (email && !cart.email) cart.email = email;
    await cart.save();
    return res.status(200).json(cartResponse(cart));
  } catch (error) {
    console.error("addToCart error:", error);
    return res.status(500).json({ status: false, message: "Failed to add item to cart" });
  }
};

export const removeCartByProduct = async (req, res) => {
  try {
    const pid = Number(req.params?.productId);
    if (!pid) {
      return res.status(400).json({ status: false, message: "productId required" });
    }

    const cart = await resolveCart({
      cartId: req.query?.cart_id,
      email: req.query?.email,
      create: false,
    });
    if (!cart) return res.status(200).json({ status: true, cart_id: "", items: [] });

    cart.items = cart.items.filter((item) => Number(item.product_id) !== pid);
    await cart.save();
    return res.status(200).json(cartResponse(cart));
  } catch (error) {
    console.error("removeCartByProduct error:", error);
    return res.status(500).json({ status: false, message: "Failed to remove cart item" });
  }
};

export const updateCartItem = async (req, res) => {
  try {
    const pid = Number(req.body?.product_id);
    if (!pid) {
      return res.status(400).json({ status: false, message: "product_id required" });
    }

    const size = normalizeVariant(req.body?.size);
    const color = normalizeVariant(req.body?.color);
    const qty = Number(req.body?.qty);
    if (!Number.isFinite(qty)) {
      return res.status(400).json({ status: false, message: "qty required" });
    }

    const cart = await resolveCart({
      cartId: req.body?.cart_id,
      email: req.body?.email,
      create: true,
    });

    const idx = cart.items.findIndex((item) => sameCartItem(item, pid, size, color));
    if (idx >= 0) {
      if (qty <= 0) {
        cart.items.splice(idx, 1);
      } else {
        cart.items[idx].qty = toPositiveInt(qty, 1);
      }
    }

    await cart.save();
    return res.status(200).json(cartResponse(cart));
  } catch (error) {
    console.error("updateCartItem error:", error);
    return res.status(500).json({ status: false, message: "Failed to update cart item" });
  }
};

export const clearCart = async (req, res) => {
  try {
    const cart = await resolveCart({
      cartId: req.body?.cart_id,
      email: req.body?.email,
      create: false,
    });
    if (!cart) return res.status(200).json({ status: true, cart_id: "", items: [] });

    cart.items = [];
    await cart.save();
    return res.status(200).json(cartResponse(cart));
  } catch (error) {
    console.error("clearCart error:", error);
    return res.status(500).json({ status: false, message: "Failed to clear cart" });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const auth = await ensureActiveCustomer(req.body?.email || "user@example.com");
    if (!auth.ok) {
      return res.status(auth.code).json({ status: false, message: auth.message });
    }
    const email = auth.email;
    const profile =
      (await Profile.findOne({ email }).lean()) || { email, name: "" };
    // Do not expose removed/legacy fields like `age` in the API response
    try {
      if (profile && typeof profile === 'object' && 'age' in profile) delete profile.age;
    } catch (e) {}
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
    // Do not accept or store `age` from the client anymore
    const { email = "user@example.com", name = "", phone = "", gender } = req.body || {};
    const customerAccess = await ensureActiveCustomer(email);
    if (!customerAccess.ok) {
      return res.status(customerAccess.code).json({ status: false, message: customerAccess.message });
    }

    const update = { email: customerAccess.email, name, phone };
    if (typeof gender === "string" && ["male", "female", "others"].includes(gender)) {
      update.gender = gender;
    }

    const profile = await Profile.findOneAndUpdate(
      { email: customerAccess.email },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    // Ensure `age` is not returned even if present in DB documents
    try {
      if (profile && typeof profile === 'object' && 'age' in profile) delete profile.age;
    } catch (e) {}
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
  const email = String(req.body?.email || "").trim().toLowerCase();
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
    const auth = await ensureActiveCustomer(email);
    if (!auth.ok) {
      return res.status(auth.code).json({ status: false, message: auth.message });
    }
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

const createRandomOrderId = (length = 10) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};

const createTicketCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "CT-";
  for (let i = 0; i < 8; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};

export const subscribeNewsletter = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const source = String(req.body?.source || "website").trim() || "website";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ status: false, message: "Valid email required" });
    }

    const subscriber = await NewsletterSubscriber.findOneAndUpdate(
      { email },
      {
        $set: {
          email,
          source,
          isActive: true,
          subscribedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({
      status: true,
      message: "Subscribed successfully",
      subscriber,
    });
  } catch (error) {
    console.error("subscribeNewsletter error:", error);
    return res.status(500).json({ status: false, message: "Failed to subscribe" });
  }
};

export const submitContactForm = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const department = String(req.body?.department || "GENERAL INQUIRY").trim() || "GENERAL INQUIRY";
    const message = String(req.body?.message || "").trim();

    if (!name || !message || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ status: false, message: "Name, valid email and message are required" });
    }

    const entry = await ContactSubmission.create({
      ticketCode: createTicketCode(),
      name,
      email,
      department,
      message,
      status: "open",
    });

    return res.status(201).json({
      status: true,
      message: "Query submitted successfully",
      contact: {
        id: String(entry._id),
        ticketCode: entry.ticketCode,
      },
    });
  } catch (error) {
    console.error("submitContactForm error:", error);
    return res.status(500).json({ status: false, message: "Failed to submit query" });
  }
};

const generateUniqueOrderId = async () => {
  for (let i = 0; i < 20; i += 1) {
    const candidate = createRandomOrderId(10);
    const exists = await Orders.findOne({ order_id: candidate }).select("_id").lean();
    if (!exists) return candidate;
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase().slice(0, 10);
};

const resolveOrderQuery = (value) => {
  const idRaw = String(value || "").trim();
  if (!idRaw) return null;
  const queries = [{ order_id: idRaw }, { order_code: idRaw }];
  if (/^[a-f\d]{24}$/i.test(idRaw)) {
    queries.push({ _id: idRaw });
  }
  return { $or: queries };
};

const appendStatusHistory = (order, status, updatedBy = "system", note = "") => {
  const current = Array.isArray(order.status_history) ? order.status_history : [];
  order.status_history = [
    ...current,
    {
      status: String(status || "").trim().toLowerCase(),
      updatedAt: new Date(),
      updatedBy,
      note: String(note || "").trim(),
    },
  ];
};

// --- Orders ---
export const getUserOrders = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (email) {
      const auth = await ensureActiveCustomer(email);
      if (!auth.ok) {
        return res.status(auth.code).json({ status: false, message: auth.message });
      }
    }
    const filter = email ? { user_email: email } : {};
    const orders = await Orders.find(filter)
      .populate({ path: "items.product", select: "name title product_code price selling_price product_image variants" })
      .populate({ path: "address" })
      .sort({ createdAt: -1 })
      .lean();
    const missingProductIds = Array.from(
      new Set(
        orders.flatMap((order) =>
          (Array.isArray(order.items) ? order.items : [])
            .filter((item) => !item?.product && Number(item?.product_id) > 0)
            .map((item) => Number(item.product_id))
        )
      )
    );
    const fallbackProducts = missingProductIds.length
      ? await Products.find({ product_id: { $in: missingProductIds } })
        .select("product_id name title product_code product_image price selling_price variants")
        .lean()
      : [];
    const fallbackProductMap = new Map(fallbackProducts.map((p) => [Number(p.product_id), p]));
    const normalized = orders.map((order) => {
      const explicit = Number(order.amount || 0);
      const itemsTotal = Array.isArray(order.items)
        ? order.items.reduce((sum, item) => sum + Number(item?.price || 0) * Number(item?.quantity || 0), 0)
        : 0;
      const amount =
        Number.isFinite(explicit) && explicit > 0
          ? itemsTotal > 0 && explicit > itemsTotal * 5
            ? explicit / 100
            : explicit
          : itemsTotal;
      const items = Array.isArray(order.items)
        ? order.items.map((item) => {
          const populated = item?.product;
          const fallback = fallbackProductMap.get(Number(item?.product_id || 0));
          const variantImageFromFallback = Array.isArray(fallback?.variants) && fallback.variants.length
            ? String(fallback.variants[0]?.image || "")
            : "";
          const productImageFromFallback = Array.isArray(fallback?.product_image)
            ? String(fallback.product_image[0] || "")
            : "";
          const effectiveFallbackImage = productImageFromFallback || variantImageFromFallback;
          const variantPrice = Array.isArray(fallback?.variants) && fallback.variants.length
            ? Number(fallback.variants[0]?.selling_price || fallback.variants[0]?.price || 0)
            : 0;
          const fallbackPrice = variantPrice || Number(fallback?.selling_price || fallback?.price || 0);
          const itemPrice = Number(item?.price || 0) > 0 ? Number(item.price) : fallbackPrice;

          if (populated) {
            const productImages = Array.isArray(populated.product_image) ? populated.product_image : [];
            const variantImageFromPopulated = Array.isArray(populated.variants) && populated.variants.length
              ? String(populated.variants[0]?.image || "")
              : "";
            const normalizedImages = productImages.length
              ? productImages
              : (effectiveFallbackImage ? [effectiveFallbackImage] : (variantImageFromPopulated ? [variantImageFromPopulated] : []));
            return {
              ...item,
              price: itemPrice > 0 ? itemPrice : Number(item?.price || 0),
              product: {
                ...populated,
                product_code: populated.product_code || fallback?.product_code || "",
                product_image: normalizedImages.length
                  ? normalizedImages
                  : (item?.product_image ? [String(item.product_image)] : []),
              },
            };
          }
          if (!fallback) {
            return {
              ...item,
              price: itemPrice > 0 ? itemPrice : Number(item?.price || 0),
            };
          }
          return {
            ...item,
            price: itemPrice > 0 ? itemPrice : Number(item?.price || 0),
            product: {
              name: fallback.name || fallback.title || "",
              title: fallback.title || fallback.name || "",
              product_code: fallback.product_code || "",
              product_image: effectiveFallbackImage
                ? [effectiveFallbackImage]
                : (item?.product_image ? [String(item.product_image)] : []),
            },
          };
        })
        : [];
      return { ...order, amount, items };
    });
    return res.status(200).json({ status: true, orders: normalized });
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
    const auth = await ensureActiveCustomer(email);
    if (!auth.ok) {
      return res.status(auth.code).json({ status: false, message: auth.message });
    }
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
      if (!prod) {
        return res.status(400).json({ status: false, message: `Product not found for item ${String(it?.product_id || "")}` });
      }
      const itemSize = String(it.size || "").trim().toLowerCase();
      const itemColor = String(it.color || "").trim();
      const requestedPrice = Number(it.price || 0);
      let price = Number.isFinite(requestedPrice) && requestedPrice > 0 ? requestedPrice : 0;
      let availableStock = Number(prod.quantity || 0);
      if (Array.isArray(prod.variants) && prod.variants.length > 0) {
        const matchedVariant = itemSize
          ? prod.variants.find((v) => String(v?.label || "").trim().toLowerCase() === itemSize)
          : null;
        if (itemSize && !matchedVariant) {
          return res.status(400).json({ status: false, message: `Variant '${String(it.size || "")}' is not available for ${String(prod?.title || prod?.name || "this product")}` });
        }
        availableStock = matchedVariant
          ? Number(matchedVariant.stock || 0)
          : prod.variants.reduce((sum, variant) => sum + Math.max(0, Number(variant?.stock || 0)), 0);
        if (matchedVariant && !price) {
          price = Number(matchedVariant.price || matchedVariant.selling_price || 0);
        }
      }
      if (!price) {
        price = prod ? Number(prod.selling_price || prod.price || 0) : 0;
      }
      const qty = Number(it.quantity) || 1;
      if (qty > Math.max(0, availableStock)) {
        return res.status(409).json({
          status: false,
          message: `${String(prod?.title || prod?.name || "Product")} is out of stock for requested quantity`,
          product_id: Number(it.product_id) || 0,
          requested_qty: qty,
          available_qty: Math.max(0, availableStock),
        });
      }
      const variantImage = Array.isArray(prod?.variants) && prod.variants.length
        ? String(prod.variants[0]?.image || "")
        : "";
      const productImage = Array.isArray(prod?.product_image) && prod.product_image.length
        ? String(prod.product_image[0] || "")
        : "";
      amountPaise += Math.max(price, 0) * qty * 100;
      orderItems.push({
        product_id: it.product_id,
        quantity: qty,
        price,
        size: it.size || "",
        color: itemColor,
        product_name: String(prod?.title || prod?.name || ""),
        product_image: productImage || variantImage,
        product: prod?._id,
      });
    }
    if (!amountPaise) {
      return res.status(400).json({ status: false, message: "Unable to calculate order amount from items" });
    }

    const payload = {
      amount: Math.round(amountPaise),
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      payment_capture: 1,
      notes: { address_id: address_id || "" },
    };

    const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const rpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
      body: JSON.stringify(payload),
    });

    if (!rpRes.ok) {
      const text = await rpRes.text();
      throw new Error(`Razorpay order failed: ${rpRes.status} ${text}`);
    }
    const order = await rpRes.json();

    return res.status(200).json({
      status: true,
      order,
      key: keyId,
      amount: payload.amount,
      currency: payload.currency,
      order_preview: {
        items: orderItems,
        address_id: address_id || null,
        email: auth.email || "",
      },
    });
  } catch (error) {
    console.error("createOrder error:", error);
    return res.status(500).json({ status: false, message: "Failed to create order" });
  }
};

export const confirmPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      items = [],
      address_id,
      email = "",
    } = req.body || {};
    const customerAccess = await ensureActiveCustomer(email);
    if (!customerAccess.ok) {
      return res.status(customerAccess.code).json({ status: false, message: customerAccess.message });
    }
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

    let order = await Orders.findOne({ razorpay_order_id });
    if (!order) {
      const ids = Array.isArray(items) ? items.map((i) => Number(i.product_id)).filter(Boolean) : [];
      const products = await Products.find({ product_id: { $in: ids } }).lean();
      const productMap = new Map(products.map((p) => [p.product_id, p]));
      const orderItems = [];
      let amountPaise = 0;

      for (const it of items) {
        const prod = productMap.get(Number(it.product_id));
        if (!prod) {
          return res.status(400).json({ status: false, message: `Product not found for item ${String(it?.product_id || "")}` });
        }
        const itemSize = String(it.size || "").trim().toLowerCase();
        const requestedPrice = Number(it.price || 0);
        let price = Number.isFinite(requestedPrice) && requestedPrice > 0 ? requestedPrice : 0;
        let availableStock = Number(prod.quantity || 0);
        if (Array.isArray(prod.variants) && prod.variants.length > 0) {
          const matchedVariant = itemSize
            ? prod.variants.find((v) => String(v?.label || "").trim().toLowerCase() === itemSize)
            : null;
          if (itemSize && !matchedVariant) {
            return res.status(400).json({ status: false, message: `Variant '${String(it.size || "")}' is not available for ${String(prod?.title || prod?.name || "this product")}` });
          }
          availableStock = matchedVariant
            ? Number(matchedVariant.stock || 0)
            : prod.variants.reduce((sum, variant) => sum + Math.max(0, Number(variant?.stock || 0)), 0);
          if (matchedVariant && !price) price = Number(matchedVariant.price || matchedVariant.selling_price || 0);
        }
        if (!price) price = prod ? Number(prod.selling_price || prod.price || 0) : 0;
        const qty = Number(it.quantity) || 1;
        if (qty > Math.max(0, availableStock)) {
          return res.status(409).json({
            status: false,
            message: `${String(prod?.title || prod?.name || "Product")} is out of stock for requested quantity`,
            product_id: Number(it.product_id) || 0,
            requested_qty: qty,
            available_qty: Math.max(0, availableStock),
          });
        }
        const variantImage = Array.isArray(prod?.variants) && prod.variants.length
          ? String(prod.variants[0]?.image || "")
          : "";
        const productImage = Array.isArray(prod?.product_image) && prod.product_image.length
          ? String(prod.product_image[0] || "")
          : "";
        amountPaise += Math.max(price, 0) * qty * 100;
        orderItems.push({
          product_id: it.product_id,
          quantity: qty,
          price,
          size: it.size || "",
          color: it.color || "",
          product_name: String(prod?.title || prod?.name || ""),
          product_image: productImage || variantImage,
          product: prod?._id,
        });
      }

      const addressDoc = address_id
        ? await Addresses.findOne({ address_id: Number(address_id) })
        : null;

      const localOrderId = await generateUniqueOrderId();
      order = await Orders.create({
        order_id: localOrderId,
        order_code: localOrderId,
        status: "confirmed",
        payment_status: "paid",
        payment_method: "Razorpay",
        amount: amountPaise,
        currency: "INR",
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        items: orderItems,
        address: addressDoc?._id,
        user_email: customerAccess.email || "",
        FullName: addressDoc?.FullName || addressDoc?.full_name || "",
        phone1: addressDoc?.phone1 || addressDoc?.phone || "",
        phone2: addressDoc?.phone2 || addressDoc?.alt_phone || "",
        address_line1: addressDoc?.address_line1 || addressDoc?.address || "",
        city: addressDoc?.city || "",
        state: addressDoc?.state || "",
        country: addressDoc?.country || "",
        pinCode: addressDoc?.pinCode || addressDoc?.postal_code || "",
        addressType: addressDoc?.addressType || "",
        status_history: [
          { status: "confirmed", updatedAt: new Date(), updatedBy: "system", note: "Payment verified" },
        ],
      });
    } else {
      order.payment_status = "paid";
      order.status = "confirmed";
      order.razorpay_payment_id = razorpay_payment_id;
      order.razorpay_signature = razorpay_signature;
      appendStatusHistory(order, "confirmed", "system", "Payment verified");
      await order.save();
    }

    // Reduce stock for each item in the order
    for (const item of order.items) {
      const product = item.product ? await Products.findById(item.product) : await Products.findOne({ product_id: item.product_id });
      if (!product) continue;
      if (product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          if (variant.label === item.size || variant.label?.toLowerCase() === String(item.size || "").toLowerCase()) {
            variant.stock = Math.max(0, (variant.stock || 0) - item.quantity);
          }
        }
      } else {
        product.quantity = Math.max(0, (product.quantity || 0) - item.quantity);
      }
      await product.save();
    }

    return res.status(200).json({ status: true, message: "Payment verified", order_id: order?.order_id });
  } catch (error) {
    console.error("confirmPayment error:", error);
    return res.status(500).json({ status: false, message: "Failed to confirm payment" });
  }
};

export const updateUserAddress = async (req, res) => {
  try {
    const auth = await ensureActiveCustomer(req.body?.email);
    if (!auth.ok) {
      return res.status(auth.code).json({ status: false, message: auth.message });
    }
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

export const getUserAddresses = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(200).json({ status: true, addresses: [], data: [], message: "ok" });
    }
    const auth = await ensureActiveCustomer(email);
    if (!auth.ok) {
      return res.status(auth.code).json({ status: false, message: auth.message });
    }

    const addresses = await Addresses.find({ email: auth.email }).sort({ createdAt: -1 });
    const mapped = addresses.map((a) => ({
      id: a.address_id || a._id?.toString(),
      address_id: a.address_id,
      FullName: a.FullName || a.full_name || "",
      phone1: a.phone1 || a.phone || "",
      phone2: a.phone2 || a.alt_phone || "",
      email: a.email || "",
      country: a.country || "",
      state: a.state || "",
      city: a.city || "",
      pinCode: a.pinCode || a.postal_code || "",
      address: a.address || a.address_line1 || "",
      address_line2: a.address_line2 || "",
      addressType: a.addressType || "",
    }));
    return res
      .status(200)
      .json({ status: true, addresses: mapped, data: mapped, message: "ok" });
  } catch (error) {
    console.error("getUserAddresses error:", error);
    return res.status(500).json({ status: false, message: "Failed to load addresses" });
  }
};

export const createNewAddress = async (req, res) => {
  try {
    const payload = req.body || {};
    const auth = await ensureActiveCustomer(payload.email);
    if (!auth.ok) {
      return res.status(auth.code).json({ status: false, message: auth.message });
    }
    if (!payload.address_id) {
      payload.address_id = await getNextSequence("address_id");
    }
    const addr = await Addresses.create({
      address_id: payload.address_id,
      full_name: payload.FullName,
      email: auth.email,
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
    const auth = await ensureActiveCustomer(req.body?.email);
    if (!auth.ok) {
      return res.status(auth.code).json({ status: false, message: auth.message });
    }
    const idStr = order_id || id;
    if (!idStr) {
      return res.status(400).json({ status: false, message: "order_id required" });
    }

    const query = resolveOrderQuery(idStr);
    if (!query) {
      return res.status(400).json({ status: false, message: "order_id required" });
    }

    const order = await Orders.findOne(query);
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }

    const finalStatuses = ["cancelled", "rejected", "delivered", "rto", "refund", "refunded", "return"];
    if (finalStatuses.includes((order.status || "").toLowerCase())) {
      return res
        .status(400)
        .json({ status: false, message: `Order already ${order.status}` });
    }

    const blockedStatuses = ["processed", "in_transit", "in transit", "shipped", "out_for_delivery", "delivered"];
    if (blockedStatuses.includes(String(order.status || "").toLowerCase())) {
      return res.status(400).json({ status: false, message: "Order can only be cancelled before shipping." });
    }

    order.status = "cancelled";
    order.payment_status = order.payment_status === "paid" ? "refund_pending" : "cancelled";
    appendStatusHistory(order, "cancelled", "user", "Cancelled by user");
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

export const returnOrder = async (req, res) => {
  try {
    const { order_id, id, reason } = req.body || {};
    const auth = await ensureActiveCustomer(req.body?.email);
    if (!auth.ok) {
      return res.status(auth.code).json({ status: false, message: auth.message });
    }
    const query = resolveOrderQuery(order_id || id);
    if (!query) {
      return res.status(400).json({ status: false, message: "order_id required" });
    }
    const order = await Orders.findOne(query);
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }
    const status = String(order.status || "").toLowerCase();
    if (status !== "delivered") {
      return res.status(400).json({ status: false, message: "Return allowed only for delivered orders." });
    }
    const deliveredEntry = (Array.isArray(order.status_history) ? [...order.status_history] : [])
      .reverse()
      .find((entry) => String(entry?.status || "").toLowerCase() === "delivered");
    const deliveredAt = deliveredEntry?.updatedAt ? new Date(deliveredEntry.updatedAt) : new Date(order.updatedAt || order.createdAt);
    const returnWindowEnd = new Date(deliveredAt.getTime() + 5 * 24 * 60 * 60 * 1000);
    if (Date.now() > returnWindowEnd.getTime()) {
      return res.status(400).json({ status: false, message: "Return window closed (5 days after delivery)." });
    }

    order.status = "return";
    if (String(order.payment_status || "").toLowerCase() === "paid") {
      order.payment_status = "refund_pending";
    }
    appendStatusHistory(order, "return", "user", reason || "Requested by user");
    await order.save();
    return res.status(200).json({ status: true, message: "Return requested", order });
  } catch (error) {
    console.error("returnOrder error:", error);
    return res.status(500).json({ status: false, message: "Failed to request return" });
  }
};
