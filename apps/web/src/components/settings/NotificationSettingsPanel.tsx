import { useState } from "react";
import {
  Bell,
  BellOff,
  CheckCircle2,
  AlertTriangle,
  Monitor,
  Layout,
  Volume2,
  Sparkles,
} from "lucide-react";

import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { useNotificationSettings } from "~/lib/notifications/notificationSettings";
import { useSoundSettings } from "~/lib/sound/soundSettings";
import { playNotificationSound } from "~/lib/sound/soundManager";
import { toastManager } from "../ui/toast";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

export function NotificationSettingsPanel() {
  const [notificationSettings, updateNotificationSettings] = useNotificationSettings();
  const [soundSettings, updateSoundSettings] = useSoundSettings();

  const scopedSettings = useScopedSettings((s) => ({
    notificationMode: s.notificationMode,
    inAppNotificationsEnabled: s.inAppNotificationsEnabled,
  }));
  const updateScopedSettings = useUpdateScopedSettings();

  const [requesting, setRequesting] = useState(false);
  const [permissionState, setPermissionState] = useState<NotificationPermission>(() => {
    if (typeof Notification !== "undefined") {
      return Notification.permission;
    }
    return "default";
  });

  const requestDesktopPermission = async () => {
    if (typeof Notification === "undefined") return;
    setRequesting(true);
    try {
      const result = await Notification.requestPermission();
      setPermissionState(result);
      if (result === "granted") {
        updateNotificationSettings({ desktopEnabled: true });
        updateScopedSettings({ notificationMode: "notifications-and-sound" });
      }
    } catch {
      // Ignored
    } finally {
      setRequesting(false);
    }
  };

  const handleSendTestNotification = () => {
    // 1. Play sound if enabled
    if (notificationSettings.soundEnabled && soundSettings.notificationSound) {
      playNotificationSound(true);
    }

    // 2. In-app toast
    toastManager.add({
      type: "info",
      title: "Test Notification",
      description: "AutoCode notification test successful! Alerts are configured properly.",
    });

    // 3. Desktop system notification if granted
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      notificationSettings.desktopEnabled
    ) {
      try {
        new Notification("AutoCode - Task Completed", {
          body: "This is a test notification. Your background notifications are working!",
          icon: "/favicon.ico",
        });
      } catch {
        // Ignored
      }
    }
  };

  return (
    <SettingsPageContainer>
      {/* Master Notifications */}
      <SettingsSection id="notification-master" title="Master Notification Controls">
        <SettingsRow
          id="notification-master-toggle"
          title="Enable Notifications"
          description="Global toggle for all system alerts, background notifications, and in-app toasts."
          control={
            <div className="flex items-center gap-3">
              {notificationSettings.masterEnabled ? (
                <Bell className="size-4 text-emerald-400" />
              ) : (
                <BellOff className="size-4 text-muted-foreground" />
              )}
              <Switch
                checked={notificationSettings.masterEnabled}
                onCheckedChange={(checked) => {
                  updateNotificationSettings({ masterEnabled: checked });
                  if (!checked) {
                    updateScopedSettings({
                      notificationMode: "off",
                      inAppNotificationsEnabled: false,
                    });
                  } else {
                    updateScopedSettings({
                      notificationMode: notificationSettings.desktopEnabled
                        ? "notifications-and-sound"
                        : "sound",
                      inAppNotificationsEnabled: notificationSettings.inAppEnabled,
                    });
                  }
                }}
                aria-label="Master notification switch"
              />
            </div>
          }
        />

        <SettingsRow
          id="notification-test-action"
          title="Send Test Alert"
          description="Trigger an instant sample notification to test your current toast and sound configuration."
          control={
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!notificationSettings.masterEnabled}
              onClick={handleSendTestNotification}
              className="gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300"
            >
              <Sparkles className="size-3.5" />
              Send Test Notification
            </Button>
          }
        />
      </SettingsSection>

      {/* Delivery Channels */}
      <SettingsSection id="notification-channels" title="Delivery Surfaces">
        <SettingsRow
          id="notification-desktop-channel"
          title="Desktop / Background System Alerts"
          description="Send native OS notifications when this browser tab or app is minimized or running in the background."
          control={
            <div className="flex items-center gap-3">
              {permissionState === "granted" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="size-3" /> Granted
                </span>
              ) : (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={requesting || !notificationSettings.masterEnabled}
                  onClick={requestDesktopPermission}
                  className="text-xs"
                >
                  Grant OS Permission
                </Button>
              )}
              <Switch
                checked={notificationSettings.desktopEnabled && permissionState === "granted"}
                disabled={!notificationSettings.masterEnabled || permissionState !== "granted"}
                onCheckedChange={(checked) => {
                  updateNotificationSettings({ desktopEnabled: checked });
                  updateScopedSettings({
                    notificationMode: checked ? "notifications-and-sound" : "sound",
                  });
                }}
                aria-label="Desktop system alerts"
              />
            </div>
          }
        />

        <SettingsRow
          id="notification-in-app-channel"
          title="In-App Banner & Toast Notifications"
          description="Display animated toast banners inside the workspace when threads finish or need attention while focused."
          control={
            <Switch
              checked={notificationSettings.inAppEnabled}
              disabled={!notificationSettings.masterEnabled}
              onCheckedChange={(checked) => {
                updateNotificationSettings({ inAppEnabled: checked });
                updateScopedSettings({ inAppNotificationsEnabled: checked });
              }}
              aria-label="In-app toast notifications"
            />
          }
        />

        <SettingsRow
          id="notification-sound-toggle"
          title="Play Sound with Notifications"
          description="Play a chime whenever a notification is delivered."
          control={
            <div className="flex items-center gap-2">
              <Volume2 className="size-3.5 text-amber-400" />
              <Switch
                checked={notificationSettings.soundEnabled && soundSettings.notificationSound}
                disabled={!notificationSettings.masterEnabled}
                onCheckedChange={(checked) => {
                  updateNotificationSettings({ soundEnabled: checked });
                  updateSoundSettings({ notificationSound: checked });
                }}
                aria-label="Notification sound toggle"
              />
            </div>
          }
        />
      </SettingsSection>

      {/* Triggers / Events */}
      <SettingsSection id="notification-triggers" title="Notification Triggers">
        <SettingsRow
          id="notification-on-completion"
          title="Task & Thread Completed"
          description="Trigger an alert when an AI turn, agent run, or task finishes running."
          control={
            <Switch
              checked={notificationSettings.onCompletion}
              disabled={!notificationSettings.masterEnabled}
              onCheckedChange={(checked) => updateNotificationSettings({ onCompletion: checked })}
              aria-label="Notify on completion"
            />
          }
        />

        <SettingsRow
          id="notification-on-error"
          title="Task Failed / Error Encountered"
          description="Trigger an alert if a coding task fails, hits an error, or stops unexpectedly."
          control={
            <Switch
              checked={notificationSettings.onError}
              disabled={!notificationSettings.masterEnabled}
              onCheckedChange={(checked) => updateNotificationSettings({ onError: checked })}
              aria-label="Notify on error"
            />
          }
        />

        <SettingsRow
          id="notification-on-input"
          title="Input or Approval Needed"
          description="Trigger an alert when the agent pauses waiting for your input, confirmation, or permission."
          control={
            <Switch
              checked={notificationSettings.onInputNeeded}
              disabled={!notificationSettings.masterEnabled}
              onCheckedChange={(checked) => updateNotificationSettings({ onInputNeeded: checked })}
              aria-label="Notify on input needed"
            />
          }
        />

        <SettingsRow
          id="notification-presentation-style"
          title="Notification Layout Style"
          description="Choose between a subtle compact toast or a full notification card with details."
          control={
            <Select
              value={notificationSettings.presentationStyle}
              onValueChange={(val: "toast" | "card") =>
                updateNotificationSettings({ presentationStyle: val })
              }
              disabled={!notificationSettings.masterEnabled}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-48"
                aria-label="Notification layout style"
              >
                <SelectValue>
                  {notificationSettings.presentationStyle === "card"
                    ? "Full Card"
                    : "Compact Toast"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="toast">
                  Compact Toast
                </SelectItem>
                <SelectItem hideIndicator value="card">
                  Full Detailed Card
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
