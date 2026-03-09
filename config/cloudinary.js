import crypto from "crypto";
import { loadEnv } from "./env.js";

loadEnv();

const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || "").trim();
const apiKey = (process.env.CLOUDINARY_API_KEY || "").trim();
const apiSecret = (process.env.CLOUDINARY_API_SECRET || "").trim();

if (!cloudName || !apiKey || !apiSecret) {
  console.warn("⚠️ Cloudinary env vars missing. Uploads will fail until set.");
}

const signParams = (params) => {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
};

export const uploadToCloudinary = async (fileBuffer, fileName, mimeType) => {
  if (!apiSecret || !apiKey || !cloudName) {
    throw new Error("Cloudinary env vars missing (cloud name/api key/secret)");
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "products";
  const publicId = fileName.replace(/\.[^/.]+$/, "");

  const paramsToSign = { folder, public_id: publicId, timestamp };
  const signature = signParams(paramsToSign);

  // Use base64 data URI to avoid multipart dependency
  const dataUri = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

  const body = new URLSearchParams();
  body.append("file", dataUri);
  body.append("api_key", apiKey);
  body.append("timestamp", timestamp.toString());
  body.append("signature", signature);
  body.append("folder", folder);
  body.append("public_id", publicId); // strip ext for consistent id

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudinary upload failed: ${res.status} ${text}`);
  }

  return res.json();
};

export const deleteFromCloudinary = async (publicId) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = { public_id: publicId, timestamp };
  const signature = signParams(paramsToSign);

  const body = new URLSearchParams();
  body.append("public_id", publicId);
  body.append("timestamp", timestamp.toString());
  body.append("signature", signature);
  body.append("api_key", apiKey);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudinary delete failed: ${res.status} ${text}`);
  }

  return res.json();
};

export const extractPublicId = (url) => {
  // Example: https://res.cloudinary.com/<cloud>/image/upload/v123456789/dir/name.jpg
  try {
    const withoutParams = url.split("?")[0];
    const parts = withoutParams.split("/upload/");
    if (parts.length < 2) return null;
    const path = parts[1];
    const noExt = path.replace(/\.[^/.]+$/, "");
    return noExt;
  } catch {
    return null;
  }
};
