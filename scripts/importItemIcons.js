/**
 * Generates the pickable icons for accounts and categories from Lucide (https://lucide.dev, a
 * dev dependency). Run with `node scripts/importItemIcons.js` after changing `GROUPS`.
 *
 * Writes three files:
 * - `src/core/domain/itemIcons.js`: the allowed icon keys (validation).
 * - `src/ui/icons/itemIconPaths.js`: one SVG path per key, every Lucide shape folded into a path.
 * - `src/ui/icons/itemIconGroups.js`: the keys grouped for the icon chooser.
 *
 * Keys are stored in synced data: never rename or remove one, only add. The first 16 keys
 * predate this script (they were hand-drawn); they now map to their Lucide equivalents.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LUCIDE_ICONS = `${ROOT}node_modules/lucide/dist/esm/icons/`;

/** Group → { app key: Lucide icon name }, in display order. */
const GROUPS = {
  money: {
    wallet: 'wallet',
    bank: 'landmark',
    piggyBank: 'piggy-bank',
    card: 'credit-card',
    coins: 'coins',
    banknote: 'banknote',
    handCoins: 'hand-coins',
    moneyCircle: 'circle-dollar-sign',
    euro: 'euro',
    dollar: 'dollar-sign',
    pound: 'pound-sterling',
    bitcoin: 'bitcoin',
    vault: 'vault',
    gem: 'gem',
    trendingUp: 'trending-up',
    trendingDown: 'trending-down',
    chartLine: 'chart-line',
    chartPie: 'chart-pie',
    candlestick: 'chart-candlestick',
    percent: 'percent',
    discount: 'badge-percent',
    receipt: 'receipt',
    calculator: 'calculator',
    arrowIn: 'arrow-down-to-line',
    arrowOut: 'arrow-up-from-line',
    handshake: 'handshake',
    scale: 'scale',
  },
  home: {
    home: 'house',
    building: 'building',
    key: 'key',
    sofa: 'sofa',
    armchair: 'armchair',
    bed: 'bed-double',
    lamp: 'lamp',
    lightbulb: 'lightbulb',
    bath: 'bath',
    shower: 'shower-head',
    washingMachine: 'washing-machine',
    refrigerator: 'refrigerator',
    microwave: 'microwave',
    hammer: 'hammer',
    wrench: 'wrench',
    drill: 'drill',
    paintRoller: 'paint-roller',
    brush: 'brush',
    sprout: 'sprout',
    flower: 'flower-2',
    trees: 'trees',
    shovel: 'shovel',
    fence: 'fence',
  },
  food: {
    utensils: 'utensils',
    chefHat: 'chef-hat',
    coffee: 'coffee',
    cupSoda: 'cup-soda',
    pizza: 'pizza',
    sandwich: 'sandwich',
    salad: 'salad',
    soup: 'soup',
    apple: 'apple',
    carrot: 'carrot',
    beef: 'beef',
    fish: 'fish',
    egg: 'egg',
    croissant: 'croissant',
    cakeSlice: 'cake-slice',
    iceCream: 'ice-cream-cone',
    cookie: 'cookie',
    candy: 'candy',
    milk: 'milk',
    wine: 'wine',
    beer: 'beer',
    martini: 'martini',
  },
  shopping: {
    cart: 'shopping-cart',
    bag: 'shopping-bag',
    basket: 'shopping-basket',
    store: 'store',
    tag: 'tag',
    package: 'package',
    shirt: 'shirt',
    glasses: 'glasses',
    watch: 'watch',
    backpack: 'backpack',
    scissors: 'scissors',
    sparkles: 'sparkles',
    gift: 'gift',
    phone: 'smartphone',
    laptop: 'laptop',
    tv: 'tv',
    headphones: 'headphones',
    camera: 'camera',
    plug: 'plug',
  },
  transport: {
    car: 'car',
    carFront: 'car-front',
    taxi: 'car-taxi-front',
    bus: 'bus',
    train: 'train-front',
    tram: 'tram-front',
    bike: 'bike',
    motorbike: 'motorbike',
    truck: 'truck',
    fuel: 'fuel',
    evCharger: 'plug-zap',
    parking: 'square-parking',
    ship: 'ship',
    sailboat: 'sailboat',
    mapPin: 'map-pin',
    route: 'route',
  },
  travel: {
    plane: 'plane',
    luggage: 'luggage',
    hotel: 'hotel',
    map: 'map',
    globe: 'globe',
    compass: 'compass',
    mountain: 'mountain-snow',
    palmTree: 'tree-palm',
    tent: 'tent',
    caravan: 'caravan',
    umbrella: 'umbrella',
    sun: 'sun',
    snowflake: 'snowflake',
    ticket: 'ticket',
    castle: 'castle',
    ferrisWheel: 'ferris-wheel',
  },
  health: {
    heart: 'heart',
    heartPulse: 'heart-pulse',
    pill: 'pill',
    stethoscope: 'stethoscope',
    hospital: 'hospital',
    syringe: 'syringe',
    bandage: 'bandage',
    thermometer: 'thermometer',
    toothbrush: 'toothbrush',
    brain: 'brain',
    eye: 'eye',
    dumbbell: 'dumbbell',
    accessibility: 'accessibility',
    cross: 'cross',
    shieldPlus: 'shield-plus',
    microscope: 'microscope',
  },
  family: {
    baby: 'baby',
    users: 'users',
    user: 'user',
    heartHandshake: 'heart-handshake',
    handHeart: 'hand-heart',
    dog: 'dog',
    cat: 'cat',
    pawPrint: 'paw-print',
    bone: 'bone',
    bird: 'bird',
    rabbit: 'rabbit',
    toyBrick: 'toy-brick',
    cake: 'cake',
    partyPopper: 'party-popper',
    church: 'church',
  },
  leisure: {
    film: 'film',
    clapperboard: 'clapperboard',
    popcorn: 'popcorn',
    drama: 'drama',
    music: 'music',
    guitar: 'guitar',
    piano: 'piano',
    mic: 'mic-vocal',
    gamepad: 'gamepad-2',
    dice: 'dice-5',
    puzzle: 'puzzle',
    palette: 'palette',
    bookOpen: 'book-open',
    trophy: 'trophy',
    medal: 'medal',
    volleyball: 'volleyball',
    waves: 'waves-ladder',
  },
  work: {
    briefcase: 'briefcase',
    book: 'book',
    graduationCap: 'graduation-cap',
    school: 'school',
    library: 'library',
    notebook: 'notebook-pen',
    pencil: 'pencil',
    presentation: 'presentation',
    monitor: 'monitor',
    printer: 'printer',
    languages: 'languages',
    flask: 'flask-conical',
    award: 'award',
    idCard: 'id-card',
    clipboard: 'clipboard-list',
    code: 'code',
    factory: 'factory',
    hardHat: 'hard-hat',
    tractor: 'tractor',
  },
  bills: {
    bolt: 'zap',
    droplet: 'droplet',
    flame: 'flame',
    wifi: 'wifi',
    router: 'router',
    call: 'phone',
    signal: 'signal',
    mail: 'mail',
    newspaper: 'newspaper',
    fileText: 'file-text',
    shield: 'shield',
    shieldCheck: 'shield-check',
    lock: 'lock',
    server: 'server',
    calendar: 'calendar',
    clock: 'clock',
    renew: 'refresh-cw',
    recycle: 'recycle',
    bin: 'trash',
    gavel: 'gavel',
  },
  other: {
    dots: 'ellipsis',
    star: 'star',
    bookmark: 'bookmark',
    flag: 'flag',
    bell: 'bell',
    pin: 'pin',
    box: 'box',
    archive: 'archive',
    leaf: 'leaf',
    crown: 'crown',
    rocket: 'rocket',
    target: 'target',
    anchor: 'anchor',
    infinity: 'infinity',
    smile: 'face-slightly-smiling',
    help: 'circle-question-mark',
    circle: 'circle',
  },
};

