type MetricSample = {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  at: string;
};

type EventSample = {
  name: string;
  payload?: Record<string, any>;
  at: string;
};

function rateMetric(name: string, value: number): MetricSample['rating'] {
  if (name === 'LCP') {
    if (value <= 2500) return 'good';
    if (value <= 4000) return 'needs-improvement';
    return 'poor';
  }
  if (name === 'CLS') {
    if (value <= 0.1) return 'good';
    if (value <= 0.25) return 'needs-improvement';
    return 'poor';
  }
  if (name === 'FID') {
    if (value <= 100) return 'good';
    if (value <= 300) return 'needs-improvement';
    return 'poor';
  }
  if (value <= 2000) return 'good';
  if (value <= 4000) return 'needs-improvement';
  return 'poor';
}

function pushSample(sample: MetricSample) {
  const scope = window as any;
  const store = Array.isArray(scope.__kaisenMobileVitals) ? scope.__kaisenMobileVitals : [];
  store.push(sample);
  scope.__kaisenMobileVitals = store;
  if (import.meta.env.DEV) {
    console.info('[mobile-telemetry]', sample.name, sample.value, sample.rating);
  }
}

export function trackMobileEvent(name: string, payload?: Record<string, any>) {
  if (typeof window === 'undefined' || !name) return;
  const scope = window as any;
  const store = Array.isArray(scope.__kaisenMobileEvents) ? scope.__kaisenMobileEvents : [];
  const sample: EventSample = {
    name,
    payload,
    at: new Date().toISOString(),
  };
  store.push(sample);
  scope.__kaisenMobileEvents = store;
  if (import.meta.env.DEV) {
    console.info('[mobile-event]', sample.name, sample.payload || {});
  }
}

export function initMobileTelemetry() {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

  try {
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const last = entries[entries.length - 1] as any;
      if (!last) return;
      pushSample({
        name: 'LCP',
        value: Number(last.startTime || 0),
        rating: rateMetric('LCP', Number(last.startTime || 0)),
        at: new Date().toISOString(),
      });
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (_) {}

  try {
    let cls = 0;
    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries() as any[]) {
        if (entry.hadRecentInput) continue;
        cls += Number(entry.value || 0);
      }
      pushSample({
        name: 'CLS',
        value: Number(cls.toFixed(4)),
        rating: rateMetric('CLS', cls),
        at: new Date().toISOString(),
      });
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch (_) {}

  try {
    const fidObserver = new PerformanceObserver((entryList) => {
      const first = entryList.getEntries()[0] as any;
      if (!first) return;
      const fid = Number(first.processingStart || 0) - Number(first.startTime || 0);
      pushSample({
        name: 'FID',
        value: Number(fid.toFixed(2)),
        rating: rateMetric('FID', fid),
        at: new Date().toISOString(),
      });
    });
    fidObserver.observe({ type: 'first-input', buffered: true });
  } catch (_) {}
}
