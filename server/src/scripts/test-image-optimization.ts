import { imageService } from '../services/ImageService';
import fs from 'fs/promises';
import path from 'path';

async function runTest() {
    console.log("Starting ImageService test...");

    // A tiny 1x1 transparent base64 GIF
    const sampleBase64 = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    const testId = "test-org";

    try {
        console.log("Processing sample image...");
        const baseFilename = await imageService.processLogo(sampleBase64, testId);
        console.log(`Generated base filename: ${baseFilename}`);

        const uploadDir = path.join(process.cwd(), 'public/uploads/logos');
        const tiers = ['large', 'medium', 'thumb'];
        
        for (const tier of tiers) {
            const filePath = path.join(uploadDir, `${baseFilename}_${tier}.webp`);
            const exists = await fs.access(filePath).then(() => true).catch(() => false);
            if (exists) {
                const stats = await fs.stat(filePath);
                console.log(`[PASS] ${tier} version created (${stats.size} bytes)`);
            } else {
                console.error(`[FAIL] ${tier} version NOT found at ${filePath}`);
            }
        }

        console.log("Cleaning up test files...");
        await imageService.deleteLogo(baseFilename);
        console.log("Test cleanup complete.");

    } catch (err) {
        console.error("Test failed with error:", err);
    }
}

runTest();
