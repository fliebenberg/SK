import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

export class ImageService {
    private uploadDir: string;

    constructor() {
        this.uploadDir = path.join(process.cwd(), 'public/uploads/logos');
        this.ensureDirectories();
    }

    private ensureDirectories() {
        if (!existsSync(path.join(process.cwd(), 'public'))) {
            mkdirSync(path.join(process.cwd(), 'public'));
        }
        if (!existsSync(path.join(process.cwd(), 'public/uploads'))) {
            mkdirSync(path.join(process.cwd(), 'public/uploads'));
        }
        if (!existsSync(this.uploadDir)) {
            mkdirSync(this.uploadDir, { recursive: true });
        }
    }

    /**
     * Processes a base64 image, saves it in 3 tiers (large, medium, thumb) as WebP.
     * @returns The base filename (without extension or suffix)
     */
    async processLogo(base64: string, id: string): Promise<string> {
        // Remove data:image/...;base64, prefix if present
        const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        const baseFilename = `logo-${id}-${Date.now()}`;
        
        const tiers = [
            { name: 'large', size: 1024 },
            { name: 'medium', size: 256 },
            { name: 'thumb', size: 64 }
        ];

        for (const tier of tiers) {
            const filename = `${baseFilename}_${tier.name}.webp`;
            const filePath = path.join(this.uploadDir, filename);

            await sharp(buffer)
                .resize(tier.size, tier.size, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .webp({ quality: 80 })
                .toFile(filePath);
        }

        return baseFilename;
    }

    /**
     * Deletes existing logo files for an organization
     */
    async deleteLogo(baseFilename: string) {
        if (!baseFilename || baseFilename.startsWith('http') || baseFilename.startsWith('data:')) return;

        const tiers = ['large', 'medium', 'thumb'];
        for (const tier of tiers) {
            const filePath = path.join(this.uploadDir, `${baseFilename}_${tier}.webp`);
            try {
                if (existsSync(filePath)) {
                    await fs.unlink(filePath);
                }
            } catch (err) {
                console.error(`Failed to delete logo file: ${filePath}`, err);
            }
        }
    }
}

export const imageService = new ImageService();