/** The keys that existed before this script; they must never disappear. */
const LEGACY_KEYS = [
  'cart',
  'home',
  'bolt',
  'car',
  'utensils',
  'heart',
  'film',
  'shirt',
  'plane',
  'book',
  'gift',
  'phone',
  'briefcase',
  'coins',
  'arrowIn',
  'dots',
];

/**
 * @param {unknown} value
 * @returns {string}
 */
function num(value) {
  return String(Number(Number(value).toFixed(3)));
}

/**
 * @param {string} points `x,y x,y …` or `x y x y …`
 * @returns {string[]}
 */
function pointPairs(points) {
  const values = points.trim().split(/[\s,]+/);
  /** @type {string[]} */
  const pairs = [];
  for (let i = 0; i + 1 < values.length; i += 2)
    pairs.push(`${num(values[i])} ${num(values[i + 1])}`);
  return pairs;
}

/**
 * One Lucide shape as SVG path data, drawn the way the shape element would be.
 * @param {string} tag
 * @param {Record<string, string | number>} a
 * @returns {string}
 */
function shapeToPath(tag, a) {
  switch (tag) {
    case 'path': {
      // A path may start with a relative move (`m`), which counts from the origin only while it
      // is first; joined after other shapes it would count from their end. Moving to the origin
      // first keeps it in place.
      const d = String(a.d).trim();
      return d.startsWith('m') ? `M0 0${d}` : d;
    }
    case 'line':
      return `M${num(a.x1)} ${num(a.y1)}L${num(a.x2)} ${num(a.y2)}`;
    case 'polyline':
    case 'polygon': {
      const [first, ...rest] = pointPairs(String(a.points));
      return `M${first}${rest.map((p) => `L${p}`).join('')}${tag === 'polygon' ? 'z' : ''}`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = Number(a.cx ?? 0);
      const cy = Number(a.cy ?? 0);
      const rx = Number(tag === 'circle' ? a.r : a.rx);
      const ry = Number(tag === 'circle' ? a.r : a.ry);
      const arc = `a${num(rx)} ${num(ry)} 0 1 0`;
      return `M${num(cx - rx)} ${num(cy)}${arc} ${num(2 * rx)} 0${arc} ${num(-2 * rx)} 0`;
    }
    case 'rect': {
      const x = Number(a.x ?? 0);
      const y = Number(a.y ?? 0);
      const w = Number(a.width);
      const h = Number(a.height);
      const rx = Math.min(Number(a.rx ?? a.ry ?? 0), w / 2);
      const ry = Math.min(Number(a.ry ?? a.rx ?? 0), h / 2);
      if (!rx || !ry) return `M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}z`;
      const corner = (/** @type {number} */ dx, /** @type {number} */ dy) =>
        `a${num(rx)} ${num(ry)} 0 0 1 ${num(dx)} ${num(dy)}`;
      return (
        `M${num(x + rx)} ${num(y)}h${num(w - 2 * rx)}${corner(rx, ry)}v${num(h - 2 * ry)}` +
        `${corner(-rx, ry)}h${num(-(w - 2 * rx))}${corner(-rx, -ry)}v${num(-(h - 2 * ry))}` +
        `${corner(rx, -ry)}z`
      );
    }
    default:
      throw new Error(`Unsupported Lucide shape <${tag}>`);
  }
}

