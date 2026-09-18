import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createLogger } from './logger.js';

const log = createLogger('claim-check');

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
    log.info('Payload staged', {
      claimId,
      filename: safeFilename,
      sizeBytes: stats.size,
      mimeType,
    });

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
      log.error('Claim file not found', { claimUri, resolvedPath: filePath });
      throw new Error(`Claim file not found at: ${filePath}`);
    }
    log.info('Payload retrieved', { claimUri, sizeBytes: (await fs.promises.stat(filePath)).size });
    return fs.promises.readFile(filePath, 'utf-8');
  }
}

export const claimCheckService = new ClaimCheckService();
