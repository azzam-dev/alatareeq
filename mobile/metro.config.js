// المنطق المشترك في ../src/core (خارج مجلد التطبيق)، فنخلي Metro يراقبه ويحزمه.
// ملفات core صافية بدون أي حزم، فما نحتاج نغيّر مسارات node_modules.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../src/core')];

module.exports = config;
