import type { ReactNode } from "react";
import LiveHeaderClock from "./live-header-clock";

export default function PrimeIdentityHeader({
  children,
  caption,
  accessLabel,
}: {
  children?: ReactNode;
  caption?: string;
  accessLabel?: string;
}) {
  return (
    <div className="prime-identity-header">
      <img className="prime-identity-header__logo" src="/prime-brand-logo.png" alt="PRIME" />
      <div className="prime-identity-header__right">
        <LiveHeaderClock accessLabel={accessLabel || caption || "ENCRYPTED CUSTOMER ACCESS"} />
        {children}
      </div>
    </div>
  );
}
