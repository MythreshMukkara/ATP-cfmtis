import { Router } from "express";
import {
  createCase,
  deleteCase,
  getCase,
  listCases,
  updateCase
} from "../controllers/caseController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/", listCases);
router.post("/", createCase);
router.get("/:id", getCase);
router.patch("/:id", updateCase);
router.delete("/:id", requireRole("ADMIN"), deleteCase);

export default router;
