# عالطريق (alatareeq)

تذكير للسائق ينبّه عند المرور بمكان مناسب، وتميّزه إنه يقيس **تكلفة التحويلة بالوقت** لا المسافة،
ويستهدف **نوع مكان** (فئة/براند) لا مكانًا واحدًا. عربي، RTL.
فيه نسختان: **الويب** (MVP بـ Vite في الجذر، متجمّد تقريبًا) و**تطبيق الجوال** (`mobile/` بـ Expo، هو الاتجاه الحالي).
المنطق المشترك بينهما في `src/core`.

## الـ Stack

الويب: Vite 8 · React 19 · TypeScript 7 (strict) · Leaflet 1.9 · Vitest 5 · بدون باكند (تطبيق الجوال له سيرفر Supabase، تحت).
بيانات الأماكن من Overpass/OpenStreetMap، المسارات من OSRM التجريبي، البحث بالاسم من Nominatim.
التخزين كله `localStorage` على الجهاز.

## الأوامر

```bash
npm run dev      # خادم التطوير (--host عشان تفتحه من الجوال)
npm test         # vitest على src/core فقط
npm run build    # tsc -b ثم vite build ← dist/
npm run icons    # يولّد أيقونات PNG من نفس تصميم public/icons/icon.svg
npm run functions # ينسخ ملفات src/core اللي تحتاجها دوال Supabase لـ supabase/functions/_shared (قبل أي نشر)
```

المعاينة داخل Claude: `.claude/launch.json` يشغّل Vite على المنفذ 5178.

ما فيه ESLint. فحص النوع هو `tsc -b` (strict + noUnusedLocals)، وهو جزء من `build`.

## المجلدات

| المجلد | المسؤولية |
| --- | --- |
| `src/core/` | المنطق الصافي والمختبَر، مشترك بين الويب والتطبيق: تطبيع عربي، محلل الجملة، الوقت، الهندسة، تقدير التحويلة، بوابة قواعد التنبيه، آلة الحالات، نصوص التنبيه، تصنيف أماكن OSM (`placeKind.ts`)، والأغراض داخل التذكير (`items.ts` بقاموس `products.ts`، بدون ذكاء اصطناعي بقرار صاحب المشروع)، والبحث عن فئة (`categorySearch.ts`؛ الفئات بـ `more: true` تطلع بالبحث بس). وخاص بتطبيق الجوال: الجملة ← تذكير لكل غرض بمحل وآخر موعد (`reminderInput.ts`)، والأولوية (`priority.ts`)، وآخر الموعد وإشعاره و«ذكرني» (`deadline.ts`)، وتجميع «تمت» وفرزها (`doneGroups.ts`)، والتعرف على براند من اسم فيه خطأ على نتائج TomTom (`brandName.ts`)، ومربعات الأماكن وأرقام فئات TomTom (`placeTiles.ts`)، ويستخدمهم السيرفر. **بدون أي API متصفح أو React Native.** |
| `supabase/` | سيرفر تطبيق الجوال (مشروع Supabase `alatareeq`): جدول `brands` في `migrations/`، وجدولين `place_tiles` (أماكن كل مربع ونوع ٩٠ يوم) و`tomtom_budget` (رصيد TomTom بالشهر لكل نوع)، ودالة `functions/verify-brand` (تصحيح البراند) و`functions/nearby-places` (أماكن TomTom بمربعات)، و`functions/_shared/` منسوخة من `src/core` بـ `npm run functions` (لا تعدّلها يدويًا). |
| `src/services/` | الربط بالعالم: `osm.ts` (Overpass/OSRM/Nominatim)، `placeCache.ts`، `device.ts` (صوت/نطق/إشعارات/wake lock)، `simulator.ts`، و`engine.ts` اللي يوصّل كل شيء. |
| `src/state/` | مخزن واحد على `localStorage` + سجل القرارات. |
| `src/ui/` | الواجهات فقط: اليوم، المشوار (خريطة)، السجل، الإعدادات، الترحيب، لوحة التنبيه. |
| `scripts/`, `public/` | مولّد الأيقونات، وملفات PWA (manifest، sw.js، أيقونات). |

نقطة البداية لفهم المنتج: `src/services/engine.ts` → `checkPassBy()`.

## الـ Conventions المتبعة

