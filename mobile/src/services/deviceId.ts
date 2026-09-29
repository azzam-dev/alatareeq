import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'alatareeq:device';
/** كان داخل سجل المشاوير، ونبقيه عشان الجوال ما يتغير رقمه */
const OLD_KEY = 'alatareeq:triplog:device';

let cached: Promise<string> | null = null;

/** رقم عشوائي ثابت للجوال (مو اسمه ولا حسابه): تبليغ واحد لكل جوال، ويميّز المشاوير */
export function deviceId(): Promise<string> {
  cached ??= (async () => {
    try {
      const have = (await AsyncStorage.getItem(KEY)) ?? (await AsyncStorage.getItem(OLD_KEY));
      const id = have ?? Math.random().toString(36).slice(2, 10);
      await AsyncStorage.setItem(KEY, id);
      return id;
    } catch {
      return 'unknown';
    }
  })();
  return cached;
}
