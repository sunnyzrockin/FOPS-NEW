import { v4 as uuidv4 } from 'uuid';

// Demo users with fixed IDs for predictable seeding
export const demoUsers = [
  // Owner
  {
    id: 'owner-001',
    name: 'Michael Roberts',
    email: 'owner@demo.com',
    password: 'demo123',
    role: 'owner',
    status: 'active',
    created_at: new Date().toISOString()
  },
  // Operators
  {
    id: 'operator-001',
    name: 'Sarah Johnson',
    email: 'operator@demo.com',
    password: 'demo123',
    role: 'operator',
    status: 'active',
    created_at: new Date().toISOString()
  },
  {
    id: 'operator-002',
    name: 'David Chen',
    email: 'operator2@demo.com',
    password: 'demo123',
    role: 'operator',
    status: 'active',
    created_at: new Date().toISOString()
  },
  // Staff
  {
    id: 'staff-001',
    name: 'Emma Wilson',
    email: 'staff@demo.com',
    password: 'demo123',
    role: 'staff',
    status: 'active',
    created_at: new Date().toISOString()
  },
  {
    id: 'staff-002',
    name: 'James Taylor',
    email: 'staff2@demo.com',
    password: 'demo123',
    role: 'staff',
    status: 'active',
    created_at: new Date().toISOString()
  },
  {
    id: 'staff-003',
    name: 'Lisa Brown',
    email: 'staff3@demo.com',
    password: 'demo123',
    role: 'staff',
    status: 'active',
    created_at: new Date().toISOString()
  },
  {
    id: 'staff-004',
    name: 'Mark Davis',
    email: 'staff4@demo.com',
    password: 'demo123',
    role: 'staff',
    status: 'active',
    created_at: new Date().toISOString()
  },
  {
    id: 'staff-005',
    name: 'Anna Martinez',
    email: 'staff5@demo.com',
    password: 'demo123',
    role: 'staff',
    status: 'active',
    created_at: new Date().toISOString()
  },
  {
    id: 'staff-006',
    name: 'Tom Anderson',
    email: 'staff6@demo.com',
    password: 'demo123',
    role: 'staff',
    status: 'active',
    created_at: new Date().toISOString()
  }
];

// Demo sites (5 sites)
export const demoSites = [
  {
    id: 'site-001',
    name: 'Sunstate Fuel - Brisbane Central',
    code: 'BNE-001',
    location: '123 Queen Street, Brisbane CBD, QLD 4000',
    owner_id: 'owner-001',
    status: 'active',
    created_at: new Date().toISOString()
  },
  {
    id: 'site-002',
    name: 'Sunstate Fuel - Gold Coast',
    code: 'GC-002',
    location: '456 Surfers Paradise Blvd, Gold Coast, QLD 4217',
    owner_id: 'owner-001',
    status: 'active',
    created_at: new Date().toISOString()
  },
  {
    id: 'site-003',
    name: 'Sunstate Fuel - Sunshine Coast',
    code: 'SC-003',
    location: '789 Ocean Drive, Maroochydore, QLD 4558',
    owner_id: 'owner-001',
    status: 'active',
    created_at: new Date().toISOString()
  },
  {
    id: 'site-004',
    name: 'Sunstate Fuel - Toowoomba',
    code: 'TWB-004',
    location: '321 Ruthven Street, Toowoomba, QLD 4350',
    owner_id: 'owner-001',
    status: 'active',
    created_at: new Date().toISOString()
  },
  {
    id: 'site-005',
    name: 'Sunstate Fuel - Cairns',
    code: 'CNS-005',
    location: '555 Sheridan Street, Cairns, QLD 4870',
    owner_id: 'owner-001',
    status: 'active',
    created_at: new Date().toISOString()
  }
];

