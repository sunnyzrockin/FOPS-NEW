import { v4 as uuidv4 } from 'uuid';
import supabase from './supabase.js';

/**
 * Supabase Seeder for WorkflowLite
 * This script populates the Supabase database with demo data
 * 
 * IMPORTANT: Before running this:
 * 1. Run the SQL schema (supabase-schema.sql) in Supabase SQL Editor
 * 2. Create demo users in Supabase Auth manually OR use this script
 */

// Demo users with fixed IDs for predictable seeding
export const demoUsers = [
  // Owner
  {
    id: 'owner-001',
    name: 'Michael Roberts',
    email: 'owner@workflowlite.com',
    password: 'WorkflowDemo2026!',
    role: 'owner',
    status: 'active'
  },
  // Operators
  {
    id: 'operator-001',
    name: 'Sarah Johnson',
    email: 'operator@workflowlite.com',
    password: 'WorkflowDemo2026!',
    role: 'operator',
    status: 'active'
  },
  {
    id: 'operator-002',
    name: 'David Chen',
    email: 'operator2@workflowlite.com',
    password: 'WorkflowDemo2026!',
    role: 'operator',
    status: 'active'
  },
  // Staff
  {
    id: 'staff-001',
    name: 'Emma Wilson',
    email: 'staff@workflowlite.com',
    password: 'WorkflowDemo2026!',
    role: 'staff',
    status: 'active'
  },
  {
    id: 'staff-002',
    name: 'James Taylor',
    email: 'staff2@workflowlite.com',
    password: 'WorkflowDemo2026!',
    role: 'staff',
    status: 'active'
  },
  {
    id: 'staff-003',
    name: 'Lisa Brown',
    email: 'staff3@workflowlite.com',
    password: 'WorkflowDemo2026!',
    role: 'staff',
    status: 'active'
  },
  {
    id: 'staff-004',
    name: 'Mark Davis',
    email: 'staff4@workflowlite.com',
    password: 'WorkflowDemo2026!',
    role: 'staff',
    status: 'active'
  },
  {
    id: 'staff-005',
    name: 'Anna Martinez',
    email: 'staff5@workflowlite.com',
    password: 'WorkflowDemo2026!',
    role: 'staff',
    status: 'active'
  },
  {
    id: 'staff-006',
    name: 'Tom Anderson',
    email: 'staff6@workflowlite.com',
    password: 'WorkflowDemo2026!',
    role: 'staff',
    status: 'active'
  }
];

// Demo sites (5 sites)
export const demoSites = [
  {
    id: 'site-001',
    name: 'Sunstate Fuel - Brisbane Central',
    code: 'BNE-001',
    location: '123 Queen Street, Brisbane CBD, QLD 4000',
    latitude: -27.4698,
    longitude: 153.0251,
    owner_id: 'owner-001',
    status: 'active'
  },
  {
    id: 'site-002',
    name: 'Sunstate Fuel - Gold Coast',
    code: 'GC-002',
    location: '456 Surfers Paradise Blvd, Gold Coast, QLD 4217',
    latitude: -28.0023,
    longitude: 153.4283,
    owner_id: 'owner-001',
    status: 'active'
  },
  {
    id: 'site-003',
    name: 'Sunstate Fuel - Sunshine Coast',
    code: 'SC-003',
    location: '789 Ocean Drive, Maroochydore, QLD 4558',
    latitude: -26.6556,
    longitude: 153.0877,
    owner_id: 'owner-001',
    status: 'active'
  },
  {
    id: 'site-004',
    name: 'Sunstate Fuel - Toowoomba',
    code: 'TWB-004',
    location: '321 Ruthven Street, Toowoomba, QLD 4350',
    latitude: -27.5598,
    longitude: 151.9507,
    owner_id: 'owner-001',
    status: 'active'
  },
  {
    id: 'site-005',
    name: 'Sunstate Fuel - Cairns',
    code: 'CNS-005',
    location: '555 Sheridan Street, Cairns, QLD 4870',
    latitude: -16.9186,
    longitude: 145.7781,
    owner_id: 'owner-001',
    status: 'active'
  }
];

/**
 * Seed Users in Supabase Auth and users table
 */
