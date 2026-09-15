import type { CategoryId } from './types';

export interface CategoryDef {
  id: CategoryId;
  label: string;
  anyLabel: string;
  /** صيغ مطبّعة، بدون «ال». العبارات متعددة الكلمات مسموحة */
  words: string[];
  /** وسوم OpenStreetMap اللي تمثل الفئة، مع اسم النوع للعرض */
  osm: [key: string, value: string, label: string][];
  /** كلمات في اسم المكان تدل على نوعه (مطبّعة)، فما نكتب النوع قبل الاسم */
  nameWords: string[];
  /**
   * كلمات في اسم المكان تناقض الفئة (مطبّعة): وسمه في OSM غلط، مثل «العاب الحسين» موسوم بقالة.
   * نطابق الكلمة كاملة، فـ«العابدين» ما تنستبعد.
   */
  excludeWords: string[];
  /**
   * المكان لازم يكون عليه اسم أو مشغّل أو هاتف أو موقع، وإلا ما ينحسب من الفئة.
   * نقاط المحلات بلا هوية غالبًا قديمة وتسكّرت؛ المحطات تبان من الأقمار فما تحتاجه.
   */
  requireIdentity: boolean;
  /**
   * بضاعة المحل (مطبّعة): تنحسب فئة بعد «محل/متجر» بس («محل ألعاب»)، ولحالها تبقى غرض («أشتري ألعاب»).
   * البحث في المحرر يطابقها كمان.
   */
  goods?: string[];
  /** فئة إضافية: تطلع بالبحث في المحرر، مو زر دائم */
  more?: true;
}

