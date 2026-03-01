import pool from '../server/src/db';
import { OrganizationManager } from '../server/src/managers/OrganizationManager';

async function test() {
    const orgManager = new OrganizationManager();
    
    console.log('--- Test 1: No params ---');
    try {
        const res1 = await orgManager.getOrganizations();
        console.log('Success! Total:', res1.total, 'Items:', res1.items.length);
    } catch (e) {
        console.error('Test 1 failed:', e);
    }

    console.log('\n--- Test 2: Search only ---');
    try {
        const res2 = await orgManager.getOrganizations({ page: 1, limit: 10, search: 'test' });
        console.log('Success! Total:', res2.total, 'Items:', res2.items.length);
    } catch (e) {
        console.error('Test 2 failed:', e);
    }

    console.log('\n--- Test 3: isClaimed only ---');
    try {
        const res3 = await orgManager.getOrganizations({ page: 1, limit: 10, isClaimed: false });
        console.log('Success! Total:', res3.total, 'Items:', res3.items.length);
    } catch (e) {
        console.error('Test 3 failed:', e);
    }

    console.log('\n--- Test 4: Combined filters ---');
    try {
        const res4 = await orgManager.getOrganizations({ page: 1, limit: 10, search: 'test', isClaimed: false });
        console.log('Success! Total:', res4.total, 'Items:', res4.items.length);
    } catch (e) {
        console.error('Test 4 failed:', e);
    }

    await pool.end();
}

test();
