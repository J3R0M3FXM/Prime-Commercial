import type { ReactNode } from "react";
import LiveHeaderClock from "./live-header-clock";

export default function PrimeIdentityHeader({
  children,
}: {
  children?: ReactNode;
}) {
  return (
    <div className="prime-identity-header">
      <img className="prime-identity-header__logo" src="/primefinal.png" alt="PRIME" />
      <div className="prime-identity-header__right">
        <LiveHeaderClock />
        {children}
      </div>
    </div>
  );
}
