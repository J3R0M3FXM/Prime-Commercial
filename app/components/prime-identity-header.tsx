import type { ReactNode } from "react";
import LiveHeaderClock from "./live-header-clock";

export default function PrimeIdentityHeader({
  children,
}: {
  children?: ReactNode;
  caption?: string;
  accessLabel?: string;
}) {
  return (
    <div className="prime-identity-header">
      <img className="prime-identity-header__logo" src="/prime-global-brand.png" alt="PRIME" />
      <div className="prime-identity-header__right">
        <LiveHeaderClock />
        {children}
      </div>
    </div>
  );
}