export async function seedUsers() {
  console.log('🔧 Seeding users...');
  const createdUsers = [];

  for (const user of demoUsers) {
    try {
      // Step 1: Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          name: user.name,
          role: user.role
        }
      });

      if (authError) {
        // User might already exist
        console.log(`⚠️  User ${user.email} might already exist in Auth:`, authError.message);
        
        // Try to find existing user
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existing = existingUsers?.users?.find(u => u.email === user.email);
        
        if (existing) {
          // Insert into users table with existing auth_user_id
          const { error: insertError } = await supabase
            .from('users')
            .upsert({
              id: user.id,
              auth_user_id: existing.id,
              name: user.name,
              email: user.email,
              role: user.role,
              status: user.status
            }, { onConflict: 'id' });

          if (!insertError) {
            createdUsers.push(user);
            console.log(`✅ User ${user.email} synced to users table`);
          }
        }
        continue;
      }

      // Step 2: Insert into users table
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          auth_user_id: authData.user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status
        });

      if (insertError) {
        console.error(`❌ Error inserting user ${user.email}:`, insertError.message);
        continue;
      }

      createdUsers.push(user);
      console.log(`✅ Created user: ${user.email} (${user.role})`);
    } catch (error) {
      console.error(`❌ Error creating user ${user.email}:`, error.message);
    }
  }

  console.log(`✅ Seeded ${createdUsers.length}/${demoUsers.length} users`);
  return createdUsers;
}

/**
 * Seed Sites
 */
export async function seedSites() {
  console.log('🏢 Seeding sites...');
  
  const { data, error } = await supabase
    .from('sites')
    .upsert(demoSites, { onConflict: 'id' });

  if (error) {
    console.error('❌ Error seeding sites:', error.message);
    return [];
  }

  console.log(`✅ Seeded ${demoSites.length} sites`);
  return demoSites;
}

/**
 * Generate and seed site assignments
 */
export async function seedAssignments() {
  console.log('👥 Seeding assignments...');
  
  const owner = demoUsers.find(u => u.role === 'owner');
  const operators = demoUsers.filter(u => u.role === 'operator');
  const staff = demoUsers.filter(u => u.role === 'staff');
  
  const operatorAssignments = [];
  const staffAssignments = [];
  
  // OWNER → OPERATOR assignments
  // Operator 1 gets sites 1, 2, 3
  [demoSites[0], demoSites[1], demoSites[2]].forEach(site => {
    operatorAssignments.push({
      id: uuidv4(),
      operator_user_id: operators[0].id,
      site_id: site.id,
      assigned_by_owner_id: owner.id
    });
  });
  
  // Operator 2 gets sites 4, 5
  [demoSites[3], demoSites[4]].forEach(site => {
    operatorAssignments.push({
      id: uuidv4(),
      operator_user_id: operators[1].id,
      site_id: site.id,
      assigned_by_owner_id: owner.id
    });
  });
  
  // OPERATOR → STAFF assignments
  // Staff assignments for Operator 1's sites
  staffAssignments.push(
    { id: uuidv4(), staff_user_id: staff[0].id, site_id: demoSites[0].id, assigned_by_operator_id: operators[0].id },
    { id: uuidv4(), staff_user_id: staff[1].id, site_id: demoSites[0].id, assigned_by_operator_id: operators[0].id },
    { id: uuidv4(), staff_user_id: staff[1].id, site_id: demoSites[1].id, assigned_by_operator_id: operators[0].id },
    { id: uuidv4(), staff_user_id: staff[2].id, site_id: demoSites[1].id, assigned_by_operator_id: operators[0].id },
    { id: uuidv4(), staff_user_id: staff[2].id, site_id: demoSites[2].id, assigned_by_operator_id: operators[0].id },
    { id: uuidv4(), staff_user_id: staff[3].id, site_id: demoSites[2].id, assigned_by_operator_id: operators[0].id }
  );
  
  // Staff assignments for Operator 2's sites
  staffAssignments.push(
    { id: uuidv4(), staff_user_id: staff[3].id, site_id: demoSites[3].id, assigned_by_operator_id: operators[1].id },
    { id: uuidv4(), staff_user_id: staff[4].id, site_id: demoSites[3].id, assigned_by_operator_id: operators[1].id },
    { id: uuidv4(), staff_user_id: staff[4].id, site_id: demoSites[4].id, assigned_by_operator_id: operators[1].id },
    { id: uuidv4(), staff_user_id: staff[5].id, site_id: demoSites[4].id, assigned_by_operator_id: operators[1].id }
  );
  
  // Insert operator assignments
  const { error: opError } = await supabase
    .from('operator_site_assignments')
    .upsert(operatorAssignments, { onConflict: 'id' });
  
  if (opError) {
    console.error('❌ Error seeding operator assignments:', opError.message);
  } else {
    console.log(`✅ Seeded ${operatorAssignments.length} operator assignments`);
  }
  
  // Insert staff assignments
  const { error: staffError } = await supabase
    .from('staff_site_assignments')
    .upsert(staffAssignments, { onConflict: 'id' });
  
  if (staffError) {
    console.error('❌ Error seeding staff assignments:', staffError.message);
  } else {
    console.log(`✅ Seeded ${staffAssignments.length} staff assignments`);
  }
  
  return { operatorAssignments, staffAssignments };
}

