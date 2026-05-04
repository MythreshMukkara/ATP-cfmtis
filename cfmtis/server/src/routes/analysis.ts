import { Router } from "express";
import {
  analyzeCase,
  getAnalysisStatus,
  getGraph,
  getRecovery,
  getRisk
} from "../controllers/analysisController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.post("/:id/analyze", analyzeCase);
router.get("/:id/status", getAnalysisStatus);
router.get("/:id/graph", getGraph);
router.get("/:id/risk", getRisk);
router.get("/:id/recovery", getRecovery);

export default router;
