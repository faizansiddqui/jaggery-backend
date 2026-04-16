import { Catagories } from "../model/catagory.model.js";
import mongoose from "mongoose";
import Products from "../model/product.model.js";
import DraftProducts from "../model/draftProduct.model.js";
import Orders from "../model/orders.model.js";
import Reviews from "../model/review.model.js";
import Wishlist from "../model/wishlist.model.js";
import Cart from "../model/cart.model.js";
import Profile from "../model/profile.model.js";
import UserSession from "../model/session.model.js";
import UserActivity from "../model/activity.model.js";
import SiteSettings from "../model/siteSettings.model.js";
import { getNextSequence } from "../model/counter.model.js";
import Banner from "../model/banner.model.js";
import Testimonial from "../model/testimonial.model.js";
import NewsletterSubscriber from "../model/newsletterSubscriber.model.js";
import ContactSubmission from "../model/contactSubmission.model.js";
import { sendBrevoEmail } from "../utils/brevo.js";
import {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
} from "../config/cloudinary.js";
import {
  buildProductSearchFilter,
  filterProductsByColorName,
  pickMatchedColor,
  parseSearchQuery,
  buildTokenRegex,
} from "../utils/search.js";
import {
  notifySubscribersInstagramPost,
  notifySubscribersProductInStock,
  notifySubscribersProductUploaded,
} from "../utils/subscriberNotifications.js";
import {
  notifyProductWaitlistIfRestocked,
  resetProductWaitlistIfOutOfStock,
  notifyProductWaitlistForVariant,
  resetProductWaitlistForVariant,
} from "../utils/productStockNotifications.js";

const createRandomAlphaNum = (length = 12) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};

// Helper to call notification utilities that may be sync or return a Promise.
// Accepts a function that invokes the notification and a label for logging.
const safeFireAndForget = (fn, label) => {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      result.catch((err) => console.error(`${label} error:`, err?.message || err));
    }
  } catch (err) {
    console.error(`${label} error:`, err?.message || err);
  }
};

const normalizeVariantField = (value) => String(value || "").trim().toLowerCase();
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || "").trim());

const buildVariantStockMap = (product) => {
  const map = new Map();
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  variants.forEach((variant) => {
    const labelKey = normalizeVariantField(variant?.label);
    map.set(labelKey, Math.max(0, Number(variant?.stock || 0)));
  });
  return map;
};

const getEnvString = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
};

const DEFAULT_INSTAGRAM_GALLERY_URLS = [
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBB6krFZt3NforzP_CzR4ptQE8-y0eealOxaiOFyw-M_PiEaPfHJmpJx0KQ69PoCCe-8I9bO5ABXLOBzrYtxX6fodcfeGMSdhpRfwL4ik_U7Ohea9FqYCZZSy7necDaaZIVUyzB_JQcC1LoUfL-N7sffd-8fBPsMnS85KvnWDDmmtG2s3J-VvSA4OrZAuNxF2A_7khyXBN_RpmcxVAJR8BB5pYxp6lAeHd0vJVeHjz7LL1feXps7U4mxDgFMTAl-Zan8yykFBkZfy-U",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuD7-2TpSC81XkW68SsR5qO7YCUI-agr1FkXJz6iAL2GqdUeil7o-SGTIwoV6Udw2sePVRGEriL-oq9SUQgYH-3hEcuZkF1k-3CDFq-cr9pZnDiVmYHzQPUSiyV0udgVA1j_DWyF6JsNYQjHAkNW1TvbfkMsSnfIjpYIytsbmvb-ArCRej6S77U1GKT9jkDQrHJPzf3oEUrheRg5hgvx1fyraxmtsXLolgFIgYq-RwSv0Evi8FhdOpgt5AtDXT6cBWXgqs8RTmyqT0yf",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBbPAmDMHekqLqrXZLergrySXBUGDZAJIKoEwWT1bZDzRqtg810OU5KsX8xa0w_bgyQIU4a-FSWdOAE4biaiMTeurKmzMJDdLPSSxFc_jAKcsvG44n2gEBH_EwG6oQtmdvBU_BYpG-qhla42bC3ppOILHBgUvSKvt9HCeTLNOVDMlliJFbzs15y6y0NDpMyky2-PtgjrfPcnMlT_A0EKisv2thjdd3ra_3fxCKp6EJ31D4eD_twaLrvhbkw5QN1hT3gD9nV9w4xqUiy",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuDKAQ6BN0zpefAWyL1BvwOEYUEHMo8megKTLEmt-S9eb_xLkICO0VQBcPdxjmxdGWX67pZWCsubEihh4MyCwW_aCBjGPXwvOrVMtN_hdtoO3OtP8TuKjEMC4NmQcJLekA7TqDEzk0zKdmI0cWcln_TOiEWQfsOD6helF5CSyKnGrEkpzLixSICrqKjMM-IM9wmXsOXvsQ2nG37VyYlvjtWZq5Vbs3kpZlcNs_wybr-LmbxRQU9ojYeli7yk0P0adT7B7KreSF6SAEOy",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBgvVDiPytr5AGZgDZEwwSmR3CutLMkDaeDqvODNfZKhHAjqN30RAbqvGyYv2Ddf1K7hOFW8ck7KQZb0SMZpzGK9JdP9O4bSZky_-Hm8If1mGAd_t3ke4dh6QyAGJvSbuIE3E6KvrcS_GflfJjf_cDSoUg_Xs35w1LaO2RMVncewWVLNo6mKsEiv1bLbczujHaErcgcinzCspq74o89foNU-zduQpPAyFJmIiFQllEhnz0xVRV2vdQbyZmZF4HEfTM2TNB1CUQ8qqcT",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuC39Rz00OUHQlENEoJpluueV1-p681BILVYn3ImGm_Pys2GQnFrWvE6k7JoE48_-SJVR-IQWsuBzseVTa3wmytgVSCAzj8Rk82xFapDFYCsJpw8_r803fBj80Dx84pd_ioNPiR1LqgQQ_wW_Hb5yewgMeb_xlKK_ASJrhCHZWwlHzvDQH0Oi8n3EL2-UYHxi6deJgoWXu2gSMXjYjG0Cc2NQCs9qug9oae_JceeOUjBarf5jOL8Ocrq8KVSXcPZ64dXclnUXT4YFdhS",
];

const normalizeInstagramHandle = (value) => {
  const normalized = String(value || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "");
  return normalized || "kinetic_riot";
};

const buildDefaultInstagramGallery = () =>
  DEFAULT_INSTAGRAM_GALLERY_URLS.map((imageUrl, index) => ({
    imageUrl,
    imagePublicId: "",
    username: "kinetic_riot",
    sortOrder: index,
    isActive: true,
  }));

const buildDefaultSiteSettings = () => ({
  siteName: getEnvString("NEXT_PUBLIC_SITE_NAME") || "STREETRIOT",
  navbarTitle: getEnvString("NEXT_PUBLIC_SITE_NAME") || "STREETRIOT",
  footerTitle: getEnvString("NEXT_PUBLIC_SITE_NAME") || "STREETRIOT",
  footerDescription:
    getEnvString("NEXT_PUBLIC_FOOTER_DESCRIPTION") ||
    "Forging the future of urban streetwear. Precision engineered, culturally driven, and globally distributed.",
  companyAddress: getEnvString("NEXT_PUBLIC_COMPANY_ADDRESS"),
  companyEmail: getEnvString("NEXT_PUBLIC_COMPANY_EMAIL"),
  companyPhone: getEnvString("NEXT_PUBLIC_COMPANY_PHONE"),
  emailFooterDescription:
    getEnvString("EMAIL_FOOTER_DESCRIPTION", "NEXT_PUBLIC_EMAIL_FOOTER_DESCRIPTION") ||
    "This is an automated message from StreetRiot commerce engine.",
  logoUrl: getEnvString("NEXT_PUBLIC_BRAND_LOGO_URL", "NEXT_PUBLIC_LOGO_URL"),
  logoPublicId: "",
  currencySymbol: getEnvString("NEXT_PUBLIC_CURRENCY") || "$",
  instagramUrl: getEnvString("NEXT_PUBLIC_INSTAGRAM_URL"),
  instagramHandle: normalizeInstagramHandle(
    getEnvString("NEXT_PUBLIC_INSTAGRAM_HANDLE") || "kinetic_riot"
  ),
  instagramGallery: buildDefaultInstagramGallery(),
  twitterUrl: getEnvString("NEXT_PUBLIC_TWITTER_URL"),
  youtubeUrl: getEnvString("NEXT_PUBLIC_YOUTUBE_URL"),
  facebookUrl: getEnvString("NEXT_PUBLIC_FACEBOOK_URL"),
});

const sanitizeUrl = (value) => {
  const input = String(value || "").trim();
  if (!input) return "";
  if (/^https?:\/\//i.test(input)) return input;
  return `https://${input}`;
};

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const SOCIAL_HOST_WHITELIST = {
  instagram: ["instagram.com", "instagr.am"],
  twitter: ["twitter.com", "x.com"],
  youtube: ["youtube.com", "youtu.be"],
  facebook: ["facebook.com", "fb.com"],
};

const isAllowedSocialHost = (hostname, allowedHosts) =>
  allowedHosts.some((allowedHost) =>
    hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
  );

const sanitizeSocialUrl = (value, platformLabel, allowedHosts) => {
  const normalized = sanitizeUrl(value);
  if (!normalized) return "";

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw createHttpError(400, `${platformLabel} URL is invalid.`);
  }

  const protocol = String(parsed.protocol || "").toLowerCase();
  if (protocol !== "https:") {
    throw createHttpError(400, `${platformLabel} URL must start with https://`);
  }

  const hostname = String(parsed.hostname || "").toLowerCase();
  if (!hostname || !isAllowedSocialHost(hostname, allowedHosts)) {
    throw createHttpError(
      400,
      `${platformLabel} URL must point to ${allowedHosts.join(" or ")}.`
    );
  }

  return parsed.toString();
};

const shapeSiteSettings = (doc) => {
  const defaults = buildDefaultSiteSettings();
  const hasSavedGallery = !!doc && Array.isArray(doc.instagramGallery);
  const gallerySource = hasSavedGallery ? doc.instagramGallery : defaults.instagramGallery;

  const instagramGallery = gallerySource
    .map((entry, index) => ({
      id: entry?._id ? String(entry._id) : `default-${index}`,
      imageUrl: String(entry?.imageUrl || ""),
      imagePublicId: String(entry?.imagePublicId || ""),
      username: normalizeInstagramHandle(
        entry?.username ?? doc?.instagramHandle ?? defaults.instagramHandle
      ),
      sortOrder: Number.isFinite(Number(entry?.sortOrder))
        ? Number(entry.sortOrder)
        : index,
      isActive: entry?.isActive !== false,
    }))
    .filter((entry) => entry.imageUrl);

  instagramGallery.sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    siteName: String(doc?.siteName ?? defaults.siteName),
    navbarTitle: String(doc?.navbarTitle ?? doc?.siteName ?? defaults.navbarTitle),
    footerTitle: String(doc?.footerTitle ?? doc?.siteName ?? defaults.footerTitle),
    footerDescription: String(doc?.footerDescription ?? defaults.footerDescription),
    companyAddress: String(doc?.companyAddress ?? defaults.companyAddress ?? ""),
    companyEmail: String(doc?.companyEmail ?? defaults.companyEmail ?? ""),
    companyPhone: String(doc?.companyPhone ?? defaults.companyPhone ?? ""),
    emailFooterDescription: String(
      doc?.emailFooterDescription ?? defaults.emailFooterDescription
    ),
    logoUrl: String(doc?.logoUrl ?? defaults.logoUrl ?? ""),
    logoPublicId: String(doc?.logoPublicId ?? defaults.logoPublicId ?? ""),
    currencySymbol: String(doc?.currencySymbol ?? defaults.currencySymbol),
    instagramUrl: String(doc?.instagramUrl ?? defaults.instagramUrl ?? ""),
    instagramHandle: normalizeInstagramHandle(doc?.instagramHandle ?? defaults.instagramHandle),
    instagramGallery,
    twitterUrl: String(doc?.twitterUrl ?? defaults.twitterUrl ?? ""),
    youtubeUrl: String(doc?.youtubeUrl ?? defaults.youtubeUrl ?? ""),
    facebookUrl: String(doc?.facebookUrl ?? defaults.facebookUrl ?? ""),
    updatedBy: String(doc?.updatedBy ?? "admin"),
    updatedAt: doc?.updatedAt || null,
  };
};

const ensurePrimarySiteSettings = async () => {
  const defaults = buildDefaultSiteSettings();
  let doc = await SiteSettings.findOneAndUpdate(
    { key: "primary" },
    {
      $setOnInsert: {
        key: "primary",
        ...defaults,
        updatedBy: "system",
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  ).lean();

  const patch = {};
  if (!doc?.instagramHandle) {
    patch.instagramHandle = defaults.instagramHandle;
  }
  if (!Array.isArray(doc?.instagramGallery)) {
    patch.instagramGallery = defaults.instagramGallery;
  }

  if (Object.keys(patch).length) {
    doc = await SiteSettings.findOneAndUpdate(
      { key: "primary" },
      { $set: patch },
      { returnDocument: "after" }
    ).lean();
  }

  return doc;
};

const generateProductCode = async () => {
  for (let i = 0; i < 10; i += 1) {
    const candidate = createRandomAlphaNum(12);
    const exists = await Products.findOne({ product_code: candidate }).select("_id").lean();
    if (!exists) return candidate;
  }
  return `KNTC${Date.now().toString(36).toUpperCase()}`.slice(0, 15);
};

// ---------- Category helpers ----------
const buildCategoryTree = (categories) => {
  const map = new Map();
  categories.forEach((doc) => {
    const obj = doc.toObject();
    obj.id = obj._id; // convenience for frontend
    obj.children = [];
    map.set(String(obj._id), obj);
  });

  const roots = [];
  map.forEach((cat) => {
    const parentFromField = cat.parent ? String(cat.parent) : (cat.parentId ? String(cat.parentId) : null);
    const parentFromAncestors = Array.isArray(cat.ancestors) && cat.ancestors.length
      ? String(cat.ancestors[cat.ancestors.length - 1]?._id || "")
      : null;
    const parentId = parentFromField || parentFromAncestors;
    if (parentId && map.has(parentId)) {
      map.get(parentId).children.push(cat);
    } else {
      roots.push(cat);
    }
  });

  const sortDeep = (nodes) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortDeep(n.children));
  };
  sortDeep(roots);
  return roots;
};

