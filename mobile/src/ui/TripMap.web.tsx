import { useEffect, useRef, useState } from 'react';
import type { TripMapProps } from './TripMap';
import { TRIP_MAP_HTML } from './tripMapHtml';

/** نسخة المتصفح: الخريطة في iframe (WebView ما يشتغل على الويب) */
export function TripMap({ data, fitKey, focus }: TripMapProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const fitted = useRef('');
  const send = (m: unknown) => ref.current?.contentWindow?.postMessage(m, '*');

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
    <iframe
      ref={ref} title="خريطة المشوار" srcDoc={TRIP_MAP_HTML} onLoad={() => setReady(true)}
      style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}
