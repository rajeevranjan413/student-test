"use client";

import * as React from "react";
import { Download, Check, Share } from "lucide-react";

/**
 * PWA install support. `PwaRegister` (mount once, app-wide) registers the
 * service worker and captures the browser's install prompt. `InstallAppButton`
 * renders the "Install Android app" control on the home page and drives the
 * native install flow. See docs/FEATURES.md → F11.
 */

// The browser fires `beforeinstallprompt` early (often before the button
// mounts), so we stash the deferred event on the window and re-broadcast it via
// a custom event that the button can also catch if it mounts later.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __nccDeferredPrompt?: BeforeInstallPromptEvent | null;
  }
}

const INSTALLABLE_EVENT = "ncc:installable";
const INSTALLED_EVENT = "ncc:installed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PwaRegister() {
  React.useEffect(() => {
    const hasSW = "serviceWorker" in navigator;
    let updateTimer: ReturnType<typeof setInterval> | undefined;
    let refreshing = false;

    // Silent auto-update: a newly deployed worker (see public/sw.js) skips waiting
    // and claims control, which fires `controllerchange` here — we reload once so
    // the page loads the new build's assets. We only arm this when a worker was
    // ALREADY controlling the page; otherwise the very first install would trigger
    // a pointless reload on a brand-new visitor.
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    const armedForUpdates = hasSW && !!navigator.serviceWorker.controller;
    if (armedForUpdates) {
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    }

    // Ask the browser to re-check for a new worker when the app regains focus, so
    // updates land promptly on the next launch instead of waiting for a reload.
    const onVisible = () => {
      if (hasSW && document.visibilityState === "visible") {
        navigator.serviceWorker
          .getRegistration()
          .then((reg) => reg?.update())
          .catch(() => {});
      }
    };

    if (hasSW) {
      // Stamp the current build id onto the SW url so every deploy is a distinct
      // worker the browser installs. Register after load so it never competes with
      // first paint.
      const swUrl = `/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`;
      const register = () =>
        navigator.serviceWorker
          .register(swUrl)
          .then((reg) => {
            // Long-lived tabs still get updates: re-check hourly.
            updateTimer = setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
          })
          .catch(() => {});
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
      document.addEventListener("visibilitychange", onVisible);
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      window.__nccDeferredPrompt = e as BeforeInstallPromptEvent;
      window.dispatchEvent(new Event(INSTALLABLE_EVENT));
    };
    const onInstalled = () => {
      window.__nccDeferredPrompt = null;
      window.dispatchEvent(new Event(INSTALLED_EVENT));
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (hasSW) document.removeEventListener("visibilitychange", onVisible);
      if (armedForUpdates)
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      if (updateTimer) clearInterval(updateTimer);
    };
  }, []);

  return null;
}

export function InstallAppButton() {
  const [canInstall, setCanInstall] = React.useState(false);
  const [installed, setInstalled] = React.useState(false);
  const [isIOS, setIsIOS] = React.useState(false);
  const [showHelp, setShowHelp] = React.useState(false);

  React.useEffect(() => {
    // One-time sync from browser-only APIs. Must happen after mount (not in a
    // lazy initializer) so SSR/first render stays the neutral default and there
    // is no hydration mismatch.
    /* eslint-disable react-hooks/set-state-in-effect -- intentional mount-time read of window/navigator */
    setInstalled(isStandalone());
    setIsIOS(
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
        !(window.navigator as unknown as { standalone?: boolean }).standalone
    );
    if (window.__nccDeferredPrompt) setCanInstall(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    const onInstallable = () => setCanInstall(true);
    const onInstalled = () => {
      setInstalled(true);
      setCanInstall(false);
    };
    window.addEventListener(INSTALLABLE_EVENT, onInstallable);
    window.addEventListener(INSTALLED_EVENT, onInstalled);
    return () => {
      window.removeEventListener(INSTALLABLE_EVENT, onInstallable);
      window.removeEventListener(INSTALLED_EVENT, onInstalled);
    };
  }, []);

  const handleClick = async () => {
    const deferred = window.__nccDeferredPrompt;
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      window.__nccDeferredPrompt = null;
      setCanInstall(false);
      if (choice.outcome === "accepted") setInstalled(true);
      return;
    }
    // No native prompt available (iOS, or already dismissed) — show steps.
    setShowHelp((v) => !v);
  };

  if (installed) {
    return (
      <p className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-500">
        <Check className="h-4 w-4" /> App installed — you&apos;re running it as an app
      </p>
    );
  }

  return (
    <div className="mt-8 flex flex-col items-center">
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
      >
        <Download className="h-4 w-4" />
        {canInstall ? "Install Android app" : "Get the Android app"}
      </button>

      {(showHelp || (!canInstall && isIOS)) && (
        <div className="mt-4 max-w-sm rounded-xl border border-gray-200 bg-background p-4 text-left text-sm text-gray-600 dark:border-gray-800 dark:text-gray-400">
          {isIOS ? (
            <p className="inline-flex items-start gap-2">
              <Share className="mt-0.5 h-4 w-4 shrink-0" />
              On iPhone/iPad: tap the <strong>Share</strong> button in Safari, then{" "}
              <strong>Add to Home Screen</strong>.
            </p>
          ) : (
            <>
              <p className="font-medium text-foreground">Install on Android</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>Open this page in <strong>Chrome</strong>.</li>
                <li>
                  Tap the <strong>⋮</strong> menu, then{" "}
                  <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
                </li>
                <li>Launch it from your home screen — it opens full-screen like a native app.</li>
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}