- **منطق الأعمال في `src/core` كدوال صافية.** الخدمات تنسّق والواجهات تعرض؛ ما فيه قرار تنبيه يُحسب في UI.
- **ما فيه `export default`** في المشروع كله — تصدير بالاسم دائمًا، واستيراد نسبي، والأنواع بـ `import type`.
- **الأخطاء ما تُرمى للواجهة**: الخدمة تمسكها وتحوّلها لنص عربي في الحالة (`gpsError`, `placesError`, `cache.error`).
  ووصول التخزين وواجهات الجهاز دائمًا داخل `try/catch` مع تجاهل صامت، لأن المتصفح يرفضها أحيانًا.
- **الحالة**: `store` خارجي + `useStore(selector)` عبر `useSyncExternalStore`، والمحرك له لقطة خاصة `useEngine()`.
- **الاختبارات**: `src/core/*.test.ts` فقط، بـ Vitest في بيئة node، بأسماء عربية، وبوقت ثابت (`NOW`) بدل `Date.now()`.
  ما فيه mocks ولا شبكة في الاختبارات — لأن كل شيء قابل للاختبار صافي أصلًا.
- **النصوص العربية مكتوبة مباشرة في الكود** (ما فيه طبقة i18n)، والتواريخ دائمًا `ar-SA-u-nu-latn-ca-gregory`.
- CSS يدوي في `src/styles.css` بمتغيرات `:root` ووضع ليلي عبر `prefers-color-scheme`؛ ما فيه مكتبة تنسيق.

## لا تفعل

- **لا تستورد شيئًا من المتصفح أو React Native أو أي حزمة داخل `src/core`** (اختباراتها تعمل في node، وتطبيق `mobile/` يستوردها كما هي).
- **لا تنادِ Overpass/OSRM/Nominatim من خارج `services/osm.ts`** — فيه طابور `queued()` بفاصل ثانية،
  والخوادم المجتمعية تحظر عند تجاوز الحد.
- **لا ترجّع مصفوفة أو كائنًا جديدًا من selector في `useStore`** (`.filter` مثلًا) — يسبب حلقة إعادة رسم لا نهائية. اشتق بـ `useMemo`.
- **لا تشيل `isolation`/`z-index` من `.map-wrap`** — طبقات Leaflet تصل z-index 700 وتغطي لوحة التنبيه.
- **لا تكتب `≥` أو `≤` في نص عربي** — الرموز تنعكس في RTL وتقلب المعنى. اكتب «٥٠٪ أو أكثر».
- **لا تعدّل نطاق التشكيل في `normalize.ts`** بدون تحقق: توسيعه يبلع الأرقام العربية (U+0660) قبل تحويلها.
- **لا تغيّر `base: './'` في `vite.config.ts`** — النشر والـ PWA يعتمدان على المسارات النسبية.
- في وضع المحاكاة الزمن مأخوذ من `sample.t` لا من `Date.now()`؛ أي منطق يعتمد على الوقت داخل المحرك يستخدم `t`.

## تطبيق الجوال (`mobile/`)

Expo SDK 57 · React Native 0.86 · TypeScript (strict) · بدون خريطة. يُجرَّب على iPhone داخل Expo Go.
التذاكير والإعدادات و`pendingGo` في AsyncStorage (ما فيه سجل). الأماكن وأنت تسوق **من TomTom عن طريق السيرفر بمربعات**
(`tilePlaces` في `services/places.ts`، بنفس واجهة `PlacesSource` عشان تتبدّل لـ Google بعدين)، والمشوار التجريبي على أماكن العليا الثابتة
(`mobile/src/mock/olaya.ts`) عشان ما يصرف رصيد TomTom. التحويلة تقديرية (بدون OSRM).
المفاتيح في `mobile/.env.local` (مستثنى من git، ومتغيرات `EXPO_PUBLIC_*` تنقرأ وقت تشغيل الخادم فقط، فأعد تشغيله بعد أي تغيير):
`EXPO_PUBLIC_TOMTOM_KEY`، و`EXPO_PUBLIC_SUPABASE_URL` و`EXPO_PUBLIC_SUPABASE_ANON_KEY` (المفتاح العام). لا تطبع قيمة مفتاح في أي مخرجات.