// Generate site assignments with strict hierarchy: Owner → Operator → Staff
export function generateSiteAssignments(users, sites) {
  const owner = users.find(u => u.role === 'owner');
  const operators = users.filter(u => u.role === 'operator');
  const staff = users.filter(u => u.role === 'staff');
  
  const operatorAssignments = [];
  const staffAssignments = [];
  
  // OWNER → OPERATOR assignments
  // Operator 1 gets sites 1, 2, 3 (Brisbane, Gold Coast, Sunshine Coast)
  [sites[0], sites[1], sites[2]].forEach(site => {
    operatorAssignments.push({
      id: uuidv4(),
      operator_user_id: operators[0].id,
      site_id: site.id,
      assigned_by_owner_id: owner.id,
      created_at: new Date().toISOString()
    });
  });
  
  // Operator 2 gets sites 4, 5 (Toowoomba, Cairns)
  [sites[3], sites[4]].forEach(site => {
    operatorAssignments.push({
      id: uuidv4(),
      operator_user_id: operators[1].id,
      site_id: site.id,
      assigned_by_owner_id: owner.id,
      created_at: new Date().toISOString()
    });
  });
  
  // OPERATOR → STAFF assignments
  // Operator 1 assigns staff to their sites (sites 0, 1, 2)
  // Staff 1, 2 -> Site 1 (Brisbane)
  staffAssignments.push({ 
    id: uuidv4(), 
    staff_user_id: staff[0].id, 
    site_id: sites[0].id, 
    assigned_by_operator_id: operators[0].id, 
    created_at: new Date().toISOString() 
  });
  staffAssignments.push({ 
    id: uuidv4(), 
    staff_user_id: staff[1].id, 
    site_id: sites[0].id, 
    assigned_by_operator_id: operators[0].id, 
    created_at: new Date().toISOString() 
  });
  
  // Staff 2, 3 -> Site 2 (Gold Coast)
  staffAssignments.push({ 
    id: uuidv4(), 
    staff_user_id: staff[1].id, 
    site_id: sites[1].id, 
    assigned_by_operator_id: operators[0].id, 
    created_at: new Date().toISOString() 
  });
  staffAssignments.push({ 
    id: uuidv4(), 
    staff_user_id: staff[2].id, 
    site_id: sites[1].id, 
    assigned_by_operator_id: operators[0].id, 
    created_at: new Date().toISOString() 
  });
  
  // Staff 3 -> Site 3 (Sunshine Coast)
  staffAssignments.push({ 
    id: uuidv4(), 
    staff_user_id: staff[2].id, 
    site_id: sites[2].id, 
    assigned_by_operator_id: operators[0].id, 
    created_at: new Date().toISOString() 
  });
  
  // Operator 2 assigns staff to their sites (sites 3, 4)
  // Staff 4, 5 -> Site 4 (Toowoomba)
  staffAssignments.push({ 
    id: uuidv4(), 
    staff_user_id: staff[3].id, 
    site_id: sites[3].id, 
    assigned_by_operator_id: operators[1].id, 
    created_at: new Date().toISOString() 
  });
  staffAssignments.push({ 
    id: uuidv4(), 
    staff_user_id: staff[4].id, 
    site_id: sites[3].id, 
    assigned_by_operator_id: operators[1].id, 
    created_at: new Date().toISOString() 
  });
  
  // Staff 5, 6 -> Site 5 (Cairns)
  staffAssignments.push({ 
    id: uuidv4(), 
    staff_user_id: staff[4].id, 
    site_id: sites[4].id, 
    assigned_by_operator_id: operators[1].id, 
    created_at: new Date().toISOString() 
  });
  staffAssignments.push({ 
    id: uuidv4(), 
    staff_user_id: staff[5].id, 
    site_id: sites[4].id, 
    assigned_by_operator_id: operators[1].id, 
    created_at: new Date().toISOString() 
  });
  
  return { operatorAssignments, staffAssignments };
}

