import { dataManager } from '../DataManager';

async function testNomination() {
  console.log('Testing nomination and referral fetching...');

  // 1. Get an organization (assume we have at least one)
  const orgs = await dataManager.getOrganizations();
  if (orgs.items.length === 0) {
    console.log('No organizations found to test with.');
    process.exit(0);
  }

  const testOrg = orgs.items[0];
  console.log(`Using organization: ${testOrg.name} (${testOrg.id})`);

  // 2. Create a referral (nomination)
  const testEmail = `test-nominate-${Date.now()}@example.com`;
  const referredByUserId = 'user-initial-admin'; // Initial admin created during seed
  
  console.log(`Creating referral for ${testEmail}...`);
  try {
    const refs = await dataManager.referOrgContact(testOrg.id, [testEmail], referredByUserId);
    console.log(`Successfully created ${refs.length} referral(s).`);
    
    // 3. Fetch referrals for this org
    console.log(`Fetching referrals for org ${testOrg.id}...`);
    const fetchedRefs = await dataManager.getReferralsForOrg(testOrg.id);
    console.log(`Found ${fetchedRefs.length} referral(s).`);
    
    const found = fetchedRefs.find(r => r.referredEmail === testEmail);
    if (found) {
      console.log('SUCCESS: Referral found in history.');
    } else {
      console.log('FAILURE: Referral NOT found in history.');
    }
  } catch (e) {
    console.error('Test failed:', e);
  }

  process.exit(0);
}

testNomination();