/**
 * Seed field configurations
 */
export async function seedFieldConfigs() {
  console.log('📝 Seeding field configurations...');
  
  const operators = demoUsers.filter(u => u.role === 'operator');
  const defaultFields = [
    { key: 'fuel_sales', label: 'Fuel Sales ($)', field_type: 'currency', is_core: true, is_enabled: true, display_order: 1 },
    { key: 'total_litres', label: 'Total Litres', field_type: 'number', is_core: false, is_enabled: true, display_order: 2 },
    { key: 'shop_sales', label: 'Shop Sales ($)', field_type: 'currency', is_core: true, is_enabled: true, display_order: 3 },
    { key: 'beverages', label: 'Beverages ($)', field_type: 'currency', is_core: false, is_enabled: true, display_order: 4 },
    { key: 'hot_food', label: 'Hot Food ($)', field_type: 'currency', is_core: false, is_enabled: true, display_order: 5 },
    { key: 'eftpos', label: 'EFTPOS ($)', field_type: 'currency', is_core: false, is_enabled: true, display_order: 6 },
    { key: 'motorpass', label: 'Motorpass ($)', field_type: 'currency', is_core: false, is_enabled: true, display_order: 7 },
    { key: 'cash', label: 'Cash ($)', field_type: 'currency', is_core: false, is_enabled: true, display_order: 8 },
    { key: 'accounts', label: 'Accounts ($)', field_type: 'currency', is_core: false, is_enabled: true, display_order: 9 },
    { key: 'drive_offs', label: 'Drive Offs ($)', field_type: 'currency', is_core: false, is_enabled: true, display_order: 10 },
    { key: 'dips', label: 'Dips ($)', field_type: 'currency', is_core: true, is_enabled: true, display_order: 11 }
  ];
  
  const configs = [];
  
  demoSites.forEach((site, index) => {
    const assignedOperator = operators[index % operators.length];
    
    defaultFields.forEach(field => {
      configs.push({
        id: uuidv4(),
        site_id: site.id,
        key: field.key,
        label: field.label,
        field_type: field.field_type,
        is_core: field.is_core,
        is_enabled: field.is_enabled,
        display_order: field.display_order,
        created_by_user_id: assignedOperator.id
      });
    });
  });
  
  const { error } = await supabase
    .from('site_field_configs')
    .upsert(configs, { onConflict: 'id' });
  
  if (error) {
    console.error('❌ Error seeding field configs:', error.message);
  } else {
    console.log(`✅ Seeded ${configs.length} field configurations`);
  }
  
  return configs;
}

/**
 * Seed banking formulas (with NEW visibility fields)
 */
export async function seedBankingFormulas() {
  console.log('💰 Seeding banking formulas...');
  
  const operators = demoUsers.filter(u => u.role === 'operator');
  const formulas = [];
  
  demoSites.forEach((site, index) => {
    const assignedOperator = operators[index % operators.length];
    
    // Formula 1: Cash Reconciliation (visible to staff)
    formulas.push({
      id: uuidv4(),
      site_id: site.id,
      name: 'Cash Reconciliation',
      result_label: 'Total Cash',
      formula_json: JSON.stringify({
        operations: [
          { type: 'field', value: 'eftpos' },
          { type: 'operator', value: '+' },
          { type: 'field', value: 'cash' },
          { type: 'operator', value: '+' },
          { type: 'field', value: 'motorpass' }
        ]
      }),
      is_active: true,
      visible_to_staff: true,  // NEW: Staff can see this during shift entry
      visible_in_operator_daily_summary: true,  // NEW: Shows in operator daily rollup
      created_by_user_id: assignedOperator.id
    });
    
    // Formula 2: Shop Revenue Breakdown (visible in operator summary only)
    formulas.push({
      id: uuidv4(),
      site_id: site.id,
      name: 'Shop Revenue Breakdown',
      result_label: 'Total Shop',
      formula_json: JSON.stringify({
        operations: [
          { type: 'field', value: 'beverages' },
          { type: 'operator', value: '+' },
          { type: 'field', value: 'hot_food' }
        ]
      }),
      is_active: true,
      visible_to_staff: false,  // NEW: Hidden from staff
      visible_in_operator_daily_summary: true,  // NEW: Shows in operator daily rollup
      created_by_user_id: assignedOperator.id
    });
    
    // Formula 3: Net Sales (visible everywhere)
    formulas.push({
      id: uuidv4(),
      site_id: site.id,
      name: 'Net Sales',
      result_label: 'Net Revenue',
      formula_json: JSON.stringify({
        operations: [
          { type: 'field', value: 'total_sales' },
          { type: 'operator', value: '-' },
          { type: 'field', value: 'drive_offs' }
        ]
      }),
      is_active: true,
      visible_to_staff: true,  // NEW: Staff can see during shift entry
      visible_in_operator_daily_summary: true,  // NEW: Shows in operator daily rollup
      created_by_user_id: assignedOperator.id
    });
  });
  
  const { error } = await supabase
    .from('site_banking_formulas')
    .upsert(formulas, { onConflict: 'id' });
  
  if (error) {
    console.error('❌ Error seeding banking formulas:', error.message);
  } else {
    console.log(`✅ Seeded ${formulas.length} banking formulas (with visibility controls)`);
  }
  
  return formulas;
}