**السيرفر (Supabase):** البراندات المشتركة في جدول `brands` (التطبيق يقرأ بس، والكتابة من الدالة)، ودالة `verify-brand` تصحح الاسم
بالجدول ثم TomTom، و`nearby-places` تجيب أماكن المربعات بسؤال واحد لكل مربع وحصة لكل نوع من رصيد TomTom
(**٢٥٠٠ طلب بالشهر للبحث كله**، `MONTHLY_PLACES_BUDGET`). مفتاح TomTom على السيرفر في Supabase Secrets باسم `TOMTOM_KEY` (صاحب المشروع يضيفه من اللوحة، لا تمرّره بالمحادثة).
**قبل إنشاء أي شي جديد في Supabase (جدول، دالة، مشروع) اعرض على صاحب المشروع بالضبط وش بينشئ.** بعد أي تعديل على الجدول شغّل فحص الأمان.
رصيد TomTom المجاني **٢٥٠٠ طلب بحث بالشهر** للدالتين مع بعض، فأي تجربة بطلبات حقيقية تصرف منه.
**النشر:** عدّلت ملف في `src/core` تستخدمه دالة؟ شغّل `npm run functions` ثم انشر الدالة وملفاتها المشتركة بأسماء `../_shared/<الملف>.ts`
(ما فيه Supabase CLI على الجهاز؛ النشر من أداة Supabase). ملفات الترحيل في `supabase/migrations/` نسخة من اللي انطبق، مو تُطبّق لحالها.

**الموقع (Vercel):** نسخة الجوال نفسها تنبني كموقع من GitHub (كل push على `main`). الإعدادات في `mobile/vercel.json`، ومتغيرات
Supabase العامة في `mobile/.env.production` (داخل git عمدًا، **لا تحط فيه مفتاح سري**). مشروع Vercel لازم Root Directory = `mobile` مع
«Include files outside the root directory»، وإلا يبني الويب القديم أو يفشل على `../src/core`. تجربة البناء محليًا: `npx expo export -p web` داخل `mobile/`.

```bash
npm --prefix mobile start        # خادم Expo لجوال صاحب المشروع (Expo Go، نفس شبكة Wi-Fi)
npm --prefix mobile run web      # نفس التطبيق في المتصفح للتحقق من الواجهة والمحرك
```

فحص النوع: `npx tsc --noEmit` داخل `mobile/`. المعاينة داخل Claude في `.claude/launch.json`: `mobile` (خادم الجوال)
و`mobile-web` (المتصفح)، **الاثنين على المنفذ 8081**: أوقف واحد قبل تشغيل الثاني، ورجّع `mobile` بعد التحقق.
معاينة `mobile` نفسها تخدم نسخة المتصفح على `http://localhost:8081`، فغالبًا تتحقق فيها بدون تبديل. التحميل الجديد يفقد بيانات المتصفح
أحيانًا (يرجع الترحيب)، ومتغيرات `.env.local` الجديدة تحتاج إعادة تشغيل الخادم.

| الملف | المسؤولية |
| --- | --- |
| `App.tsx` | الشريط تحت: «مذكرة» · زر + بالنص · «تمت»، والإعدادات من ⚙ فوق بشاشة لها سهم رجوع. الترحيب، بطاقة التنبيه فوق، «رحت له؟»، رسالة «حصلت / باقي» أو «انضاف» تحت، المحرر ونافذة الإضافة، ربط الإشعارات، وتشغيل مراقبة الموقع تلقائيًا. |
| `src/ui/NotesScreen.tsx`, `DoneScreen.tsx`, `AddSheet.tsx` | «مذكرة» (اللي باقي، بالأولوية أو الموعد، و«انتهى» للي فات موعده)، «تمت» («جبتها» بفرز التاريخ/الفئة/المكان، و«انتهى موعدها»)، ونافذة + (تحفظ مباشرة لو فهمت الغرض ومحله، وإلا تفتح المحرر). |
| `src/ui/CategoryPicker.tsx`, `DeadlineField.tsx`, `BrandField.tsx` | في المحرر: اختيار الفئة من نافذة ببحث، و«آخر موعد» (اليوم، الوقت نص ساعة نص ساعة، «ذكرني»)، و«براند أو اسم» مع «تقصد: …؟». |
| `src/services/brands.ts` | ينادي دالة `verify-brand`: `suggestBrand` (اقتراح بدون كتابة) و`confirmBrand` (المستخدم اعتمده). |
| `src/services/engine.ts` | محرك الجوال (نسخة من محرك الويب بدون خريطة ولا OSRM)، تنبيه المرور بس (`pass`) و«تجاوزت المكان؟» (`passed`)، ومصدرين: `gps` (أماكن `tilePlaces`) و`test` (المشوار التجريبي بأماكن العليا). فيه كمان انتهاء التنبيهات (`sweepAlerts`) وجواب «خلصت؟» (`confirmGo`). |
| `src/services/device.ts` | إشعارات بأزرار (فئة لكل نوع تنبيه) بطابور مرتّب، نطق، اهتزاز، و«اذهب» / «افتح في خرائط Google». |
| `src/services/places.ts`, `src/mock/olaya.ts` | مصدرين: `tilePlaces` (مربعات TomTom من `nearby-places`، محفوظة في الجوال ٩٠ يوم) و`mockPlaces` (العليا للمشوار التجريبي)، و`branchOf`. |
| `src/services/routePlayer.ts` | المشوار التجريبي: يمشي على مسار ثابت بدون شبكة. |
| `src/ui/GoCheckCard.tsx` | «رحت له؟» بعلامة صح لكل غرض (من `src/core/items.ts`)، و`GoResultToast`. |
| `src/state/store.ts`, `src/ui/` | المخزن والواجهات، بنفس أنماط الويب. |

