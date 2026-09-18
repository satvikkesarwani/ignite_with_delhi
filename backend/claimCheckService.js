import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

class ClaimCheckService {
  constructor() {
    // Resolve relative to this module so the uploads dir is stable no matter the cwd
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    this.storageDir = path.join(moduleDir, 'uploads');
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  async storePayload(filename, contentBuffer, mimeType = 'text/plain') {
    const claimId = `claim_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const safeFilename = `${claimId}_${path.basename(filename || 'dataset.txt')}`;
    const targetPath = path.join(this.storageDir, safeFilename);

    await fs.promises.writeFile(targetPath, contentBuffer);
    const stats = await fs.promises.stat(targetPath);

    return {
      claimId,
      uri: `file://${targetPath}`,
      filename: safeFilename,
      sizeBytes: stats.size,
      mimeType,
      createdAt: new Date().toISOString(),
    };
  }

  async retrievePayload(claimUri) {
    const filePath = claimUri.replace('file://', '');
    if (!fs.existsSync(filePath)) {
      throw new Error(`Claim file not found at: ${filePath}`);
    }
    return fs.promises.readFile(filePath, 'utf-8');
  }
}

export const claimCheckService = new ClaimCheckService();
