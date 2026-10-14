import { useState, useEffect } from "react";

const STORAGE_KEY = "t3code:show-log-floating-button:v1";

export function loadShowLogFloatingButton(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true; // default is enabled
    return raw === "true";
  } catch {
    return true;
  }
}

export function saveShowLogFloatingButton(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
    window.dispatchEvent(
      new CustomEvent("t3-show-log-floating-button-changed", { detail: enabled }),
    );
  } catch (err) {
    console.warn("Failed to save show log floating button setting:", err);
  }
}

export function subscribeShowLogFloatingButton(callback: (enabled: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const custom = e as CustomEvent<boolean>;
    if (typeof custom.detail === "boolean") {
      callback(custom.detail);
    } else {
      callback(loadShowLogFloatingButton());
    }
  };
  window.addEventListener("t3-show-log-floating-button-changed", handler);
  return () => {
    window.removeEventListener("t3-show-log-floating-button-changed", handler);
  };
}

export function useShowLogFloatingButton(): [boolean, (enabled: boolean) => void] {
  const [show, setShow] = useState<boolean>(loadShowLogFloatingButton);

  useEffect(() => {
    setShow(loadShowLogFloatingButton());
    return subscribeShowLogFloatingButton(setShow);
  }, []);

  return [show, saveShowLogFloatingButton];
}
