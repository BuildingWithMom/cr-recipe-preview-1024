/* Common Roots: fridge shelf-life table used ONLY to suggest cooking order in "My week".
 * Numbers are days in a home refrigerator (40°F / 4°C or below) counted from purchase.
 * min = the conservative end of the range (used for ordering); max = the far end (used only for a "past the range" warning).
 * kind 'usda'     = the number is taken from a USDA source named in src/url.
 * kind 'estimate' = NOT in a USDA table we could read. Our own judgement, labelled as such. Package dates always win.
 * minor: true     = garnish-level herbs. They are shown but never set a dish's use-by score.
 * Items not listed here (flour, sugar, oils, canned goods, dried spices, vinegars, honey, rice, pasta, onions-by-the-month...) are treated as not time-critical.
 * This is planning help, not food-safety advice. When in doubt, follow the package date and FoodSafety.gov. */
(function () {
  var CHART = 'https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts';
  var FSIS = 'https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/steps-keep-food-safe';
  var FK = 'https://www.fsis.usda.gov/shared/data/EN/foodkeeper.json';
  var FKNOTE = 'USDA FSIS FoodKeeper dataset (foodkeeper.json), refrigerator column';

  var items = {
    'cod fillet':               { label: 'fresh fish', group: 'fish', min: 1, max: 2, kind: 'usda', url: FSIS, src: 'FSIS cold storage chart: fresh fish 1-2 days; FoodKeeper "Lean fish (cod, flounder, haddock...)" 1-2 days' },
    'ground beef':              { label: 'ground beef', group: 'ground meat', min: 1, max: 2, kind: 'usda', url: CHART, src: 'FoodSafety.gov cold storage chart: hamburger and ground meats 1-2 days' },
    'ground turkey':            { label: 'ground turkey', group: 'ground meat', min: 1, max: 2, kind: 'usda', url: CHART, src: 'FoodSafety.gov cold storage chart: ground poultry 1-2 days' },
    'chicken breast':           { label: 'raw chicken', group: 'poultry', min: 1, max: 2, kind: 'usda', url: CHART, src: 'FoodSafety.gov cold storage chart: fresh poultry pieces 1-2 days' },
    'roasted chicken':          { label: 'cooked rotisserie chicken', group: 'poultry', min: 3, max: 4, kind: 'usda', url: FK, src: FKNOTE + ': Rotisserie chicken 3-4 days' },
    'round steak':              { label: 'beef steak', group: 'steaks, ribs and roasts', min: 3, max: 5, kind: 'usda', url: CHART, src: 'FoodSafety.gov cold storage chart: fresh beef steaks 3-5 days' },
    'beef short rib':           { label: 'beef short ribs', group: 'steaks, ribs and roasts', min: 3, max: 5, kind: 'usda', url: FK, src: FKNOTE + ': Beef, short ribs 3-5 days' },
    'pork country-style rib':   { label: 'pork ribs', group: 'steaks, ribs and roasts', min: 3, max: 5, kind: 'usda', url: FK, src: FKNOTE + ': Pork, ribs 3-5 days (country-style ribs are shoulder cuts: 3-5 days)' },
    'bacon':                    { label: 'bacon', group: 'cured meat', min: 7, max: 7, kind: 'usda', url: CHART, src: 'FoodSafety.gov cold storage chart: bacon 1 week' },
    'cheese filled tortellini': { label: 'fresh tortellini', group: 'fresh pasta', min: 5, max: 7, kind: 'estimate', url: null, src: 'ESTIMATE: no USDA number found for fresh filled pasta. The package use-by date always wins.' },
    'asparagus spear':          { label: 'asparagus', group: 'vegetables', min: 3, max: 4, kind: 'usda', url: FK, src: FKNOTE + ': Asparagus 3-4 days' },
    'cauliflower':              { label: 'cauliflower', group: 'vegetables', min: 3, max: 5, kind: 'usda', url: FK, src: FKNOTE + ': Cauliflower 3-5 days' },
    'cucumber':                 { label: 'cucumbers', group: 'vegetables', min: 4, max: 6, kind: 'usda', url: FK, src: FKNOTE + ': Cucumbers 4-6 days' },
    'tomato':                   { label: 'fresh tomatoes', group: 'vegetables', min: 5, max: 7, kind: 'estimate', url: FK, src: 'ESTIMATE from FoodKeeper "Tomatoes: until ripe, then 7 days". We use 5-7 because we cannot know how ripe they are when bought.' },
    'red pepper':               { label: 'bell peppers', group: 'vegetables', min: 4, max: 14, kind: 'usda', url: FK, src: FKNOTE + ': Peppers 4-14 days' },
    'green pepper':             { label: 'bell peppers', group: 'vegetables', min: 4, max: 14, kind: 'usda', url: FK, src: FKNOTE + ': Peppers 4-14 days' },
    'celery':                   { label: 'celery', group: 'vegetables', min: 7, max: 14, kind: 'usda', url: FK, src: FKNOTE + ': Celery 1-2 weeks' },
    'carrot':                   { label: 'carrots', group: 'vegetables', min: 14, max: 21, kind: 'usda', url: FK, src: FKNOTE + ': Carrots 2-3 weeks' },
    'green onion':              { label: 'green onions', group: 'vegetables', min: 7, max: 7, kind: 'usda', url: FK, src: FKNOTE + ': Onions, spring or green 1 week' },
    'egg':                      { label: 'eggs', group: 'eggs and dairy', min: 21, max: 35, kind: 'usda', url: CHART, src: 'FoodSafety.gov cold storage chart: raw eggs in shell 3-5 weeks' },
    'egg yolk':                 { label: 'eggs (separated yolks are used right away)', group: 'eggs and dairy', min: 21, max: 35, kind: 'usda', url: CHART, src: 'Eggs in shell 3-5 weeks; the recipe separates them at cooking time, so the shell-egg number applies at purchase' },
    'heavy cream':              { label: 'heavy cream', group: 'eggs and dairy', min: 10, max: 10, kind: 'usda', url: FK, src: FKNOTE + ': Cream, heavy 10 days' },
    'milk':                     { label: 'milk', group: 'eggs and dairy', min: 7, max: 7, kind: 'estimate', url: null, src: 'ESTIMATE: FoodKeeper says "package use-by date" for milk. We use 7 days when the date is unknown.' },
    'sour cream':               { label: 'sour cream', group: 'eggs and dairy', min: 14, max: 14, kind: 'estimate', url: null, src: 'ESTIMATE: FoodKeeper says "package use-by date" for sour cream. We use 14 days when the date is unknown.' },
    'butter':                   { label: 'butter', group: 'eggs and dairy', min: 30, max: 60, kind: 'usda', url: FK, src: FKNOTE + ': Butter 1-2 months' },
    'crumbles feta cheese':     { label: 'feta', group: 'eggs and dairy', min: 7, max: 14, kind: 'usda', url: FK, src: FKNOTE + ': Cheese, soft (brie, goat...) 1-2 weeks; used as the nearest USDA entry for feta' },
    'cheddar cheese':           { label: 'cheddar', group: 'eggs and dairy', min: 30, max: 30, kind: 'usda', url: FK, src: FKNOTE + ': Cheese, shredded cheddar 1 month' },
    'basil':                    { label: 'fresh basil', group: 'herbs', min: 10, max: 10, kind: 'usda', url: FK, src: FKNOTE + ': Basil, fresh 10 days' },
    'fresh thyme':              { label: 'fresh thyme', group: 'herbs', min: 14, max: 21, kind: 'usda', url: FK, src: FKNOTE + ': Thyme 2-3 weeks' },
    'parsley':                  { label: 'fresh parsley', group: 'herbs', min: 2, max: 3, kind: 'usda', url: FK, src: FKNOTE + ': Parsley, fresh 2-3 days. Treated as a garnish here, so it never sets the order.', minor: true },
    'fresh dill':               { label: 'fresh dill', group: 'herbs', min: 7, max: 10, kind: 'usda', url: FK, src: FKNOTE + ': Herbs (general, no dill entry) 7-10 days. Treated as a garnish here, so it never sets the order.', minor: true }
  };

  /* Prep reminders: ONLY where the recipe's own text says to start ahead. Nothing here is invented.
   * lead = minutes before dinner to remind. basis = the recipe wording the reminder rests on (kept short and quoted). */
  var prep = {
    'barbecued-spare-ribs':   { lead: 22 * 60, label: 'Start the night before', basis: 'The method says to simmer the ribs 1 hour, sauce them, then "refrigerate overnight" before grilling.' },
    'egg-casserole':          { lead: 22 * 60, label: 'Assemble the night before', basis: 'The method says to assemble the casserole and "refrigerate overnight" before baking.' },
    'crock-pot-sloppy-joes':  { lead: 9 * 60, label: 'Start the slow cooker', basis: 'The method says to cook on low for 6 to 8 hours (or high for 3 to 4 hours), after browning the meat.' },
    'deviled-swiss-steak':    { lead: 3 * 60 + 30, label: 'Start the steak', basis: 'The method says to simmer for 2 1/2 hours, after browning.' },
    'beef-barley-soup':       { lead: 3 * 60, label: 'Start the soup', basis: 'The method says to simmer 1 1/2 hours, then an additional 45 minutes, after browning the ribs.' },
    'sweet-and-sour-cucumber':{ lead: 3 * 60, label: 'Make the cucumber salad', basis: 'The method says to "cover and chill for 2 hours".' },
    'chocolate-mousse':       { lead: 4 * 60, label: 'Make the mousse', basis: 'The method says to chill 30 to 40 minutes, then chill the cups 2 hours.' }
  };

  var data = {
    version: 1,
    chartUrl: CHART, fsisUrl: FSIS, foodKeeperUrl: FK,
    disclaimer: 'Assumes you buy fresh at the start of the week. Freezing extends it. Numbers are conservative USDA refrigerator ranges (some marked estimate); package dates and your own judgement come first.',
    items: items, prep: prep
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = data; else window.CR_FRESH = data;
})();
