import { Router } from "express";
import { sendOtp, verifyOtp } from "../controller/auth.controller.js";

const router = Router();

router.post("/log", sendOtp);
router.post("/varify-email", verifyOtp);

export { router };
export default router;