// Generate realistic shift reports (50+ reports)
export function generateShiftReports(users, sites, staffAssignments) {
  const reports = [];
  const staff = users.filter(u => u.role === 'staff');
  const shiftTypes = ['Morning', 'Afternoon', 'Night'];
  
  // Generate reports for last 20 days to get 50+ reports
  for (let dayOffset = 0; dayOffset < 20; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    
    // Each site gets 1-3 reports per day
    sites.forEach((site, siteIndex) => {
      const siteStaff = staff.filter(s => 
        staffAssignments.some(a => a.staff_user_id === s.id && a.site_id === site.id)
      );
      
      if (siteStaff.length === 0) return;
      
      // Determine shifts for the day
      const shiftsForDay = dayOffset === 0 ? ['Morning'] : 
                           dayOffset < 3 ? ['Morning', 'Afternoon'] : 
                           ['Morning', 'Afternoon', 'Night'];
      
      shiftsForDay.forEach((shiftType, shiftIndex) => {
        const staffMember = siteStaff[shiftIndex % siteStaff.length];
        if (!staffMember) return;
        
        // Base values vary by site and shift
        const siteMultiplier = 1 + (siteIndex * 0.12);
        const shiftMultiplier = shiftType === 'Morning' ? 1.2 : shiftType === 'Afternoon' ? 1.0 : 0.7;
        
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
        
        const submittedAt = new Date(date);
        submittedAt.setHours(shiftType === 'Morning' ? 14 : shiftType === 'Afternoon' ? 22 : 6);
        submittedAt.setMinutes(Math.floor(Math.random() * 45));
        
        const status = dayOffset > 2 ? 'reviewed' : (Math.random() > 0.4 ? 'pending' : 'reviewed');
        const reviewedBy = status === 'reviewed' ? (siteIndex < 3 ? 'operator-001' : 'operator-002') : null;
        
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
          difference_value: null, // Placeholder for future formula
          status: status,
          submitted_at: submittedAt.toISOString(),
          reviewed_by_user_id: reviewedBy,
          reviewed_at: status === 'reviewed' ? new Date(submittedAt.getTime() + 3600000).toISOString() : null
        });
      });
    });
  }
  
  return reports;
}

// Generate dynamic field configurations for each site
export function generateSiteFieldConfigs(sites, users) {
  const configs = [];
  const operators = users.filter(u => u.role === 'operator');
  
  // Default field configuration (core + standard fields)
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
  
  // Create field configs for each site
  sites.forEach((site, index) => {
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
        created_by_user_id: assignedOperator.id,
        created_at: new Date().toISOString()
      });
    });
    
    // Add 1-2 custom fields per site for variety
    if (index === 0 || index === 2) {
      configs.push({
        id: uuidv4(),
        site_id: site.id,
        key: `lottery_sales_${site.id}`,
        label: 'Lottery Sales ($)',
        field_type: 'currency',
        is_core: false,
        is_enabled: true,
        display_order: 12,
        created_by_user_id: assignedOperator.id,
        created_at: new Date().toISOString()
      });
    }
    
    if (index === 1 || index === 3) {
      configs.push({
        id: uuidv4(),
        site_id: site.id,
        key: `car_wash_${site.id}`,
        label: 'Car Wash Revenue ($)',
        field_type: 'currency',
        is_core: false,
        is_enabled: true,
        display_order: 13,
        created_by_user_id: assignedOperator.id,
        created_at: new Date().toISOString()
      });
    }
  });
  
  return configs;
}

// Generate banking formulas for each site
export function generateSiteBankingFormulas(sites, users) {
  const formulas = [];
  const operators = users.filter(u => u.role === 'operator');
  
  sites.forEach((site, index) => {
    const assignedOperator = operators[index % operators.length];
    
    // Formula 1: Total Cash Reconciliation (EFTPOS + Cash + Motorpass)
    formulas.push({
      id: uuidv4(),
      site_id: site.id,
      name: 'Cash Reconciliation',
      formula_json: JSON.stringify({
        operations: [
          { type: 'field', value: 'eftpos' },
          { type: 'operator', value: '+' },
          { type: 'field', value: 'cash' },
          { type: 'operator', value: '+' },
          { type: 'field', value: 'motorpass' }
        ]
      }),
      created_by_user_id: assignedOperator.id,
      created_at: new Date().toISOString()
    });
    
    // Formula 2: Shop Breakdown (Beverages + Hot Food)
    formulas.push({
      id: uuidv4(),
      site_id: site.id,
      name: 'Shop Revenue Breakdown',
      formula_json: JSON.stringify({
        operations: [
          { type: 'field', value: 'beverages' },
          { type: 'operator', value: '+' },
          { type: 'field', value: 'hot_food' }
        ]
      }),
      created_by_user_id: assignedOperator.id,
      created_at: new Date().toISOString()
    });
    
    // Formula 3: Net Sales (Total Sales - Drive Offs)
    formulas.push({
      id: uuidv4(),
      site_id: site.id,
      name: 'Net Sales (minus Drive Offs)',
      formula_json: JSON.stringify({
        operations: [
          { type: 'field', value: 'total_sales' },
          { type: 'operator', value: '-' },
          { type: 'field', value: 'drive_offs' }
        ]
      }),
      created_by_user_id: assignedOperator.id,
      created_at: new Date().toISOString()
    });
  });
  
  return formulas;
}

