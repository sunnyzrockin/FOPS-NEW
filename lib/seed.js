import { v4 as uuidv4 } from 'uuid';

// Demo users
export const demoUsers = [
  // Owner
  {
    id: uuidv4(),
    name: 'Michael Roberts',
    email: 'owner@demo.com',
    password: 'demo123',
    role: 'owner'
  },
  // Operators
  {
    id: uuidv4(),
    name: 'Sarah Johnson',
    email: 'operator@demo.com',
    password: 'demo123',
    role: 'operator'
  },
  {
    id: uuidv4(),
    name: 'David Chen',
    email: 'operator2@demo.com',
    password: 'demo123',
    role: 'operator'
  },
  // Staff
  {
    id: uuidv4(),
    name: 'Emma Wilson',
    email: 'staff@demo.com',
    password: 'demo123',
    role: 'staff'
  },
  {
    id: uuidv4(),
    name: 'James Taylor',
    email: 'staff2@demo.com',
    password: 'demo123',
    role: 'staff'
  },
  {
    id: uuidv4(),
    name: 'Lisa Brown',
    email: 'staff3@demo.com',
    password: 'demo123',
    role: 'staff'
  },
  {
    id: uuidv4(),
    name: 'Mark Davis',
    email: 'staff4@demo.com',
    password: 'demo123',
    role: 'staff'
  },
  {
    id: uuidv4(),
    name: 'Anna Martinez',
    email: 'staff5@demo.com',
    password: 'demo123',
    role: 'staff'
  },
  {
    id: uuidv4(),
    name: 'Tom Anderson',
    email: 'staff6@demo.com',
    password: 'demo123',
    role: 'staff'
  }
];

// Demo sites
export const demoSites = [
  {
    id: uuidv4(),
    name: 'Sunstate Fuel - Brisbane Central',
    code: 'BNE-001',
    location: '123 Queen Street, Brisbane CBD, QLD 4000'
  },
  {
    id: uuidv4(),
    name: 'Sunstate Fuel - Gold Coast',
    code: 'GC-002',
    location: '456 Surfers Paradise Blvd, Gold Coast, QLD 4217'
  },
  {
    id: uuidv4(),
    name: 'Sunstate Fuel - Sunshine Coast',
    code: 'SC-003',
    location: '789 Ocean Drive, Maroochydore, QLD 4558'
  }
];

// Generate site assignments
export function generateSiteAssignments(users, sites) {
  const assignments = [];
  
  // Owner gets all sites
  const owner = users.find(u => u.role === 'owner');
  sites.forEach(site => {
    assignments.push({
      id: uuidv4(),
      user_id: owner.id,
      site_id: site.id
    });
  });
  
  // Operators get specific sites
  const operators = users.filter(u => u.role === 'operator');
  assignments.push({ id: uuidv4(), user_id: operators[0].id, site_id: sites[0].id });
  assignments.push({ id: uuidv4(), user_id: operators[0].id, site_id: sites[1].id });
  assignments.push({ id: uuidv4(), user_id: operators[1].id, site_id: sites[2].id });
  
  // Staff get one site each
  const staff = users.filter(u => u.role === 'staff');
  assignments.push({ id: uuidv4(), user_id: staff[0].id, site_id: sites[0].id });
  assignments.push({ id: uuidv4(), user_id: staff[1].id, site_id: sites[0].id });
  assignments.push({ id: uuidv4(), user_id: staff[2].id, site_id: sites[1].id });
  assignments.push({ id: uuidv4(), user_id: staff[3].id, site_id: sites[1].id });
  assignments.push({ id: uuidv4(), user_id: staff[4].id, site_id: sites[2].id });
  assignments.push({ id: uuidv4(), user_id: staff[5].id, site_id: sites[2].id });
  
  return assignments;
}

// Generate realistic shift reports
export function generateShiftReports(users, sites, assignments) {
  const reports = [];
  const staff = users.filter(u => u.role === 'staff');
  const shiftTypes = ['Morning', 'Evening', 'Night'];
  const statuses = ['pending', 'reviewed'];
  
  // Generate reports for last 15 days
  for (let dayOffset = 0; dayOffset < 15; dayOffset++) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    
    // Each site gets 2-3 reports per day
    sites.forEach((site, siteIndex) => {
      const siteStaff = staff.filter(s => 
        assignments.some(a => a.user_id === s.id && a.site_id === site.id)
      );
      
      // Morning and Evening shifts minimum
      const shiftsForDay = dayOffset === 0 ? ['Morning'] : ['Morning', 'Evening'];
      if (dayOffset > 2 && Math.random() > 0.5) shiftsForDay.push('Night');
      
      shiftsForDay.forEach((shiftType, shiftIndex) => {
        const staffMember = siteStaff[shiftIndex % siteStaff.length];
        if (!staffMember) return;
        
        // Base values vary by site
        const siteMultiplier = 1 + (siteIndex * 0.15);
        const baseShopSales = (800 + Math.random() * 400) * siteMultiplier;
        const baseFuelSales = (3500 + Math.random() * 2000) * siteMultiplier;
        
        const fuelSales = Math.round(baseFuelSales * 100) / 100;
        const shopSales = Math.round(baseShopSales * 100) / 100;
        const totalLitres = Math.round((fuelSales / 1.75) * 100) / 100;
        const totalSales = Math.round((fuelSales + shopSales) * 100) / 100;
        
        const eftpos = Math.round((totalSales * 0.65) * 100) / 100;
        const motorpass = Math.round((totalSales * 0.15) * 100) / 100;
        const cash = Math.round((totalSales * 0.12) * 100) / 100;
        const sunstateAccount = Math.round((totalSales * 0.08) * 100) / 100;
        
        const beverages = Math.round((shopSales * 0.35) * 100) / 100;
        const hotFood = Math.round((shopSales * 0.25) * 100) / 100;
        
        const driveOffs = Math.random() > 0.85 ? Math.round(Math.random() * 50 * 100) / 100 : 0;
        const dips = Math.round((15000 + Math.random() * 5000) * 100) / 100;
        
        const submittedAt = new Date(date);
        submittedAt.setHours(shiftType === 'Morning' ? 14 : shiftType === 'Evening' ? 22 : 6);
        submittedAt.setMinutes(Math.floor(Math.random() * 30));
        
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
          sunstate_account: sunstateAccount,
          drive_offs: driveOffs,
          dips: dips,
          notes: driveOffs > 0 ? `Drive off incident reported - ${Math.floor(driveOffs)} litres` : '',
          total_revenue: totalSales,
          status: dayOffset > 1 ? 'reviewed' : (Math.random() > 0.3 ? 'pending' : 'reviewed'),
          submitted_at: submittedAt.toISOString()
        });
      });
    });
  }
  
  return reports;
}
