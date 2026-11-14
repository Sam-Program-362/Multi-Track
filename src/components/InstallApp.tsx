"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    queueMicrotask(() => {
      setInstalled(standalone);
      setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    });

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!prompt && !isIos)) return null;

  const install = async () => {
    if (!prompt) { setShowIosHelp(true); return; }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setPrompt(null);
  };

  return (
    <>
      <button onClick={install} className="install-button press" aria-label="Install Multi-Track app">
        <img src="/logo.svg" alt="" />
        <span><strong>Install app</strong><small>Use Multi-Track from your home screen</small></span>
        <b aria-hidden>↓</b>
      </button>
      {showIosHelp ? (
        <div className="install-overlay" role="dialog" aria-modal="true" aria-label="Install instructions" onClick={() => setShowIosHelp(false)}>
          <div className="install-help" onClick={(event) => event.stopPropagation()}>
            <img src="/logo.svg" alt="Multi-Track" />
            <h2>Install Multi-Track</h2>
            <p>In Safari, tap the <strong>Share</strong> button, then choose <strong>Add to Home Screen</strong>.</p>
            <button onClick={() => setShowIosHelp(false)}>Got it</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