/**
 * Seed shift reports (sample data)
 */
export async function seedShiftReports() {
  console.log('📊 Seeding shift reports...');
  
  const staff = demoUsers.filter(u => u.role === 'staff');
  const reports = [];
  const shiftTypes = ['Morning', 'Afternoon', 'Night'];
  
  // Generate reports for last 10 days
  for (let dayOffset = 0; dayOffset < 10; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    
    demoSites.forEach((site, siteIndex) => {
      const shiftsForDay = dayOffset === 0 ? ['Morning'] : ['Morning', 'Afternoon'];
      
      shiftsForDay.forEach((shiftType, shiftIndex) => {
        const staffMember = staff[siteIndex % staff.length];
        
        const siteMultiplier = 1 + (siteIndex * 0.12);
        const shiftMultiplier = shiftType === 'Morning' ? 1.2 : 1.0;
        
        const baseShopSales = (700 + Math.random() * 500) * siteMultiplier * shiftMultiplier;
        const baseFuelSales = (3000 + Math.random() * 2500) * siteMultiplier * shiftMultiplier;
        
        const fuelSales = Math.round(baseFuelSales * 100) / 100;
        const shopSales = Math.round(baseShopSales * 100) / 100;
        const totalLitres = Math.round((fuelSales / 1.72) * 100) / 100;
        const totalSales = Math.round((fuelSales + shopSales) * 100) / 100;
        
        const eftpos = Math.round((totalSales * 0.62) * 100) / 100;
        const motorpass = Math.round((totalSales * 0.18) * 100) / 100;
        const cash = Math.round((totalSales * 0.12) * 100) / 100;
        const accounts = Math.round((totalSales * 0.08) * 100) / 100;
        
        const beverages = Math.round((shopSales * 0.38) * 100) / 100;
        const hotFood = Math.round((shopSales * 0.28) * 100) / 100;
        
        const driveOffs = Math.random() > 0.88 ? Math.round(Math.random() * 65 * 100) / 100 : 0;
        const dips = Math.round((12000 + Math.random() * 8000) * 100) / 100;
        
        reports.push({
          id: uuidv4(),
          site_id: site.id,
          submitted_by_user_id: staffMember.id,
          date: dateStr,
          shift_type: shiftType,
          total_sales: totalSales,
          fuel_sales: fuelSales,
          total_litres: totalLitres,
          eftpos: eftpos,
          motorpass: motorpass,
          cash: cash,
          shop_sales: shopSales,
          beverages: beverages,
          hot_food: hotFood,
          accounts: accounts,
          drive_offs: driveOffs,
          dips: dips,
          notes: driveOffs > 0 ? `Drive off incident - approx ${Math.floor(driveOffs)} litres` : '',
          total_revenue: totalSales,
          status: dayOffset > 2 ? 'reviewed' : 'pending'
        });
      });
    });
  }
  
  // Insert in batches to avoid size limits
  const batchSize = 50;
  let inserted = 0;
  
  for (let i = 0; i < reports.length; i += batchSize) {
    const batch = reports.slice(i, i + batchSize);
    const { error } = await supabase
      .from('shift_reports')
      .upsert(batch, { onConflict: 'id' });
    
    if (error) {
      console.error(`❌ Error seeding shift reports batch ${i}:`, error.message);
    } else {
      inserted += batch.length;
    }
  }
  
  console.log(`✅ Seeded ${inserted} shift reports`);
  return reports;
}

