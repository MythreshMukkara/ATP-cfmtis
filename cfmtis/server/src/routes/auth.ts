import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, logout, me } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post(
  "/login",
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    message: {
      message: "Too many login attempts. Wait a few minutes and try again."
    },
    skipSuccessfulRequests: true
  }),
  login
);
router.post("/logout", logout);
router.get("/me", requireAuth, me);

export default router;
