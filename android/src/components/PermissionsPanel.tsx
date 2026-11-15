"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getReminderPermissions,
  isNative,
  openExactAlarmSettings,
  pendingReminderCount,
  requestNotificationPermission,
  type ReminderPermission,
} from "@/lib/native";
import { Panel, SectionTitle, Touchable } from "./ui";

/**
 * Plain-language explanation of the two Android permissions the reminder
 * system needs, with buttons that actually open the right system screen.
 * Denials are not fatal: the app keeps working, only the alarms are missing.
 */
export default function PermissionsPanel({
  scheduledCount,
  onReschedule,
  remindersEnabled,
}: {
  scheduledCount: number;
  onReschedule: () => Promise<void>;
  remindersEnabled: boolean;
}) {
  const [permissions, setPermissions] = useState<ReminderPermission | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setPermissions(await getReminderPermissions());
  }, []);

  useEffect(() => {
    // Deferred by a tick so the permission lookup happens outside the render pass.
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, scheduledCount]);

  const askNotifications = async () => {
    setBusy(true);
    await requestNotificationPermission();
    await onReschedule();
    await refresh();
    setBusy(false);
  };

  const askExactAlarms = async () => {
    setBusy(true);
    await openExactAlarmSettings();
    await onReschedule();
    await refresh();
    setBusy(false);
  };

  const granted = permissions?.notifications && permissions.exactAlarms;

  return (
    <Panel className="p-4 sm:p-5" delay={400}>
      <SectionTitle
        icon="🔔"
        title="Prayer reminders on this phone"
        subtitle={
          remindersEnabled
            ? `${scheduledCount} reminder${scheduledCount === 1 ? "" : "s"} armed for the next 7 days`
            : "Reminders are switched off in settings"
        }
      />

      {!isNative() ? (
        <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          You are using the browser version, so reminders only work while this tab is open.
          Install the Android app to get real notifications at prayer time, even when the
          phone is locked.
        </p>
      ) : (
        <div className="mt-3 grid gap-2">
          <PermissionRow
            ok={Boolean(permissions?.notifications)}
            title="1. Allow notifications"
            body="Android asks for this on Android 13 and newer. Without it Android silently drops every prayer alert."
            action={permissions?.notifications ? undefined : "Allow notifications"}
            onAction={askNotifications}
            busy={busy}
          />
          <PermissionRow
            ok={Boolean(permissions?.exactAlarms)}
            title="2. Allow exact alarms"
            body='Needed so a reminder arrives at the exact minute. Find "Alarms & reminders" and turn it on for Multi-Track.'
            action={permissions?.exactAlarms ? undefined : "Open alarm settings"}
            onAction={askExactAlarms}
            busy={busy}
          />
          <div
            className="rounded-2xl border px-3 py-2 text-[11px] leading-relaxed"
            style={{
              borderColor: "var(--panel-border)",
              background: "rgba(255,255,255,0.05)",
              color: "var(--muted)",
            }}
          >
            {granted
              ? "Everything is set. Reminders are re-armed automatically each time you open the app and whenever you change the location, calculation method or prayer times."
              : "Reminders still work as in-app alarms while Multi-Track is open. Finish the two steps above to get them while the phone is locked."}
          </div>
        </div>
      )}
    </Panel>
  );
}

function PermissionRow({
  ok,
  title,
  body,
  action,
  onAction,
  busy,
}: {
  ok: boolean;
  title: string;
  body: string;
  action?: string;
  onAction: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-3 py-2.5"
      style={{
        borderColor: "var(--panel-border)",
        background: ok ? "rgba(141,232,255,0.08)" : "rgba(255,255,255,0.05)",
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold">
          {ok ? "✅ " : "⬜ "}
          {title}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
          {body}
        </p>
      </div>
      {action ? (
        <Touchable
          onClick={onAction}
          disabled={busy}
          className="shrink-0 rounded-xl border px-3 py-1.5 text-[11px] font-semibold"
          style={{
            borderColor: "var(--panel-border)",
            background: "var(--accent)",
            color: "#08102b",
          }}
        >
          {action}
        </Touchable>
      ) : null}
    </div>
  );
}