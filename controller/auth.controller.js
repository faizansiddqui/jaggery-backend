import crypto from "crypto";
import { sendSmtpMail } from "../utils/smtp.js";
import { loadEnv } from "../config/env.js";

loadEnv();

const otpStore = new Map(); // email -> { code, expires }
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

const emailFrom = process.env.SMTP_EMAIL;
const emailPass = process.env.SMTP_PASSWORD;
const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure =
  process.env.SMTP_SECURE === "true" || smtpPort === 465 ? true : false;

export const sendOtp = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: "Email required" });

    if (!emailFrom || !emailPass) {
      return res
        .status(500)
        .json({ message: "SMTP not configured on server" });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const expires = Date.now() + OTP_TTL_MS;
    otpStore.set(email, { code, expires });

    const subject = "Your login OTP";
    const text = `Your OTP is ${code}. It expires in 10 minutes.`;

    const doSend = process.env.SMTP_DRY_RUN !== "true";

    if (doSend) {
      await sendSmtpMail({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        user: emailFrom,
        pass: emailPass,
        from: emailFrom,
        to: email,
        subject,
        text,
      });
    } else {
      console.log(`[SMTP_DRY_RUN] OTP for ${email}: ${code}`);
    }

    return res.status(200).json({ status: true, message: "OTP sent" });
  } catch (error) {
    console.error("sendOtp error:", error);
    return res
      .status(500)
      .json({ status: false, message: error.message || "Failed to send OTP" });
  }
};

export const verifyOtp = (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP required" });
  }

  const entry = otpStore.get(email);
  if (!entry) return res.status(400).json({ message: "OTP expired or not found" });
  if (Date.now() > entry.expires) {
    otpStore.delete(email);
    return res.status(400).json({ message: "OTP expired" });
  }
  if (entry.code !== otp) {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  otpStore.delete(email);
  return res.status(200).json({ status: true, message: "OTP verified" });
};
