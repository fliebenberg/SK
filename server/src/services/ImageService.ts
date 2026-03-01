import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

export class ImageService {
    private uploadDir: string;
    private profileUploadDir: string;

    constructor() {
        this.uploadDir = path.join(process.cwd(), 'public/uploads/logos');
        this.profileUploadDir = path.join(process.cwd(), 'public/uploads/profiles');
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
        if (!existsSync(this.profileUploadDir)) {
            mkdirSync(this.profileUploadDir, { recursive: true });
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

    /**
     * Processes a base64 image for an OrgProfile/User
     */
    async processProfileImage(base64: string, id: string): Promise<string> {
        const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        const baseFilename = `profile-${id}-${Date.now()}`;
        
        const tiers = [
            { name: 'large', size: 1024 },
            { name: 'medium', size: 256 },
            { name: 'thumb', size: 64 }
        ];

        for (const tier of tiers) {
            const filename = `${baseFilename}_${tier.name}.webp`;
            const filePath = path.join(this.profileUploadDir, filename);

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
     * Deletes existing profile images
     */
    async deleteProfileImage(baseFilename: string) {
        if (!baseFilename || baseFilename.startsWith('http') || baseFilename.startsWith('data:')) return;

        const tiers = ['large', 'medium', 'thumb'];
        for (const tier of tiers) {
            const filePath = path.join(this.profileUploadDir, `${baseFilename}_${tier}.webp`);
            try {
                if (existsSync(filePath)) {
                    await fs.unlink(filePath);
                }
            } catch (err) {
                console.error(`Failed to delete profile image file: ${filePath}`, err);
            }
        }
    }
}

export const imageService = new ImageService();
