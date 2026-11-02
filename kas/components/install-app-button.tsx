"use client";

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState("");

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || ("standalone" in navigator && navigator.standalone === true);
    setIsInstalled(isStandalone);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIos && !isStandalone) setIsIosDevice(true);

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setShowIosHelp(false);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
        console.error("Kas Kelas: gagal mendaftarkan service worker.", error);
        setInstallError("Fitur instal belum tersedia. Muat ulang halaman atau coba lagi nanti.");
      });
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    setInstalling(true);
    setInstallError("");
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstallPrompt(null);
        setIsInstalled(true);
      }
    } catch (error) {
      console.error("Kas Kelas: proses instal gagal.", error);
      setInstallError("Instalasi gagal dimulai. Coba pasang lewat menu browser.");
    } finally {
      setInstalling(false);
    }
  }

  if (isInstalled) {
    return <span className="app-installed-badge"><span aria-hidden="true">✓</span> Aplikasi terpasang</span>;
  }

  if (installPrompt) {
    return (
      <>
        <button className="nav-cta install-app-button" type="button" disabled={installing} onClick={() => void installApp()}>
          <span aria-hidden="true">↓</span> {installing ? "Menyiapkan…" : "Pasang aplikasi"}
        </button>
        {installError && <span className="install-error" role="status">{installError}</span>}
      </>
    );
  }

  if (!isIosDevice) return null;

  return (
    <>
      <button className="nav-cta install-app-button" type="button" onClick={() => setShowIosHelp(true)}>
        <span aria-hidden="true">↓</span> Cara instal
      </button>
      {showIosHelp && (
        <div className="install-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowIosHelp(false);
        }}>
          <section className="install-dialog" role="dialog" aria-modal="true" aria-labelledby="install-dialog-title">
            <button className="install-dialog-close" type="button" aria-label="Tutup" onClick={() => setShowIosHelp(false)}>×</button>
            <span className="install-dialog-icon" aria-hidden="true">↥</span>
            <span className="eyebrow">AKSES LEBIH PRAKTIS</span>
            <h2 id="install-dialog-title">Pasang Kas Kelas</h2>
            <p className="muted">Tambahkan ke layar utama agar laporan kas bisa dibuka seperti aplikasi.</p>
            <ol className="install-steps">
              <li>Ketuk tombol <strong>Bagikan</strong> <span aria-label="ikon bagikan">□↑</span> di browser Safari.</li>
              <li>Gulir menu, lalu pilih <strong>Tambahkan ke Layar Utama</strong>.</li>
              <li>Ketuk <strong>Tambah</strong>. Ikon Kas Kelas akan muncul di layar utama.</li>
            </ol>
            {installError && <p className="install-error" role="status">{installError}</p>}
            <button className="button button-primary button-wide" type="button" onClick={() => setShowIosHelp(false)}>Mengerti</button>
          </section>
        </div>
      )}
    </>
  );
}
