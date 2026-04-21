import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ViewMode = 'simple' | 'advanced';

type ViewModeContextType = {
  viewMode: ViewMode;
  isSimpleView: boolean;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
};

const STORAGE_KEY = 'kaisen:view-mode';

const ViewModeContext = createContext<ViewModeContextType | null>(null);

function readInitialMode(): ViewMode {
  if (typeof window === 'undefined') return 'advanced';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'simple' ? 'simple' : 'advanced';
}

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => readInitialMode());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, viewMode);
    document.body.dataset.viewMode = viewMode;
  }, [viewMode]);

  const value = useMemo(
    () => ({
      viewMode,
      isSimpleView: viewMode === 'simple',
      setViewMode: (mode: ViewMode) => setViewModeState(mode),
      toggleViewMode: () =>
        setViewModeState((current) => (current === 'simple' ? 'advanced' : 'simple')),
    }),
    [viewMode],
  );

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (!context) {
    throw new Error('useViewMode debe usarse dentro de ViewModeProvider');
  }
  return context;
}
