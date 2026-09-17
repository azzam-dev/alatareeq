// ينسخ ملفات src/core اللي تحتاجها دوال Supabase لمجلد _shared (Deno يبي امتداد .ts في الاستيراد)
import fs from 'node:fs';

const files = ['normalize.ts', 'brandName.ts', 'placeTiles.ts', 'types.ts'];
fs.mkdirSync('supabase/functions/_shared', { recursive: true });
for (const f of files) {
  const src = fs.readFileSync(`src/core/${f}`, 'utf8').replace(/from '(\.\/[^']+)'/g, "from '$1.ts'");
  fs.writeFileSync(`supabase/functions/_shared/${f}`, `// منسوخ من src/core/${f} بـ npm run functions. لا تعدّله هنا\n${src}`);
}
console.log('copied', files.join(', '));
