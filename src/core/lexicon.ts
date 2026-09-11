import type { CategoryId } from './types';

export interface CategoryDef {
  id: CategoryId;
  label: string;
  anyLabel: string;
  /** صيغ مطبّعة، بدون «ال». العبارات متعددة الكلمات مسموحة */
  words: string[];
  /** وسوم OpenStreetMap اللي تمثل الفئة */
  osm: [string, string][];
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'pharmacy',
    label: 'صيدلية',
    anyLabel: 'أي صيدلية',
    words: ['صيدليه', 'صيدليات', 'فارمسي'],
    osm: [['amenity', 'pharmacy'], ['shop', 'chemist'], ['healthcare', 'pharmacy']],
  },
  {
    id: 'grocery',
    label: 'بقالة',
    anyLabel: 'أي بقالة',
    words: ['بقاله', 'بقالات', 'سوبرماركت', 'سوبر ماركت', 'ماركت', 'تموينات', 'هايبر', 'هايبرماركت', 'سوبر'],
    osm: [['shop', 'supermarket'], ['shop', 'convenience'], ['shop', 'grocery'], ['shop', 'greengrocer']],
  },
  {
    id: 'bookstore',
    label: 'مكتبة',
    anyLabel: 'أي مكتبة',
    words: ['مكتبه', 'مكتبات', 'قرطاسيه'],
    osm: [['shop', 'books'], ['shop', 'stationery']],
  },
  {
    id: 'fuel',
    label: 'محطة وقود',
    anyLabel: 'أي محطة وقود',
    words: ['محطه بنزين', 'محطه وقود', 'بنزينه', 'محطه', 'محطات', 'كازيه'],
    osm: [['amenity', 'fuel']],
  },
  {
    id: 'laundry',
    label: 'مغسلة',
    anyLabel: 'أي مغسلة',
    words: ['مغسله ملابس', 'مغسله', 'دراي كلين', 'مصبغه'],
    osm: [['shop', 'laundry'], ['shop', 'dry_cleaning']],
  },
  {
    id: 'charging',
    label: 'شحن سيارات',
    anyLabel: 'أي محطة شحن',
    words: ['محطه شحن', 'شاحن سيارات', 'شحن سيارات', 'شحن كهربا'],
    osm: [['amenity', 'charging_station']],
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, CategoryDef>;

export interface BrandDef {
  id: string;
  label: string;
  words: string[];
  /** تعبير يطابق الاسم في OSM بالعربي والإنجليزي */
  osmRegex: string;
  category?: CategoryId;
}

export const BRANDS: BrandDef[] = [
  { id: 'jarir', label: 'جرير', words: ['جرير', 'مكتبه جرير'], osmRegex: 'جرير|jarir', category: 'bookstore' },
  { id: 'obeikan', label: 'العبيكان', words: ['عبيكان', 'مكتبه العبيكان'], osmRegex: 'العبيكان|obeikan', category: 'bookstore' },
  { id: 'nahdi', label: 'النهدي', words: ['نهدي', 'صيدليه النهدي', 'صيدليات النهدي'], osmRegex: 'النهدي|nahdi', category: 'pharmacy' },
  { id: 'dawaa', label: 'صيدليات الدواء', words: ['صيدليات الدواء', 'صيدليه الدواء'], osmRegex: 'الدواء|dawaa', category: 'pharmacy' },
  { id: 'whites', label: 'وايتس', words: ['وايتس'], osmRegex: 'وايتس|whites', category: 'pharmacy' },
  { id: 'panda', label: 'بنده', words: ['بنده', 'هايبر بنده', 'باندا'], osmRegex: 'بنده|panda', category: 'grocery' },
  { id: 'danube', label: 'الدانوب', words: ['دانوب'], osmRegex: 'الدانوب|danube', category: 'grocery' },
  { id: 'tamimi', label: 'التميمي', words: ['تميمي', 'اسواق التميمي'], osmRegex: 'التميمي|tamimi', category: 'grocery' },
  { id: 'othaim', label: 'العثيم', words: ['عثيم', 'اسواق العثيم'], osmRegex: 'العثيم|othaim', category: 'grocery' },
  { id: 'carrefour', label: 'كارفور', words: ['كارفور'], osmRegex: 'كارفور|carrefour', category: 'grocery' },
  { id: 'lulu', label: 'لولو', words: ['لولو'], osmRegex: 'لولو|lulu', category: 'grocery' },
  { id: 'aldrees', label: 'الدريس', words: ['دريس', 'محطه الدريس'], osmRegex: 'الدريس|aldrees', category: 'fuel' },
  { id: 'sasco', label: 'ساسكو', words: ['ساسكو'], osmRegex: 'ساسكو|sasco', category: 'fuel' },
  { id: 'extra', label: 'اكسترا', words: ['اكسترا'], osmRegex: 'اكسترا|extra' },
  { id: 'ikea', label: 'ايكيا', words: ['ايكيا'], osmRegex: 'ايكيا|ikea' },
  { id: 'starbucks', label: 'ستاربكس', words: ['ستاربكس'], osmRegex: 'ستاربكس|starbucks' },
];

export const BRAND_BY_ID = Object.fromEntries(BRANDS.map((b) => [b.id, b])) as Record<string, BrandDef>;

/** الغرض ← الفئات المناسبة (فكرة 2 في الخطة) */
export const ITEM_CATEGORIES: [string[], CategoryId[]][] = [
  [['شامبو', 'معجون', 'فرشاه', 'مناديل', 'صابون', 'حفايظ', 'حفاضات', 'مزيل'], ['pharmacy', 'grocery']],
  [['دوا', 'دواء', 'دواي', 'علاج', 'بنادول', 'بندول', 'فيفادول', 'حبوب', 'فيتامين', 'فيتامينات', 'مسكن', 'كمامات', 'كمام', 'شاش', 'لاصق', 'مرهم', 'قطره', 'بخاخ', 'كريم', 'واقي', 'روشته', 'وصفه'], ['pharmacy']],
  [['حليب', 'خبز', 'عيش', 'صامولي', 'ماء', 'مويه', 'موي', 'بيض', 'جبن', 'جبنه', 'لبن', 'روب', 'عصير', 'رز', 'سكر', 'شاهي', 'شاي', 'قهوه', 'خضار', 'خضره', 'فواكه', 'فاكهه', 'طماط', 'طماطم', 'بصل', 'زيت', 'دجاج', 'لحم', 'تمر', 'بطاطس', 'بسكوت', 'شوكولاته', 'ثلج', 'مقاضي', 'اغراض'], ['grocery']],
  [['كتاب', 'كتب', 'دفتر', 'دفاتر', 'قلم', 'اقلام', 'قرطاسيه', 'ورق', 'حبر', 'الوان', 'مسطره', 'ممحاه', 'طباعه', 'تصوير'], ['bookstore']],
  [['بنزين', 'وقود', 'ديزل', 'تفويل', 'عبي', 'اعبي', 'فول'], ['fuel']],
  [['ثوب', 'ثياب', 'ثيابي', 'ملابس', 'شماغ', 'غتره', 'بدله', 'بشت', 'كوي', 'غسيل'], ['laundry']],
];

// ——— كلمات التريغر ———

export const COMMANDS = ['ذكرني', 'ذكريني', 'ذكرنى', 'فكرني', 'نبهني', 'نبهيني', 'تذكير', 'ذكرنا', 'نبهنا'];
export const CONDITIONALS = ['اذا', 'لو', 'لا', 'لما', 'يوم', 'متى', 'حين', 'كلما', 'واذا', 'ولو', 'ولما', 'وان', 'ان', 'اول', 'عند', 'بس'];
export const PASS_VERBS = ['مريت', 'مرينا', 'امر', 'نمر', 'مررت', 'عديت', 'اعدي', 'عدينا', 'مرييت', 'قربت', 'اقرب', 'صرت قريب', 'شفت'];
export const ARRIVE_VERBS = ['وصلت', 'اوصل', 'وصلنا', 'نوصل', 'دخلت', 'ادخل', 'رحت', 'اروح', 'جيت', 'اجي', 'كنت', 'اكون', 'وصولي'];
export const PREPS = ['على', 'علي', 'ب', 'من', 'جنب', 'عند', 'قرب', 'حول', 'الى', 'الي', 'ل', 'في', 'لل', 'فيه'];
export const ROUTE_PHRASES = ['في طريقي', 'على طريقي', 'بطريقي', 'بطريقي', 'في الطريق', 'على الطريق', 'وانا ماشي', 'وانا راجع', 'وانا رايح'];
export const PLACE_MODIFIERS = ['اي', 'باي', 'لاي', 'اقرب', 'باقرب', 'لاقرب', 'فرع', 'محل', 'اول'];

/** أفعال تبدأ فيها المهمة، تنهي عبارة المكان */
export const TASK_VERBS = [
  'اشتري', 'اشتر', 'اخذ', 'اجيب', 'جيب', 'خذ', 'اسحب', 'اعبي', 'عبي', 'ادفع', 'اطبع', 'استلم', 'اسلم', 'ارجع', 'اسال',
  'اشحن', 'اغسل', 'اتصل', 'اصرف', 'احجز', 'ابدل', 'اشيك', 'اكلم', 'اخلص', 'اعطي', 'اكمل', 'اشوف', 'اطلب', 'انزل', 'اوقف',
  'اصور', 'اجدد', 'اشتريلي', 'نشتري', 'ناخذ', 'نجيب',
];
export const CONNECTORS = ['عشان', 'علشان', 'لاجل', 'و', 'ثم', 'بعدين', 'اني', 'ان', 'انه', 'لازم', 'ضروري', 'بـ', '-', ':', '—'];
