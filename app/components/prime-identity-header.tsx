import type { ReactNode } from "react";
import LiveHeaderClock from "./live-header-clock";

export default function PrimeIdentityHeader({
  caption = "SECURED CUSTOMER ACCESS",
  children,
}: {
  caption?: string;
  children?: ReactNode;
}) {
  return (
    <div className="prime-identity-header">
      <img className="prime-identity-header__logo" src="/primefinal.png" alt="PRIME" />
      <div className="prime-identity-header__right">
        <LiveHeaderClock caption={caption} />
        {children}
      </div>
    </div>
  );
}