/**
 * @param {string} name Lucide icon name
 * @returns {Promise<string>}
 */
async function loadPath(name) {
  const url = pathToFileURL(`${LUCIDE_ICONS}${name}.mjs`).href;
  /** @type {{ default: [string, Record<string, string | number>][] }} */
  const module = await import(url);
  return module.default.map(([tag, attrs]) => shapeToPath(tag, attrs)).join('');
}

/**
 * @param {string} file path relative to the repo root
 * @param {string} source
 * @returns {Promise<void>}
 */
async function writeFormatted(file, source) {
  const filepath = `${ROOT}${file}`;
  const options = await resolveConfig(filepath);
  await writeFile(filepath, await format(source, { ...options, filepath }));
}

const HEADER =
  '// Generated by scripts/importItemIcons.js. Do not edit; change the script and rerun.\n';

const entries = Object.entries(GROUPS).flatMap(([group, icons]) =>
  Object.entries(icons).map(([key, lucide]) => ({ group, key, lucide })),
);
const keys = entries.map((entry) => entry.key);
const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
if (duplicates.length) throw new Error(`Duplicate keys: ${duplicates.join(', ')}`);
const missingLegacy = LEGACY_KEYS.filter((key) => !keys.includes(key));
if (missingLegacy.length) throw new Error(`Legacy keys missing: ${missingLegacy.join(', ')}`);

/** @type {string[]} */
const unknown = [];
/** @type {[string, string][]} */
const paths = [];
for (const { key, lucide } of entries) {
  try {
    paths.push([key, await loadPath(lucide)]);
  } catch {
    unknown.push(lucide);
  }
}
if (unknown.length) throw new Error(`Unknown Lucide icons: ${unknown.join(', ')}`);

// Legacy keys first, so the original order of the 16 seeded-era icons is kept.
const orderedKeys = [...LEGACY_KEYS, ...keys.filter((key) => !LEGACY_KEYS.includes(key))];
const license = (await readFile(`${ROOT}node_modules/lucide/LICENSE`, 'utf8'))
  .trim()
  .split('\n')
  .map((line) => ` * ${line}`.trimEnd())
  .join('\n');

await writeFormatted(
  'src/core/domain/itemIcons.js',
  `${HEADER}
/**
 * Icon keys for accounts and categories; the UI maps each to an inline SVG. Stored in synced
 * data, so keys are only ever added.
 */
export const ITEM_ICONS = /** @type {const} */ (${JSON.stringify(orderedKeys)});

/** @typedef {(typeof ITEM_ICONS)[number]} ItemIcon */
`,
);

await writeFormatted(
  'src/ui/icons/itemIconPaths.js',
  `${HEADER}
/*!
 * Icon drawings from Lucide (https://lucide.dev), each folded into one stroke path on a 24 × 24
 * grid. Lucide's license:
 *
${license}
 */

/** @type {Readonly<Record<import('../../core/domain/itemIcons.js').ItemIcon, string>>} */
export const ITEM_ICON_PATHS = Object.freeze(${JSON.stringify(Object.fromEntries(paths))});
`,
);

await writeFormatted(
  'src/ui/icons/itemIconGroups.js',
  `${HEADER}
/**
 * The icon chooser's groups, in display order. Each group's name is \`t('iconGroup.<group>')\`.
 * @type {ReadonlyArray<{ group: string, icons: ReadonlyArray<import('../../core/domain/itemIcons.js').ItemIcon> }>}
 */
export const ITEM_ICON_GROUPS = ${JSON.stringify(
    Object.entries(GROUPS).map(([group, icons]) => ({ group, icons: Object.keys(icons) })),
  )};
`,
);

process.stdout.write(`Wrote ${keys.length} icons in ${Object.keys(GROUPS).length} groups.
`);
