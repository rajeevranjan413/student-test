"use client";

import * as React from "react";
import { Card, Flex, Switch, Typography, App as AntApp } from "antd";
import { BellOutlined } from "@ant-design/icons";

const { Text } = Typography;

/**
 * Student opt-in for push notifications (F15). A bell toggle that subscribes this
 * device to Web Push and registers the subscription with the server. Browsers
 * require a user gesture to grant notification permission, so this is strictly
 * opt-in and reflects the live permission/subscription state.
 *
 * Renders nothing when push is unconfigured (no VAPID public key) or unsupported,
 * so the app degrades cleanly. See docs/DECISIONS.md D30.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Convert the base64url VAPID public key to the Uint8Array the Push API expects.
// Allocate over an explicit ArrayBuffer so the type is `Uint8Array<ArrayBuffer>`
// (a valid BufferSource for `applicationServerKey`).
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PushToggle() {
  const { message } = AntApp.useApp();
  const [ready, setReady] = React.useState(false);
  const [supported, setSupported] = React.useState(false);
  const [enabled, setEnabled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [iosNeedsInstall, setIosNeedsInstall] = React.useState(false);

  React.useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time read of browser APIs */
    const ok = pushSupported();
    setSupported(ok);
    setReady(true);
    // iOS supports web push only for an INSTALLED PWA (iOS 16.4+).
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIosNeedsInstall(isIOS && !isStandalone());
    if (ok) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setEnabled(Boolean(sub)))
        .catch(() => {});
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Nothing to show if push is unconfigured or the browser can't do it at all.
  if (!VAPID_PUBLIC_KEY) return null;
  if (ready && !supported) return null;

  const subscribe = async () => {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      message.info("Notifications are blocked. Enable them in your browser settings.");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) {
      await sub.unsubscribe().catch(() => {});
      throw new Error("Could not register the subscription.");
    }
    setEnabled(true);
    message.success("Notifications enabled — you'll hear about new work.");
  };

  const unsubscribe = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      }).catch(() => {});
    }
    setEnabled(false);
    message.success("Notifications turned off.");
  };

  const onToggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) await subscribe();
      else await unsubscribe();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ marginTop: 16 }} styles={{ body: { padding: 16 } }}>
      <Flex align="center" justify="space-between" gap={12}>
        <Flex align="center" gap={12}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#f59e0b1a",
              color: "#f59e0b",
              fontSize: 20,
            }}
          >
            <BellOutlined />
          </span>
          <Flex vertical>
            <Text strong>Notifications</Text>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {iosNeedsInstall
                ? "On iPhone/iPad, add this app to your Home Screen first, then enable."
                : "Get alerts for new homework, tests and study material."}
            </Text>
          </Flex>
        </Flex>
        <Switch
          checked={enabled}
          loading={busy}
          disabled={!ready || iosNeedsInstall}
          onChange={onToggle}
        />
      </Flex>
    </Card>
  );
}