// Generate fuel price data
export function generateFuelPriceData(sites, users) {
  const operators = users.filter(u => u.role === 'operator');
  const siteCompetitors = [];
  const fuelPriceEntries = [];
  const competitorPrices = [];
  
  const fuelTypes = ['ULP', 'Diesel', 'Premium'];
  
  // Base competitor names
  const competitorNames = ['Shell', 'BP', '7-Eleven', 'Caltex', 'United Petroleum'];
  
  // Generate competitors for each site (2-3 competitors per site)
  sites.forEach((site, siteIndex) => {
    const numCompetitors = 2 + (siteIndex % 2); // 2 or 3 competitors
    
    for (let i = 0; i < numCompetitors; i++) {
      siteCompetitors.push({
        id: uuidv4(),
        site_id: site.id,
        competitor_name: `${competitorNames[i % competitorNames.length]} ${site.location.split(',')[0]}`,
        distance_km: (0.5 + Math.random() * 3).toFixed(1), // 0.5-3.5 km away
        created_at: new Date().toISOString()
      });
    }
  });
  
  // Generate fuel price entries and competitor prices for last 7 days
  const today = new Date();
  
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    
    sites.forEach((site, siteIndex) => {
      const assignedOperator = operators[siteIndex % operators.length];
      
      // Generate own fuel prices for this site
      fuelTypes.forEach((fuelType, typeIndex) => {
        // Base prices vary by fuel type and add some daily variation
        let basePrice;
        if (fuelType === 'ULP') basePrice = 180 + Math.random() * 10;
        else if (fuelType === 'Diesel') basePrice = 175 + Math.random() * 8;
        else basePrice = 195 + Math.random() * 12; // Premium
        
        // Add daily variation (prices change slightly day to day)
        const dailyVariation = (Math.random() - 0.5) * 4;
        const ownPrice = basePrice + dailyVariation + (siteIndex * 0.5); // Each site slightly different
        
        fuelPriceEntries.push({
          id: uuidv4(),
          site_id: site.id,
          entered_by_user_id: assignedOperator.id,
          date: dateStr,
          fuel_type: fuelType,
          own_price: Math.round(ownPrice * 10) / 10,
          created_at: new Date(date.getTime() + (typeIndex * 3600000)).toISOString()
        });
      });
      
      // Generate competitor prices
      const siteComps = siteCompetitors.filter(sc => sc.site_id === site.id);
      
      siteComps.forEach((comp, compIndex) => {
        fuelTypes.forEach((fuelType, typeIndex) => {
          let basePrice;
          if (fuelType === 'ULP') basePrice = 180 + Math.random() * 10;
          else if (fuelType === 'Diesel') basePrice = 175 + Math.random() * 8;
          else basePrice = 195 + Math.random() * 12;
          
          const dailyVariation = (Math.random() - 0.5) * 4;
          const competitorPrice = basePrice + dailyVariation + (compIndex * 1.2); // Competitors vary more
          
          competitorPrices.push({
            id: uuidv4(),
            site_id: site.id,
            competitor_name: comp.competitor_name,
            fuel_type: fuelType,
            price: Math.round(competitorPrice * 10) / 10,
            recorded_at: dateStr,
            entered_by_user_id: assignedOperator.id,
            created_at: new Date(date.getTime() + ((compIndex + typeIndex) * 3600000)).toISOString()
          });
        });
      });
    });
  }
  
  return { siteCompetitors, fuelPriceEntries, competitorPrices };
}
