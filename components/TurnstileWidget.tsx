"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

// Cloudflare's own script, loaded directly - no npm dependency required.
// This is the smallest reliable integration: Turnstile's browser API is a
// plain global (`window.turnstile`) once this script loads, with no build
// step or bundler-specific wrapper needed.
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

let scriptLoadingPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Turnstile script")));
      return;
    }
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

export type TurnstileWidgetHandle = {
  // Forces a fresh challenge/token - Turnstile tokens are single-use and
  // short-lived, so callers must invoke this after any failed submit that
  // already consumed the previous token (wrong password, duplicate email,
  // server/network error) rather than expecting the same token to work
  // twice.
  reset: () => void;
};

type TurnstileWidgetProps = {
  onTokenChange: (token: string | null) => void;
};

// Reusable across login/register (and any future authenticated-action
// captcha needs) rather than duplicating the script-loading/render/cleanup
// logic per page.
const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onTokenChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const reactId = useId();

    const siteKey = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY;

    useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          onTokenChange(null);
          if (window.turnstile && widgetIdRef.current) {
            try {
              window.turnstile.reset(widgetIdRef.current);
            } catch {
              // Widget may already be gone (unmounted/navigated) - a reset
              // call failing silently is safe; the token is already cleared
              // above regardless.
            }
          }
        },
      }),
      [onTokenChange]
    );

    useEffect(() => {
      if (!siteKey) {
        // No site key configured at all - nothing to render. The parent
        // form treats this the same as "captcha not required" client-side;
        // actual enforcement always happens server-side regardless.
        return;
      }

      let cancelled = false;
      setStatus("loading");

      loadTurnstileScript()
        .then(() => {
          if (cancelled || !containerRef.current || !window.turnstile) {
            if (!cancelled) setStatus("error");
            return;
          }

          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token) => {
              onTokenChange(token);
            },
            "expired-callback": () => {
              onTokenChange(null);
            },
            "error-callback": () => {
              onTokenChange(null);
              setStatus("error");
            },
          });
          setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });

      return () => {
        cancelled = true;
        if (window.turnstile && widgetIdRef.current) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // no-op - widget/script may already be torn down
          }
        }
        widgetIdRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteKey]);

    if (!siteKey) return null;

    const containerId = `turnstile-widget-${reactId}`;

    return (
      <div>
        <div ref={containerRef} id={containerId} data-testid="turnstile-widget" />
        {status === "loading" && (
          <p className="text-xs text-slate-500 mt-1" role="status">
            Loading verification…
          </p>
        )}
        {status === "error" && (
          <p className="text-xs text-red-600 mt-1" role="alert">
            Verification failed to load. Please refresh the page and try again.
          </p>
        )}
      </div>
    );
  }
);

export default TurnstileWidget;
