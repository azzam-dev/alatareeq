import { useEffect, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import type { MapData } from '../services/tripDetails';
import { TRIP_MAP_HTML } from './tripMapHtml';

export interface TripMapProps {
  data: MapData | null;
  /** يتغير لما يتغير المشوار المعروض، فتقرّب الخريطة عليه */
  fitKey: string;
  /** يروح للمحل ويفتح تفاصيله (`n` عشان نفس المحل مرتين يشتغل) */
  focus: { lat: number; lon: number; n: number } | null;
}

/** الجوال: الخريطة في WebView (نسخة المتصفح في `TripMap.web.tsx`) */
export function TripMap({ data, fitKey, focus }: TripMapProps) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const fitted = useRef('');
  const send = (m: unknown) => ref.current?.injectJavaScript(`window.handle(${JSON.stringify(JSON.stringify(m))});true;`);

  useEffect(() => {
    if (!ready || !data) return;
    const fit = fitted.current !== fitKey;
    fitted.current = fitKey;
    send({ type: 'render', data, fit });
  }, [ready, data, fitKey]);

  useEffect(() => {
    if (ready && focus) send({ type: 'focus', lat: focus.lat, lon: focus.lon });
  }, [ready, focus]);

  return (
    <WebView
      ref={ref}
      originWhitelist={['*']}
      // عنوان حقيقي عشان خوادم خرائط OpenStreetMap تقبل الطلب (ترفض بدون Referer)
      source={{ html: TRIP_MAP_HTML, baseUrl: 'https://alatareeq-948m.vercel.app/' }}
      onLoadEnd={() => setReady(true)}
      style={{ flex: 1 }}
    />
  );
}
