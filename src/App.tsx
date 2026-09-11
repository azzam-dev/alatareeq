import { useEffect, useState, type ReactElement } from 'react';
import { registerServiceWorker } from './services/device';
import { engine, useEngine } from './services/engine';
import { useStore } from './state/store';
import { AlertSign } from './ui/AlertSign';
import { DriveView } from './ui/DriveView';
import { Icon } from './ui/icons';
import { LogView } from './ui/LogView';
import { Onboarding } from './ui/Onboarding';
import { SettingsView } from './ui/SettingsView';
import { TodayView } from './ui/TodayView';

type Tab = 'today' | 'drive' | 'log' | 'settings';

const TABS: { id: Tab; label: string; icon: keyof typeof Icon }[] = [
  { id: 'today', label: 'اليوم', icon: 'today' },
  { id: 'drive', label: 'المشوار', icon: 'drive' },
  { id: 'log', label: 'السجل', icon: 'log' },
  { id: 'settings', label: 'الإعدادات', icon: 'settings' },
];

function initialTab(): Tab {
  const h = location.hash.slice(1) as Tab;
  return TABS.some((t) => t.id === h) ? h : 'today';
}

export function App() {
  const [tab, setTab] = useState<Tab>(initialTab);
  const onboarded = useStore((s) => s.onboarded);
  const status = useEngine();

  useEffect(() => {
    void registerServiceWorker((id, action) => engine.respond(id, action));
  }, []);

  useEffect(() => {
    history.replaceState(null, '', `#${tab}`);
    window.scrollTo(0, 0);
  }, [tab]);

  const alert = status.alerts[0];

  return (
    <div className="app">
      {tab === 'today' && <TodayView goDrive={() => setTab('drive')} />}
      {tab === 'drive' && <DriveView />}
      {tab === 'log' && <LogView />}
      {tab === 'settings' && <SettingsView />}

      {alert && (
        <div className="alert-layer">
          <AlertSign key={alert.id} alert={alert} queued={status.alerts.length - 1} />
        </div>
      )}

      <nav className="tabbar" aria-label="التنقل">
        <div className="tabbar-inner">
          {TABS.map((t) => {
            const I = Icon[t.icon] as (p: { size?: number }) => ReactElement;
            return (
              <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                <I size={22} />
                {t.label}
                {t.id === 'drive' && status.source !== 'none' && tab !== 'drive' && <span className="badge" aria-label="المشوار شغال" />}
              </button>
            );
          })}
        </div>
      </nav>

      {!onboarded && <Onboarding onDone={(goDrive) => setTab(goDrive ? 'drive' : 'today')} />}
    </div>
  );
}
