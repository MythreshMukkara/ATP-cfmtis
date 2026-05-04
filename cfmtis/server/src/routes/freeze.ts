import { Router } from "express";
import {
  freezeAccount,
  freezeBulk,
  freezeLog,
  unfreezeAccount
} from "../controllers/freezeController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.post("/:id/freeze/:accountId", requireRole("ADMIN", "OFFICER"), freezeAccount);
router.delete("/:id/freeze/:accountId", requireRole("ADMIN", "OFFICER"), unfreezeAccount);
router.post("/:id/freeze/bulk", requireRole("ADMIN", "OFFICER"), freezeBulk);
router.get("/:id/freeze-log", freezeLog);

export default router;
