import { Router } from "express";
import { sendOtp, verifyOtp } from "../controller/auth.controller.js";

const router = Router();

router.post("/log", sendOtp);
router.post("/varify-email", verifyOtp);

// Admin auth placeholders
router.post("/admin-reset", (req, res) => {
  res.status(200).json({ status: true, message: "Password reset not implemented" });
});

router.post("/admin-logout", (req, res) => {
  res.status(200).json({ status: true, message: "Logout successful" });
});

export { router };
export default router;
