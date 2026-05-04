import { Router } from "express";
import {
  getBanks,
  getCaseDetailById,
  getGraphByCase,
  getRisk,
  getSummary,
  uploadDataset
} from "../controllers/analyzerController.js";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const router = Router();

router.use(requireAuth);
router.post("/upload-dataset", upload.single("dataset"), uploadDataset);
router.get("/case/:id", getCaseDetailById);
router.get("/analysis/summary", getSummary);
router.get("/analysis/banks", getBanks);
router.get("/analysis/risk", getRisk);
router.get("/analysis/graph/:caseId", getGraphByCase);

export default router;
