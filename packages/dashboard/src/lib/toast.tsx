import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";

type Tone = "default" | "success";

interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback((message: string, tone: Tone = "default") => {
    const id = ++nextId.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-center gap-2.5 rounded-lg border border-strong bg-elev2 px-3.5 py-2.5 text-ink shadow-card"
            style={{ animation: "qg-toast-in 0.18s ease" }}
          >
            <div
              className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                toast.tone === "success" ? "bg-success" : "bg-accent"
              }`}
            />
            <div className="text-[13px]">{toast.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
