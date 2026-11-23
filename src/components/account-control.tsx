"use client";

import { useEffect, useRef, useState } from "react";
import { RiArrowDownSLine, RiLogoutBoxRLine, RiUserLine } from "@remixicon/react";
import { Button } from "./ui/button";

export function AccountControl({ signedIn, label, onSignIn, onSignOut, onError }: {
  signedIn: boolean;
  label: string;
  onSignIn: () => void;
  onSignOut: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); };
  }, []);

  if (!signedIn) return <Button variant="outline" className="account-signin" onClick={onSignIn}><RiUserLine size={16} />Prijava</Button>;

  return <details className="account-menu" ref={menu}>
    <summary><RiUserLine size={16} /><span>Nalog</span><RiArrowDownSLine size={14} /></summary>
    <div className="account-dropdown">
      <strong>{label}</strong>
      <Button variant="ghost" disabled={busy} onClick={async () => {
        if (pending.current) return;
        pending.current = true; setBusy(true);
        try {
          await onSignOut();
          if (menu.current) menu.current.open = false;
        } catch (error) { onError((error as Error).message); }
        finally { pending.current = false; setBusy(false); }
      }}><RiLogoutBoxRLine size={16} />{busy ? "Odjavljivanje…" : "Odjavi se"}</Button>
    </div>
  </details>;
}
