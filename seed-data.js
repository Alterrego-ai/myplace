/**
 * Seed file for Sauf Imprévu restaurant data
 * Exports a function to seed real restaurant data and test reservations
 */

function seedRealData(carteDb) {
  // Check if real data already exists by looking for "La carte" family
  const existingFamily = carteDb.prepare(`
    SELECT f.id FROM families f
    JOIN restaurants r ON r.id = f.restaurant_id
    WHERE r.slug = 'sauf-imprevu' AND f.name = 'La carte'
  `).get();

  if (existingFamily) {
    console.log('✓ Real data for Sauf Imprévu already exists, skipping seed');
    return;
  }

  // Clear any existing demo data for sauf-imprevu
  const existingResto = carteDb.prepare(`
    SELECT id FROM restaurants WHERE slug = 'sauf-imprevu'
  `).get();

  if (existingResto) {
    // Delete all items, categories, and families for this restaurant
    carteDb.prepare(`
      DELETE FROM items WHERE category_id IN (
        SELECT id FROM categories WHERE restaurant_id = ?
      )
    `).run(existingResto.id);

    carteDb.prepare(`
      DELETE FROM categories WHERE restaurant_id = ?
    `).run(existingResto.id);

    carteDb.prepare(`
      DELETE FROM families WHERE restaurant_id = ?
    `).run(existingResto.id);
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SEED RESTAURANT
  // ═════════════════════════════════════════════════════════════════════════════
  let restId;
  if (existingResto) {
    restId = existingResto.id;
    carteDb.prepare(`
      UPDATE restaurants SET tagline = ? WHERE id = ?
    `).run('Cuisine de saison · Lyon', restId);
  } else {
    const restResult = carteDb.prepare(`
      INSERT INTO restaurants (name, slug, tagline) VALUES (?, ?, ?)
    `).run('Sauf Imprévu', 'sauf-imprevu', 'Cuisine de saison · Lyon');
    restId = restResult.lastInsertRowid;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SEED FAMILIES
  // ═════════════════════════════════════════════════════════════════════════════
  const familiesData = [
    { name: 'La carte', order: 0 },
    { name: 'Boissons', order: 1 },
  ];

  const familyMap = {};
  const insertFamily = carteDb.prepare(`
    INSERT INTO families (name, "order", restaurant_id) VALUES (?, ?, ?)
  `);

  for (const family of familiesData) {
    const result = insertFamily.run(family.name, family.order, restId);
    familyMap[family.name] = result.lastInsertRowid;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SEED CATEGORIES
  // ═════════════════════════════════════════════════════════════════════════════
  const categoriesData = [
    // Family "La carte"
    { family: 'La carte', name: 'Formules du midi', order: 0 },
    { family: 'La carte', name: 'Entrées', order: 1 },
    { family: 'La carte', name: 'Plats', order: 2 },
    { family: 'La carte', name: 'Fromages', order: 3 },
    { family: 'La carte', name: 'Desserts', order: 4 },
    // Family "Boissons"
    { family: 'Boissons', name: 'Eaux softs & sodas', order: 1 },
    { family: 'Boissons', name: 'Sans alcool', order: 1 },
    { family: 'Boissons', name: 'Boissons chaudes', order: 2 },
    { family: 'Boissons', name: 'Bières pression', order: 3 },
    { family: 'Boissons', name: 'Cocktails', order: 4 },
    { family: 'Boissons', name: 'Spiritueux', order: 5 },
    { family: 'Boissons', name: 'Vins blancs', order: 6 },
    { family: 'Boissons', name: 'Vins rouges', order: 7 },
    { family: 'Boissons', name: 'Crémant & Champagne', order: 8 },
    { family: 'Boissons', name: 'Vins rosés', order: 9 },
  ];

  const categoryMap = {};
  const insertCategory = carteDb.prepare(`
    INSERT INTO categories (name, "order", visible, family_id, restaurant_id)
    VALUES (?, ?, 1, ?, ?)
  `);

  for (const category of categoriesData) {
    const result = insertCategory.run(
      category.name,
      category.order,
      familyMap[category.family],
      restId
    );
    categoryMap[category.name] = result.lastInsertRowid;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // SEED ITEMS
  // ═════════════════════════════════════════════════════════════════════════════
  const itemsData = [
    // FORMULES DU MIDI
    {
      category: 'Formules du midi',
      name: 'Entrée + Plat ou Plat + Dessert',
      description: 'Formule midi',
      price: 22,
      tags: ['menu-midi'],
    },
    {
      category: 'Formules du midi',
      name: 'Entrée + Plat + Fromage ou Dessert',
      description: 'Formule midi',
      price: 26,
      tags: ['menu-midi'],
    },
    {
      category: 'Formules du midi',
      name: 'Entrée + Plat + Fromage et Dessert',
      description: 'Formule midi complète',
      price: 29,
      tags: ['menu-midi'],
    },

    // ENTRÉES
    {
      category: 'Entrées',
      name: 'Assiette de melon et jambon cru serrano 18 mois',
      description: null,
      price: 8,
      tags: ['menu-midi'],
    },
    {
      category: 'Entrées',
      name: 'Salade de tomates, pesto maison',
      description: null,
      price: 8,
      tags: ['vegetarien', 'fait-maison', 'menu-midi'],
    },
    {
      category: 'Entrées',
      name: 'Foccacia à l\'italienne',
      description: null,
      price: 8,
      tags: ['gluten', 'menu-midi'],
    },

    // PLATS
    {
      category: 'Plats',
      name: 'Filet de poulet, jus au thym, légumes de saison',
      description: null,
      price: 16,
      tags: ['menu-midi', 'saison'],
    },
    {
      category: 'Plats',
      name: 'Fish and chips maison',
      description: null,
      price: 16,
      tags: ['gluten', 'poisson', 'fait-maison', 'menu-midi'],
    },
    {
      category: 'Plats',
      name: 'Tartare de bœuf, frites salade',
      description: null,
      price: 16,
      tags: ['cru', 'menu-midi'],
    },
    {
      category: 'Plats',
      name: 'Salade de tomates, concombres, pesto, Burrata',
      description: null,
      price: 16,
      tags: ['lait', 'vegetarien', 'menu-midi'],
    },
    {
      category: 'Plats',
      name: 'Boudin noir, purée de pomme de terre et pomme au four',
      description: 'Supplément 4€',
      price: 16,
      tags: ['menu-midi'],
    },

    // FROMAGES
    {
      category: 'Fromages',
      name: 'Demi Saint-Marcellin',
      description: null,
      price: 5,
      tags: ['lait', 'local', 'menu-midi'],
    },
    {
      category: 'Fromages',
      name: 'Assiette de fromages',
      description: 'Supplément 3€ dans la formule',
      price: 5,
      tags: ['lait', 'menu-midi'],
    },

    // DESSERTS
    {
      category: 'Desserts',
      name: 'Mousse de citron jaune',
      description: null,
      price: 8,
      tags: ['fait-maison', 'menu-midi'],
    },
    {
      category: 'Desserts',
      name: 'Salade de fruits',
      description: null,
      price: 8,
      tags: ['vegan', 'menu-midi'],
    },

    // EAUX SOFTS & SODAS
    {
      category: 'Eaux softs & sodas',
      name: '½ Eau plate',
      description: '35cl',
      price: 2.5,
      tags: ['sans-alcool'],
    },
    {
      category: 'Eaux softs & sodas',
      name: '½ Eau pétillante',
      description: '35cl',
      price: 3.5,
      tags: ['sans-alcool', 'petillant'],
    },
    {
      category: 'Eaux softs & sodas',
      name: 'Sirop bio',
      description: '35cl',
      price: 3.5,
      tags: ['bio', 'sans-alcool'],
    },
    {
      category: 'Eaux softs & sodas',
      name: 'Eau plate',
      description: '75cl',
      price: 4,
      tags: ['sans-alcool'],
    },
    {
      category: 'Eaux softs & sodas',
      name: 'Limonade bio',
      description: '25cl',
      price: 4,
      tags: ['bio', 'sans-alcool'],
    },
    {
      category: 'Eaux softs & sodas',
      name: 'Tonic',
      description: '35cl',
      price: 4.5,
      tags: ['sans-alcool'],
    },
    {
      category: 'Eaux softs & sodas',
      name: 'Coca / Coca Zéro / Fuzz tea',
      description: '33cl',
      price: 4.5,
      tags: ['sans-alcool'],
    },
    {
      category: 'Eaux softs & sodas',
      name: 'Diabolo bio',
      description: '35cl',
      price: 4.5,
      tags: ['bio', 'sans-alcool'],
    },
    {
      category: 'Eaux softs & sodas',
      name: 'Eau pétillante',
      description: '75cl',
      price: 5,
      tags: ['sans-alcool', 'petillant'],
    },
    {
      category: 'Eaux softs & sodas',
      name: 'Jus de fruits bio',
      description: '20cl',
      price: 6,
      tags: ['bio', 'sans-alcool'],
    },

    // SANS ALCOOL
    {
      category: 'Sans alcool',
      name: 'Ginger beer',
      description: '35cl',
      price: 5,
      tags: ['sans-alcool'],
    },
    {
      category: 'Sans alcool',
      name: 'Martini blanc ou rouge',
      description: '6cl',
      price: 7,
      tags: ['sans-alcool'],
    },
    {
      category: 'Sans alcool',
      name: 'Martini tonic',
      description: '35cl',
      price: 8,
      tags: ['sans-alcool'],
    },
    {
      category: 'Sans alcool',
      name: 'Virgin Spritz / Mojito',
      description: '35cl',
      price: 9,
      tags: ['sans-alcool'],
    },

    // BOISSONS CHAUDES
    {
      category: 'Boissons chaudes',
      name: 'Espresso / Ristretto / Allongé / Déca',
      description: null,
      price: 2,
      tags: ['sans-alcool'],
    },
    {
      category: 'Boissons chaudes',
      name: 'Noisette',
      description: null,
      price: 2.2,
      tags: ['lait', 'sans-alcool'],
    },
    {
      category: 'Boissons chaudes',
      name: 'Americano',
      description: null,
      price: 3.5,
      tags: ['sans-alcool'],
    },
    {
      category: 'Boissons chaudes',
      name: 'Café crème',
      description: null,
      price: 3.5,
      tags: ['lait', 'sans-alcool'],
    },
    {
      category: 'Boissons chaudes',
      name: 'Double expresso',
      description: null,
      price: 4,
      tags: ['sans-alcool'],
    },
    {
      category: 'Boissons chaudes',
      name: 'Thé noir',
      description: null,
      price: 4.5,
      tags: ['sans-alcool'],
    },
    {
      category: 'Boissons chaudes',
      name: 'Thé vert',
      description: null,
      price: 4.5,
      tags: ['sans-alcool'],
    },
    {
      category: 'Boissons chaudes',
      name: 'Thé blanc',
      description: null,
      price: 4.5,
      tags: ['sans-alcool'],
    },
    {
      category: 'Boissons chaudes',
      name: 'Infusion',
      description: null,
      price: 4.5,
      tags: ['sans-alcool'],
    },
    {
      category: 'Boissons chaudes',
      name: 'Tchaï tea',
      description: null,
      price: 4.5,
      tags: ['sans-alcool'],
    },
    {
      category: 'Boissons chaudes',
      name: 'Rooibos',
      description: null,
      price: 4.5,
      tags: ['sans-alcool'],
    },
    {
      category: 'Boissons chaudes',
      name: 'BB Detox',
      description: null,
      price: 4.5,
      tags: ['sans-alcool'],
    },

    // BIÈRES PRESSION
    {
      category: 'Bières pression',
      name: 'Bière blonde',
      description: '25cl : 4,00€ · 50cl : 7,00€',
      price: 4,
      tags: ['contient-alcool', 'pression'],
    },
    {
      category: 'Bières pression',
      name: 'Panaché / Monaco / Sirop',
      description: '25cl : 4,00€ · 50cl : 7,00€',
      price: 4,
      tags: ['contient-alcool', 'pression'],
    },
    {
      category: 'Bières pression',
      name: 'Indian Pale Ale (IPA)',
      description: '25cl : 4,50€ · 50cl : 8,00€',
      price: 4.5,
      tags: ['contient-alcool', 'pression'],
    },
    {
      category: 'Bières pression',
      name: 'Bière du moment',
      description: '25cl : 4,50€ · 50cl : 8,00€',
      price: 4.5,
      tags: ['contient-alcool', 'pression'],
    },
    {
      category: 'Bières pression',
      name: 'Picon bière',
      description: '25cl : 4,50€ · 50cl : 8,00€',
      price: 4.5,
      tags: ['contient-alcool', 'pression'],
    },
    {
      category: 'Bières pression',
      name: 'Happy Hour 17h-19h',
      description: 'Pinte',
      price: 6,
      tags: ['contient-alcool', 'pression', 'happy-hour'],
    },

    // COCKTAILS
    {
      category: 'Cocktails',
      name: 'Spritz Apérol',
      description: '50cl',
      price: 10,
      tags: ['contient-alcool'],
    },
    {
      category: 'Cocktails',
      name: 'Gin tonic',
      description: '50cl',
      price: 12,
      tags: ['contient-alcool'],
    },
    {
      category: 'Cocktails',
      name: 'Chartreuse Mule / Vodka Mule',
      description: '50cl',
      price: 12,
      tags: ['contient-alcool'],
    },
    {
      category: 'Cocktails',
      name: 'Espresso Martini',
      description: '50cl',
      price: 12,
      tags: ['contient-alcool'],
    },
    {
      category: 'Cocktails',
      name: 'Spritz Saint Germain',
      description: '50cl',
      price: 14,
      tags: ['contient-alcool'],
    },

    // SPIRITUEUX
    {
      category: 'Spiritueux',
      name: 'Ricard',
      description: '4cl',
      price: 3.5,
      tags: ['contient-alcool'],
    },
    {
      category: 'Spiritueux',
      name: 'Gentiane / Limoncello / Génépi',
      description: '4cl',
      price: 8,
      tags: ['contient-alcool'],
    },
    {
      category: 'Spiritueux',
      name: 'Gin',
      description: '4cl',
      price: 9,
      tags: ['contient-alcool'],
    },
    {
      category: 'Spiritueux',
      name: 'Calvados',
      description: '4cl',
      price: 9,
      tags: ['contient-alcool', 'france'],
    },
    {
      category: 'Spiritueux',
      name: 'Tequila',
      description: '4cl',
      price: 9,
      tags: ['contient-alcool'],
    },
    {
      category: 'Spiritueux',
      name: 'Whisky Single Malt',
      description: '4cl',
      price: 9,
      tags: ['contient-alcool'],
    },
    {
      category: 'Spiritueux',
      name: 'Liqueurs "la petite merveille"',
      description: '4cl',
      price: 10,
      tags: ['contient-alcool', 'local'],
    },
    {
      category: 'Spiritueux',
      name: 'Whisky Isaly Storm',
      description: '4cl',
      price: 10,
      tags: ['contient-alcool'],
    },
    {
      category: 'Spiritueux',
      name: 'Rhum XO Overseas',
      description: '4cl',
      price: 10,
      tags: ['contient-alcool'],
    },
    {
      category: 'Spiritueux',
      name: 'Chartreuse jaune / Chartreuse verte',
      description: '4cl',
      price: 12,
      tags: ['contient-alcool', 'local'],
    },
    {
      category: 'Spiritueux',
      name: 'Grande sapinette',
      description: '4cl',
      price: 12,
      tags: ['contient-alcool', 'local'],
    },
    {
      category: 'Spiritueux',
      name: 'Cognac / Armagnac',
      description: '4cl',
      price: 12,
      tags: ['contient-alcool', 'france'],
    },
    {
      category: 'Spiritueux',
      name: 'Hudson Bourbon',
      description: '4cl',
      price: 14,
      tags: ['contient-alcool'],
    },

    // VINS BLANCS
    {
      category: 'Vins blancs',
      name: 'Côtes du Rhône Villages',
      description: '2021 · AOP · Collection VIP — 12cl : 6€ · 75cl : 29€',
      price: 6,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins blancs',
      name: 'Cool of the Wine',
      description: '2023 · Coteaux du Lyonnais AOC — 12cl : 7€ · 75cl : 35€',
      price: 7,
      tags: ['sulfites', 'contient-alcool', 'france', 'aoc'],
    },
    {
      category: 'Vins blancs',
      name: 'Saint Bris',
      description: '2023 · AOP · Bourgogne, sauvignon blanc — 12cl : 7€ · 75cl : 35€',
      price: 7,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins blancs',
      name: 'Beaujolais Village',
      description: '2021 · AOP · Château de Poncié — 12cl : 8€ · 75cl : 39€',
      price: 8,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins blancs',
      name: 'Costières de Nîmes',
      description: '2023 · AOP · Mas des Bressades — 12cl : 8€ · 75cl : 39€',
      price: 8,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins blancs',
      name: 'Pinot d\'Alsace',
      description: '2022 · Assemblage Alsace · Vignoble du Rêveur — 12cl : 8€ · 75cl : 39€',
      price: 8,
      tags: ['sulfites', 'contient-alcool', 'france'],
    },
    {
      category: 'Vins blancs',
      name: 'Viognier, Les Vignes d\'à Côté',
      description: '2023 · IGP · Yves Cuilleron — 12cl : 8€ · 75cl : 39€',
      price: 8,
      tags: ['sulfites', 'contient-alcool', 'france', 'igp'],
    },
    {
      category: 'Vins blancs',
      name: 'Crozes-Hermitage',
      description: '2022 · AOP · Côtes du Rhône septentrionale — 12cl : 9€ · 75cl : 45€',
      price: 9,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins blancs',
      name: 'Vacqueyras',
      description: '2023 · AOP · Côtes du Rhône septentrionale — 12cl : 9€ · 75cl : 45€',
      price: 9,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins blancs',
      name: 'Viré-Clessé',
      description: '2022 · AOC · Maison Rophéau — 12cl : 9€ · 75cl : 45€',
      price: 9,
      tags: ['sulfites', 'contient-alcool', 'france', 'aoc'],
    },
    {
      category: 'Vins blancs',
      name: 'Rully Les Cailloux',
      description: '2020 · AOC · Bourgogne — 12cl : 10€ · 75cl : 49€',
      price: 10,
      tags: ['sulfites', 'contient-alcool', 'france', 'aoc'],
    },
    {
      category: 'Vins blancs',
      name: 'Saint Joseph',
      description: '2023 · AOP · Domaine Stéphane Montez — 12cl : 10€ · 75cl : 49€',
      price: 10,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins blancs',
      name: 'Saint Véran',
      description: '2022 · AOC · Bourgogne, Maison Rophéau — 12cl : 10€ · 75cl : 49€',
      price: 10,
      tags: ['sulfites', 'contient-alcool', 'france', 'aoc'],
    },
    {
      category: 'Vins blancs',
      name: 'Saint-Peray',
      description: '2023 · AOP · Yves Cuilleron — 12cl : 10€ · 75cl : 49€',
      price: 10,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins blancs',
      name: 'Ronceray',
      description: '2023 · AOC · Loire, chenin sec, Ch. de plaisance — 12cl : 12€ · 75cl : 59€',
      price: 12,
      tags: ['sulfites', 'contient-alcool', 'france', 'aoc'],
    },

    // VINS ROUGES
    {
      category: 'Vins rouges',
      name: 'Côtes du Rhône Villages',
      description: '2022 · AOP · Collection VIP — 12cl : 6€ · 75cl : 29€',
      price: 6,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins rouges',
      name: 'Syrah',
      description: '2023 · Les Vignes du Côté, Yves Cuilleron — 12cl : 7€ · 75cl : 35€',
      price: 7,
      tags: ['sulfites', 'contient-alcool', 'france'],
    },
    {
      category: 'Vins rouges',
      name: 'Beaujolais rouge',
      description: '2023 · Beaujolais AOP · Domaine Desvignes — 12cl : 8€ · 75cl : 39€',
      price: 8,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins rouges',
      name: 'Brouilly',
      description: '2022 · AOP · Beaujolais, château de Pierreux — 12cl : 8€ · 75cl : 39€',
      price: 8,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins rouges',
      name: 'Costières de Nîmes',
      description: '2022 · AOP · Mas des Bressades — 12cl : 8€ · 75cl : 39€',
      price: 8,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins rouges',
      name: 'Crozes-Hermitage',
      description: '2022 · AOP · Côtes du Rhône septentrionale — 12cl : 8€ · 75cl : 45€',
      price: 8,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins rouges',
      name: 'Bivouac - Vin nature',
      description: '2023 · Vin de France · Jérémy Bricka — 12cl : 9€ · 75cl : 45€',
      price: 9,
      tags: ['sulfites', 'contient-alcool', 'vin-naturel', 'france'],
    },
    {
      category: 'Vins rouges',
      name: 'La Syrah de Lyon !',
      description: '2024 · Vin de France · Plein Soleil de Culture — 12cl : 9€ · 75cl : 45€',
      price: 9,
      tags: ['sulfites', 'contient-alcool', 'france'],
    },
    {
      category: 'Vins rouges',
      name: 'Vacqueyras',
      description: '2022 · AOP · Côtes du Rhône septentrionale — 12cl : 9€ · 75cl : 45€',
      price: 9,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins rouges',
      name: 'Gigondas',
      description: '2020 · AOP · Côtes du Rhône · Collection VIP — 12cl : 10€ · 75cl : 49€',
      price: 10,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins rouges',
      name: 'Saint Joseph',
      description: '2020 · AOP · Domaine Stéphane Montez — 12cl : 10€ · 75cl : 49€',
      price: 10,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins rouges',
      name: 'Auxey-Duresse',
      description: '2018 · AOC · Bourgogne — 12cl : 12€ · 75cl : 59€',
      price: 12,
      tags: ['sulfites', 'contient-alcool', 'france', 'aoc'],
    },

    // CRÉMANT & CHAMPAGNE
    {
      category: 'Crémant & Champagne',
      name: 'Vionnier, mousseux',
      description: '2021 · Yves Cuilleron — 12cl : 9€ · 75cl : 45€',
      price: 9,
      tags: ['sulfites', 'contient-alcool', 'petillant', 'france'],
    },
    {
      category: 'Crémant & Champagne',
      name: 'Champagne Tradition',
      description: 'AOC · Collection VIP — 12cl : 12€ · 75cl : 59€',
      price: 12,
      tags: ['sulfites', 'contient-alcool', 'petillant', 'france', 'aoc'],
    },
    {
      category: 'Crémant & Champagne',
      name: 'Champagne Blanc de Blanc / Rosé / Prestige',
      description: 'AOC · Collection VIP — 75cl : 69€',
      price: 69,
      tags: ['sulfites', 'contient-alcool', 'petillant', 'france', 'aoc'],
    },

    // VINS ROSÉS
    {
      category: 'Vins rosés',
      name: 'Côtes du Rhône',
      description: '2022 · AOP · Collection VIP — 12cl : 6€ · 75cl : 29€',
      price: 6,
      tags: ['sulfites', 'contient-alcool', 'france', 'aop'],
    },
    {
      category: 'Vins rosés',
      name: 'Puech-Haut',
      description: '2024 · IGP · Argali — 12cl : 9€ · 75cl : 45€',
      price: 9,
      tags: ['sulfites', 'contient-alcool', 'france', 'igp'],
    },
  ];

  const insertItem = carteDb.prepare(`
    INSERT INTO items (name, description, price, available, category_id)
    VALUES (?, ?, ?, 1, ?)
  `);

  const insertItemTag = carteDb.prepare(`
    INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)
  `);

  const getTagBySlug = carteDb.prepare(`
    SELECT id FROM tags WHERE slug = ?
  `);

  const seedItems = carteDb.transaction(() => {
    for (const item of itemsData) {
      const result = insertItem.run(
        item.name,
        item.description || null,
        item.price,
        categoryMap[item.category]
      );

      for (const tagSlug of item.tags) {
        const tag = getTagBySlug.get(tagSlug);
        if (tag) {
          insertItemTag.run(result.lastInsertRowid, tag.id);
        }
      }
    }
  });

  seedItems();
  console.log('✓ Real data for Sauf Imprévu seeded successfully');

  // Note : pas de seed de réservations de test — les données réelles ne doivent jamais être supprimées
  console.log('✓ Carte seeded (réservations existantes préservées)');
}

module.exports = { seedRealData };
