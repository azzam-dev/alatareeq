import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { MONTHLY_PLACES_BUDGET } from '../../../src/core/placeTiles';
import { fetchSpent, fetchTileRows, summarize, type TileRow } from '../services/tripDetails';
import { useTripLogs, useTripLogOn, type TripLog } from '../services/tripLog';
import { formatClock, formatWhen } from './format';
import { Chip, ScreenHeader } from './parts';
import { C, S } from './theme';
import { TripMap } from './TripMap';

/**
 * مؤقت للاختبار: «تفاصيل المشوار». المشوار الحالي (يتحدث وأنت تسوق) وآخر ١٠ مشاوير على خريطة، ومعها اللي يهم بس:
 * المدة والمسافة، التكلفة، المحلات، التنبيهات وردك، واللي ما نبهناك عليه وليش.
 */
export function TripDetailsScreen({ onBack }: { onBack: () => void }) {
  const on = useTripLogOn();
  const { current, history } = useTripLogs();
  const trips = useMemo(() => (current ? [current, ...history] : history), [current, history]);
  const [picked, setPicked] = useState<string | null>(null);
  const log = trips.find((t) => t.id === picked) ?? trips[0];
  const live = !!current && log?.id === current.id;

  const [rows, setRows] = useState<TileRow[]>([]);
  const [spent, setSpent] = useState<number | null>(null);
  // المربعات تزيد وأنت تسوق: نجيب أماكنها من جديد لما تتغير
  const keys = log ? Object.keys(log.tiles).sort().join(',') : '';
  useEffect(() => {
    if (!log) return;
    let alive = true;
    void fetchTileRows(keys ? keys.split(',') : []).then((r) => { if (alive) setRows(r); });
    void fetchSpent(log.startedAt).then((s) => { if (alive) setSpent(s); });
    return () => { alive = false; };
  }, [log?.id, keys]);

  const view = useMemo(() => (log ? summarize(log, rows, spent, live) : null), [log, rows, spent, live]);
  const [focus, setFocus] = useState<{ lat: number; lon: number; n: number } | null>(null);
  const goTo = (placeId: string) => {
    const p = view?.map.places.find((x) => x.id === placeId);
    if (p) setFocus({ lat: p.lat, lon: p.lon, n: Date.now() });
  };
  const { height } = useWindowDimensions();

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 8, gap: 8 }}>
        <ScreenHeader title="تفاصيل المشوار" onBack={onBack} />
        {trips.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: 'row-reverse' }}>
            {trips.map((t) => (
              <Chip key={t.id} label={tripLabel(t, t.id === current?.id)} on={t.id === log?.id} onPress={() => setPicked(t.id)} />
            ))}
          </ScrollView>
        )}
      </View>

      {!log || !view ? (
        <View style={{ padding: 16 }}>
          <Text style={S.sub}>
            {on ? 'ما فيه مشاوير للحين. سُق ويبدأ التسجيل لحاله.' : 'التسجيل مطفي. شغّل «سجّل مشاويري» من الإعدادات وسُق.'}
          </Text>
        </View>
      ) : (
        <>
          <View style={{ height: Math.round(height * 0.45), borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line }}>
            <TripMap data={view.map} fitKey={log.id} focus={focus} />
          </View>
          <ScrollView contentContainerStyle={S.scroll}>
            <View style={S.card}>
              <Text style={S.h2}>{live ? 'المشوار الحالي' : formatWhen(log.startedAt)}{log.source === 'test' ? ' · تجريبي' : ''}</Text>
              <Line label="المدة والمسافة" value={`${minutes(view.durationMs)} · ${km(view.distanceM)}`} />
              <Line
                label="التكلفة"
                value={`${view.tomtom} طلب TomTom${view.budgetLeft !== null ? ` · باقي ${view.budgetLeft} من ${MONTHLY_PLACES_BUDGET} هالشهر` : ''}`}
              />
              <Line label="المحلات" value={`${view.placesTotal} في المنطقة · ${view.placesNew} جديدة · ${view.placesMatched} تناسب تذاكيرك`} />
              {(view.gaps.length > 0 || view.cut) && (
                <Text style={[S.sub, { color: C.warn }]}>
                  {[
                    ...view.gaps.map((g) => `الموقع انقطع ${seconds(g.ms)} الساعة ${formatClock(g.t)}`),
                    ...(view.cut ? ['التطبيق انقفل قبل نهاية المشوار'] : []),
                  ].join('\n')}
                </Text>
              )}
            </View>

            <Text style={S.h2}>التنبيهات ({view.alerts.length})</Text>
            <View style={S.card}>
              {view.alerts.length === 0 ? <Text style={S.sub}>ما جاك تنبيه.</Text> : view.alerts.map((a) => (
                <Pressable key={a.t} accessibilityRole="button" onPress={() => goTo(a.placeId)} style={{ gap: 2 }}>
                  <Text style={S.text}><Text style={{ fontWeight: '700' }}>{formatClock(a.t)} {a.title}</Text> · {a.items}</Text>
                  <Text style={S.sub}>ردك: {a.answer}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={S.h2}>ما نبّهناك وليش</Text>
            <View style={S.card}>
              {view.skipped.length === 0 ? <Text style={S.sub}>ما فيه.</Text> : view.skipped.map((s) => (
                <Pressable key={s.placeId} accessibilityRole="button" onPress={() => goTo(s.placeId)} style={{ gap: 2 }}>
                  <Text style={[S.text, { fontWeight: '700' }]}>{s.name}</Text>
                  <Text style={S.sub}>{s.why}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </>
      )}
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <Text style={S.text}><Text style={{ color: C.sub }}>{label}: </Text>{value}</Text>;
}

function tripLabel(t: TripLog, isCurrent: boolean): string {
  if (isCurrent) return '● الحالي';
  return formatWhen(t.startedAt);
}

function minutes(ms: number): string {
  const m = Math.round(ms / 60_000);
  return m < 1 ? 'أقل من دقيقة' : `${m} د`;
}

function seconds(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} ث` : `${Math.round(s / 60)} د`;
}

function km(m: number): string {
  return m < 1000 ? `${Math.round(m)} م` : `${(m / 1000).toFixed(1)} كم`;
}