const createCategory = async (req, res) => {
  const { name, parentId, levels } = req.body;
  try {
    // allow creating an entire chain in one request: ["Mens", "Bottom Wear", "Jeans"]
    if (Array.isArray(levels) && levels.length > 0) {
      let parentDoc = null;
      for (const rawName of levels) {
        const trimmed = (rawName || "").trim();
        if (!trimmed) {
          return res
            .status(400)
            .json({ status: false, message: "Category names cannot be empty." });
        }
        const parentRef = parentDoc ? parentDoc._id : null;
        let existing = await Catagories.findOne({
          name: trimmed,
          $or: [{ parent: parentRef }, { parentId: parentRef }],
        });
        if (!existing) {
          const ancestors = parentDoc
            ? [
              ...parentDoc.ancestors,
              { _id: parentDoc._id, name: parentDoc.name },
            ]
            : [];
          existing = await Catagories.create({
            name: trimmed,
            parent: parentRef,
            parentId: parentRef,
            ancestors,
          });
        }
        parentDoc = existing;
      }
      return res.status(201).json({
        status: true,
        message: "Category chain ensured/created successfully",
        category: parentDoc,
      });
    }

    const trimmed = (name || "").trim();
    if (!trimmed) {
      return res.status(400).json({ status: false, message: "Category name required" });
    }

    let parentDoc = null;
    let ancestors = [];
    if (parentId) {
      parentDoc = await Catagories.findById(parentId);
      if (!parentDoc) {
        return res
          .status(404)
          .json({ status: false, message: "Parent category not found" });
      }
      ancestors = [
        ...parentDoc.ancestors,
        { _id: parentDoc._id, name: parentDoc.name },
      ];
    }

    const parentRef = parentDoc ? parentDoc._id : null;
    const result = await Catagories.create({
      name: trimmed,
      parent: parentRef,
      parentId: parentRef,
      ancestors,
    });
    res.status(201).json({ status: true, category: result });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        status: false,
        message: "Category already exists at this level",
      });
    }
    console.error("createCategory error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const parseArrayField = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map((v) => String(v).trim());
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter(Boolean).map((v) => String(v).trim());
    }
  } catch (_) {
    /* fall back */
  }
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
};

const parseHighlights = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => ({
          key: String(item.key || "").trim(),
          value: String(item.value || "").trim(),
        }))
        .filter((h) => h.key && h.value);
    }
  } catch (_) {
    /* fall back */
  }
  return [];
};

const parseWeightVariants = (value) => {
  if (!value) return [];
  let arr = [];
  if (typeof value === "string") {
    try {
      arr = JSON.parse(value);
    } catch {
      return [];
    }
  } else if (Array.isArray(value)) {
    arr = value;
  } else {
    return [];
  }
  return arr
    .map((v) => ({
      label: String(v.label || v.weight || v.size || "").trim(), // e.g., "500g", "1kg"
      stock: Math.max(0, Number(v.stock || v.quantity || 0)),
      price: v.price != null ? Number(v.price) : 0,
      originalPrice: v.originalPrice != null ? Number(v.originalPrice) : v.price != null ? Number(v.price) : 0,
      selling_price: v.selling_price != null ? Number(v.selling_price) : v.price != null ? Number(v.price) : 0,
      image: v.image || v.existingImage || undefined,
    }))
    .filter((v) => v.label);
};

const validateWeightVariants = (wvs) => {
  if (!wvs.length) return null; // Weight variants optional
  for (const wv of wvs) {
    if (!wv.label) return "Each variant must have a weight label (e.g., 500g, 1kg).";
    if (wv.price <= 0) return `Variant ${wv.label} must have a price greater than 0.`;
  }
  return null;
};

const applyWeightVariantsToDoc = (doc, wvs) => {
  doc.variants = wvs;
  // total quantity = sum of all variant stocks
  const totalQty = wvs.reduce((sum, v) => sum + (Number.isFinite(v.stock) ? v.stock : 0), 0);
  doc.quantity = totalQty;
  // Use first variant price as default if not set
  if (wvs.length > 0 && !doc.price) {
    doc.price = wvs[0].price;
    doc.selling_price = wvs[0].selling_price || wvs[0].price;
  }
};

const syncProductImagesFromVariants = (doc, variants = []) => {
  const variantImages = variants
    .map((variant) => String(variant?.image || "").trim())
    .filter(Boolean);
  const variantImagePublicIds = variants
    .map((variant) => String(variant?.imagePublicId || "").trim())
    .filter(Boolean);

  if (variantImages.length) {
    doc.product_image = variantImages;
    doc.image_public_ids = variantImagePublicIds;
  }
};

const validateMediaRules = ({ status, imagesCount, videoCount }) => {
  if (imagesCount > 10) {
    return "Maximum 10 images allowed.";
  }
  if (status === "published") {
    if (imagesCount < 1) return "At least 1 image is required to publish.";
  }
  return null;
};

const uploadMedia = async ({ productId, images = [], video }) => {
  const imageUrls = [];
  const imagePublicIds = [];
  for (const file of images) {
    const uploadRes = await uploadToCloudinary(
      file.buffer,
      `${productId}-${file.originalname}`,
      file.mimetype
    );
    imageUrls.push(uploadRes.secure_url);
    imagePublicIds.push(uploadRes.public_id);
  }

  let videoUrl = "";
  let videoPublicId = "";
  if (video) {
    const uploadRes = await uploadToCloudinary(
      video.buffer,
      `${productId}-${video.originalname}`,
      video.mimetype
    );
    videoUrl = uploadRes.secure_url;
    videoPublicId = uploadRes.public_id;
  }

  return { imageUrls, imagePublicIds, videoUrl, videoPublicId };
};

const uploadVariantMedia = async ({ productId, color, images = [], video }) => {
  const safeColor = (color || "color").replace(/[^a-zA-Z0-9_-]/g, "");
  const prefix = safeColor ? `${productId}-${safeColor}` : `${productId}-color`;
  const imgResult = await uploadMedia({ productId: prefix, images, video });
  return { images: imgResult.imageUrls, video: imgResult.videoUrl };
};

const stageFromLabel = (label = "") => {
  const l = label.toLowerCase();
  if (l.includes("pricing")) return "pricing";
  if (l.includes("media")) return "media";
  if (l.includes("detail")) return "details";
  if (l.includes("complete")) return "complete";
  return "category";
};

const DESCRIPTION_MAX_LENGTH = 1200;
const SPECIFICATIONS_MIN = 6;
const SPECIFICATIONS_MAX = 10;
const SKU_PATTERN = /^[A-Z]{2}-\d{3}$/;

const descriptionTextLength = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;

const normalizeSku = (value) => String(value || "").trim().toUpperCase();

const isValidSku = (value) => SKU_PATTERN.test(normalizeSku(value));

const normalizeFiles = (files) => {
  if (!files) return {};
  if (Array.isArray(files)) {
    const map = {};
    files.forEach((f) => {
      map[f.fieldname] = map[f.fieldname] || [];
      map[f.fieldname].push(f);
    });
    return map;
  }
  return files;
};

const uploadProduct = async (req, res) => {
  try {
    const files = normalizeFiles(req.files);
    // Handle multiple possible field names from uploadProductFiles
    const imageFiles = files.images || files.image || files.files || [];
    const videoFile = files.video ? files.video[0] : null;
    const variantImageFiles = files.variantImages || [];
    const {
      name,
      title,
      description,
      catagory,
      categoryId,
      specification,
      key_highlights,
      status: rawStatus,
      draft_stage,
      variants: rawVariants,
      sku,
      ingredients,
      nutritions,
    } = req.body;

    const status = (rawStatus || "draft").toLowerCase();
    if (!["draft", "published"].includes(status)) {
      return res.status(400).json({ status: false, message: "status must be 'draft' or 'published'" });
    }

    const descLength = descriptionTextLength(description);
    if (descLength > DESCRIPTION_MAX_LENGTH) {
      return res.status(400).json({ status: false, message: `description must be ${DESCRIPTION_MAX_LENGTH} characters or less` });
    }

    const providedCategoryId = categoryId || req.body.catagory_id;
    const category = providedCategoryId ? await Catagories.findById(providedCategoryId) : null;
    const fallbackCategory = !category && catagory ? await Catagories.findOne({ name: catagory.trim() }) : null;
    const finalCategory = category || fallbackCategory;
    if (!finalCategory) {
      return res.status(400).json({ status: false, message: "Valid categoryId is required. Create/select a category before uploading products." });
    }

    let specsArr = [];
    let highlightsArr = [];
    if (specification) {
      try {
        const parsed = JSON.parse(specification);
        specsArr = Object.entries(parsed).map(([key, value]) => ({ key, value }));
      } catch {
        return res.status(400).json({ message: "Invalid specification JSON" });
      }
      if (specsArr.length < SPECIFICATIONS_MIN || specsArr.length > SPECIFICATIONS_MAX) {
        return res.status(400).json({ status: false, message: `specifications must have ${SPECIFICATIONS_MIN}-${SPECIFICATIONS_MAX} items` });
      }
    }
    if (key_highlights) {
      highlightsArr = parseHighlights(key_highlights);
      if (highlightsArr.length < 6 || highlightsArr.length > 10) {
        return res.status(400).json({ status: false, message: "key_highlights must have 6-10 items" });
      }
    }

    // Parse weight variants
    const weightVariants = parseWeightVariants(rawVariants || req.body.variants);
    if (weightVariants.length) {
      const wvError = validateWeightVariants(weightVariants);
      if (wvError) {
        return res.status(400).json({ status: false, message: wvError });
      }
    }

    // Upload per-variant images
    let variantImageUrls = [];
    if (variantImageFiles.length > 0) {
      for (let i = 0; i < Math.min(variantImageFiles.length, weightVariants.length); i++) {
        const file = variantImageFiles[i];
        const uploadRes = await uploadToCloudinary(
          file.buffer,
          `variant-${Date.now()}-${file.originalname}`,
          file.mimetype
        );
        variantImageUrls.push(uploadRes.secure_url);
        // Attach image to corresponding variant
        weightVariants[i].image = uploadRes.secure_url;
        weightVariants[i].imagePublicId = uploadRes.public_id;
      }
    }

    // Upload product images (if no variants or additional images)
    let imageUrls = [];
    let publicIds = [];
    if (imageFiles.length > 0 && weightVariants.length === 0) {
      for (const file of imageFiles) {
        const uploadRes = await uploadToCloudinary(
          file.buffer,
          `product-${Date.now()}-${file.originalname}`,
          file.mimetype
        );
        imageUrls.push(uploadRes.secure_url);
        publicIds.push(uploadRes.public_id);
      }
    }

    // Upload video if provided
    let videoUrl = "";
    let videoPublicId = "";
    if (videoFile) {
      const uploadRes = await uploadToCloudinary(
        videoFile.buffer,
        `product-video-${Date.now()}-${videoFile.originalname}`,
        videoFile.mimetype
      );
      videoUrl = uploadRes.secure_url;
      videoPublicId = uploadRes.public_id;
    }

    const productId = await getNextSequence("product_id");
    let newProduct = new Products({
      product_id: productId,
      product_code: await generateProductCode(),
      title: title || name,
      name,
      description,
      catagory_id: finalCategory._id,
      specifications: specsArr,
      key_highlights: highlightsArr,
      product_image: imageUrls,
      image_public_ids: publicIds,
      video_url: videoUrl,
      video_public_id: videoPublicId,
      variants: weightVariants,
      sku,
      ingredients: ingredients ? JSON.parse(ingredients) : [],
      nutritions: nutritions ? JSON.parse(nutritions) : [],
      status,
      draft_stage: draft_stage || (status === "published" ? "complete" : "details"),
    });

    // Apply variants to set quantity and price if not set
    if (weightVariants.length) {
      applyWeightVariantsToDoc(newProduct, weightVariants);
      syncProductImagesFromVariants(newProduct, weightVariants);
    }

    await newProduct.save();

    // Notify subscribers (fire and forget - doesn't return promise)
    try {
      const result = notifySubscribersProductUploaded(newProduct.toObject());
      if (result && typeof result.then === 'function') {
        result.then((res) => {
          if (res?.total) {
            console.log("product upload campaign:", res);
          }
        }).catch((err) => {
          console.error("notifySubscribersProductUploaded error:", err?.message || err);
        });
      }
    } catch (err) {
      console.error("notifySubscribersProductUploaded error:", err?.message || err);
    }

    res.status(201).json({
      message: status === "published" ? "Product published successfully!" : "Draft saved successfully!",
      product: newProduct,
    });
  } catch (error) {
    console.error("uploadProduct error:", error);
    res.status(500).json({ message: "Server error", error: error.message || error });
  }
};

