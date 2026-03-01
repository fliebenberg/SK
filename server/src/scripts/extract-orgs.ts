import pool from '../db';
import * as fs from 'fs';
import * as path from 'path';

const extractOrgs = async () => {
    try {
        console.log('Extracting Organizations for re-seeding...');
        
        const res = await pool.query(`
            SELECT * FROM organizations 
            WHERE logo IS NOT NULL 
               OR name ILIKE '%Springfield%'
        `);

        const orgs = res.rows;
        const filePath = path.join(__dirname, '../../data/existing_orgs.json');
        
        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, JSON.stringify(orgs, null, 2));
        console.log(`Successfully extracted ${orgs.length} organizations to ${filePath}`);
        process.exit(0);
    } catch (error) {
        console.error('Error extracting organizations:', error);
        process.exit(1);
    }
};

extractOrgs();