/** فئة إضافية بدون استبعاد بالاسم */
function more(
  id: CategoryId, label: string, anyLabel: string, words: string[], goods: string[],
  osm: CategoryDef['osm'], nameWords: string[], requireIdentity = true,
): CategoryDef {
  return { id, label, anyLabel, words, goods, osm, nameWords, excludeWords: [], requireIdentity, more: true };
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'pharmacy',
    label: 'صيدلية',
    anyLabel: 'أي صيدلية',
    words: ['صيدليه', 'صيدليات', 'فارمسي'],
    osm: [['amenity', 'pharmacy', 'صيدلية'], ['shop', 'chemist', 'صيدلية'], ['healthcare', 'pharmacy', 'صيدلية']],
    requireIdentity: true,
    nameWords: ['pharmacy', 'pharmacies', 'drugstore'],
    excludeWords: [],
  },
  {
    id: 'grocery',
    label: 'بقالة',
    anyLabel: 'أي بقالة',
    words: ['بقاله', 'بقالات', 'سوبرماركت', 'سوبر ماركت', 'ماركت', 'تموينات', 'هايبر', 'هايبرماركت', 'سوبر'],
    osm: [['shop', 'supermarket', 'سوبرماركت'], ['shop', 'convenience', 'بقالة'], ['shop', 'grocery', 'بقالة'], ['shop', 'greengrocer', 'خضار وفواكه']],
    requireIdentity: true,
    nameWords: [
      'اسواق', 'سوق', 'مخابز', 'خضار', 'خضاره', 'خضروات', 'فواكه', 'فاكهه',
      'market', 'markets', 'supermarket', 'supermarkt', 'hypermarket', 'minimarket', 'mart', 'grocery', 'convenience', 'bakala',
    ],
    excludeWords: [
      'العاب', 'لعب', 'لعبه', 'toys', 'toy', 'games', 'وسايل تعليميه',
      'رحلات', 'صيد', 'عقاريه', 'عقارات', 'عقار',
      'اثاث', 'مفروشات', 'furniture', 'هوم سنتر', 'home center', 'home centre',
      'عطور', 'عطر', 'perfume', 'perfumes', 'جوالات', 'جوال', 'mobile', 'mobiles', 'ملابس', 'ازياء', 'fashion',
    ],
  },
  {
    id: 'bookstore',
    label: 'مكتبة',
    anyLabel: 'أي مكتبة',
    words: ['مكتبه', 'مكتبات', 'قرطاسيه'],
    osm: [['shop', 'books', 'مكتبة'], ['shop', 'stationery', 'قرطاسية']],
    requireIdentity: true,
    nameWords: ['books', 'bookstore', 'bookshop', 'library', 'stationery'],
    excludeWords: [],
  },
  {
    id: 'fuel',
    label: 'محطة وقود',
    anyLabel: 'أي محطة وقود',
    words: ['محطه بنزين', 'محطه وقود', 'بنزينه', 'محطه', 'محطات', 'كازيه'],
    osm: [['amenity', 'fuel', 'محطة وقود']],
    requireIdentity: false,
    nameWords: ['بنزين', 'وقود', 'station', 'fuel', 'petrol'],
    excludeWords: [],
  },
  {
    id: 'laundry',
    label: 'مغسلة',
    anyLabel: 'أي مغسلة',
    words: ['مغسله ملابس', 'مغسله', 'دراي كلين', 'مصبغه'],
    osm: [['shop', 'laundry', 'مغسلة'], ['shop', 'dry_cleaning', 'مغسلة']],
    requireIdentity: true,
    nameWords: ['laundry', 'dry cleaning', 'dry clean'],
    excludeWords: [],
  },
  {
    id: 'charging',
    label: 'شحن سيارات',
    anyLabel: 'أي محطة شحن',
    words: ['محطه شحن', 'شاحن سيارات', 'شحن سيارات', 'شحن كهربا'],
    osm: [['amenity', 'charging_station', 'شحن سيارات']],
    requireIdentity: false,
    nameWords: ['شحن', 'charging', 'charger'],
    excludeWords: [],
  },
  // ——— فئات إضافية (بالبحث) ———
  more('toys', 'محل ألعاب', 'أي محل ألعاب', ['تويز'], ['العاب', 'لعب'], [['shop', 'toys', 'محل ألعاب'], ['shop', 'video_games', 'ألعاب فيديو']], ['toys', 'toy', 'games']),
  more('electronics', 'إلكترونيات', 'أي محل إلكترونيات', ['الكترونيات'], ['اجهزه', 'كهربائيات'], [['shop', 'electronics', 'إلكترونيات'], ['shop', 'computer', 'كمبيوتر']], ['electronics', 'computer', 'computers']),
  more('mobile', 'جوالات', 'أي محل جوالات', ['اتصالات'], ['جوالات', 'جوال', 'موبايلات'], [['shop', 'mobile_phone', 'جوالات']], ['mobile', 'mobiles', 'phone', 'phones', 'telecom']),
  more('clothes', 'ملابس', 'أي محل ملابس', ['ازياء', 'بوتيك'], ['ملابس', 'عبايات', 'فساتين'], [['shop', 'clothes', 'ملابس'], ['shop', 'boutique', 'بوتيك'], ['shop', 'fashion', 'أزياء']], ['fashion', 'clothing', 'boutique']),
  more('shoes', 'أحذية', 'أي محل أحذية', [], ['احذيه', 'جزم', 'نعالات'], [['shop', 'shoes', 'أحذية']], ['shoes', 'shoe']),
  more('perfume', 'عطور', 'أي محل عطور', [], ['عطور', 'عطر', 'عود', 'بخور'], [['shop', 'perfumery', 'عطور']], ['perfume', 'perfumes', 'oud']),
  more('jewelry', 'ذهب ومجوهرات', 'أي محل ذهب', ['مجوهرات', 'صاغه'], ['ذهب'], [['shop', 'jewelry', 'مجوهرات']], ['jewelry', 'jewellery', 'gold']),
  more('florist', 'ورد', 'أي محل ورد', ['مشتل'], ['ورد', 'ورود', 'زهور'], [['shop', 'florist', 'ورد'], ['shop', 'garden_centre', 'مشتل']], ['flowers', 'florist']),
  more('gifts', 'هدايا', 'أي محل هدايا', [], ['هدايا', 'تغليف'], [['shop', 'gift', 'هدايا']], ['gift', 'gifts']),
  more('houseware', 'أدوات منزلية', 'أي محل أدوات منزلية', ['منزليات'], ['اواني', 'ادوات منزليه'], [['shop', 'houseware', 'أدوات منزلية']], ['houseware', 'kitchen']),
  more('furniture', 'أثاث', 'أي محل أثاث', ['مفروشات'], ['اثاث'], [['shop', 'furniture', 'أثاث']], ['furniture']),
  more('hardware', 'عدد وأدوات', 'أي محل عدد', ['خردوات', 'هاردوير'], ['عدد', 'ادوات'], [['shop', 'hardware', 'عدد وأدوات'], ['shop', 'doityourself', 'عدد وأدوات']], ['hardware', 'tools']),
  more('sports', 'رياضة', 'أي محل رياضة', [], ['رياضه', 'ادوات رياضيه'], [['shop', 'sports', 'رياضة']], ['sport', 'sports']),
  more('pets', 'مستلزمات حيوانات', 'أي محل حيوانات', [], ['حيوانات', 'حيوانات اليفه', 'طيور', 'قطط'], [['shop', 'pet', 'مستلزمات حيوانات']], ['pet', 'pets']),
  more('bakery', 'مخبز', 'أي مخبز', ['مخبز', 'مخابز'], ['معجنات', 'فطاير'], [['shop', 'bakery', 'مخبز']], ['bakery']),
  more('sweets', 'حلويات', 'أي محل حلويات', [], ['حلويات', 'حلا', 'كيك'], [['shop', 'confectionery', 'حلويات'], ['shop', 'pastry', 'حلويات']], ['sweets', 'cake', 'cakes', 'pastry']),
  more('cafe', 'مقهى', 'أي مقهى', ['مقهي', 'كوفي', 'كافيه', 'كوفي شوب'], ['قهوه'], [['amenity', 'cafe', 'مقهى']], ['cafe', 'coffee']),
  more('restaurant', 'مطعم', 'أي مطعم', ['مطعم', 'مطاعم'], ['اكل', 'وجبات'], [['amenity', 'restaurant', 'مطعم'], ['amenity', 'fast_food', 'وجبات سريعة']], ['restaurant', 'burger', 'pizza', 'grill']),
  more('atm', 'صراف آلي', 'أي صراف', ['صراف', 'صرافه', 'صرافات'], [], [['amenity', 'atm', 'صراف آلي']], ['atm'], false),
  more('bank', 'بنك', 'أي بنك', ['بنك', 'بنوك', 'مصرف'], [], [['amenity', 'bank', 'بنك']], ['bank']),
  more('clinic', 'عيادة', 'أي عيادة', ['عياده', 'عيادات', 'مستوصف', 'مجمع طبي', 'مركز طبي'], [], [['amenity', 'clinic', 'عيادة'], ['amenity', 'doctors', 'عيادة'], ['amenity', 'dentist', 'عيادة أسنان']], ['clinic', 'medical', 'dental']),
  more('hospital', 'مستشفى', 'أي مستشفى', ['مستشفي', 'مستشفيات'], [], [['amenity', 'hospital', 'مستشفى']], ['hospital'], false),
  more('optician', 'بصريات', 'أي محل بصريات', ['بصريات'], ['نظارات', 'عدسات'], [['shop', 'optician', 'بصريات']], ['optical', 'optics', 'optician']),
  more('barber', 'حلاق', 'أي حلاق', ['حلاق', 'حلاقين', 'صالون حلاقه'], [], [['shop', 'hairdresser', 'حلاق']], ['barber', 'barbershop']),
  more('beauty', 'صالون تجميل', 'أي صالون تجميل', ['مشغل', 'مشاغل', 'صالون', 'كوافير'], [], [['shop', 'beauty', 'صالون تجميل']], ['beauty', 'salon', 'spa']),
  more('carWash', 'مغسلة سيارات', 'أي مغسلة سيارات', ['مغسله سيارات', 'غسيل سيارات'], [], [['amenity', 'car_wash', 'مغسلة سيارات']], ['car wash', 'carwash']),
  more('carParts', 'قطع غيار', 'أي محل قطع غيار', ['قطع غيار', 'تشليح'], ['كفرات', 'زيوت'], [['shop', 'car_parts', 'قطع غيار'], ['shop', 'tyres', 'كفرات']], ['parts', 'tyres', 'tires']),
  more('carRepair', 'ورشة سيارات', 'أي ورشة', ['ورشه', 'ورش', 'بنشر', 'ميكانيكي'], [], [['shop', 'car_repair', 'ورشة سيارات']], ['garage', 'repair']),
  more('post', 'بريد', 'أي فرع بريد', ['بريد', 'مكتب بريد', 'سبل'], [], [['amenity', 'post_office', 'بريد']], ['post', 'spl']),
  more('tailor', 'خياط', 'أي خياط', ['خياط', 'خياطين'], [], [['shop', 'tailor', 'خياط']], ['tailor', 'tailoring']),
  more('butcher', 'ملحمة', 'أي ملحمة', ['ملحمه', 'ملاحم', 'جزار', 'قصاب'], [], [['shop', 'butcher', 'ملحمة']], ['butcher', 'meat']),
  more('mall', 'مول', 'أي مول', ['مول', 'مولات', 'مجمع تجاري'], [], [['shop', 'mall', 'مول']], ['mall']),
  more('gym', 'نادي رياضي', 'أي نادي رياضي', ['نادي رياضي', 'جيم', 'صاله رياضيه'], [], [['leisure', 'fitness_centre', 'نادي رياضي']], ['gym', 'fitness']),
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
  [['حليب', 'خبز', 'عيش', 'صامولي', 'ماء', 'مويه', 'موي', 'بيض', 'جبن', 'جبنه', 'لبن', 'روب', 'عصير', 'رز', 'سكر', 'شاهي', 'شاي', 'قهوه', 'خضار', 'خضره', 'فواكه', 'فاكهه', 'طماط', 'طماطم', 'بصل', 'زيت', 'دجاج', 'لحم', 'تمر', 'بطاطس', 'بسكوت', 'شوكولاته', 'ثلج', 'مقاضي', 'اغراض', 'زبادي', 'لبنه', 'قشطه', 'تونه', 'مكرونه', 'معكرونه', 'كاتشب', 'مايونيز', 'نودلز', 'حلاوه'], ['grocery']],
  [['كتاب', 'كتب', 'دفتر', 'دفاتر', 'قلم', 'اقلام', 'قرطاسيه', 'ورق', 'حبر', 'الوان', 'مسطره', 'ممحاه', 'طباعه', 'تصوير'], ['bookstore']],
  [['بنزين', 'وقود', 'ديزل', 'تفويل', 'عبي', 'اعبي', 'فول'], ['fuel']],
  [['ثوب', 'ثياب', 'ثيابي', 'ملابس', 'شماغ', 'غتره', 'بدله', 'بشت', 'كوي', 'غسيل'], ['laundry']],
  // الفئات الإضافية
  [['شريط', 'اشرطه', 'فيفا', 'بلايستيشن', 'بلاستيشن', 'سوني', 'اكسبوكس', 'نينتندو', 'لعبه', 'العاب', 'دميه', 'باربي', 'ليغو'], ['toys']],
  [['جوال', 'ايفون', 'شاحن', 'شريحه', 'سماعه', 'سماعات'], ['mobile', 'electronics']],
  [['تلفزيون', 'شاشه', 'لابتوب', 'كمبيوتر', 'راوتر', 'ماوس', 'كيبورد'], ['electronics']],
  [['عبايه', 'عبايات', 'فستان', 'بنطلون', 'قميص', 'تيشيرت', 'بيجامه', 'جاكيت'], ['clothes']],
  [['جزمه', 'حذاء', 'احذيه', 'نعال', 'شبشب', 'كوتش'], ['shoes']],
  [['عطر', 'عطور', 'عود', 'مسك', 'بخور'], ['perfume']],
  [['خاتم', 'دبله', 'سلسال', 'اسواره', 'ذهب'], ['jewelry']],
  [['ورد', 'ورود', 'بوكيه', 'زهور'], ['florist']],
  [['هديه', 'هدايا'], ['gifts']],
  [['صحون', 'كاسات', 'ملاعق', 'قدور', 'مقلاه', 'ترمس', 'دله', 'فناجين', 'اواني'], ['houseware']],
  [['كنب', 'كنبه', 'سرير', 'دولاب', 'طاوله', 'مرتبه'], ['furniture']],
  [['مفك', 'مسامير', 'دريل', 'عده'], ['hardware']],
  [['كوره', 'مضرب', 'دمبل'], ['sports']],
  [['قطط', 'علف'], ['pets']],
  [['كرواسون', 'معجنات', 'تميس'], ['bakery']],
  [['كيك', 'كيكه', 'حلا', 'كنافه', 'بقلاوه', 'دونات'], ['sweets']],
  [['لاتيه', 'كابتشينو', 'موكا', 'اسبريسو'], ['cafe']],
  [['غداء', 'عشاء', 'عشا', 'بيتزا', 'برجر', 'شاورما', 'مندي', 'كبسه'], ['restaurant']],
  [['فلوس', 'كاش', 'نقود'], ['atm', 'bank']],
  [['نظاره', 'نظارات', 'عدسات'], ['optician']],
  [['طرد', 'طرود'], ['post']],
];

