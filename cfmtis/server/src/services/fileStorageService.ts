import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

type StoredFileLike = {
  filename: string;
  content?: Uint8Array | Buffer | null;
  storageKey?: string | null;
};

export const createTempFileFromBuffer = async (filename: string, content: Uint8Array | Buffer) => {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const tempPath = path.join(os.tmpdir(), `${Date.now()}-${randomUUID()}-${safeName}`);
  await fs.writeFile(tempPath, Buffer.from(content));
  return {
    path: tempPath,
    cleanup: async () => {
      await fs.rm(tempPath, { force: true });
    }
  };
};

export const materializeStoredFile = async (file: StoredFileLike) => {
  if (file.content && file.content.length > 0) {
    return createTempFileFromBuffer(file.filename, file.content);
  }

  if (file.storageKey) {
    return {
      path: file.storageKey,
      cleanup: async () => undefined
    };
  }

  throw new Error(`Stored file ${file.filename} has no content`);
};
