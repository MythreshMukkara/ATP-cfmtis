import { Router } from "express";
import {
  downloadSampleDataset,
  listFiles,
  listSampleDatasets,
  uploadFiles
} from "../controllers/fileController.js";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const router = Router();

router.use(requireAuth);
router.get("/samples", listSampleDatasets);
router.get("/samples/:fileName", downloadSampleDataset);
router.post("/:id/files", upload.array("files"), uploadFiles);
router.get("/:id/files", listFiles);

export default router;