/**
 * Seed fuel price data
 */
export async function seedFuelPrices() {
  console.log('⛽ Seeding fuel prices...');
  
  const operators = demoUsers.filter(u => u.role === 'operator');
  const fuelTypes = ['ULP', 'Diesel', 'Premium'];
  const fuelPriceEntries = [];
  const siteCompetitors = [];
  const competitorPrices = [];
  
  const competitorNames = ['Shell', 'BP', '7-Eleven', 'Caltex'];
  
  // Generate competitors for each site
  demoSites.forEach((site, siteIndex) => {
    const numCompetitors = 2;
    
    for (let i = 0; i < numCompetitors; i++) {
      const distanceKm = 0.5 + Math.random() * 3;
      const angle = Math.random() * 2 * Math.PI;
      const latOffset = (distanceKm / 111) * Math.cos(angle);
      const lngOffset = (distanceKm / (111 * Math.cos(site.latitude * Math.PI / 180))) * Math.sin(angle);
      
      const compId = uuidv4();
      siteCompetitors.push({
        id: compId,
        site_id: site.id,
        competitor_name: `${competitorNames[i % competitorNames.length]} ${site.code}`,
        distance_km: distanceKm.toFixed(1),
        latitude: site.latitude + latOffset,
        longitude: site.longitude + lngOffset
      });
    }
  });
  
  // Insert competitors
  const { error: compError } = await supabase
    .from('site_competitors')
    .upsert(siteCompetitors, { onConflict: 'id' });
  
  if (compError) {
    console.error('❌ Error seeding competitors:', compError.message);
  } else {
    console.log(`✅ Seeded ${siteCompetitors.length} competitors`);
  }
  
  // Generate fuel prices for last 3 days
  const today = new Date();
  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    
    demoSites.forEach((site, siteIndex) => {
      const assignedOperator = operators[siteIndex % operators.length];
      
      fuelTypes.forEach((fuelType) => {
        let basePrice;
        if (fuelType === 'ULP') basePrice = 180 + Math.random() * 10;
        else if (fuelType === 'Diesel') basePrice = 175 + Math.random() * 8;
        else basePrice = 195 + Math.random() * 12;
        
        const ownPrice = Math.round((basePrice + (siteIndex * 0.5)) * 100) / 100;
        
        fuelPriceEntries.push({
          id: uuidv4(),
          site_id: site.id,
          entered_by_user_id: assignedOperator.id,
          date: dateStr,
          fuel_type: fuelType,
          price: ownPrice
        });
        
        // Competitor prices
        const siteComps = siteCompetitors.filter(c => c.site_id === site.id);
        siteComps.forEach(comp => {
          const compPrice = Math.round((basePrice + Math.random() * 5 - 2.5) * 100) / 100;
          competitorPrices.push({
            id: uuidv4(),
            competitor_id: comp.id,
            site_id: site.id,
            entered_by_user_id: assignedOperator.id,
            date: dateStr,
            fuel_type: fuelType,
            price: compPrice
          });
        });
      });
    });
  }
  
  // Insert own fuel prices
  const { error: priceError } = await supabase
    .from('fuel_price_entries')
    .upsert(fuelPriceEntries, { onConflict: 'id' });
  
  if (priceError) {
    console.error('❌ Error seeding fuel prices:', priceError.message);
  } else {
    console.log(`✅ Seeded ${fuelPriceEntries.length} fuel price entries`);
  }
  
  // Insert competitor prices in batches
  const batchSize = 100;
  let inserted = 0;
  for (let i = 0; i < competitorPrices.length; i += batchSize) {
    const batch = competitorPrices.slice(i, i + batchSize);
    const { error } = await supabase
      .from('competitor_fuel_prices')
      .upsert(batch, { onConflict: 'id' });
    
    if (!error) inserted += batch.length;
  }
  
  console.log(`✅ Seeded ${inserted} competitor fuel prices`);
}

/**
 * Main seeder function
 */
export async function seedDatabase() {
  console.log('🌱 Starting Supabase database seeding...\n');
  
  try {
    await seedUsers();
    await seedSites();
    await seedAssignments();
    await seedFieldConfigs();
    await seedBankingFormulas();
    await seedShiftReports();
    await seedFuelPrices();
    
    console.log('\n✅ Database seeding completed successfully!');
    return { success: true };
  } catch (error) {
    console.error('\n❌ Database seeding failed:', error);
    return { success: false, error: error.message };
  }
}
