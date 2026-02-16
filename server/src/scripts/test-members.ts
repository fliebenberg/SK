import { dataManager } from '../DataManager';

async function test() {
    console.log("Testing getOrganizationMembers('org-1')...");
    try {
        const members = await dataManager.getOrganizationMembers('org-1');
        console.log(`Success: Found ${members.length} members.`);
        members.forEach((m: any) => console.log(` - ${m.name} (${m.id})`));
    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
}

test();