// ------- Drafts -------
const createDraftProduct = async (req, res) => {
  const files = normalizeFiles(req.files);
  const imageFiles = files.images || files.image || files.files || [];
  const videoFile = files.video ? files.video[0] : null;
  const variantImageFiles = files.variantImages || [];

  const {
    name,
    title,
    price,
    quantity,
    sku,
    description,
    catagory,
    categoryId,
    specification,
    selling_price,
    selling_price_link,
    key_highlights,
    draft_stage,
    variants: rawVariants,
    ingredients,
    nutritions,
  } = req.body;
  const weightVariants = parseWeightVariants(rawVariants || req.body.variants);

  try {
    const providedCategoryId = categoryId || req.body.catagory_id;
    const category = providedCategoryId
      ? await Catagories.findById(providedCategoryId)
      : null;
    const fallbackCategory =
      !category && catagory ? await Catagories.findOne({ name: catagory.trim() }) : null;
    const finalCategory = category || fallbackCategory || null;

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
      // Only validate specifications length if a new, non-empty `specification`
      // payload was provided in the request body. This matches the upload flow
      // where specs are only enforced when explicitly sent by the client.
      if (specification) {
        if (specsArr.length < SPECIFICATIONS_MIN || specsArr.length > SPECIFICATIONS_MAX) {
          return res.status(400).json({
            status: false,
            message: `specifications must have ${SPECIFICATIONS_MIN}-${SPECIFICATIONS_MAX} items`,
          });
        }
      }
    }
    let highlightsArr = parseHighlights(key_highlights);
    if (highlightsArr.length && (highlightsArr.length < 6 || highlightsArr.length > 10)) {
      return res
        .status(400)
        .json({ status: false, message: "key_highlights must have 6-10 items" });
    }

    // Validate weight variants
    const wvError = validateWeightVariants(weightVariants);
    if (wvError) {
      return res.status(400).json({ status: false, message: wvError });
    }

    // Upload per-variant images
    if (variantImageFiles.length > 0 && weightVariants.length > 0) {
      for (let i = 0; i < Math.min(variantImageFiles.length, weightVariants.length); i++) {
        const file = variantImageFiles[i];
        const uploadRes = await uploadToCloudinary(
          file.buffer,
          `variant-${Date.now()}-${file.originalname}`,
          file.mimetype
        );
        weightVariants[i].image = uploadRes.secure_url;
        weightVariants[i].imagePublicId = uploadRes.public_id;
      }
    }

    const draftId = await getNextSequence("draft_id");
    let draft = new DraftProducts({
      draft_id: draftId,
      title,
      name,
      price: price ? Number(price) : undefined,
      selling_price: selling_price ? Number(selling_price) : undefined,
      description,
      selling_price_link,
      product_image: [],
      image_public_ids: [],
      video_url: "",
      video_public_id: "",
      quantity: quantity ? Number(quantity) : undefined,
      sku,
      catagory_id: finalCategory?._id,
      specifications: specsArr,
      key_highlights: highlightsArr,
      ingredients: ingredients ? JSON.parse(ingredients) : [],
      nutritions: nutritions ? JSON.parse(nutritions) : [],
      draft_stage: draft_stage || stageFromLabel(draft_stage) || "details",
      status: "draft",
    });

    if (weightVariants.length) {
      applyWeightVariantsToDoc(draft, weightVariants);
    } else {
      const { imageUrls, imagePublicIds, videoUrl, videoPublicId } = await uploadMedia({
        productId: `draft-${draftId}`,
        images: imageFiles,
        video: videoFile,
      });
      draft.product_image = imageUrls;
      draft.image_public_ids = imagePublicIds;
      draft.video_url = videoUrl;
      draft.video_public_id = videoPublicId;
    }

    await draft.save();

    res.status(201).json({ status: true, draft });
  } catch (error) {
    console.error("createDraftProduct error:", error);
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { product_id } = req.params;
    const files = normalizeFiles(req.files);
    // Handle multiple possible field names from uploadProductFiles
    const imageFiles = files.images || files.image || files.files || [];
    const videoFile = files.video ? files.video[0] : null;
    const variantImageFiles = files.variantImages || [];
    const variantImageIndexes = parseArrayField(
      req.body.variantImageIndexes || req.body.variant_image_indexes
    )
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0);
    const removedImageUrls = parseArrayField(req.body.removedImageUrls || req.body.removed_image_urls);
    const removeVideoFlag = req.body.removeVideo === "true";
    const {
      name,
      title,
      price,
      quantity,
      sku,
      description,
      catagory,
      categoryId,
      specification,
      selling_price,
      selling_price_link,
      key_highlights,
      status: rawStatus,
      draft_stage,
      variants: rawVariants,
      ingredients,
      nutritions,
    } = req.body;

    console.log('Update product request body:', { name, sku, ingredients, nutritions, rawVariants });
    const weightVariants = parseWeightVariants(rawVariants || req.body.variants);

    const status = rawStatus ? rawStatus.toLowerCase() : undefined;

    if (description !== undefined) {
      const descLength = descriptionTextLength(description);
      if (descLength > DESCRIPTION_MAX_LENGTH) {
        console.log('Validation failed: description too long', descLength);
        return res.status(400).json({
          status: false,
          message: `description must be ${DESCRIPTION_MAX_LENGTH} characters or less`,
        });
      }
    }

    const hasPrice = price !== undefined && price !== null && String(price).trim() !== "";
    const hasSellingPrice =
      selling_price !== undefined && selling_price !== null && String(selling_price).trim() !== "";
    const hasSku = sku !== undefined && sku !== null && String(sku).trim() !== "";
    const parsedSku = hasSku ? normalizeSku(sku) : undefined;
    const parsedPrice = hasPrice ? Number(price) : undefined;
    const parsedSellingPrice = hasSellingPrice ? Number(selling_price) : undefined;

    if (hasSku && !isValidSku(parsedSku)) {
      console.log('Validation failed: invalid SKU format', parsedSku);
      return res.status(400).json({
        status: false,
        message: "sku format must be AA-123 (2 uppercase letters, hyphen, 3 digits)",
      });
    }

    if (hasPrice && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
      console.log('Validation failed: invalid price', parsedPrice);
      return res.status(400).json({ status: false, message: "price must be a valid number greater than 0" });
    }
    if (hasSellingPrice && (!Number.isFinite(parsedSellingPrice) || parsedSellingPrice < 0)) {
      console.log('Validation failed: invalid selling_price', parsedSellingPrice);
      return res
        .status(400)
        .json({ status: false, message: "selling_price must be a valid number" });
    }

    let product = await Products.findOne({ product_id: Number(product_id) });
    if (!product) {
      return res
        .status(404)
        .json({ status: false, message: "Product not found" });
    }
    const previousQuantity = Number(product.quantity || 0);
    const previousVariantStockMap = buildVariantStockMap(product.toObject());

    const providedCategoryId = String(categoryId || req.body.catagory_id || "").trim();
    let categoryData = null;
    if (providedCategoryId) {
      if (isValidObjectId(providedCategoryId)) {
        categoryData = await Catagories.findById(providedCategoryId);
      } else {
        categoryData = await Catagories.findOne({ name: providedCategoryId });
      }
    }
    if (!categoryData && catagory) {
      categoryData = await Catagories.findOne({ name: String(catagory).trim() });
    }
    // allow status-only updates by falling back to existing category
    if (!categoryData) {
      const existingCategoryRef = String(product.catagory_id || "").trim();
      if (isValidObjectId(existingCategoryRef)) {
        categoryData = await Catagories.findById(existingCategoryRef);
      } else if (existingCategoryRef) {
        categoryData = await Catagories.findOne({ name: existingCategoryRef });
      }
    }
    // If still no category, skip category update (allow partial updates)
    if (!categoryData) {
      console.warn('No valid category found, skipping category update for product:', product_id);
    }

    console.log("Update product files meta:", {
      imageFiles: imageFiles.length,
      variantImageFiles: variantImageFiles.length,
      variantImageIndexes,
      removedImageUrls,
      providedCategoryId,
      resolvedCategoryId: categoryData?._id ? String(categoryData._id) : "",
    });

    let specsArr = product.specifications || [];
    let highlightsArr = product.key_highlights || [];
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
    if (key_highlights) {
      highlightsArr = parseHighlights(key_highlights);
      if (highlightsArr.length < 6 || highlightsArr.length > 10) {
        return res.status(400).json({
          status: false,
          message: "key_highlights must have 6-10 items",
        });
      }
    }

    if (weightVariants.length) {
      // Validate weight variants
      const wvError = validateWeightVariants(weightVariants);
      if (wvError) {
        return res.status(400).json({ status: false, message: wvError });
      }

      const existingVariants = Array.isArray(product.variants) ? product.variants : [];
      const existingVariantByLabel = new Map();
      existingVariants.forEach((variant) => {
        existingVariantByLabel.set(normalizeVariantField(variant?.label), variant);
      });

      // Map uploaded files to concrete variant indexes.
      // Preferred: explicit indexes from frontend (variantImageIndexes).
      // Fallback: sequential mapping for older clients.
      const uploadIndexByVariantIndex = new Map();
      if (variantImageFiles.length > 0) {
        if (variantImageIndexes.length === variantImageFiles.length) {
          variantImageIndexes.forEach((variantIdx, fileIdx) => {
            if (variantIdx < weightVariants.length) {
              uploadIndexByVariantIndex.set(variantIdx, fileIdx);
            }
          });
        } else {
          for (let i = 0; i < Math.min(variantImageFiles.length, weightVariants.length); i += 1) {
            uploadIndexByVariantIndex.set(i, i);
          }
        }
      }

      // Preserve existing image if payload didn't explicitly remove/replace it.
      weightVariants.forEach((variant, variantIdx) => {
        const key = normalizeVariantField(variant?.label);
        const existing = existingVariantByLabel.get(key);
        const hasReplacementUpload = uploadIndexByVariantIndex.has(variantIdx);
        const payloadImage = String(variant?.image || "").trim();

        if (!payloadImage && !hasReplacementUpload && existing?.image) {
          variant.image = existing.image;
        }
        if (!variant?.imagePublicId && existing?.imagePublicId && variant?.image === existing?.image) {
          variant.imagePublicId = existing.imagePublicId;
        }
      });

      for (const [variantIdx, fileIdx] of uploadIndexByVariantIndex.entries()) {
        const file = variantImageFiles[fileIdx];
        if (!file || !weightVariants[variantIdx]) continue;
        const uploadRes = await uploadToCloudinary(
          file.buffer,
          `variant-${product.product_id}-${Date.now()}-${file.originalname}`,
          file.mimetype
        );
        weightVariants[variantIdx].image = uploadRes.secure_url;
        weightVariants[variantIdx].imagePublicId = uploadRes.public_id;
      }

      // Delete old Cloudinary assets that were removed/replaced.
      const nextVariantByLabel = new Map();
      weightVariants.forEach((variant) => {
        nextVariantByLabel.set(normalizeVariantField(variant?.label), variant);
      });
      existingVariants.forEach((existing) => {
        const existingPublicId = String(existing?.imagePublicId || "").trim();
        if (!existingPublicId) return;
        const next = nextVariantByLabel.get(normalizeVariantField(existing?.label));
        const nextImage = String(next?.image || "").trim();
        const existingImage = String(existing?.image || "").trim();
        if (!nextImage || nextImage !== existingImage) {
          deleteFromCloudinary(existingPublicId).catch((err) =>
            console.warn("Failed to delete removed variant image:", existingPublicId, err?.message)
          );
        }
      });
    }

    // compute current images after removal but before adding new files
    let currentImages = product.product_image || [];
    let currentPublicIds = product.image_public_ids || [];

    if (!weightVariants.length && removedImageUrls.length) {
      const nextImages = [];
      const nextPublic = [];
      currentImages.forEach((url, idx) => {
        if (removedImageUrls.includes(url)) {
          const pid = currentPublicIds[idx] || extractPublicId(url);
          if (pid) {
            deleteFromCloudinary(pid).catch((err) =>
              console.warn("Failed to delete removed image:", pid, err.message)
            );
          }
        } else {
          nextImages.push(url);
          if (currentPublicIds[idx]) nextPublic.push(currentPublicIds[idx]);
        }
      });
      currentImages = nextImages;
      currentPublicIds = nextPublic;
    }

    // validate media constraints based on target status
    const targetStatus = status || product.status || "draft";
    const variantImagesFromPayloadCount = Array.isArray(weightVariants) && weightVariants.length
      ? weightVariants.filter((v) => v && v.image).length
      : 0;
    const plannedImageCount = imageFiles.length > 0 || variantImageFiles.length > 0 || variantImagesFromPayloadCount > 0
      ? imageFiles.length + variantImageFiles.length + variantImagesFromPayloadCount
      : currentImages.length;
    const plannedVideoCount = videoFile
      ? 1
      : removeVideoFlag
        ? 0
        : product.video_url
          ? 1
          : 0;
    const mediaError = validateMediaRules({
      status: targetStatus,
      imagesCount: plannedImageCount,
      videoCount: plannedVideoCount,
    });
    if (mediaError) {
      return res.status(400).json({ status: false, message: mediaError });
    }

    if (targetStatus === "published") {
      // Compute effective values taking variants into account so variant-driven
      // products can be published without explicit top-level price/quantity fields.
      const effectiveName = String((name ?? product.name) || "").trim();
      const effectiveSku = hasSku ? parsedSku : normalizeSku(product.sku || "");

      let effectivePriceVal;
      let effectiveSellingPriceVal;
      let effectiveQuantityVal;

      if (Array.isArray(weightVariants) && weightVariants.length) {
        effectiveQuantityVal = weightVariants.reduce((sum, v) => sum + (Number.isFinite(Number(v.stock)) ? Number(v.stock) : 0), 0);
        effectivePriceVal = hasPrice ? parsedPrice : Number(weightVariants[0].price || product.price || 0);
        effectiveSellingPriceVal = hasSellingPrice ? parsedSellingPrice : Number((weightVariants[0].selling_price ?? weightVariants[0].price) || product.selling_price || 0);
      } else {
        effectiveQuantityVal = quantity !== undefined ? Number(quantity) : Number(product.quantity || 0);
        effectivePriceVal = hasPrice ? parsedPrice : Number(product.price || 0);
        effectiveSellingPriceVal = hasSellingPrice ? parsedSellingPrice : Number(product.selling_price || 0);
      }

      if (!effectiveName || !effectiveSku || !Number.isFinite(effectivePriceVal) || !Number.isFinite(effectiveSellingPriceVal) || !Number.isFinite(effectiveQuantityVal) || effectiveQuantityVal <= 0) {
        return res.status(400).json({
          status: false,
          message: "name, price, selling_price, quantity, sku are required to publish",
        });
      }

      if (!isValidSku(effectiveSku)) {
        return res.status(400).json({
          status: false,
          message: "sku format must be AA-123 (2 uppercase letters, hyphen, 3 digits)",
        });
      }

      if (specification) {
        if (specsArr.length < SPECIFICATIONS_MIN || specsArr.length > SPECIFICATIONS_MAX) {
          return res.status(400).json({
            status: false,
            message: `specifications must have ${SPECIFICATIONS_MIN}-${SPECIFICATIONS_MAX} items`,
          });
        }
      }
    }

    const effectivePrice = hasPrice ? parsedPrice : Number(product.price);
    const effectiveSellingPrice = hasSellingPrice
      ? parsedSellingPrice
      : Number(product.selling_price);
    if (Number.isFinite(effectivePrice) && Number.isFinite(effectiveSellingPrice)) {
      if (!(effectiveSellingPrice < effectivePrice)) {
        return res
          .status(400)
          .json({ status: false, message: "selling_price must be less than price" });
      }
    }

    let imageUrls = currentImages;
    let publicIds = currentPublicIds;
    let videoUrl = product.video_url;
    let videoPublicId = product.video_public_id;

    // Handle image uploads for product (not per variant)
    if (imageFiles.length > 0) {
      for (const pid of publicIds) {
        try {
          await deleteFromCloudinary(pid);
        } catch (err) {
          console.warn("Failed to delete old image:", pid, err.message);
        }
      }
      imageUrls = [];
      publicIds = [];
      for (const file of imageFiles) {
        const uploadRes = await uploadToCloudinary(
          file.buffer,
          `${product.product_id}-${file.originalname}`,
          file.mimetype
        );
        imageUrls.push(uploadRes.secure_url);
        publicIds.push(uploadRes.public_id);
      }
    } else if (req.body.removeImages === "true" || (removedImageUrls.length && imageFiles.length === 0)) {
      for (const pid of publicIds) {
        try {
          await deleteFromCloudinary(pid);
        } catch (err) {
          console.warn("Failed to delete old image:", pid, err.message);
        }
      }
      imageUrls = [];
      publicIds = [];
    }

    if (videoFile) {
      if (videoPublicId) {
        try {
          await deleteFromCloudinary(videoPublicId);
        } catch (err) {
          console.warn("Failed to delete old video:", videoPublicId, err.message);
        }
      }
      const uploadRes = await uploadToCloudinary(
        videoFile.buffer,
        `${product.product_id}-${videoFile.originalname}`,
        videoFile.mimetype
      );
      videoUrl = uploadRes.secure_url;
      videoPublicId = uploadRes.public_id;
    } else if (removeVideoFlag) {
      if (videoPublicId) {
        try {
          await deleteFromCloudinary(videoPublicId);
        } catch (err) {
          console.warn("Failed to delete old video:", videoPublicId, err.message);
        }
      }
      videoUrl = "";
      videoPublicId = "";
    }

    const applyProductMutations = (targetDoc) => {
      targetDoc.title = (title ?? name) || targetDoc.title;
      targetDoc.name = name ?? targetDoc.name;
      if (hasPrice) targetDoc.price = parsedPrice;
      if (hasSellingPrice) targetDoc.selling_price = parsedSellingPrice;
      if (quantity !== undefined) targetDoc.quantity = Number(quantity);
      if (hasSku) targetDoc.sku = parsedSku;
      targetDoc.description = description ?? targetDoc.description;
      targetDoc.selling_price_link = selling_price_link ?? targetDoc.selling_price_link;
      if (categoryData?._id) {
        targetDoc.catagory_id = categoryData._id;
      }
      targetDoc.product_image = imageUrls;
      targetDoc.image_public_ids = publicIds;
      targetDoc.specifications = specsArr;
      targetDoc.key_highlights = highlightsArr;
      targetDoc.video_url = videoUrl;
      targetDoc.video_public_id = videoPublicId;
    };

    applyProductMutations(product);
    function safeParseArray(val) {
      if (Array.isArray(val)) return val;
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch {
          return [];
        }
      }
      return [];
    }
    if (ingredients !== undefined) product.ingredients = safeParseArray(ingredients);
    if (nutritions !== undefined) product.nutritions = safeParseArray(nutritions);
    // Apply weight variants if provided
    if (weightVariants.length) {
      applyWeightVariantsToDoc(product, weightVariants);
      // Keep list/thumb image in sync with variant images for variant-only products.
      if (imageFiles.length === 0 && removedImageUrls.length === 0 && req.body.removeImages !== "true") {
        syncProductImagesFromVariants(product, weightVariants);
      } else if (!product.product_image?.length) {
        syncProductImagesFromVariants(product, weightVariants);
      }
    }
    if (status) product.status = status;
    if (draft_stage) product.draft_stage = draft_stage;

    const persistWithRetry = async () => {
      try {
        await product.save();
      } catch (saveError) {
        if (saveError?.name !== "VersionError") throw saveError;

        console.warn("updateProduct version conflict, retrying once", {
          product_id: Number(product_id),
          message: saveError?.message,
        });

        const latest = await Products.findOne({ product_id: Number(product_id) });
        if (!latest) throw saveError;

        product = latest;
        applyProductMutations(product);
        if (ingredients !== undefined) product.ingredients = safeParseArray(ingredients);
        if (nutritions !== undefined) product.nutritions = safeParseArray(nutritions);
        if (weightVariants.length) {
          applyWeightVariantsToDoc(product, weightVariants);
          if (imageFiles.length === 0 && removedImageUrls.length === 0 && req.body.removeImages !== "true") {
            syncProductImagesFromVariants(product, weightVariants);
          } else if (!product.product_image?.length) {
            syncProductImagesFromVariants(product, weightVariants);
          }
        }
        if (status) product.status = status;
        if (draft_stage) product.draft_stage = draft_stage;

        await product.save();
      }
    };

    await persistWithRetry();

    const currentQuantity = Number(product.quantity || 0);
    if (previousQuantity <= 0 && currentQuantity > 0) {
      safeFireAndForget(() => notifySubscribersProductInStock(product.toObject()), "notifySubscribersProductInStock");
    }

    const currentVariantStockMap = buildVariantStockMap(product.toObject());
    const hasVariantStock = previousVariantStockMap.size || currentVariantStockMap.size;

    if (hasVariantStock) {
      const keys = new Set([
        ...previousVariantStockMap.keys(),
        ...currentVariantStockMap.keys(),
      ]);
      keys.forEach((key) => {
        const before = previousVariantStockMap.get(key) ?? 0;
        const after = currentVariantStockMap.get(key) ?? 0;
        const [colorKey, sizeKey] = key.split("|");

        if (before <= 0 && after > 0) {
          safeFireAndForget(() => notifyProductWaitlistForVariant({
            product: product.toObject(),
            color: colorKey,
            size: sizeKey,
          }), "notifyProductWaitlistForVariant");
        }

        if (before > 0 && after <= 0) {
          safeFireAndForget(() => resetProductWaitlistForVariant({
            productId: product.product_id,
            color: colorKey,
            size: sizeKey,
          }), "resetProductWaitlistForVariant");
        }
      });
    } else {
      if (previousQuantity <= 0 && currentQuantity > 0) {
        safeFireAndForget(() => notifyProductWaitlistIfRestocked({
          previousQuantity,
          product: product.toObject(),
        }), "notifyProductWaitlistIfRestocked");
      }

      if (previousQuantity > 0 && currentQuantity <= 0) {
        safeFireAndForget(() => resetProductWaitlistIfOutOfStock({
          previousQuantity,
          currentQuantity,
          productId: product.product_id,
        }), "resetProductWaitlistIfOutOfStock");
      }
    }

    res
      .status(200)
      .json({ status: true, message: "Product updated successfully", product });
  } catch (error) {
    console.error("updateProduct error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
    });
    res
      .status(500)
      .json({ status: false, message: "Server error", error: error.message });
  }
};

