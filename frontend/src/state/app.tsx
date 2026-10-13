import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  clearAcceptedNotice,
  getAcceptedNotice,
  getClientToken,
  onConsentRequired,
  setAcceptedNotice,
  type AppConfig,
} from "@/api/client";
import { loadModels, type LoadResult } from "@/ml/detection";

export interface ModelState {
  status: "idle" | "loading" | "ready" | "error";
  progress: number;
  result: LoadResult | null;
  error: string | null;
}

interface AppContextValue {
  config: AppConfig | undefined;
  configError: boolean;
  retryConfig: () => void;
  needsConsent: boolean;
  agree: () => Promise<void>;
  models: ModelState;
  loadMs: () => number | null;
  ensureModels: () => Promise<LoadResult>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // undefined = not yet read from storage (SSR / before hydration)
  const [accepted, setAccepted] = useState<string | null | undefined>(undefined);
  const configQ = useQuery({
    queryKey: ["config"],
    queryFn: () => api.getConfig(),
    staleTime: Infinity,
    retry: 1,
    enabled: accepted !== undefined,
  });

  useEffect(() => {
    getClientToken();
    setAccepted(getAcceptedNotice());
    return onConsentRequired(() => {
      clearAcceptedNotice();
      setAccepted(null);
    });
  }, []);

  const config = configQ.data;
  const needsConsent = accepted === undefined || !config || accepted !== config.notice_version;

  const agree = useCallback(async () => {
    if (!config) return;
    await api.postConsent(config.notice_version);
    setAcceptedNotice(config.notice_version);
    setAccepted(config.notice_version);
  }, [config]);

  const [models, setModels] = useState<ModelState>({
    status: "idle",
    progress: 0,
    result: null,
    error: null,
  });
  const loadRef = useRef<Promise<LoadResult> | null>(null);
  const loadMsRef = useRef<number | null>(null);

  const ensureModels = useCallback((): Promise<LoadResult> => {
    if (loadRef.current) return loadRef.current;
    setModels({ status: "loading", progress: 0, result: null, error: null });
    const t0 = performance.now();
    const p = loadModels((f) => setModels((s) => ({ ...s, progress: f })))
      .then((result) => {
        loadMsRef.current = performance.now() - t0;
        setModels({ status: "ready", progress: 1, result, error: null });
        return result;
      })
      .catch((e: unknown) => {
        loadRef.current = null;
        const ms = performance.now() - t0;
        setModels({
          status: "error",
          progress: 0,
          result: null,
          error: e instanceof Error ? e.message : "The models could not be loaded.",
        });
        api.postEvent({
          model_version: null,
          backend: null,
          outcome: "load_failure",
          load_ms: ms,
          inference_ms: null,
        });
        throw e;
      });
    loadRef.current = p;
    return p;
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      config,
      configError: configQ.isError,
      retryConfig: () => void configQ.refetch(),
      needsConsent,
      agree,
      models,
      loadMs: () => loadMsRef.current,
      ensureModels,
    }),
    [config, configQ, needsConsent, agree, models, ensureModels],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