- **كل تذكير «عند المرور» وله محل** (فئة أو براند): ما فيه «عند الوصول» ولا تنبيه بوقت. الوقت في الجملة يصير **آخر موعد**
  (`src/core/reminderInput.ts` → `toReminderInputs`، وكل غرض تذكير مستقل)، والجملة اللي ما لها محل («أتصل على أبوي») ما تنحفظ. السجل انشال كامل.
- **الشرح اللي ما يحتاجه المستخدم كل مرة خلف «؟»** (`HelpTitle` / `HelpDot` في `parts.tsx`، و`hint` في `Stepper`/`ToggleRow` يطلع منه).
- **يستورد `src/core` بمسار نسبي** (`../../../src/core/...`)، و`metro.config.js` يضيفه لـ `watchFolders`. أي تبعية
  تنضاف لـ core تكسر التطبيق، فخله صافي.
- **RTL يدوي**: الصفوف `flexDirection: ROW` من `ui/theme.ts`، والنصوص `textAlign: 'right'` + `writingDirection: 'rtl'`.
  لا تستخدم `I18nManager.forceRTL` (يأثر على Expo Go نفسه ويحتاج إعادة تشغيل).
- **انتهاء التنبيه بوقت المشوار (`engineNow()`)، لا بـ `setTimeout` بالساعة**: المؤقت ما يشتغل والجوال مقفل، والمشوار التجريبي أسرع من الساعة.
- **تنبيهات الطريق خانة إشعار وحدة (`DRIVE_NOTIFICATION`)**: امسح إشعار التنبيه نفسه بـ `dismissNotification`، لا `dismissAll`،
  وخلّ الإرسال والمسح يمرّون بطابور `serial` في `device.ts`.
- **رسالة «حصلت / باقي» تحت الشاشة، لا في مكان التنبيه فوق**: تنبيه فرع ثاني يجي فورًا بعد «ما تم» ويغطيها.
- **النص من iPhone فيه أحيانًا حروف اتجاه مخفية** (U+200F قبل الكلمة): أي مقارنة كلمات تمر بـ `normalize` (يشيل `INVISIBLE`)،
  لا مقارنة النص الخام. اختبارات Node والمتصفح ما تبيّنها لأن الكتابة فيها ما تضيف الحرف.
- `Alert.alert` ما يشتغل في نسخة المتصفح: استخدم `confirmDelete` و`showNotice` من `services/device.ts` (نوافذ المتصفح على الويب). والكتابة بأداة الكتابة في المتصفح ما توصل
  لخانة React Native أحيانًا؛ عبّها بـ `form_input` أو بمحدد `value` + حدث `input`.
- **Expo Go يحتاج CLI مسجّل دخول بنفس حساب الجوال، والمشروع مربوط** (`extra.eas.projectId` و`owner` في `app.json`).
  لا تشيلهم، وإلا يرجع الجوال يرفض المشروع. تحقق: `npx expo whoami` داخل `mobile/`.
- **الجوال يوصل بعنوان الجهاز في الشبكة** (`exp://<IP>:8081`)، والـ CLI غير التفاعلي ما يطبع QR؛ ولّده من الرابط.
- **على PowerShell `npm` محجوب في جهاز صاحب المشروع**: أعطه أوامر بـ `mobile\node_modules\.bin\expo.cmd`.

## git

فرع وحيد `main` (الافتراضي على GitHub، ريبو خاص). commit وpush بطلب صاحب المشروع فقط.

اقرأ PROGRESS.md لآخر حالة عمل.
