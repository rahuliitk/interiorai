import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function seed() {
  console.log('Seeding database...');

  // --- Categories ---------------------------------------------------------
  console.log('  -> Categories...');
  const categoryData = [
    { name: 'Furniture', slug: 'furniture', description: 'Tables, chairs, sofas, beds, and storage', icon: 'chair', sortOrder: 1 },
    { name: 'Flooring', slug: 'flooring', description: 'Tiles, hardwood, vinyl, and carpet', icon: 'construction', sortOrder: 2 },
    { name: 'Lighting', slug: 'lighting', description: 'Ceiling, wall, floor, and task lighting', icon: 'lightbulb', sortOrder: 3 },
    { name: 'Wall Finishes', slug: 'wall-finishes', description: 'Paint, wallpaper, paneling, and cladding', icon: 'palette', sortOrder: 4 },
    { name: 'Plumbing Fixtures', slug: 'plumbing-fixtures', description: 'Faucets, sinks, toilets, and showers', icon: 'shower', sortOrder: 5 },
    { name: 'Electrical', slug: 'electrical', description: 'Switches, sockets, panels, and wiring', icon: 'bolt', sortOrder: 6 },
    { name: 'Soft Furnishings', slug: 'soft-furnishings', description: 'Curtains, cushions, rugs, and upholstery', icon: 'weekend', sortOrder: 7 },
    { name: 'Hardware', slug: 'hardware', description: 'Handles, hinges, locks, and fasteners', icon: 'build', sortOrder: 8 },
    { name: 'Kitchen', slug: 'kitchen', description: 'Cabinets, countertops, appliances, and sinks', icon: 'kitchen', sortOrder: 9 },
    { name: 'Bathroom', slug: 'bathroom', description: 'Vanities, mirrors, accessories, and storage', icon: 'bathtub', sortOrder: 10 },
    { name: 'Decorative', slug: 'decorative', description: 'Art, plants, sculptures, and accent pieces', icon: 'image', sortOrder: 11 },
    { name: 'Ceiling', slug: 'ceiling', description: 'False ceilings, cornices, and ceiling panels', icon: 'roofing', sortOrder: 12 },
  ];

  const insertedCategories = await db.insert(schema.categories).values(categoryData).returning();
  console.log(`    OK ${insertedCategories.length} categories`);

  // Build a lookup map
  const catMap = Object.fromEntries(insertedCategories.map(c => [c.slug, c.id]));

  // --- Vendors ------------------------------------------------------------
  console.log('  -> Vendors...');
  const vendorData = [
    {
      name: 'Urban Ladder',
      code: 'UL',
      description: 'Premium online furniture and home decor retailer',
      website: 'https://www.urbanladder.com',
      contactEmail: 'business@urbanladder.com',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'IN',
      rating: 4.3,
      paymentTerms: 'Net 30',
    },
    {
      name: 'Pepperfry',
      code: 'PF',
      description: 'India\'s largest online furniture marketplace',
      website: 'https://www.pepperfry.com',
      contactEmail: 'business@pepperfry.com',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'IN',
      rating: 4.1,
      paymentTerms: 'Net 30',
    },
    {
      name: 'IKEA India',
      code: 'IKEA',
      description: 'Swedish home furnishing retailer',
      website: 'https://www.ikea.com/in',
      contactEmail: 'business.in@ikea.com',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'IN',
      rating: 4.5,
      paymentTerms: 'Net 15',
    },
    {
      name: 'Asian Paints',
      code: 'AP',
      description: 'Leading paint and wall finish manufacturer',
      website: 'https://www.asianpaints.com',
      contactEmail: 'projects@asianpaints.com',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'IN',
      rating: 4.6,
      paymentTerms: 'Net 45',
    },
    {
      name: 'Kajaria Ceramics',
      code: 'KC',
      description: 'India\'s largest manufacturer of ceramic tiles',
      website: 'https://www.kajariaceramics.com',
      contactEmail: 'projects@kajaria.com',
      city: 'Gurgaon',
      state: 'Haryana',
      country: 'IN',
      rating: 4.4,
      paymentTerms: 'Net 30',
    },
  ];

  const insertedVendors = await db.insert(schema.vendors).values(vendorData).returning();
  console.log(`    OK ${insertedVendors.length} vendors`);
  const vendorMap = Object.fromEntries(insertedVendors.map(v => [v.code, v.id]));

  // --- Products -----------------------------------------------------------
  console.log('  -> Products...');
  const productData = [
    // Furniture
    { name: 'Oslo 3-Seater Sofa', brand: 'Urban Ladder', category: 'Furniture', categoryId: catMap['furniture'], vendorId: vendorMap['UL'], sku: 'UL-SOFA-001', material: 'Engineered Wood + Fabric', finish: 'Matte', color: '#4A5568', minPrice: 32999, maxPrice: 32999, unit: 'piece', dimensions: { length_mm: 2100, width_mm: 850, height_mm: 900 } },
    { name: 'Vienna Dining Table', brand: 'Pepperfry', category: 'Furniture', categoryId: catMap['furniture'], vendorId: vendorMap['PF'], sku: 'PF-DIN-001', material: 'Solid Sheesham Wood', finish: 'Honey', color: '#D69E2E', minPrice: 24500, maxPrice: 24500, unit: 'piece', dimensions: { length_mm: 1500, width_mm: 900, height_mm: 750 } },
    { name: 'MALM Bed Frame', brand: 'IKEA', category: 'Furniture', categoryId: catMap['furniture'], vendorId: vendorMap['IKEA'], sku: 'IKEA-BED-001', material: 'Particleboard', finish: 'White', color: '#FFFFFF', minPrice: 14999, maxPrice: 18999, unit: 'piece', dimensions: { length_mm: 2090, width_mm: 1560, height_mm: 380 } },
    { name: 'Ergo Pro Office Chair', brand: 'Urban Ladder', category: 'Furniture', categoryId: catMap['furniture'], vendorId: vendorMap['UL'], sku: 'UL-CHR-001', material: 'Mesh + Nylon', finish: 'Matte Black', color: '#1A202C', minPrice: 15999, maxPrice: 15999, unit: 'piece', dimensions: { length_mm: 650, width_mm: 650, height_mm: 1200 } },
    // Flooring
    { name: 'Arabesque Vitrified Tile 600x600', brand: 'Kajaria', category: 'Flooring', categoryId: catMap['flooring'], vendorId: vendorMap['KC'], sku: 'KC-VIT-001', material: 'Vitrified', finish: 'Glossy', color: '#E8DCC8', minPrice: 65, maxPrice: 85, unit: 'sqft', dimensions: { length_mm: 600, width_mm: 600, height_mm: 10 } },
    { name: 'Rustic Oak Laminate', brand: 'Pepperfry', category: 'Flooring', categoryId: catMap['flooring'], vendorId: vendorMap['PF'], sku: 'PF-LAM-001', material: 'HDF Laminate', finish: 'Textured', color: '#8B6914', minPrice: 95, maxPrice: 120, unit: 'sqft', dimensions: { length_mm: 1200, width_mm: 195, height_mm: 8 } },
    // Lighting
    { name: 'Nordic Pendant Light', brand: 'Urban Ladder', category: 'Lighting', categoryId: catMap['lighting'], vendorId: vendorMap['UL'], sku: 'UL-LGT-001', material: 'Metal + Glass', finish: 'Brass', color: '#D4A373', minPrice: 4999, maxPrice: 4999, unit: 'piece', dimensions: { length_mm: 350, width_mm: 350, height_mm: 400 } },
    { name: 'LED Downlight 12W', brand: 'Philips', category: 'Lighting', categoryId: catMap['lighting'], vendorId: vendorMap['UL'], sku: 'PH-DWN-001', material: 'Aluminium', finish: 'White', color: '#FFFFFF', minPrice: 599, maxPrice: 799, unit: 'piece', dimensions: { length_mm: 150, width_mm: 150, height_mm: 50 } },
    // Wall Finishes
    { name: 'Royale Luxury Emulsion', brand: 'Asian Paints', category: 'Wall Finishes', categoryId: catMap['wall-finishes'], vendorId: vendorMap['AP'], sku: 'AP-RLE-001', material: 'Acrylic Emulsion', finish: 'Sheen', color: '#F5F5F0', minPrice: 450, maxPrice: 520, unit: 'litre', weight_kg: 1.4 },
    { name: 'Texture Wall Paint - Ragging', brand: 'Asian Paints', category: 'Wall Finishes', categoryId: catMap['wall-finishes'], vendorId: vendorMap['AP'], sku: 'AP-TXR-001', material: 'Textured Emulsion', finish: 'Textured', color: '#C9B99A', minPrice: 180, maxPrice: 220, unit: 'sqft' },
    // Plumbing
    { name: 'Artize Single Lever Basin Mixer', brand: 'Jaquar', category: 'Plumbing Fixtures', categoryId: catMap['plumbing-fixtures'], vendorId: vendorMap['PF'], sku: 'JQ-BSN-001', material: 'Chrome Plated Brass', finish: 'Chrome', color: '#C0C0C0', minPrice: 8500, maxPrice: 8500, unit: 'piece' },
    // Kitchen
    { name: 'Modular Kitchen Base Cabinet 600mm', brand: 'IKEA', category: 'Kitchen', categoryId: catMap['kitchen'], vendorId: vendorMap['IKEA'], sku: 'IKEA-KIT-001', material: 'Particleboard + MDF', finish: 'White Matt', color: '#FFFFFF', minPrice: 6999, maxPrice: 8999, unit: 'piece', dimensions: { length_mm: 600, width_mm: 560, height_mm: 800 } },
    { name: 'Granite Countertop - Black Galaxy', brand: 'Kajaria', category: 'Kitchen', categoryId: catMap['kitchen'], vendorId: vendorMap['KC'], sku: 'KC-GRN-001', material: 'Natural Granite', finish: 'Polished', color: '#1A1A2E', minPrice: 250, maxPrice: 350, unit: 'sqft' },
    // Bathroom
    { name: 'Wall-Hung WC', brand: 'Jaquar', category: 'Bathroom', categoryId: catMap['bathroom'], vendorId: vendorMap['PF'], sku: 'JQ-WC-001', material: 'Ceramic', finish: 'Glossy White', color: '#FFFFFF', minPrice: 15000, maxPrice: 15000, unit: 'piece' },
    // Soft Furnishings
    { name: 'Blackout Curtain Panel', brand: 'Urban Ladder', category: 'Soft Furnishings', categoryId: catMap['soft-furnishings'], vendorId: vendorMap['UL'], sku: 'UL-CUR-001', material: 'Polyester Blend', finish: 'Matte', color: '#2D3748', minPrice: 1999, maxPrice: 2999, unit: 'piece', dimensions: { length_mm: 2100, width_mm: 1200, height_mm: 0 } },
    { name: 'Shag Area Rug 5x8', brand: 'Pepperfry', category: 'Soft Furnishings', categoryId: catMap['soft-furnishings'], vendorId: vendorMap['PF'], sku: 'PF-RUG-001', material: 'Polypropylene', finish: 'Textured', color: '#718096', minPrice: 8500, maxPrice: 12000, unit: 'piece', dimensions: { length_mm: 2400, width_mm: 1500, height_mm: 25 } },
    // Hardware
    { name: 'Slim T-Bar Cabinet Handle 160mm', brand: 'Hettich', category: 'Hardware', categoryId: catMap['hardware'], vendorId: vendorMap['PF'], sku: 'HT-HDL-001', material: 'Zinc Alloy', finish: 'Brushed Nickel', color: '#A0AEC0', minPrice: 250, maxPrice: 350, unit: 'piece' },
    { name: 'Soft-Close Hinge 110deg', brand: 'Hettich', category: 'Hardware', categoryId: catMap['hardware'], vendorId: vendorMap['PF'], sku: 'HT-HNG-001', material: 'Steel', finish: 'Nickel', color: '#C0C0C0', minPrice: 180, maxPrice: 220, unit: 'piece' },
    // Electrical
    { name: 'Modular Switch Plate 8M', brand: 'Legrand', category: 'Electrical', categoryId: catMap['electrical'], vendorId: vendorMap['PF'], sku: 'LG-SWT-001', material: 'Polycarbonate', finish: 'Glossy White', color: '#FFFFFF', minPrice: 1200, maxPrice: 1500, unit: 'piece' },
    // Decorative
    { name: 'Abstract Wall Art Canvas 60x90', brand: 'Urban Ladder', category: 'Decorative', categoryId: catMap['decorative'], vendorId: vendorMap['UL'], sku: 'UL-ART-001', material: 'Canvas on Wood', finish: 'Matte', color: '#667EEA', minPrice: 3999, maxPrice: 3999, unit: 'piece', dimensions: { length_mm: 900, width_mm: 600, height_mm: 30 } },
    { name: 'Fiddle Leaf Fig (Artificial)', brand: 'IKEA', category: 'Decorative', categoryId: catMap['decorative'], vendorId: vendorMap['IKEA'], sku: 'IKEA-PLT-001', material: 'Plastic + Fabric', finish: 'Natural Green', color: '#48BB78', minPrice: 1999, maxPrice: 1999, unit: 'piece', dimensions: { length_mm: 300, width_mm: 300, height_mm: 1200 } },
    // Ceiling
    { name: 'Gypsum False Ceiling Tile 600x600', brand: 'Saint-Gobain', category: 'Ceiling', categoryId: catMap['ceiling'], vendorId: vendorMap['KC'], sku: 'SG-CLG-001', material: 'Gypsum', finish: 'Smooth White', color: '#FAFAFA', minPrice: 55, maxPrice: 75, unit: 'sqft', dimensions: { length_mm: 600, width_mm: 600, height_mm: 12 } },
    { name: 'POP Cornice Moulding', brand: 'Local', category: 'Ceiling', categoryId: catMap['ceiling'], vendorId: vendorMap['KC'], sku: 'LC-CRN-001', material: 'Plaster of Paris', finish: 'White', color: '#FFFFFF', minPrice: 40, maxPrice: 60, unit: 'rft' },
    // Additional furniture
    { name: 'KALLAX Shelf Unit 4x4', brand: 'IKEA', category: 'Furniture', categoryId: catMap['furniture'], vendorId: vendorMap['IKEA'], sku: 'IKEA-SHF-001', material: 'Particleboard', finish: 'White', color: '#FFFFFF', minPrice: 7999, maxPrice: 7999, unit: 'piece', dimensions: { length_mm: 1470, width_mm: 390, height_mm: 1470 } },
  ];

  const insertedProducts = await db.insert(schema.products).values(
    productData.map(p => ({
      ...p,
      specifications: p.dimensions ? { 'Dimensions': `${p.dimensions.length_mm}x${p.dimensions.width_mm}x${p.dimensions.height_mm} mm` } : undefined,
      dimensions: p.dimensions ?? undefined,
    }))
  ).returning();
  console.log(`    OK ${insertedProducts.length} products`);

  // --- Product Prices -----------------------------------------------------
  console.log('  -> Product prices...');
  const priceData = insertedProducts
    .filter(p => p.vendorId)
    .map(p => ({
      productId: p.id,
      vendorId: p.vendorId!,
      price: p.minPrice ?? 0,
      currency: 'INR',
      unit: p.unit ?? 'piece',
    }));

  if (priceData.length > 0) {
    await db.insert(schema.productPrices).values(priceData);
    console.log(`    OK ${priceData.length} product prices`);
  }

  // --- Demo Project -------------------------------------------------------
  // Requires an existing user. We create the project only if we can find one.
  console.log('  -> Demo project (checking for existing user)...');
  const existingUser = await db.query.users.findFirst();

  if (existingUser) {
    const [demoProject] = await db.insert(schema.projects).values({
      userId: existingUser.id,
      name: '3BHK Apartment - Whitefield',
      status: 'designing',
      address: 'Brigade Metropolis, Whitefield, Bengaluru 560066',
      unitSystem: 'metric',
    }).returning();
    if (!demoProject) throw new Error('Failed to insert demo project');
    console.log(`    OK Demo project: ${demoProject.name}`);

    // Create 3 rooms
    const roomData = [
      { projectId: demoProject.id, name: 'Master Bedroom', type: 'bedroom', lengthMm: 4500, widthMm: 3600, heightMm: 2700, floor: 0 },
      { projectId: demoProject.id, name: 'Living Room', type: 'living_room', lengthMm: 5200, widthMm: 4000, heightMm: 2700, floor: 0 },
      { projectId: demoProject.id, name: 'Kitchen', type: 'kitchen', lengthMm: 3200, widthMm: 2800, heightMm: 2700, floor: 0 },
    ];

    const insertedRooms = await db.insert(schema.rooms).values(roomData).returning();
    console.log(`    OK ${insertedRooms.length} rooms`);
  } else {
    console.log('    WARN No users found in DB -- skipping demo project. Sign in first, then re-run seed.');
  }

  console.log('\nSeeding complete!');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