// ——— كلمات التريغر ———

export const COMMANDS = ['ذكرني', 'ذكريني', 'ذكرنى', 'فكرني', 'نبهني', 'نبهيني', 'تذكير', 'ذكرنا', 'نبهنا'];
export const CONDITIONALS = ['اذا', 'لو', 'لا', 'لما', 'يوم', 'متى', 'حين', 'كلما', 'واذا', 'ولو', 'ولما', 'وان', 'ان', 'اول', 'عند', 'بس'];
export const PASS_VERBS = ['مريت', 'مرينا', 'امر', 'نمر', 'مررت', 'عديت', 'اعدي', 'عدينا', 'مرييت', 'قربت', 'اقرب', 'صرت قريب', 'شفت'];
export const ARRIVE_VERBS = ['وصلت', 'اوصل', 'وصلنا', 'نوصل', 'دخلت', 'ادخل', 'رحت', 'اروح', 'جيت', 'اجي', 'كنت', 'اكون', 'وصولي'];
export const PREPS = ['على', 'علي', 'ب', 'من', 'جنب', 'عند', 'قرب', 'حول', 'الى', 'الي', 'ل', 'في', 'لل', 'فيه'];
export const ROUTE_PHRASES = ['في طريقي', 'على طريقي', 'بطريقي', 'بطريقي', 'في الطريق', 'على الطريق', 'وانا ماشي', 'وانا راجع', 'وانا رايح'];
export const PLACE_MODIFIERS = ['اي', 'باي', 'لاي', 'اقرب', 'باقرب', 'لاقرب', 'فرع', 'محل', 'محلات', 'متجر', 'معرض', 'اول'];

/** أفعال تبدأ فيها المهمة، تنهي عبارة المكان */
export const TASK_VERBS = [
  'اشتري', 'اشتر', 'اخذ', 'اجيب', 'جيب', 'خذ', 'اسحب', 'اعبي', 'عبي', 'ادفع', 'اطبع', 'استلم', 'اسلم', 'ارجع', 'اسال',
  'اشحن', 'اغسل', 'اتصل', 'اصرف', 'احجز', 'ابدل', 'اشيك', 'اكلم', 'اخلص', 'اعطي', 'اكمل', 'اشوف', 'اطلب', 'انزل', 'اوقف',
  'اصور', 'اجدد', 'اشتريلي', 'نشتري', 'ناخذ', 'نجيب',
];
export const CONNECTORS = ['عشان', 'علشان', 'لاجل', 'و', 'ثم', 'بعدين', 'اني', 'ان', 'انه', 'لازم', 'ضروري', 'بـ', '-', ':', '—'];