const getProducts = async (_req, res) => {
  try {
    const products = await Products.find({})
      .populate({ path: "catagory_id", select: "name parent ancestors" })
      .sort({ product_id: -1 });

    const missingCodes = products.filter((p) => !p.product_code);
    if (missingCodes.length) {
      for (const product of missingCodes) {
        product.product_code = await generateProductCode();
        await product.save();
      }
    }

    res.status(200).json({ status: true, products });
  } catch (error) {
    console.error("getProducts error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch products", error: error.message });
  }
};

const searchProducts = async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.status(200).json({ status: true, products: [], suggestions: [] });

    const parsed = parseSearchQuery(q);
    const categoryTokenMap = new Map();
    if (parsed.textTokens?.length) {
      await Promise.all(
        parsed.textTokens.map(async (token) => {
          const regex = buildTokenRegex(token);
          if (!regex) {
            categoryTokenMap.set(token, []);
            return;
          }
          const cats = await Catagories.find({
            $or: [{ name: regex }, { "ancestors.name": regex }],
          }).select("_id");
          categoryTokenMap.set(
            token,
            cats.map((c) => c._id)
          );
        })
      );
    }
    let categoryIntersection = [];
    if (parsed.textTokens?.length) {
      const allHaveCats = parsed.textTokens.every(
        (token) => (categoryTokenMap.get(token) || []).length
      );
      if (allHaveCats) {
        const sets = parsed.textTokens.map((token) =>
          (categoryTokenMap.get(token) || []).map((id) => String(id))
        );
        categoryIntersection = sets.reduce((acc, curr) => acc.filter((id) => curr.includes(id)));
      }
    }
    let fallbackCategoryIds = [];
    if (q.trim()) {
      const fullRegex = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const cats = await Catagories.find({
        $or: [{ name: fullRegex }, { "ancestors.name": fullRegex }],
      }).select("_id");
      fallbackCategoryIds = cats.map((c) => c._id);
    }

    const { filter } = buildProductSearchFilter(q, {
      parsed,
      categoryTokenMap,
      fallbackCategoryIds,
    });
    if (categoryIntersection.length) {
      if (filter.$and) filter.$and.push({ catagory_id: { $in: categoryIntersection } });
      else filter.catagory_id = { $in: categoryIntersection };
    }
    if (filter.$and) filter.$and.push({ status: "published" });
    else filter.status = "published";

    let products = await Products.find(filter)
      .populate({ path: "catagory_id", select: "name parent ancestors" })
      .limit(50)
      .lean();
    if (parsed.colorNames?.length) {
      products = filterProductsByColorName(products, parsed.colorNames, parsed.colorHexes || []);
    }
    if (parsed.colorNames?.length || parsed.colorHexes?.length) {
      products = products.map((p) => ({
        ...p,
        matchedColor: pickMatchedColor(p, parsed.colorNames || [], parsed.colorHexes || []),
      }));
    }

    const suggestionsSet = new Set();
    products.forEach((p) => {
      const parts = `${p.name || ""} ${p.title || ""} ${p.catagory_id?.name || ""}`
        .split(/\s+/)
        .filter(Boolean);
      parts.forEach((w) => {
        if (w.toLowerCase().startsWith(q.toLowerCase())) suggestionsSet.add(w);
      });
    });

    res.status(200).json({
      status: true,
      products,
      suggestions: Array.from(suggestionsSet).slice(0, 15),
    });
  } catch (error) {
    console.error("searchProducts error:", error);
    res.status(500).json({ status: false, message: "Search failed" });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const fromBody = req.body?.productId ?? req.body?.product_id;
    const fromQuery = req.query?.productId ?? req.query?.product_id;
    const idCandidate = String(req.body?.id || req.query?.id || "").trim();
    const productId = Number(fromBody ?? fromQuery);
    const hasNumericId = Number.isFinite(productId) && productId > 0;
    const hasMongoId = /^[a-f\d]{24}$/i.test(idCandidate);
    if (!hasNumericId && !hasMongoId)
      return res
        .status(400)
        .json({ status: false, message: "Valid productId or id is required." });

    const product = hasNumericId
      ? await Products.findOne({ product_id: productId })
      : await Products.findById(idCandidate);
    if (!product) {
      return res
        .status(404)
        .json({ status: false, message: "Product not found" });
    }

    const imagePublicIds = Array.isArray(product.image_public_ids)
      ? product.image_public_ids.filter(Boolean)
      : [];
    const productImages = Array.isArray(product.product_image)
      ? product.product_image
      : [];
    const publicIds = imagePublicIds.length
      ? imagePublicIds
      : productImages
        .map((url) => extractPublicId(url))
        .filter(Boolean);

    for (const pid of publicIds) {
      try {
        await deleteFromCloudinary(pid);
      } catch (err) {
        console.warn("Error removing image:", pid, err.message);
      }
    }

    if (product.video_public_id) {
      try {
        await deleteFromCloudinary(product.video_public_id);
      } catch (err) {
        console.warn("Error removing video:", product.video_public_id, err.message);
      }
    }

    await product.deleteOne();

    res
      .status(200)
      .json({ status: true, message: "Product deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: false, message: "Something went wrong" });
  }
};

const getDrafts = async (_req, res) => {
  try {
    const drafts = await DraftProducts.find({}).sort({ updatedAt: -1 });
    return res.status(200).json({ status: true, drafts });
  } catch (error) {
    console.error("getDrafts error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const updateDraft = async (req, res) => {
  const { draft_id } = req.params;
  const files = normalizeFiles(req.files);
  const imageFiles = files.images || files.image || files.files || [];
  const videoFile = files.video ? files.video[0] : null;
  const variantImageFiles = files.variantImages || [];
  const removedImageUrls = parseArrayField(req.body.removedImageUrls || req.body.removed_image_urls);
  const removeVideoFlag = req.body.removeVideo === "true";
  const {
    name,
    price,
    quantity,
    sku,
    description,
    catagory,
    categoryId,
    specification,
    selling_price,
    selling_price_link,
    key_highlights,
    status: rawStatus,
    draft_stage,
    variants: rawVariants,
    ingredients,
    nutritions,
  } = req.body;
  const weightVariants = parseWeightVariants(rawVariants || req.body.variants);

  try {
    const draft = await DraftProducts.findOne({ draft_id: Number(draft_id) });
    if (!draft) return res.status(404).json({ status: false, message: "Draft not found" });

    const targetStatus = rawStatus ? rawStatus.toLowerCase() : draft.status || "draft";

    const providedCategoryId = categoryId || req.body.catagory_id;
    let categoryData = null;
    if (providedCategoryId) categoryData = await Catagories.findById(providedCategoryId);
    if (!categoryData && catagory) categoryData = await Catagories.findOne({ name: catagory.trim() });
    if (!categoryData) {
      return res.status(400).json({ status: false, message: "Valid categoryId is required" });
    }

    let specsArr = draft.specifications || [];
    let highlightsArr = draft.key_highlights || [];
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
    if (key_highlights) {
      highlightsArr = parseHighlights(key_highlights);
      if (highlightsArr.length < 6 || highlightsArr.length > 10) {
        return res.status(400).json({
          status: false,
          message: "key_highlights must have 6-10 items",
        });
      }
    }

    // Validate weight variants
    if (weightVariants.length) {
      const wvError = validateWeightVariants(weightVariants);
      if (wvError) {
        return res.status(400).json({ status: false, message: wvError });
      }
    }

    // validate media constraints against planned state
    let currentImages = draft.product_image || [];
    let currentPublic = draft.image_public_ids || [];
    if (!weightVariants.length && removedImageUrls.length) {
      const nextImages = [];
      const nextPublic = [];
      currentImages.forEach((url, idx) => {
        if (removedImageUrls.includes(url)) {
          const pid = currentPublic[idx] || extractPublicId(url);
          if (pid) {
            deleteFromCloudinary(pid).catch((err) =>
              console.warn("Failed to delete removed image:", pid, err.message)
            );
          }
        } else {
          nextImages.push(url);
          if (currentPublic[idx]) nextPublic.push(currentPublic[idx]);
        }
      });
      currentImages = nextImages;
      currentPublic = nextPublic;
    }

    const variantImagesFromPayloadCount = Array.isArray(weightVariants) && weightVariants.length
      ? weightVariants.filter((v) => v && v.image).length
      : 0;
    const plannedImageCount = imageFiles.length > 0 || variantImageFiles.length > 0 || variantImagesFromPayloadCount > 0
      ? imageFiles.length + variantImageFiles.length + variantImagesFromPayloadCount
      : currentImages.length;
    const plannedVideoCount = videoFile
      ? 1
      : removeVideoFlag
        ? 0
        : draft.video_url
          ? 1
          : 0;
    const mediaError = validateMediaRules({
      status: targetStatus,
      imagesCount: plannedImageCount,
      videoCount: plannedVideoCount,
    });
    if (mediaError) {
      return res.status(400).json({ status: false, message: mediaError });
    }

    let imageUrls = currentImages;
    let publicIds = currentPublic;
    let videoUrl = draft.video_url;
    let videoPublicId = draft.video_public_id;

    if (!weightVariants.length) {
      if (imageFiles.length > 0) {
        for (const pid of publicIds) {
          try {
            await deleteFromCloudinary(pid);
          } catch (err) {
            console.warn("Failed to delete old image:", pid, err.message);
          }
        }
        imageUrls = [];
        publicIds = [];
        for (const file of imageFiles) {
          const uploadRes = await uploadToCloudinary(
            file.buffer,
            `draft-${draft.draft_id}-${file.originalname}`,
            file.mimetype
          );
          imageUrls.push(uploadRes.secure_url);
          publicIds.push(uploadRes.public_id);
        }
      } else if (req.body.removeImages === "true" || (removedImageUrls.length && imageFiles.length === 0)) {
        // clear images if frontend indicates removal without replacement
        for (const pid of publicIds) {
          try {
            await deleteFromCloudinary(pid);
          } catch (err) {
            console.warn("Failed to delete old image:", pid, err.message);
          }
        }
        imageUrls = [];
        publicIds = [];
      }

      if (videoFile) {
        if (videoPublicId) {
          try {
            await deleteFromCloudinary(videoPublicId);
          } catch (err) {
            console.warn("Failed to delete old video:", videoPublicId, err.message);
          }
        }
        const uploadRes = await uploadToCloudinary(
          videoFile.buffer,
          `draft-${draft.draft_id}-${videoFile.originalname}`,
          videoFile.mimetype
        );
        videoUrl = uploadRes.secure_url;
        videoPublicId = uploadRes.public_id;
      } else if (removeVideoFlag) {
        if (videoPublicId) {
          try {
            await deleteFromCloudinary(videoPublicId);
          } catch (err) {
            console.warn("Failed to delete old video:", videoPublicId, err.message);
          }
        }
        videoUrl = "";
        videoPublicId = "";
      }
    }

    draft.name = name ?? draft.name;
    if (price !== undefined) draft.price = Number(price);
    if (selling_price !== undefined) draft.selling_price = Number(selling_price);
    if (quantity !== undefined) draft.quantity = Number(quantity);
    draft.sku = sku ?? draft.sku;
    draft.description = description ?? draft.description;
    draft.selling_price_link = selling_price_link ?? draft.selling_price_link;
    draft.catagory_id = categoryData._id;
    draft.product_image = imageUrls;
    draft.image_public_ids = publicIds;
    draft.specifications = specsArr;
    draft.key_highlights = highlightsArr;
    draft.video_url = videoUrl;
    draft.video_public_id = videoPublicId;
    if (ingredients !== undefined) draft.ingredients = ingredients ? JSON.parse(ingredients) : [];
    if (nutritions !== undefined) draft.nutritions = nutritions ? JSON.parse(nutritions) : [];
    // Apply weight variants if provided
    if (weightVariants.length) {
      applyWeightVariantsToDoc(draft, weightVariants);
    }
    if (draft_stage) draft.draft_stage = draft_stage;
    draft.status = targetStatus;

    if (targetStatus === "published") {
      if (!draft.name || !draft.price || !draft.selling_price || !draft.quantity || !draft.sku) {
        return res.status(400).json({
          status: false,
          message: "name, price, selling_price, quantity, sku are required to publish",
        });
      }
      if (draft.variants?.length) {
        const wvErr = validateWeightVariants(draft.variants);
        if (wvErr) {
          return res.status(400).json({ status: false, message: wvErr });
        }
      } else {
        if (draft.product_image.length < 5 || draft.product_image.length > 10) {
          return res.status(400).json({ status: false, message: "Publish requires 5-10 images" });
        }
        if (!draft.video_url) {
          return res.status(400).json({ status: false, message: "Publish requires exactly one video" });
        }
      }
      const productId = await getNextSequence("product_id");
      const product = new Products({
        product_id: productId,
        product_code: await generateProductCode(),
        title: draft.title,
        name: draft.name,
        price: draft.price,
        selling_price: draft.selling_price,
        description: draft.description,
        selling_price_link: draft.selling_price_link,
        product_image: draft.product_image,
        image_public_ids: draft.image_public_ids,
        video_url: draft.video_url,
        video_public_id: draft.video_public_id,
        quantity: draft.quantity,
        sku: draft.sku,
        catagory_id: draft.catagory_id,
        specifications: draft.specifications,
        key_highlights: draft.key_highlights,
        ingredients: draft.ingredients || [],
        nutritions: draft.nutritions || [],
        status: "published",
        draft_stage: "complete",
      });
      if (draft.variants?.length) {
        applyWeightVariantsToDoc(product, draft.variants);
      }
      await product.save();
      await draft.deleteOne();
      return res.status(200).json({ status: true, product, published: true });
    }

    await draft.save();
    return res.status(200).json({ status: true, draft });
  } catch (error) {
    console.error("updateDraft error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const deleteDraft = async (req, res) => {
  const { draft_id } = req.params;
  try {
    const draft = await DraftProducts.findOne({ draft_id: Number(draft_id) });
    if (!draft) return res.status(404).json({ status: false, message: "Draft not found" });

    const publicIds = draft.image_public_ids || [];
    for (const pid of publicIds) {
      try {
        await deleteFromCloudinary(pid);
      } catch (err) {
        console.warn("Error removing image:", pid, err.message);
      }
    }
    if (draft.video_public_id) {
      try {
        await deleteFromCloudinary(draft.video_public_id);
      } catch (err) {
        console.warn("Error removing video:", draft.video_public_id, err.message);
      }
    }
    await draft.deleteOne();
    return res.status(200).json({ status: true, message: "Draft deleted" });
  } catch (error) {
    console.error("deleteDraft error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const renameCategory = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      return res
        .status(400)
        .json({ status: false, message: "New category name required" });
    }
    const cat = await Catagories.findById(id);
    if (!cat) {
      return res.status(404).json({ status: false, message: "Category not found" });
    }

    const sibling = await Catagories.findOne({
      _id: { $ne: id },
      $or: [{ parent: cat.parent || cat.parentId || null }, { parentId: cat.parent || cat.parentId || null }],
      name: trimmed,
    });
    if (sibling) {
      return res
        .status(409)
        .json({ status: false, message: "A category with this name already exists at this level" });
    }

    cat.name = trimmed;
    if (cat.parent && !cat.parentId) cat.parentId = cat.parent;
    if (cat.parentId && !cat.parent) cat.parent = cat.parentId;
    await cat.save();

    // Keep descendant ancestor names in sync without relying on arrayFilters casting.
    const descendants = await Catagories.find({ "ancestors._id": cat._id });
    for (const descendant of descendants) {
      if (!Array.isArray(descendant.ancestors)) continue;
      let changed = false;
      descendant.ancestors = descendant.ancestors.map((entry) => {
        if (String(entry?._id) === String(cat._id) && entry.name !== trimmed) {
          changed = true;
          const raw = entry && typeof entry.toObject === "function" ? entry.toObject() : entry;
          return { ...(raw || {}), _id: entry._id, name: trimmed };
        }
        return entry;
      });
      if (changed) {
        await descendant.save();
      }
    }

    return res.status(200).json({ status: true, category: cat });
  } catch (error) {
    console.error("renameCategory error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

const deleteCategory = async (req, res) => {
  // business rule: categories are not deletable, only editable/renamable
  return res.status(405).json({
    status: false,
    message: "Category deletion is disabled. Please rename or reuse categories instead.",
  });
};

const getCategoryTree = async (_req, res) => {
  try {
    const categories = await Catagories.find({}).sort({ name: 1 });
    const tree = buildCategoryTree(categories);
    res.status(200).json({ status: true, categories: tree });
  } catch (error) {
    console.error("getCategoryTree error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

const resolveOrderIdentifierQuery = (orderRef) => {
  const idRaw = String(orderRef || "").trim();
  if (!idRaw) return null;
  const queries = [{ order_id: idRaw }, { order_code: idRaw }];
  if (/^[a-f\d]{24}$/i.test(idRaw)) {
    queries.push({ _id: idRaw });
  }
  return { $or: queries };
};

const getOrders = async (_req, res) => {
  try {
    const data = await Orders.find({})
      .populate({ path: "items.product", select: "name title product_code product_image price selling_price" })
      .populate({ path: "address" })
      .sort({ createdAt: -1 });

    for (const order of data) {
      if (!order.order_id || String(order.order_id).trim().length < 10) {
        let idCandidate = "";
        for (let i = 0; i < 15; i += 1) {
          const candidate = createRandomAlphaNum(10);
          const exists = await Orders.findOne({ order_id: candidate }).select("_id").lean();
          if (!exists) {
            idCandidate = candidate;
            break;
          }
        }
        order.order_id = idCandidate || createRandomAlphaNum(10);
      }
      if (!order.order_code) {
        order.order_code = String(order.order_id);
      }
      if (!Array.isArray(order.status_history) || order.status_history.length === 0) {
        order.status_history = [
          {
            status: String(order.status || "confirmed").toLowerCase(),
            updatedAt: order.createdAt || new Date(),
            updatedBy: "system",
            note: "Order created",
          },
        ];
      }
      await order.save();
    }

    const ordersWithDetails = data.map((orderDoc) => {
      const order = orderDoc.toObject();
      return {
        ...order,
        status: order.status || "pending",
        payment_method: order.payment_method || "Razorpay",
      };
    });

    res.status(200).json({
      status: true,
      orders: ordersWithDetails,
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

  // Valid order statuses
  const validStatuses = ["confirmed", "processed", "in_transit", "delivered", "rto", "return", "refund", "cancelled"];

  try {
    const idRaw = String(order_id || "").trim();
    const orderQuery = resolveOrderIdentifierQuery(idRaw);
    if (!orderQuery) {
      return res.status(400).json({ message: "Order identifier is required." });
    }

    const order = await Orders.findOne(orderQuery);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const normalizedNext = String(status || "").trim().toLowerCase();

    // Allow any valid status update by admin
    if (!validStatuses.includes(normalizedNext)) {
      return res.status(400).json({
        status: false,
        message: "Invalid status. Valid statuses: " + validStatuses.join(", "),
      });
    }

    // Update order status
    order.status = normalizedNext;
    const history = Array.isArray(order.status_history) ? order.status_history : [];
    history.push({
      status: normalizedNext,
      updatedAt: new Date(),
      updatedBy: "admin",
      note: "Updated from admin panel",
    });
    order.status_history = history;

    if (normalizedNext === "refund") {
      order.payment_status = "refunded";
    } else if (normalizedNext === "return" || normalizedNext === "rto") {
      if (String(order.payment_status || "").toLowerCase() === "paid") {
        order.payment_status = "refund_pending";
      }
    } else if (normalizedNext === "cancelled") {
      if (String(order.payment_status || "").toLowerCase() === "paid") {
        order.payment_status = "refund_pending";
      }
    } else if (normalizedNext === "confirmed" && order.payment_status !== "paid") {
      order.payment_status = "paid";
    }

    await order.save();

    return res.status(200).json({
      status: true,
      message: "Order status updated successfully",
      order: {
        order_id: order.order_id,
        status: order.status,
        payment_status: order.payment_status,
      }
    });
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
    // Generate a simple token (in production, use JWT)
    const token = Buffer.from(`${userName}:${Date.now()}`).toString('base64');
    return res.status(200).json({
      status: true,
      msg: "Login successfull",
      token,
      username: userName
    });
  } else {
    return res.status(401).json({ status: false, msg: "Can't login" });
  }
};

const getCategories = async (_req, res) => {
  // backwards compatibility alias to the tree endpoint
  return getCategoryTree(_req, res);
};

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const calculateOrderAmount = (order) => {
  const explicit = Number(order?.amount || 0);
  const itemsTotal = Array.isArray(order?.items)
    ? order.items.reduce((sum, item) => {
      const price = Number(item?.price || 0);
      const quantity = Number(item?.quantity || 0);
      return sum + (Number.isFinite(price) ? price : 0) * (Number.isFinite(quantity) ? quantity : 0);
    }, 0)
    : 0;
  if (Number.isFinite(explicit) && explicit > 0) {
    if (itemsTotal > 0 && explicit > itemsTotal * 5) return explicit / 100;
    if (itemsTotal <= 0 && explicit >= 100) return explicit / 100;
    return explicit;
  }

  return itemsTotal;
};

const normalizeOrderAmountForAnalytics = (order) => {
  const explicit = Number(order?.amount || 0);
  const itemsTotal = Array.isArray(order?.items)
    ? order.items.reduce((sum, item) => {
      const price = Number(item?.price || 0);
      const quantity = Number(item?.quantity || 0);
      return sum + (Number.isFinite(price) ? price : 0) * (Number.isFinite(quantity) ? quantity : 0);
    }, 0)
    : 0;

  if (Number.isFinite(explicit) && explicit > 0) {
    if (itemsTotal > 0 && explicit > itemsTotal * 5) return explicit / 100;
    if (itemsTotal <= 0 && explicit >= 100) return explicit / 100;
    return explicit;
  }
  return itemsTotal;
};

const toRegionLabel = (order) => {
  const city = String(order?.city || "").trim();
  const state = String(order?.state || "").trim();
  const country = String(order?.country || "").trim();

  if (city && state) return `${city.toUpperCase()} / ${state.toUpperCase()}`;
  if (state && country) return `${state.toUpperCase()} / ${country.toUpperCase()}`;
  if (country) return `${country.toUpperCase()} / GLOBAL`;
  return "UNKNOWN / GLOBAL";
};

const computeRateTrend = (current, previous) => {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  if (p <= 0) return c > 0 ? 100 : 0;
  return ((c - p) / p) * 100;
};

const round2 = (value) => Number(Number(value || 0).toFixed(2));

const getAnalyticsOverview = async (req, res) => {
  try {
    const days = Math.max(7, Math.min(Number(req.query.days || 30) || 30, 365));
    const now = new Date();
    const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);

    const [orders, activities, wishlistRows] = await Promise.all([
      Orders.find({ createdAt: { $gte: previousStart } })
        .select("createdAt amount items status payment_status user_email city state country")
        .lean(),
      UserActivity.find({})
        .select("events")
        .lean(),
      Wishlist.find({ createdAt: { $gte: previousStart } })
        .select("createdAt product_id")
        .lean(),
    ]);

    const isCompletedOrder = (order) => {
      const payment = String(order?.payment_status || "").toLowerCase().trim();
      const status = String(order?.status || "").toLowerCase().trim();
      if (payment === "paid") return true;
      return ["confirmed", "processing", "shipped", "in transit", "in_transit", "delivered"].includes(status);
    };

    const previousOrders = [];
    const currentOrders = [];

    for (const order of orders) {
      if (!isCompletedOrder(order)) continue;
      const createdAt = order?.createdAt ? new Date(order.createdAt) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
      if (createdAt >= currentStart) currentOrders.push(order);
      else if (createdAt >= previousStart && createdAt < currentStart) previousOrders.push(order);
    }

    const aggregateOrders = (rows) => {
      let revenue = 0;
      const customerSpend = new Map();
      const customerOrderCount = new Map();
      const regionRevenue = new Map();

      for (const order of rows) {
        const amount = Math.max(0, normalizeOrderAmountForAnalytics(order));
        revenue += amount;
        const email = normalizeEmail(order?.user_email);
        if (email) {
          customerSpend.set(email, (customerSpend.get(email) || 0) + amount);
          customerOrderCount.set(email, (customerOrderCount.get(email) || 0) + 1);
        }
        const region = toRegionLabel(order);
        regionRevenue.set(region, (regionRevenue.get(region) || 0) + amount);
      }

      const ordersCount = rows.length;
      const uniqueCustomers = customerSpend.size;
      const repeatCustomers = Array.from(customerOrderCount.values()).filter((count) => count >= 2).length;

      const aov = ordersCount ? revenue / ordersCount : 0;
      const ltv = uniqueCustomers ? revenue / uniqueCustomers : 0;
      const repurchaseRate = uniqueCustomers ? (repeatCustomers / uniqueCustomers) * 100 : 0;

      return {
        revenue,
        ordersCount,
        uniqueCustomers,
        repeatCustomers,
        aov,
        ltv,
        repurchaseRate,
        regionRevenue,
      };
    };

    const currentAgg = aggregateOrders(currentOrders);
    const previousAgg = aggregateOrders(previousOrders);

    const activityRows = Array.isArray(activities) ? activities : [];
    let initiatedCurrent = 0;
    let paidCurrent = 0;
    let initiatedPrevious = 0;
    let paidPrevious = 0;

    activityRows.forEach((activity) => {
      const events = Array.isArray(activity?.events) ? activity.events : [];
      events.forEach((event) => {
        const eventType = String(event?.type || "").trim().toLowerCase();
        if (!eventType) return;
        const occurredAt = event?.occurredAt ? new Date(event.occurredAt) : null;
        if (!occurredAt || Number.isNaN(occurredAt.getTime())) return;

        const isInitiated = eventType === "order_initiated";
        const isPaid = eventType === "order_paid";
        if (!isInitiated && !isPaid) return;

        if (occurredAt >= currentStart) {
          if (isInitiated) initiatedCurrent += 1;
          if (isPaid) paidCurrent += 1;
        } else if (occurredAt >= previousStart && occurredAt < currentStart) {
          if (isInitiated) initiatedPrevious += 1;
          if (isPaid) paidPrevious += 1;
        }
      });
    });

    const calcAbandonment = (initiated, paid) => {
      if (!initiated || initiated <= 0) return 0;
      const dropped = Math.max(0, initiated - paid);
      return (dropped / initiated) * 100;
    };

    const cartAbandonmentCurrent = calcAbandonment(initiatedCurrent, paidCurrent);
    const cartAbandonmentPrevious = calcAbandonment(initiatedPrevious, paidPrevious);

    const cartAddMap = new Map();
    activityRows.forEach((activity) => {
      const events = Array.isArray(activity?.events) ? activity.events : [];
      events.forEach((event) => {
        const eventType = String(event?.type || "").trim().toLowerCase();
        if (eventType !== "cart_add") return;
        const occurredAt = event?.occurredAt ? new Date(event.occurredAt) : null;
        if (!occurredAt || Number.isNaN(occurredAt.getTime()) || occurredAt < currentStart) return;

        const metadata = event?.metadata || {};
        const productId = Number(event?.product_id || metadata?.product_id || 0);
        const qty = Math.max(1, Number(metadata?.qty || 1));
        if (!productId) return;
        cartAddMap.set(productId, (cartAddMap.get(productId) || 0) + qty);
      });
    });

    const wishlistMap = new Map();
    (Array.isArray(wishlistRows) ? wishlistRows : []).forEach((row) => {
      const createdAt = row?.createdAt ? new Date(row.createdAt) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime()) || createdAt < currentStart) return;
      const productId = Number(row?.product_id || 0);
      if (!productId) return;
      wishlistMap.set(productId, (wishlistMap.get(productId) || 0) + 1);
    });

    const orderedQtyMap = new Map();
    const bestSellingMap = new Map();
    currentOrders.forEach((order) => {
      const items = Array.isArray(order?.items) ? order.items : [];
      items.forEach((item) => {
        const productId = Number(item?.product_id || 0);
        const qty = Math.max(0, Number(item?.quantity || 0));
        const price = Math.max(0, Number(item?.price || 0));
        if (!productId || !qty) return;
        orderedQtyMap.set(productId, (orderedQtyMap.get(productId) || 0) + qty);
        bestSellingMap.set(productId, (bestSellingMap.get(productId) || 0) + qty * price);
      });
    });

    const productIds = Array.from(
      new Set([
        ...Array.from(cartAddMap.keys()),
        ...Array.from(wishlistMap.keys()),
        ...Array.from(orderedQtyMap.keys()),
        ...Array.from(bestSellingMap.keys()),
      ])
    );

    const products = productIds.length
      ? await Products.find({ product_id: { $in: productIds } })
        .select("product_id name title product_image")
        .lean()
      : [];
    const productMap = new Map(products.map((p) => [Number(p.product_id), p]));

    const toTopList = (metricMap, limit = 5) =>
      Array.from(metricMap.entries())
        .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
        .slice(0, limit)
        .map(([productId, metric]) => {
          const product = productMap.get(Number(productId));
          const image = Array.isArray(product?.product_image) ? String(product.product_image[0] || "") : "";
          return {
            productId: Number(productId),
            productName: String(product?.title || product?.name || `Product #${productId}`),
            productImage: image,
            metric: round2(metric),
          };
        });

    const topProducts = {
      mostAddedToCart: toTopList(cartAddMap),
      mostWishlisted: toTopList(wishlistMap),
      mostOrdered: toTopList(orderedQtyMap),
      bestSelling: toTopList(bestSellingMap),
    };

    const regions = Array.from(
      new Set([
        ...Array.from(currentAgg.regionRevenue.keys()),
        ...Array.from(previousAgg.regionRevenue.keys()),
      ])
    )
      .map((region) => {
        const current = Number(currentAgg.regionRevenue.get(region) || 0);
        const previous = Number(previousAgg.regionRevenue.get(region) || 0);
        const growth = computeRateTrend(current, previous);
        return {
          region,
          currentRevenue: round2(current),
          previousRevenue: round2(previous),
          growthPercent: round2(growth),
        };
      })
      .sort((a, b) => b.currentRevenue - a.currentRevenue || b.growthPercent - a.growthPercent)
      .slice(0, 8);

    const positiveGrowth = regions.length
      ? regions.reduce((sum, row) => sum + Math.max(0, row.growthPercent), 0) / regions.length
      : 0;
    const performanceIndex = Math.max(0, Math.min(100, round2(40 + positiveGrowth * 0.7)));

    const metrics = {
      averageOrderValue: round2(currentAgg.aov),
      averageOrderValueTrend: round2(computeRateTrend(currentAgg.aov, previousAgg.aov)),
      customerLtv: round2(currentAgg.ltv),
      customerLtvTrend: round2(computeRateTrend(currentAgg.ltv, previousAgg.ltv)),
      repurchaseRate: round2(currentAgg.repurchaseRate),
      repurchaseRateTrend: round2(computeRateTrend(currentAgg.repurchaseRate, previousAgg.repurchaseRate)),
      cartAbandonment: round2(cartAbandonmentCurrent),
      cartAbandonmentTrend: round2(cartAbandonmentCurrent - cartAbandonmentPrevious),
    };

    return res.status(200).json({
      status: true,
      periodDays: days,
      range: {
        currentStart: currentStart.toISOString(),
        previousStart: previousStart.toISOString(),
        now: now.toISOString(),
      },
      metrics,
      regional: regions,
      topProducts,
      performanceIndex,
      notes:
        performanceIndex >= 75
          ? "Global performance index is healthy and scaling with stable regional demand."
          : "Global performance index is below target. Prioritize weak regional segments for optimization.",
    });
  } catch (error) {
    console.error("getAnalyticsOverview error:", error);
    return res.status(500).json({ status: false, message: "Failed to load analytics overview" });
  }
};

const getCustomersOverview = async (_req, res) => {
  try {
    const now = Date.now();
    const [profiles, orders, sessions] = await Promise.all([
      Profile.find({}).select("email name createdAt isBlocked blockedReason").lean(),
      Orders.find({})
        .select("user_email FullName amount items status createdAt")
        .sort({ createdAt: -1 })
        .lean(),
      UserSession.find({ expiresAt: { $gt: new Date() } }).select("email expiresAt").lean(),
    ]);

    const sessionMap = new Map();
    sessions.forEach((session) => {
      const email = normalizeEmail(session.email);
      if (!email) return;
      sessionMap.set(email, (sessionMap.get(email) || 0) + 1);
    });

    const customerMap = new Map();

    const ensureCustomer = (email, preferredName = "") => {
      const normalized = normalizeEmail(email);
      if (!normalized) return null;

      if (!customerMap.has(normalized)) {
        customerMap.set(normalized, {
          email: normalized,
          name: preferredName,
          ordersCount: 0,
          totalSpent: 0,
          lastOrderAt: null,
          activeSessions: sessionMap.get(normalized) || 0,
          isBlocked: false,
          blockedReason: "",
        });
      }

      const existing = customerMap.get(normalized);
      if (!existing.name && preferredName) {
        existing.name = preferredName;
      }
      return existing;
    };

    profiles.forEach((profile) => {
      const customer = ensureCustomer(profile.email, String(profile.name || ""));
      if (!customer) return;
      customer.isBlocked = Boolean(profile.isBlocked);
      customer.blockedReason = String(profile.blockedReason || "");
    });

    orders.forEach((order) => {
      const email = normalizeEmail(order.user_email);
      if (!email) return;

      const customer = ensureCustomer(email, String(order.FullName || ""));
      if (!customer) return;

      const amount = calculateOrderAmount(order);
      customer.ordersCount += 1;
      customer.totalSpent += amount;

      const createdAt = order.createdAt ? new Date(order.createdAt) : null;
      if (createdAt && (!customer.lastOrderAt || createdAt > new Date(customer.lastOrderAt))) {
        customer.lastOrderAt = createdAt.toISOString();
      }
      if (!customer.name) {
        customer.name = String(order.FullName || order.user_email || "");
      }
    });

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    const customers = Array.from(customerMap.values())
      .map((entry) => {
        const safeName =
          entry.name ||
          entry.email
            .split("@")[0]
            .replace(/[^a-zA-Z0-9]+/g, " ")
            .trim() ||
          "Guest User";

        let status = "NEW";
        if (entry.isBlocked) {
          status = "BLOCKED";
        } else if (entry.totalSpent >= 2500 || entry.ordersCount >= 10) {
          status = "VIP";
        } else if (entry.ordersCount > 0) {
          const lastOrderMs = entry.lastOrderAt ? new Date(entry.lastOrderAt).getTime() : 0;
          status = now - lastOrderMs <= THIRTY_DAYS_MS ? "ACTIVE" : "DORMANT";
        }

        return {
          ...entry,
          name: safeName,
          status,
          totalSpent: Number(entry.totalSpent.toFixed(2)),
        };
      })
      .sort((a, b) => b.totalSpent - a.totalSpent || b.ordersCount - a.ordersCount);

    const totalCustomers = customers.length;
    const customersWithOrders = customers.filter((customer) => customer.ordersCount > 0).length;
    const dormantCustomers = customers.filter((customer) => customer.status === "DORMANT").length;
    const activeSessions = customers.reduce(
      (sum, customer) => sum + Number(customer.activeSessions || 0),
      0,
    );

    const conversionRate =
      totalCustomers > 0 ? Number(((customersWithOrders / totalCustomers) * 100).toFixed(2)) : 0;
    const churnRate =
      totalCustomers > 0 ? Number(((dormantCustomers / totalCustomers) * 100).toFixed(2)) : 0;

    return res.status(200).json({
      status: true,
      stats: {
        totalCustomers,
        activeSessions,
        conversionRate,
        churnRate,
      },
      customers,
    });
  } catch (error) {
    console.error("getCustomersOverview error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const getSiteSettings = async (_req, res) => {
  try {
    const doc = await ensurePrimarySiteSettings();
    return res.status(200).json({ status: true, settings: shapeSiteSettings(doc) });
  } catch (error) {
    console.error("getSiteSettings error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const getPublicSiteSettings = async (_req, res) => {
  try {
    const doc = await ensurePrimarySiteSettings();
    return res.status(200).json({ status: true, settings: shapeSiteSettings(doc) });
  } catch (error) {
    console.error("getPublicSiteSettings error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const updateSiteSettings = async (req, res) => {
  try {
    const payload = req.body || {};
    const existing = await ensurePrimarySiteSettings();
    const defaults = buildDefaultSiteSettings();

    const hasPayloadKey = (key) => Object.prototype.hasOwnProperty.call(payload, key);

    const siteName = String(
      hasPayloadKey("siteName") ? payload.siteName : (existing?.siteName ?? defaults.siteName)
    ).trim();

    const navbarTitle = String(
      hasPayloadKey("navbarTitle")
        ? payload.navbarTitle
        : (existing?.navbarTitle ?? siteName ?? defaults.navbarTitle)
    ).trim();

    const footerTitle = String(
      hasPayloadKey("footerTitle")
        ? payload.footerTitle
        : (existing?.footerTitle ?? siteName ?? defaults.footerTitle)
    ).trim();

    const footerDescription = String(
      hasPayloadKey("footerDescription")
        ? payload.footerDescription
        : (existing?.footerDescription ?? defaults.footerDescription)
    ).trim();

    const companyAddress = String(
      hasPayloadKey("companyAddress")
        ? payload.companyAddress
        : (existing?.companyAddress ?? defaults.companyAddress ?? "")
    ).trim();

    const companyEmail = String(
      hasPayloadKey("companyEmail")
        ? payload.companyEmail
        : (existing?.companyEmail ?? defaults.companyEmail ?? "")
    ).trim();
    const companyPhone = String(
      hasPayloadKey("companyPhone")
        ? payload.companyPhone
        : (existing?.companyPhone ?? defaults.companyPhone ?? "")
    ).trim();

    const emailFooterDescription = String(
      hasPayloadKey("emailFooterDescription")
        ? payload.emailFooterDescription
        : (existing?.emailFooterDescription ?? defaults.emailFooterDescription)
    ).trim();

    const currencySymbol = String(
      hasPayloadKey("currencySymbol")
        ? payload.currencySymbol
        : (existing?.currencySymbol ?? defaults.currencySymbol)
    ).trim();
    const logoUrl = String(
      hasPayloadKey("logoUrl")
        ? payload.logoUrl
        : (existing?.logoUrl ?? defaults.logoUrl ?? "")
    ).trim();

    const instagramHandle = normalizeInstagramHandle(
      hasPayloadKey("instagramHandle")
        ? payload.instagramHandle
        : (existing?.instagramHandle ?? defaults.instagramHandle)
    );

    const instagramUrl = sanitizeSocialUrl(
      payload.instagramUrl ?? existing?.instagramUrl ?? "",
      "Instagram",
      SOCIAL_HOST_WHITELIST.instagram
    );
    const twitterUrl = sanitizeSocialUrl(
      payload.twitterUrl ?? existing?.twitterUrl ?? "",
      "Twitter",
      SOCIAL_HOST_WHITELIST.twitter
    );
    const youtubeUrl = sanitizeSocialUrl(
      payload.youtubeUrl ?? existing?.youtubeUrl ?? payload.twitterUrl ?? existing?.twitterUrl ?? "",
      "YouTube",
      SOCIAL_HOST_WHITELIST.youtube
    );
    const facebookUrl = sanitizeSocialUrl(
      payload.facebookUrl ?? existing?.facebookUrl ?? "",
      "Facebook",
      SOCIAL_HOST_WHITELIST.facebook
    );

    const updated = await SiteSettings.findOneAndUpdate(
      { key: "primary" },
      {
        $set: {
          siteName,
          navbarTitle,
          footerTitle,
          footerDescription,
          companyAddress,
          companyEmail,
          companyPhone,
          emailFooterDescription,
          logoUrl,
          currencySymbol,
          instagramUrl,
          instagramHandle,
          twitterUrl,
          youtubeUrl,
          facebookUrl,
          updatedBy: String(payload.updatedBy || "admin"),
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({ status: true, settings: shapeSiteSettings(updated) });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    if (statusCode >= 400 && statusCode < 500) {
      return res.status(statusCode).json({
        status: false,
        message: error?.message || "Invalid settings payload",
      });
    }
    console.error("updateSiteSettings error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const uploadSiteLogo = async (req, res) => {
  try {
    await ensurePrimarySiteSettings();
    const settings = await SiteSettings.findOne({ key: "primary" });

    if (!settings) {
      return res.status(404).json({ status: false, message: "Settings not found" });
    }

    let nextLogoUrl = String(req.body?.logoUrl || "").trim();
    let nextLogoPublicId = "";

    if (req.file) {
      const uploaded = await uploadToCloudinary(
        req.file.buffer,
        `site-logo-${Date.now()}-${req.file.originalname}`,
        req.file.mimetype
      );
      nextLogoUrl = uploaded.secure_url;
      nextLogoPublicId = uploaded.public_id;
    }

    if (!nextLogoUrl) {
      return res.status(400).json({ status: false, message: "Logo image is required." });
    }

    if (settings.logoPublicId) {
      deleteFromCloudinary(settings.logoPublicId).catch(() => { });
    } else if (settings.logoUrl) {
      const oldPublicId = extractPublicId(settings.logoUrl);
      if (oldPublicId) deleteFromCloudinary(oldPublicId).catch(() => { });
    }

    settings.logoUrl = nextLogoUrl;
    settings.logoPublicId = nextLogoPublicId;
    settings.updatedBy = String(req.body?.updatedBy || "admin");
    await settings.save();

    return res.status(200).json({ status: true, settings: shapeSiteSettings(settings.toObject()) });
  } catch (error) {
    console.error("uploadSiteLogo error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const parseBoolean = (value, fallback = true) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
};

const createInstagramGalleryItem = async (req, res) => {
  try {
    await ensurePrimarySiteSettings();
    const settings = await SiteSettings.findOne({ key: "primary" });
    if (!settings) {
      return res.status(404).json({ status: false, message: "Settings not found" });
    }

    let resolvedImageUrl = String(req.body?.imageUrl || "").trim();
    let imagePublicId = "";

    if (req.file) {
      const uploaded = await uploadToCloudinary(
        req.file.buffer,
        `instagram-${Date.now()}-${req.file.originalname}`,
        req.file.mimetype
      );
      resolvedImageUrl = uploaded.secure_url;
      imagePublicId = uploaded.public_id;
    }

    if (!resolvedImageUrl) {
      return res.status(400).json({
        status: false,
        message: "Instagram image is required.",
      });
    }

    const maxSortOrder = Array.isArray(settings.instagramGallery) && settings.instagramGallery.length
      ? Math.max(...settings.instagramGallery.map((entry) => Number(entry.sortOrder || 0)))
      : -1;

    const item = {
      imageUrl: resolvedImageUrl,
      imagePublicId,
      username: normalizeInstagramHandle(req.body?.username || settings.instagramHandle),
      sortOrder: Number.isFinite(Number(req.body?.sortOrder))
        ? Number(req.body.sortOrder)
        : maxSortOrder + 1,
      isActive: parseBoolean(req.body?.isActive, true),
    };

    settings.instagramGallery = Array.isArray(settings.instagramGallery)
      ? settings.instagramGallery
      : [];
    settings.instagramGallery.push(item);
    settings.updatedBy = String(req.body?.updatedBy || "admin");
    await settings.save();

    safeFireAndForget(() => notifySubscribersInstagramPost(item), "notifySubscribersInstagramPost");

    return res.status(201).json({ status: true, settings: shapeSiteSettings(settings.toObject()) });
  } catch (error) {
    console.error("createInstagramGalleryItem error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const updateInstagramGalleryItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    await ensurePrimarySiteSettings();
    const settings = await SiteSettings.findOne({ key: "primary" });

    if (!settings) {
      return res.status(404).json({ status: false, message: "Settings not found" });
    }

    const item = settings.instagramGallery?.id(itemId);
    if (!item) {
      return res.status(404).json({ status: false, message: "Instagram item not found" });
    }

    if (req.file) {
      const uploaded = await uploadToCloudinary(
        req.file.buffer,
        `instagram-${Date.now()}-${req.file.originalname}`,
        req.file.mimetype
      );

      if (item.imagePublicId) {
        deleteFromCloudinary(item.imagePublicId).catch(() => { });
      } else if (item.imageUrl) {
        const oldPublicId = extractPublicId(item.imageUrl);
        if (oldPublicId) deleteFromCloudinary(oldPublicId).catch(() => { });
      }

      item.imageUrl = uploaded.secure_url;
      item.imagePublicId = uploaded.public_id;
    } else if (typeof req.body?.imageUrl === "string" && req.body.imageUrl.trim()) {
      if (item.imagePublicId) {
        deleteFromCloudinary(item.imagePublicId).catch(() => { });
      }
      item.imageUrl = req.body.imageUrl.trim();
      item.imagePublicId = "";
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "username")) {
      item.username = normalizeInstagramHandle(req.body.username || settings.instagramHandle);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "sortOrder")) {
      item.sortOrder = Number.isFinite(Number(req.body.sortOrder))
        ? Number(req.body.sortOrder)
        : Number(item.sortOrder || 0);
    }

    if (Object.prototype.hasOwnProperty.call(req.body || {}, "isActive")) {
      item.isActive = parseBoolean(req.body.isActive, item.isActive !== false);
    }

    settings.updatedBy = String(req.body?.updatedBy || "admin");
    await settings.save();

    return res.status(200).json({ status: true, settings: shapeSiteSettings(settings.toObject()) });
  } catch (error) {
    console.error("updateInstagramGalleryItem error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const deleteInstagramGalleryItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    await ensurePrimarySiteSettings();
    const settings = await SiteSettings.findOne({ key: "primary" });

    if (!settings) {
      return res.status(404).json({ status: false, message: "Settings not found" });
    }

    const item = settings.instagramGallery?.id(itemId);
    if (!item) {
      return res.status(404).json({ status: false, message: "Instagram item not found" });
    }

    if (item.imagePublicId) {
      deleteFromCloudinary(item.imagePublicId).catch(() => { });
    } else if (item.imageUrl) {
      const oldPublicId = extractPublicId(item.imageUrl);
      if (oldPublicId) deleteFromCloudinary(oldPublicId).catch(() => { });
    }

    settings.instagramGallery = settings.instagramGallery.filter(
      (entry) => String(entry._id) !== String(itemId)
    );
    settings.updatedBy = String(req.body?.updatedBy || "admin");
    await settings.save();

    return res.status(200).json({ status: true, settings: shapeSiteSettings(settings.toObject()) });
  } catch (error) {
    console.error("deleteInstagramGalleryItem error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const decodeEmailParam = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
};

const updateCustomerStatus = async (req, res) => {
  try {
    const email = decodeEmailParam(req.params.email || req.body?.email);
    if (!email) {
      return res.status(400).json({ status: false, message: "email required" });
    }

    const shouldBlock = Boolean(req.body?.isBlocked);
    const blockedReason = shouldBlock ? String(req.body?.blockedReason || "Blocked by admin").trim() : "";

    const profile = await Profile.findOneAndUpdate(
      { email },
      {
        $set: {
          email,
          isBlocked: shouldBlock,
          blockedReason,
          blockedAt: shouldBlock ? new Date() : null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    if (shouldBlock) {
      await UserSession.deleteMany({ email });
    }

    return res.status(200).json({
      status: true,
      customer: {
        email,
        isBlocked: Boolean(profile?.isBlocked),
        blockedReason: String(profile?.blockedReason || ""),
        blockedAt: profile?.blockedAt || null,
      },
    });
  } catch (error) {
    console.error("updateCustomerStatus error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const getCustomerActivity = async (req, res) => {
  try {
    const email = decodeEmailParam(req.params.email || req.query?.email);
    if (!email) {
      return res.status(400).json({ status: false, message: "email required" });
    }

    const [profile, sessions, activity, orders, wishlistRows] = await Promise.all([
      Profile.findOne({ email }).select("name isBlocked blockedReason blockedAt").lean(),
      UserSession.find({ email, expiresAt: { $gt: new Date() } }).select("expiresAt createdAt").lean(),
      UserActivity.findOne({ email }).lean(),
      Orders.find({ user_email: email })
        .select("order_id order_code status amount items createdAt")
        .sort({ createdAt: -1 })
        .limit(25)
        .lean(),
      Wishlist.find({ email }).select("product_id createdAt").sort({ createdAt: -1 }).limit(50).lean(),
    ]);

    const wishlistProductIds = wishlistRows.map((row) => Number(row.product_id)).filter(Boolean);
    const wishlistProducts = wishlistProductIds.length
      ? await Products.find({ product_id: { $in: wishlistProductIds } })
        .select("product_id product_code name selling_price price product_image")
        .lean()
      : [];
    const wishlistMap = new Map(wishlistProducts.map((p) => [Number(p.product_id), p]));

    const orderRows = orders.map((order) => {
      const amount = calculateOrderAmount(order);
      const items = Array.isArray(order.items) ? order.items : [];
      return {
        orderId: order.order_id || null,
        orderCode: order.order_code || "",
        status: String(order.status || "pending"),
        amount: Number(amount.toFixed(2)),
        itemCount: items.length,
        createdAt: order.createdAt || null,
      };
    });

    const wishlistDetails = wishlistRows.map((row) => {
      const product = wishlistMap.get(Number(row.product_id));
      return {
        productId: Number(row.product_id),
        productCode: product?.product_code || "",
        name: product?.name || `Product ${row.product_id}`,
        price: Number(product?.selling_price || product?.price || 0),
        image: Array.isArray(product?.product_image) ? product.product_image[0] || "" : "",
        addedAt: row.createdAt || null,
      };
    });

    const timelineFromEvents = Array.isArray(activity?.events)
      ? activity.events.map((event) => ({
        type: String(event.type || "event"),
        title: String(event.title || event.type || "Event"),
        product_id: Number(event.product_id || 0) || null,
        order_id: Number(event.order_id || 0) || null,
        order_code: String(event.order_code || ""),
        metadata: event.metadata || {},
        occurredAt: event.occurredAt || null,
      }))
      : [];

    const timelineFromOrders = orderRows.map((order) => ({
      type: "order",
      title: `Order ${order.orderCode || order.orderId || ""} is ${order.status}`,
      order_id: order.orderId,
      order_code: order.orderCode,
      metadata: { amount: order.amount, itemCount: order.itemCount },
      occurredAt: order.createdAt,
    }));

    const timelineFromWishlist = wishlistDetails.map((item) => ({
      type: "wishlist",
      title: `Wishlisted ${item.name}`,
      product_id: item.productId,
      metadata: { price: item.price },
      occurredAt: item.addedAt,
    }));

    const timeline = [...timelineFromEvents, ...timelineFromOrders, ...timelineFromWishlist]
      .filter((entry) => entry.occurredAt)
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 80);

    const totalSpent = orderRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const activeCartEvents = timelineFromEvents.filter((event) => String(event.type).startsWith("cart_")).slice(0, 25);

    return res.status(200).json({
      status: true,
      customer: {
        email,
        name: String(profile?.name || email.split("@")[0] || "Guest User"),
        isBlocked: Boolean(profile?.isBlocked),
        blockedReason: String(profile?.blockedReason || ""),
        blockedAt: profile?.blockedAt || null,
      },
      summary: {
        activeSessions: sessions.length,
        ordersCount: orderRows.length,
        totalSpent: Number(totalSpent.toFixed(2)),
        wishlistCount: wishlistDetails.length,
        recentSearches: Array.isArray(activity?.recent_searches) ? activity.recent_searches.slice(0, 20) : [],
        recentViewed: Array.isArray(activity?.recent_viewed) ? activity.recent_viewed.slice(0, 20) : [],
      },
      orders: orderRows,
      wishlist: wishlistDetails,
      cartEvents: activeCartEvents,
      timeline,
    });
  } catch (error) {
    console.error("getCustomerActivity error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const normalizeReviewUser = (value) => {
  const trimmed = String(value || "").trim();
  return trimmed || "Anonymous";
};

const getAllReviews = async (_req, res) => {
  try {
    const reviews = await Reviews.find({}).sort({ createdAt: -1 }).lean();
    if (!reviews.length) {
      return res.status(200).json({
        status: true,
        stats: { totalReviews: 0, totalUsers: 0, totalProducts: 0 },
        reviews: [],
      });
    }

    const productIds = Array.from(
      new Set(
        reviews
          .map((row) => Number(row.product_id || 0))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
    );

    const products = productIds.length
      ? await Products.find({ product_id: { $in: productIds } })
        .select("product_id product_code name title product_image")
        .lean()
      : [];

    const productMap = new Map(
      products.map((product) => [
        Number(product.product_id),
        {
          product_id: Number(product.product_id),
          product_code: String(product.product_code || ""),
          product_name: String(product.name || product.title || `Product ${product.product_id}`),
          product_image: Array.isArray(product.product_image) ? String(product.product_image[0] || "") : "",
        },
      ])
    );

    const userSummaryMap = new Map();
    reviews.forEach((review) => {
      const userName = normalizeReviewUser(review.user);
      const userKey = userName.toLowerCase();
      const pid = Number(review.product_id || 0);
      const current =
        userSummaryMap.get(userKey) ||
        {
          user_name: userName,
          totalReviews: 0,
          productIds: new Set(),
        };

      current.totalReviews += 1;
      if (pid > 0) current.productIds.add(pid);
      if (current.user_name === "Anonymous" && userName !== "Anonymous") {
        current.user_name = userName;
      }
      userSummaryMap.set(userKey, current);
    });

    const userStatsMap = new Map();
    userSummaryMap.forEach((summary, userKey) => {
      const reviewedProducts = Array.from(summary.productIds)
        .map((pid) => {
          const product = productMap.get(pid);
          return (
            product || {
              product_id: pid,
              product_code: "",
              product_name: `Product ${pid}`,
              product_image: "",
            }
          );
        })
        .sort((a, b) => String(a.product_name).localeCompare(String(b.product_name)));

      userStatsMap.set(userKey, {
        totalReviews: summary.totalReviews,
        reviewedProducts,
      });
    });

    const shapedReviews = reviews.map((review) => {
      const userName = normalizeReviewUser(review.user);
      const userKey = userName.toLowerCase();
      const productId = Number(review.product_id || 0);
      const product =
        productMap.get(productId) ||
        {
          product_id: productId,
          product_code: "",
          product_name: productId > 0 ? `Product ${productId}` : "Unknown Product",
          product_image: "",
        };
      const userStats =
        userStatsMap.get(userKey) ||
        {
          totalReviews: 1,
          reviewedProducts: [product],
        };

      return {
        id: String(review._id),
        product_id: product.product_id,
        product,
        review_rate: Number(review.rating || 0),
        review_text: String(review.comment || ""),
        review_title: String(review.review_title || ""),
        review_image: String(review.review_image || ""),
        review_images: Array.isArray(review.review_images)
          ? review.review_images.map((entry) => String(entry || "")).filter(Boolean)
          : review.review_image
            ? [String(review.review_image)]
            : [],
        user_name: userName,
        createdAt: review.createdAt || null,
        user_stats: userStats,
      };
    });

    return res.status(200).json({
      status: true,
      stats: {
        totalReviews: shapedReviews.length,
        totalUsers: userSummaryMap.size,
        totalProducts: productIds.length,
      },
      reviews: shapedReviews,
    });
  } catch (error) {
    console.error("getAllReviews error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const deleteReview = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ status: false, message: "Review id required" });
    }
    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({ status: false, message: "Invalid review id" });
    }

    const deleted = await Reviews.findByIdAndDelete(id).lean();
    if (!deleted) {
      return res.status(404).json({ status: false, message: "Review not found" });
    }

    return res.status(200).json({
      status: true,
      message: "Review deleted successfully",
      deleted: {
        id,
        product_id: Number(deleted.product_id || 0),
        user_name: normalizeReviewUser(deleted.user),
      },
    });
  } catch (error) {
    console.error("deleteReview error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

// ---------- Top products ----------
const topProducts = async (_req, res) => {
  try {
    const ordersAgg = await Orders.aggregate([
      { $unwind: "$items" },
      { $group: { _id: "$items.product_id", orderedQty: { $sum: "$items.quantity" }, orderCount: { $sum: 1 } } },
    ]);
    const reviewAgg = await Reviews.aggregate([
      { $group: { _id: "$product_id", reviewCount: { $sum: 1 }, avgRating: { $avg: "$rating" } } },
    ]);
    const wishAgg = await Wishlist.aggregate([
      { $group: { _id: "$product_id", wishCount: { $sum: 1 } } },
    ]);

    const metricsMap = new Map();
    const upsert = (id, data) => {
      const curr =
        metricsMap.get(id) || { orderedQty: 0, orderCount: 0, reviewCount: 0, avgRating: 0, wishCount: 0 };
      metricsMap.set(id, { ...curr, ...data });
    };

    ordersAgg.forEach((o) => upsert(o._id, { orderedQty: o.orderedQty, orderCount: o.orderCount }));
    reviewAgg.forEach((r) => upsert(r._id, { reviewCount: r.reviewCount, avgRating: r.avgRating || 0 }));
    wishAgg.forEach((w) => upsert(w._id, { wishCount: w.wishCount }));

    const scored = [];
    metricsMap.forEach((m, id) => {
      const score = m.orderedQty * 3 + m.orderCount + m.reviewCount * 1.5 + m.wishCount + m.avgRating * 2;
      scored.push({ product_id: id, score, metrics: m });
    });
    scored.sort((a, b) => b.score - a.score);
    const topIds = scored.slice(0, 10).map((s) => s.product_id);

    const products = await Products.find({ product_id: { $in: topIds } })
      .select("product_id name title product_image selling_price price status catagory_id")
      .populate("catagory_id", "name")
      .lean();
    const map = new Map();
    products.forEach((p) => map.set(p.product_id, p));

    const result = scored
      .filter((s) => map.has(s.product_id))
      .slice(0, 10)
      .map((s) => ({ ...map.get(s.product_id), metrics: s.metrics }));

    res.status(200).json({ status: true, products: result });
  } catch (error) {
    console.error("topProducts error:", error);
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

// ---------- Banner carousel ----------
const validateBannerPayload = ({ imageUrl, targetUrl, title, subtitle, width, height }) => {
  if (!imageUrl || !targetUrl || !title || !subtitle) {
    return "Title, subtitle, image and target URL are required.";
  }
  const w = Number(width || 0);
  const h = Number(height || 0);
  if (w && h && w <= h) {
    return "Banner must be landscape (width should be greater than height).";
  }
  return null;
};

const createBanner = async (req, res) => {
  try {
    const { imageUrl, targetUrl, title, subtitle, width, height, order = 0, isActive = true } = req.body;

    let resolvedImageUrl = imageUrl?.trim();
    let imagePublicId = "";

    if (req.file) {
      const uploadRes = await uploadToCloudinary(
        req.file.buffer,
        `banner-${Date.now()}-${req.file.originalname}`,
        req.file.mimetype
      );
      resolvedImageUrl = uploadRes.secure_url;
      imagePublicId = uploadRes.public_id;
    }

    const validationError = validateBannerPayload({
      imageUrl: resolvedImageUrl,
      targetUrl,
      title,
      subtitle,
      width,
      height,
    });
    if (validationError) {
      return res.status(400).json({ status: false, message: validationError });
    }

    const banner = await Banner.create({
      title: title?.trim(),
      subtitle: subtitle?.trim(),
      imageUrl: resolvedImageUrl.trim(),
      imagePublicId,
      targetUrl: targetUrl.trim(),
      width: width ? Number(width) : 1200,
      height: height ? Number(height) : 675,
      order: Number(order) || 0,
      isActive,
    });
    res.status(201).json({ status: true, banner });
  } catch (error) {
    console.error("createBanner error:", error);
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const getBannersAdmin = async (_req, res) => {
  try {
    const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
    res.status(200).json({ status: true, banners });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const getBannersPublic = async (_req, res) => {
  try {
    const banners = await Banner.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .limit(10);
    res.status(200).json({ status: true, banners });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    const existing = await Banner.findById(id);
    if (!existing) return res.status(404).json({ status: false, message: "Banner not found" });

    let newImageUrl = payload.imageUrl ? payload.imageUrl.trim() : existing.imageUrl;
    let newPublicId = existing.imagePublicId;

    if (req.file) {
      const uploadRes = await uploadToCloudinary(
        req.file.buffer,
        `banner-${Date.now()}-${req.file.originalname}`,
        req.file.mimetype
      );
      newImageUrl = uploadRes.secure_url;
      newPublicId = uploadRes.public_id;
      if (existing.imagePublicId) {
        deleteFromCloudinary(existing.imagePublicId);
      } else if (existing.imageUrl) {
        const pid = extractPublicId(existing.imageUrl);
        if (pid) deleteFromCloudinary(pid);
      }
    }

    const merged = {
      title: payload.title !== undefined ? payload.title : existing.title,
      subtitle: payload.subtitle !== undefined ? payload.subtitle : existing.subtitle,
      imageUrl: newImageUrl,
      imagePublicId: newPublicId,
      targetUrl: payload.targetUrl ? payload.targetUrl.trim() : existing.targetUrl,
      width: payload.width ? Number(payload.width) : existing.width || 1200,
      height: payload.height ? Number(payload.height) : existing.height || 675,
      order: payload.order != null ? Number(payload.order) : existing.order || 0,
      isActive: payload.isActive !== undefined ? payload.isActive : existing.isActive,
    };

    const validationError = validateBannerPayload(merged);
    if (validationError) {
      return res.status(400).json({ status: false, message: validationError });
    }

    const updated = await Banner.findByIdAndUpdate(id, merged, { returnDocument: "after" });
    if (!updated) return res.status(404).json({ status: false, message: "Banner not found" });
    res.status(200).json({ status: true, banner: updated });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Banner.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ status: false, message: "Banner not found" });
    if (deleted.imagePublicId) {
      deleteFromCloudinary(deleted.imagePublicId);
    } else if (deleted.imageUrl) {
      const pid = extractPublicId(deleted.imageUrl);
      if (pid) deleteFromCloudinary(pid);
    }
    res.status(200).json({ status: true, message: "Banner deleted" });
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const shapeTestimonial = (doc) => ({
  id: String(doc._id),
  quote: String(doc.quote || ""),
  name: String(doc.name || ""),
  role: String(doc.role || ""),
  order: Number(doc.order || 0),
  isActive: doc.isActive !== false,
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null,
});

const getTestimonialsAdmin = async (_req, res) => {
  try {
    const rows = await Testimonial.find().sort({ order: 1, createdAt: -1 }).lean();
    const testimonials = rows.map((row) => shapeTestimonial(row));
    res.status(200).json({ status: true, testimonials });
  } catch (error) {
    console.error("getTestimonialsAdmin error:", error);
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const getTestimonialsPublic = async (_req, res) => {
  try {
    const rows = await Testimonial.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
      .limit(50)
      .lean();
    const testimonials = rows.map((row) => shapeTestimonial(row));
    res.status(200).json({ status: true, testimonials });
  } catch (error) {
    console.error("getTestimonialsPublic error:", error);
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const createTestimonial = async (req, res) => {
  try {
    const { quote, name, role = "", order = 0, isActive = true } = req.body || {};
    const q = String(quote || "").trim();
    const n = String(name || "").trim();
    if (!q || !n) {
      return res.status(400).json({ status: false, message: "Quote and name are required." });
    }
    const created = await Testimonial.create({
      quote: q,
      name: n,
      role: String(role || "").trim(),
      order: Number(order) || 0,
      isActive: isActive !== false,
    });
    res.status(201).json({ status: true, testimonial: shapeTestimonial(created) });
  } catch (error) {
    console.error("createTestimonial error:", error);
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const updateTestimonial = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    const existing = await Testimonial.findById(id);
    if (!existing) return res.status(404).json({ status: false, message: "Testimonial not found" });

    if (payload.quote !== undefined) existing.quote = String(payload.quote || "").trim();
    if (payload.name !== undefined) existing.name = String(payload.name || "").trim();
    if (payload.role !== undefined) existing.role = String(payload.role || "").trim();
    if (payload.order !== undefined) existing.order = Number(payload.order) || 0;
    if (payload.isActive !== undefined) existing.isActive = Boolean(payload.isActive);

    if (!existing.quote || !existing.name) {
      return res.status(400).json({ status: false, message: "Quote and name are required." });
    }
    await existing.save();
    res.status(200).json({ status: true, testimonial: shapeTestimonial(existing) });
  } catch (error) {
    console.error("updateTestimonial error:", error);
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const deleteTestimonial = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Testimonial.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ status: false, message: "Testimonial not found" });
    res.status(200).json({ status: true, message: "Testimonial deleted" });
  } catch (error) {
    console.error("deleteTestimonial error:", error);
    res.status(500).json({ status: false, message: "Server error", error: error.message });
  }
};

const getNewsletterSubscribers = async (_req, res) => {
  try {
    const subscribers = await NewsletterSubscriber.find({})
      .sort({ subscribedAt: -1, createdAt: -1 })
      .lean();
    const active = subscribers.filter((item) => item.isActive !== false).length;
    return res.status(200).json({
      status: true,
      stats: { total: subscribers.length, active },
      subscribers: subscribers.map((item) => ({
        id: String(item._id),
        email: String(item.email || ""),
        source: String(item.source || "website"),
        isActive: item.isActive !== false,
        subscribedAt: item.subscribedAt || item.createdAt || null,
        lastNotifiedAt: item.lastNotifiedAt || null,
        lastNotifiedType: String(item.lastNotifiedType || ""),
      })),
    });
  } catch (error) {
    console.error("getNewsletterSubscribers error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const getContactSubmissions = async (req, res) => {
  try {
    const status = String(req.query?.status || "").trim().toLowerCase();
    const filter = status === "open" || status === "solved" ? { status } : {};
    const contacts = await ContactSubmission.find(filter).sort({ createdAt: -1 }).lean();
    const open = contacts.filter((item) => String(item.status || "open") === "open").length;
    const solved = contacts.length - open;
    return res.status(200).json({
      status: true,
      stats: { total: contacts.length, open, solved },
      contacts: contacts.map((item) => ({
        id: String(item._id),
        ticketCode: String(item.ticketCode || ""),
        name: String(item.name || ""),
        email: String(item.email || ""),
        department: String(item.department || "GENERAL INQUIRY"),
        message: String(item.message || ""),
        status: String(item.status || "open") === "solved" ? "solved" : "open",
        solvedAt: item.solvedAt || null,
        solvedBy: String(item.solvedBy || ""),
        resolutionMessage: String(item.resolutionMessage || ""),
        createdAt: item.createdAt || null,
        updatedAt: item.updatedAt || null,
      })),
    });
  } catch (error) {
    console.error("getContactSubmissions error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

const markContactSolved = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id || !/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({ status: false, message: "Valid contact id required" });
    }
    const solvedBy = String(req.body?.solvedBy || "admin").trim() || "admin";
    const resolutionMessage = String(req.body?.resolutionMessage || "").trim();

    const contact = await ContactSubmission.findByIdAndUpdate(
      id,
      {
        $set: {
          status: "solved",
          solvedAt: new Date(),
          solvedBy,
          resolutionMessage,
        },
      },
      { new: true }
    ).lean();

    if (!contact) {
      return res.status(404).json({ status: false, message: "Contact not found" });
    }

    const brevoApiKey = process.env.BREVO_API_KEY;
    const brevoFromEmail = process.env.BREVO_FROM_EMAIL;
    const brevoFromName = process.env.BREVO_FROM_NAME || "Amila Gold";
    if (brevoApiKey && brevoFromEmail && contact.email) {
      try {
        const subject = `Your query ${contact.ticketCode} has been resolved`;
        const textContent = `Hello ${contact.name || "Customer"}, your query (${contact.ticketCode}) has been marked solved.\n\nYour query:\n${String(contact.message || "")}\n\n${resolutionMessage ? `Resolution:\n${resolutionMessage}\n\n` : ""}Thank you for contacting us.`;
        const htmlContent = `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <h2 style="color:#1f4d1d">Query Resolved</h2>
            <p>Hello ${contact.name || "Customer"},</p>
            <p>Your query <strong>${contact.ticketCode}</strong> has been marked as solved by our support team.</p>
            <p><strong>Your query:</strong></p>
            <div style="padding:12px;border:1px solid #ddd;background:#fafafa;border-radius:8px;white-space:pre-wrap;">${String(contact.message || "")}</div>
            ${resolutionMessage ? `<p><strong>Resolution:</strong> ${resolutionMessage}</p>` : ""}
            <p>Thank you for contacting us.</p>
          </div>
        `;
        await sendBrevoEmail({
          apiKey: brevoApiKey,
          fromEmail: brevoFromEmail,
          fromName: brevoFromName,
          toEmail: String(contact.email),
          toName: String(contact.name || ""),
          subject,
          textContent,
          htmlContent,
        });
      } catch (mailErr) {
        console.error("markContactSolved mail error:", mailErr);
      }
    }

    return res.status(200).json({
      status: true,
      message: "Contact marked as solved",
      contact: {
        id: String(contact._id),
        status: contact.status,
        solvedAt: contact.solvedAt || null,
      },
    });
  } catch (error) {
    console.error("markContactSolved error:", error);
    return res.status(500).json({ status: false, message: "Server error" });
  }
};

// Alias for backwards compatibility - defined after createCategory is defined
const addCatagory = createCategory;

export {
  getProducts,
  updateProduct,
  createCategory,
  uploadProduct,
  createDraftProduct,
  updateDraft,
  getDrafts,
  deleteDraft,
  login,
  getOrders,
  updateOrderStatus,
  deleteProduct,
  renameCategory,
  deleteCategory,
  getCategories,
  getCategoryTree,
  getAllReviews,
  deleteReview,
  getCustomersOverview,
  getCustomerActivity,
  updateCustomerStatus,
  getAnalyticsOverview,
  getSiteSettings,
  getPublicSiteSettings,
  updateSiteSettings,
  uploadSiteLogo,
  createInstagramGalleryItem,
  updateInstagramGalleryItem,
  deleteInstagramGalleryItem,
  searchProducts,
  topProducts,
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
  addCatagory,
};
