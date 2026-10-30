"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { 
  X, 
  ArrowRight, 
  MapPin, 
  Truck, 
  User, 
  Phone, 
  ShieldCheck, 
  CreditCard, 
  AlertCircle, 
  Loader2, 
  Search, 
  ChevronRight, 
  Building, 
  Receipt, 
  Banknote,
  Store,
  Sparkles,
  ShoppingBag,
  Copy,
  Download,
  QrCode,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Tag,
  Gift,
  Coins,
  Percent,
  Scan,
  Cpu,
  RefreshCw,
  FileCheck
} from "lucide-react";
import { formatPHP } from "@/lib/currency";
import { calculateChargesBreakdown, type ComputedCharge } from "@/lib/charges";
import { getClientFingerprint, getOrCreateSessionToken, getFreshClientLocation } from "./fingerprint-collector";
import { validateAddressLocally, type AddressValidationResult } from "@/lib/address-validation";
import { authenticatedFetch } from "./telegram-auth-client";
import TelegramMediaImage from "./telegram-media-image";
import {
  callServerless,
  clearPendingServerlessCheckoutKey,
  getOrCreateServerlessCheckoutKey,
  hasTelegramServerlessBridge,
  resolveTelegramMedia,
  uploadPaymentReceiptDataUrl,
} from "@/lib/telegram-serverless-client";

// Dynamic map import to ensure zero SSR conflicts
const AddressPickerMap = dynamic(() => import("./address-picker-map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-44 sm:h-48 md:h-52 rounded-none bg-gray-100 flex flex-col items-center justify-center text-gray-400 font-mono text-xs gap-2 border border-gray-200">
      <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
      <span>Loading Interactive Map...</span>
    </div>
  )
});

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: any[];
  onOrderSuccess: (orderData: any) => void;
}

// Auto-format phone to 0919 123 4567
export function formatPhoneNumber(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

function formatPaymentDeadline(value: string | number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(date);
  return `${day} ${time}`;
}

// Convert courier name to Title Case nicely (e.g. LALAMOVE -> Lalamove)
export function formatCourierName(name: string): string {
  if (!name) return "";
  return name.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function CourierTileLogo({ reference, name, selected }: { reference: string; name: string; selected: boolean }) {
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(!reference);

  useEffect(() => {
    let active = true;
    setSrc("");
    setFailed(!reference);
    if (!reference) return () => { active = false; };
    resolveTelegramMedia(reference)
      .then((url) => { if (active) setSrc(url); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [reference]);

  if (failed || !src) return <Truck className={`relative z-[2] h-8 w-8 ${selected ? "text-slate-500" : "text-slate-300"}`} aria-hidden="true" />;
  return <img src={src} alt={name} className="absolute inset-0 z-[2] h-full w-full object-contain" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

export default function CheckoutModal({
  isOpen,
  onClose,
  selectedItems = [],
  onOrderSuccess,
}: CheckoutModalProps) {
  // Step state: 1 = Contact & Receiver, 2 = Address & Map, 3 = Courier & Delivery Fee, 4 = Review & Place Order, 5 = Confirmation
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Payment States
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [isLoadingPaymentMethods, setIsLoadingPaymentMethods] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any>(null);
  const [uploadedProofImage, setUploadedProofImage] = useState<string>("");
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [proofSubmitSuccess, setProofSubmitSuccess] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [currentPaymentPage, setCurrentPaymentPage] = useState(0);
  const [isPaymentQrModalOpen, setIsPaymentQrModalOpen] = useState(false);
  const [zoomedPaymentMethod, setZoomedPaymentMethod] = useState<any>(null);
  const [isStartingMayaCheckout, setIsStartingMayaCheckout] = useState(false);
  const [mayaCheckoutError, setMayaCheckoutError] = useState("");
  const proofInputRef = useRef<HTMLInputElement>(null);
  const [isPreviewProofOpen, setIsPreviewProofOpen] = useState(false);

  // Receipt forensics state; no OCR or payment decision is performed here.
  const [isAnalyzingReceipt, setIsAnalyzingReceipt] = useState(false);
  const [ocrAnalysis, setOcrAnalysis] = useState<any>(null);
  const [ocrError, setOcrError] = useState<string>("");

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !overlayRef.current) return;
    const checkoutRoot = overlayRef.current;
    const pageHeader = document.querySelector("body > div header") || document.querySelector("header");
    const navigation = document.querySelector("nav.fixed");
    const visualViewport = window.visualViewport;

    const updateBounds = () => {
      const headerBottom = pageHeader?.getBoundingClientRect().bottom ?? 0;
      const navigationTop = navigation?.getBoundingClientRect().top;
      const baseBottom = typeof navigationTop === "number"
        ? Math.max(0, window.innerHeight - navigationTop + 8)
        : 108;
      const keyboardInset = visualViewport
        ? Math.max(0, window.innerHeight - (visualViewport.offsetTop + visualViewport.height))
        : 0;
      checkoutRoot.style.setProperty("--prime-checkout-top", `${Math.max(0, headerBottom)}px`);
      checkoutRoot.style.setProperty("--prime-checkout-bottom", `${Math.max(baseBottom, keyboardInset)}px`);
    };

    updateBounds();
    window.addEventListener("resize", updateBounds);
    visualViewport?.addEventListener("resize", updateBounds);
    visualViewport?.addEventListener("scroll", updateBounds);
    return () => {
      window.removeEventListener("resize", updateBounds);
      visualViewport?.removeEventListener("resize", updateBounds);
      visualViewport?.removeEventListener("scroll", updateBounds);
      checkoutRoot.style.removeProperty("--prime-checkout-top");
      checkoutRoot.style.removeProperty("--prime-checkout-bottom");
    };
  }, [isOpen]);

  // Scroll to top when step changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    if (overlayRef.current) {
      overlayRef.current.scrollTop = 0;
    }
  }, [currentStep]);

  // Telegram Identity State
  const [tgCustomer, setTgCustomer] = useState<{
    id: string;
    name: string;
    username: string;
    primeMemberId: string;
    contactNumber: string;
    tier?: string;
  }>({
    id: "",
    name: "",
    username: "",
    primeMemberId: "",
    contactNumber: "",
    tier: "",
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [isLoadingTier, setIsLoadingTier] = useState(false);

  // Step 1: Receiver Details
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverError, setReceiverError] = useState("");

  // Step 2: Address & Geolocation State
  const [addressSearch, setAddressSearch] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<string>("");
  const [unitDetails, setUnitDetails] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lon: number }>({
    lat: 14.5995,
    lon: 120.9842,
  });
  const [pinDropArmed, setPinDropArmed] = useState(false);
  const [hasSelectedAddress, setHasSelectedAddress] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [locationNotice, setLocationNotice] = useState("");
  const [addressValidation, setAddressValidation] = useState<AddressValidationResult | null>(null);
  const [isValidatingAddress, setIsValidatingAddress] = useState<boolean>(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Optional precise location. This is only captured when the customer explicitly
  // taps "Use My Location". No GPS permission is requested elsewhere.
  const [deviceGps, setDeviceGps] = useState<{
    lat: number;
    lon: number;
    accuracy?: number;
    source?: string;
    capturedAt?: string;
    reverseGeocodedAddress?: string;
  } | null>(null);
  const [deviceGpsAddress, setDeviceGpsAddress] = useState("");
  const [deviceGpsAddressLoading, setDeviceGpsAddressLoading] = useState(false);

  // Touch swipe states for payment methods carousel
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = (totalPages: number) => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50; // swipe threshold in pixels
    if (diff > threshold) {
      // Swiped left -> next page
      setCurrentPaymentPage((prev) => Math.min(prev + 1, totalPages - 1));
    } else if (diff < -threshold) {
      // Swiped right -> prev page
      setCurrentPaymentPage((prev) => Math.max(0, prev - 1));
    }
    // reset
    touchStartX.current = null;
    touchEndX.current = null;
  };

  // Step 3: Couriers & Delivery Pricing State
  const [availableCouriers, setAvailableCouriers] = useState<any[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState<string>("");
  const [calculatedDistance, setCalculatedDistance] = useState<number>(0);
  const [estimatedTravelMinutes, setEstimatedTravelMinutes] = useState<number | null>(null);
  const [trafficEstimateType, setTrafficEstimateType] = useState<string>("unavailable");
  const [isLoadingCouriers, setIsLoadingCouriers] = useState<boolean>(false);
  const [courierFetchError, setCourierFetchError] = useState<string>("");
  const [deliveryPaymentMethod, setDeliveryPaymentMethod] = useState<"upon_checkout" | "upon_delivery" | "">("");

  // Step 4: Admin Charges State
  const [activeCharges, setActiveCharges] = useState<any[]>([]);
  const [isLoadingCharges, setIsLoadingCharges] = useState<boolean>(false);
  const [chargesLoadError, setChargesLoadError] = useState("");
  const [customerNotes, setCustomerNotes] = useState<string>("");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>("");
  const [completedOrder, setCompletedOrder] = useState<any>(null);

  // Promo / Voucher State
  const [promoCodeInput, setPromoCodeInput] = useState<string>("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    title: string;
    promoId: string;
    voucherType?: string;
    discountAmount: number;
    discountType: "fixed" | "percentage" | "free_shipping" | "shipping_discount" | "coins_cashback" | string;
    discountValue?: number;
    maxDiscountAmount?: number | null;
    isFreeShipping: boolean;
    shippingSubsidy?: number;
    cashbackPoints?: number;
  } | null>(null);
  const [isCheckingPromo, setIsCheckingPromo] = useState<boolean>(false);
  const [promoError, setPromoError] = useState<string>("");

  // Store Credits State
  const [availableStoreCredits, setAvailableStoreCredits] = useState<number>(0);
  const [useStoreCredits, setUseStoreCredits] = useState<boolean>(false);

  // Referral Code State
  const [referralCodeInput, setReferralCodeInput] = useState<string>("");
  const [appliedReferral, setAppliedReferral] = useState<{
    code: string;
    referrerName: string;
    referrerMemberId: string;
  } | null>(null);
  const [existingReferrer, setExistingReferrer] = useState<{
    memberId: string;
    name?: string;
  } | null>(null);
  const [isCheckingReferral, setIsCheckingReferral] = useState<boolean>(false);
  const [referralError, setReferralError] = useState<string>("");
  const [referralSuccess, setReferralSuccess] = useState<string>("");

  // Hydrate Telegram info on open
  useEffect(() => {
    if (!isOpen) return;

    if (typeof window !== "undefined") {
      let tgUser: any = null;
      try {
        tgUser = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user;
      } catch (e) {
        // ignore
      }

      const storedId = sessionStorage.getItem("prime_customer_id") || localStorage.getItem("prime_customer_id") || "";
      const storedName = sessionStorage.getItem("prime_customer_name") || localStorage.getItem("prime_customer_name") || "";
      const storedUsername = sessionStorage.getItem("prime_customer_username") || localStorage.getItem("prime_customer_username") || "";
      const storedMemberId = sessionStorage.getItem("prime_member_id") || localStorage.getItem("prime_member_id") || "";
      const storedPhone = sessionStorage.getItem("prime_customer_phone") || localStorage.getItem("prime_customer_phone") || "";

      const resolvedId = tgUser?.id ? tgUser.id.toString() : storedId;
      const resolvedName = tgUser?.first_name 
        ? `${tgUser.first_name} ${tgUser.last_name || ""}`.trim() 
        : (storedName || "Customer");
      const resolvedUsername = tgUser?.username || storedUsername;
      const resolvedPhone = tgUser?.phone_number || storedPhone;

      setTgCustomer({
        id: resolvedId,
        name: resolvedName,
        username: resolvedUsername,
        primeMemberId: storedMemberId,
        contactNumber: resolvedPhone,
        tier: "",
      });

      // This read-only endpoint returns only the verified member's tier; account
      // summary endpoints also reconcile ledgers and are not used for this value.
      if (hasTelegramServerlessBridge()) {
        setIsLoadingTier(true);
        void callServerless<{ tier?: string }>("getMyTier", {}, 10_000)
          .then((result) => {
            const tier = String(result?.tier || "").trim();
            setTgCustomer((prev) => ({ ...prev, tier: tier.toUpperCase() }));
          })
          .catch(() => setTgCustomer((prev) => ({ ...prev, tier: "" })))
          .finally(() => setIsLoadingTier(false));
      }

      // Synchronize directly with Firestore customer record to guarantee primeMemberId hydration
      if (resolvedId) {
        setIsLoadingProfile(true);
        authenticatedFetch(`/api/account?customerId=${encodeURIComponent(resolvedId)}`, { credentials: 'include', cache: 'no-store' })
          .then(res => res.json())
          .then(data => {
            const customer = data?.customer;
            if (customer) {
              const realMemberId = customer.primeMemberId || "";
              const realName = customer.tgName || resolvedName;
              const realUsername = customer.tgUsername || resolvedUsername;

              if (realMemberId) {
                try {
                  sessionStorage.setItem("prime_member_id", realMemberId);
                  localStorage.setItem("prime_member_id", realMemberId);
                } catch (e) {}
              }
              if (realName) {
                try {
                  sessionStorage.setItem("prime_customer_name", realName);
                  localStorage.setItem("prime_customer_name", realName);
                } catch (e) {}
              }
              if (realUsername) {
                try {
                  sessionStorage.setItem("prime_customer_username", realUsername);
                  localStorage.setItem("prime_customer_username", realUsername);
                } catch (e) {}
              }

              setTgCustomer(prev => ({
                ...prev,
                name: realName,
                username: realUsername,
                primeMemberId: realMemberId || prev.primeMemberId,
              }));

              if (customer.storeCredits !== undefined) {
                setAvailableStoreCredits(Number(customer.storeCredits) || 0);
              }

              if (customer.referredByMemberId) {
                setExistingReferrer({
                  memberId: customer.referredByMemberId,
                  name: customer.referredByName || "Member"
                });
              }

            }
          })
          .catch(err => {
            console.warn("Could not sync customer record:", err);
          })
          .finally(() => {
            setIsLoadingProfile(false);
          });
      }

      // Referral Code is customer-entered only; never pre-fill it from URL or storage.
      setReferralCodeInput("");
    }
  }, [isOpen]);

  // Fetch the same active charge configuration used by the Serverless order writer.
  useEffect(() => {
    if (!isOpen || currentStep !== 4) return;
    const fetchCharges = async () => {
      try {
        setIsLoadingCharges(true);
        setChargesLoadError("");
        const data = hasTelegramServerlessBridge()
          ? await callServerless<any[]>("getPublicCharges", {})
          : await authenticatedFetch(`/api/charges?_t=${Date.now()}`, { cache: "no-store", headers: { "Pragma": "no-cache" } }).then(async (response) => {
              if (!response.ok) throw new Error("The current charge list was unavailable.");
              return response.json();
            });
        if (!Array.isArray(data)) throw new Error("The current charge list was unavailable.");
        setActiveCharges(data);
      } catch (e) {
        console.warn("Could not fetch active charges", e);
        setChargesLoadError("Could not load the current configured charges. Retry checkout before submitting to avoid an inaccurate total.");
      } finally {
        setIsLoadingCharges(false);
      }
    };
    fetchCharges();
  }, [isOpen, currentStep]);

  // Fetch active payment methods when step becomes 5 (order placed) or when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const fetchPaymentMethods = async () => {
      try {
        setIsLoadingPaymentMethods(true);
        const data = await callServerless<any[]>("getPublicPaymentMethods", {});
        const receiptTypes = new Set(["qr_code", "manual_transfer", "crypto", "secured_payment_link"]);
        setPaymentMethods((Array.isArray(data) ? data : []).filter((method) =>
          receiptTypes.has(String(method?.paymentType || method?.type || "").toLowerCase()) && method?.isActive !== false
        ));
      } catch (e) {
        console.warn("Could not fetch payment methods:", e);
        setPaymentMethods([]);
      } finally {
        setIsLoadingPaymentMethods(false);
      }
    };
    fetchPaymentMethods();
  }, [isOpen]);

  // Reset checkout session state when closed. This is important because the
  // modal stays mounted inside CartDrawer; leaving currentStep at 4 while clearing
  // deliveryPaymentMethod can reopen directly on Review with an invalid payload.
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(1);
      setPinDropArmed(false);
      setReceiverName("");
      setReceiverPhone("");
      setDeviceGps(null);
      setDeviceGpsAddress("");
      setDeviceGpsAddressLoading(false);
      setLocationNotice("");
      setSelectedPaymentMethod(null);
      setSelectedCourierId("");
      setDeliveryPaymentMethod("");
      setCourierFetchError("");
      setUploadedProofImage("");
      setProofSubmitSuccess(false);
      setIsSubmittingProof(false);
      setCurrentPaymentPage(0);
      setIsPaymentQrModalOpen(false);
      setZoomedPaymentMethod(null);
      setIsStartingMayaCheckout(false);
      setMayaCheckoutError("");
      setSubmitError("");
    }
  }, [isOpen]);

  // Precise GPS is parked. App startup, checkout open, and order submission
  // never request location. Only "Use My Location" below can do so.

  // Live sync for order updates & courier tracking button when on Step 5 (Targeted Single Order Query)
  useEffect(() => {
    if (currentStep !== 5 || !completedOrder) return;
    const orderId = completedOrder.id || completedOrder.orderNumber;
    if (!orderId) return;

    let pollCount = 0;
    const maxPolls = 8; // Max 8 polls (approx 8 minutes) to preserve Firestore quota

    const syncInterval = setInterval(async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      pollCount++;
      if (pollCount > maxPolls) {
        clearInterval(syncInterval);
        return;
      }

      try {
        const res = await authenticatedFetch(`/api/orders?orderId=${encodeURIComponent(orderId)}`);
        if (res.ok) {
          const orderData = await res.json();
          if (orderData && (orderData.id || orderData.orderNumber)) {
            setCompletedOrder((prev: any) => ({ ...prev, ...orderData }));
          }
        }
      } catch (err) {
        // silent background sync error
      }
    }, 60000);

      return () => clearInterval(syncInterval);
  }, [currentStep, completedOrder?.id, completedOrder?.orderNumber]);

  // Start a Maya-hosted checkout for the selected API payment method.
  // The server owns the Maya credential and order correlation; the browser
  // receives only Maya's hosted redirect URL.
  const handleStartMayaCheckout = async () => {
    if (!completedOrder || !selectedPaymentMethod) return;

    const paymentType = String(selectedPaymentMethod.paymentType || selectedPaymentMethod.type || "").toLowerCase();
    const isApi = paymentType === "api" || paymentType === "webhook";
    if (!isApi) return;

    const orderId = String(completedOrder.id || completedOrder.orderNumber || "").trim();
    if (!orderId) {
      setMayaCheckoutError("Order reference is missing. Please contact PRIME support.");
      return;
    }

    try {
      setIsStartingMayaCheckout(true);
      setMayaCheckoutError("");
      const res = await authenticatedFetch("/api/maya/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          paymentMethodId: selectedPaymentMethod.id,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.redirectUrl) {
        throw new Error(data.error || "Unable to start Maya Checkout. Check the active Maya environment and configured public API key.");
      }

      setCompletedOrder((prev: any) => ({
        ...prev,
        paymentMethodId: selectedPaymentMethod.id,
        paymentMethodName: selectedPaymentMethod.name,
        paymentStatus: "Awaiting Maya Payment",
        mayaPaymentId: data.checkoutId || prev?.mayaPaymentId,
        mayaRequestReferenceNumber: data.orderNumber || prev?.mayaRequestReferenceNumber,
      }));

      window.location.assign(data.redirectUrl);
    } catch (error: any) {
      console.error("Maya Checkout start failed:", error);
      setMayaCheckoutError(error?.message || "Unable to start Maya Checkout.");
    } finally {
      setIsStartingMayaCheckout(false);
    }
  };


  // Perform full address validation (local logic + online Geoapify verification)
  const performAddressValidation = async (targetAddr: string, unit: string, currentCoords: { lat: number; lon: number }) => {
    setIsValidatingAddress(true);
    const localResult = validateAddressLocally(targetAddr, unit, currentCoords);
    setAddressValidation(localResult);

    if (localResult.isValid && targetAddr && targetAddr.trim().length >= 5) {
      try {
        const apiData = await callServerless<any>("geoapifyAddress", {
          action: "validate",
          address: targetAddr,
          text: targetAddr,
          unitDetails: unit,
          lat: currentCoords.lat,
          lon: currentCoords.lon,
        }, 20_000);
        if (apiData) {
          setAddressValidation((prev) => ({
            ...prev,
            ...apiData,
            isValid: apiData.isValid ?? prev?.isValid ?? true,
            status: apiData.status || prev?.status || "verified",
            score: apiData.score || prev?.score || "high",
            message: apiData.message || prev?.message || "Address verified.",
            missingFields: apiData.missingFields || prev?.missingFields || [],
          }));
        }
      } catch (e) {
        // Retain local validation result on network issue
      }
    }
    setIsValidatingAddress(false);
  };

  // Real-time Address Validation Sync Effect (Triggered when on Step 2)
  useEffect(() => {
    if (currentStep !== 2) return;
    const targetAddr = selectedAddress || addressSearch;
    if (targetAddr || hasSelectedAddress) {
      const timer = setTimeout(() => {
        performAddressValidation(targetAddr, unitDetails, coords);
      }, 400);
      return () => clearTimeout(timer);
    } else {
      setAddressValidation(null);
    }
  }, [currentStep, selectedAddress, addressSearch, unitDetails, coords, hasSelectedAddress]);

  // Address Autocomplete Search
  const handleAddressSearch = (query: string) => {
    setAddressSearch(query);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (!query || query.trim().length < 3) {
      setAddressSuggestions([]);
      setIsSearchingAddress(false);
      return;
    }

    setIsSearchingAddress(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const data = await callServerless<{ results?: any[] }>("geoapifyAddress", {
          action: "autocomplete",
          text: query,
          lat: coords.lat,
          lon: coords.lon,
        }, 20_000);
        setAddressSuggestions(Array.isArray(data?.results) ? data.results : []);
      } catch (err) {
        console.error("Autocomplete fetch error:", err);
      } finally {
        setIsSearchingAddress(false);
      }
    }, 350);
  };

  // Select Address Suggestion
  const handleSelectSuggestion = (item: any) => {
    const formatted = item.formatted || `${item.name || ""}, ${item.city || item.county || ""}, ${item.country || "Philippines"}`.replace(/^, /, "");
    setSelectedAddress(formatted);
    setAddressSearch(formatted);
    setAddressSuggestions([]);
    setAddressError("");
    setLocationNotice("");
    
    if (item.lat && item.lon) {
      const newCoords = { lat: item.lat, lon: item.lon };
      setCoords(newCoords);
      setHasSelectedAddress(true);
      fetchCouriersForLocation(newCoords.lat, newCoords.lon);
    }
  };

  // Reverse Geocoding Helper
  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const data = await callServerless<{ results?: any[] }>("geoapifyAddress", {
        action: "reverse", lat, lon,
      }, 20_000);
      if (data) {
        if (data.results && data.results.length > 0) {
          const formatted = data.results[0].formatted || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
          setSelectedAddress(formatted);
          setAddressSearch(formatted);
          setHasSelectedAddress(true);
        }
      }
    } catch (e) {
      console.warn("Reverse geocode failed", e);
    }
  };

  // Handle Location update from Map Click or Marker Drag
  const handleLocationChange = (lat: number, lon: number) => {
    setCoords({ lat, lon });
    setHasSelectedAddress(true);
    setAddressError("");
    setLocationNotice("");
    reverseGeocode(lat, lon);
    fetchCouriersForLocation(lat, lon);
  };

  const reverseGeocodeDeviceGps = async (lat: number, lon: number) => {
    try {
      setDeviceGpsAddressLoading(true);
      const data = await callServerless<{ results?: any[] }>("geoapifyAddress", {
        action: "reverse", type: "building", lat, lon,
      }, 20_000);
      if (data) {
        const formatted = String(data?.results?.[0]?.formatted || "").trim();
        if (formatted) setDeviceGpsAddress(formatted);
      }
    } catch (e) {
      console.warn("Device GPS reverse geocode failed:", e);
    } finally {
      setDeviceGpsAddressLoading(false);
    }
  };

  // "Use My Location" is the only point where precise location is requested.
  // The exact coordinate is snapshotted here and attached to the order.
  const handleUseMyLocation = async () => {
    setIsLocating(true);
    setAddressError("");
    setLocationNotice("");
    setDeviceGps(null);

    try {
      const location = await getFreshClientLocation(12000, true);
      const lat = Number(location?.lat);
      const lon = Number(location?.lon);

      if (
        location?.source !== "Precise GPS" ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        (lat === 0 && lon === 0)
      ) {
        throw new Error("Phone location is unavailable. Search for your address or move the map pin; GPS is not required to continue.");
      }

      const reportedAccuracy = Number(location.accuracy);
      const hasOrderGradeAccuracy = Number.isFinite(reportedAccuracy) && reportedAccuracy > 0 && reportedAccuracy <= 20;

      const capturedAt = new Date().toISOString();
      let reverseGeocodedAddress = "";

      setDeviceGps(hasOrderGradeAccuracy ? {
        lat,
        lon,
        accuracy: reportedAccuracy,
        source: "Use My Location snapshot",
        capturedAt,
        reverseGeocodedAddress,
      } : null);
      setLocationNotice("Location updated. Confirm the pin and address.");
      setDeviceGpsAddress(reverseGeocodedAddress);
      setCoords({ lat, lon });
      setHasSelectedAddress(true);

      setDeviceGpsAddressLoading(true);
      void callServerless<{ results?: any[] }>("geoapifyAddress", {
        action: "reverse", type: "building", lat, lon,
      }, 12_000).then((data) => {
        const formatted = String(data?.results?.[0]?.formatted || "").trim();
        if (formatted) {
          setDeviceGpsAddress(formatted);
          setSelectedAddress(formatted);
          setAddressSearch(formatted);
        }
      }).catch(() => {
        void reverseGeocode(lat, lon);
      }).finally(() => setDeviceGpsAddressLoading(false));

      fetchCouriersForLocation(lat, lon);
    } catch (error: any) {
      console.warn("Use My Location failed:", error);
      setAddressError(error?.message || "Phone location is unavailable. Search for your address or move the map pin; GPS is not required to continue.");
    } finally {
      setIsLocating(false);
    }
  };

  // Fetch Couriers & Rates when destination is selected
  const fetchCouriersForLocation = async (lat: number, lon: number) => {
    try {
      setIsLoadingCouriers(true);
      setCourierFetchError("");

      const data = await callServerless<any>("getDeliveryQuote", {
        destinationLat: lat,
        destinationLon: lon,
      }, 20_000);
      setCalculatedDistance(data.distanceKm || 0);
      setEstimatedTravelMinutes(Number.isFinite(Number(data.routeTimeMinutes)) ? Number(data.routeTimeMinutes) : null);
      setTrafficEstimateType(String(data.trafficModel || "unavailable"));

      const couriersList = Array.isArray(data.couriers) && data.couriers.length > 0
        ? data.couriers
        : data.courier ? [data.courier] : [];

      setAvailableCouriers(couriersList);
      // Do not pre-select any courier
    } catch (err: any) {
      console.error("Courier pricing error:", err);
      setCourierFetchError(err.message || "Failed to calculate delivery fee.");
    } finally {
      setIsLoadingCouriers(false);
    }
  };

  // Current selected courier object - do not pre-select any provider
  const selectedCourier = useMemo(() => {
    if (!selectedCourierId) return null;
    return availableCouriers.find((c) => c.id === selectedCourierId) || null;
  }, [availableCouriers, selectedCourierId]);

  // Calculations
  const itemsSubtotal = useMemo(() => {
    return selectedItems.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
  }, [selectedItems]);

  // Compute active charges dynamically via lib/charges.ts engine
  const { totalChargesAmount, computedCharges } = useMemo(() => {
    return calculateChargesBreakdown(activeCharges, itemsSubtotal);
  }, [activeCharges, itemsSubtotal]);

  const courierDeliveryFee = useMemo(() => {
    return selectedCourier?.calculatedFee || 0;
  }, [selectedCourier]);

  // Effective courier delivery fee considering free shipping or capped shipping subsidy promo
  const effectiveCourierDeliveryFee = useMemo(() => {
    if (appliedPromo?.isFreeShipping) return 0;
    if (appliedPromo?.shippingSubsidy && appliedPromo.shippingSubsidy > 0) {
      return Math.max(0, courierDeliveryFee - appliedPromo.shippingSubsidy);
    }
    return courierDeliveryFee;
  }, [appliedPromo, courierDeliveryFee]);

  // Recalculate promo discount if cart items subtotal changes
  const promoDiscountAmount = useMemo(() => {
    if (!appliedPromo) return 0;
    if (appliedPromo.isFreeShipping) return 0; // Handled via effectiveCourierDeliveryFee
    if (appliedPromo.discountType === "percentage" && appliedPromo.discountValue) {
      const pct = Number(appliedPromo.discountValue) || 0;
      let calc = (itemsSubtotal * pct) / 100;
      if (appliedPromo.maxDiscountAmount) {
        calc = Math.min(calc, appliedPromo.maxDiscountAmount);
      }
      return Math.min(itemsSubtotal, Math.round(calc));
    }
    return Math.min(itemsSubtotal, appliedPromo.discountAmount || 0);
  }, [appliedPromo, itemsSubtotal]);

  const subtotalAfterPromo = useMemo(() => {
    return Math.max(0, itemsSubtotal - promoDiscountAmount);
  }, [itemsSubtotal, promoDiscountAmount]);

  // Base payable amount before store credits
  const payableBeforeCredits = useMemo(() => {
    const base = subtotalAfterPromo + totalChargesAmount;
    if (deliveryPaymentMethod === "upon_checkout") {
      return base + effectiveCourierDeliveryFee;
    }
    return base;
  }, [subtotalAfterPromo, totalChargesAmount, effectiveCourierDeliveryFee, deliveryPaymentMethod]);

  // Store credits to deduct
  const creditsDeducted = useMemo(() => {
    if (!useStoreCredits || availableStoreCredits <= 0) return 0;
    return Math.min(availableStoreCredits, payableBeforeCredits);
  }, [useStoreCredits, availableStoreCredits, payableBeforeCredits]);

  // Final payable now
  const payableNow = useMemo(() => {
    return Math.max(0, payableBeforeCredits - creditsDeducted);
  }, [payableBeforeCredits, creditsDeducted]);

  // Final payable on delivery
  const payableOnDelivery = useMemo(() => {
    if (deliveryPaymentMethod === "upon_delivery") {
      return effectiveCourierDeliveryFee;
    }
    return 0;
  }, [deliveryPaymentMethod, effectiveCourierDeliveryFee]);

  // Total order value
  const overallOrderValue = useMemo(() => {
    return payableNow + payableOnDelivery;
  }, [payableNow, payableOnDelivery]);

  // Derived current payable amount for step 5 confirmation and payment instructions
  const currentPayableNow = useMemo(() => {
    if (completedOrder) {
      if (completedOrder.payableNow !== undefined && completedOrder.payableNow !== null) {
        return Number(completedOrder.payableNow);
      }
      if (completedOrder.deliveryFeePaymentMethod === "upon_delivery") {
        return Math.max(0, Number(completedOrder.totalAmount || 0) - Number(completedOrder.deliveryFee || 0));
      }
      return Number(completedOrder.totalAmount || 0);
    }
    return payableNow;
  }, [completedOrder, payableNow]);

  // Hash the selected file and a normalized pixel sample. This records
  // comparison evidence only; it does not authenticate a receipt or approve payment.
  const analyzeReceiptImage = async (base64Image: string) => {
    if (!base64Image) return;
    const analysisStartedAt = Date.now();
    const waitForMinimumScanDuration = async () => {
      const remaining = Math.max(0, 15_000 - (Date.now() - analysisStartedAt));
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    };
    try {
      setIsAnalyzingReceipt(true);
      setOcrError("");
      setOcrAnalysis(null);
      const [, encoded = ""] = base64Image.split(",", 2);
      if (!encoded || !globalThis.crypto?.subtle) throw new Error("Automated image analysis is unavailable. Please try selecting the receipt again.");
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const rawDigest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      const rawImageSha256 = Array.from(new Uint8Array(rawDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");

      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("The selected receipt image could not be analyzed."));
        element.src = base64Image;
      });
      const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("The selected receipt image could not be analyzed.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixelBytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const pixelDigest = await globalThis.crypto.subtle.digest("SHA-256", pixelBytes);
      const pixelFingerprintSha256 = Array.from(new Uint8Array(pixelDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const analysis = {
        model: "PRIME Image Forensics v1",
        rawImageSha256,
        scanImageSha256: rawImageSha256,
        pixelFingerprintSha256,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        imageByteLength: bytes.length,
        analyzedAt: new Date().toISOString(),
        matchStatus: "ANALYSIS_COMPLETED",
        forensicsResult: "Image hashes and a normalized pixel sample are ready. Exact reuse and replacement comparisons are checked during secure upload; staff must still verify the payment manually.",
        requiresManualReview: true,
      };
      await waitForMinimumScanDuration();
      setOcrAnalysis(analysis);
    } catch (e: any) {
      await waitForMinimumScanDuration();
      console.warn("Receipt image analysis failed:", e);
      setOcrError(e?.message || "Receipt image analysis failed. Please re-scan the image.");
    } finally {
      setIsAnalyzingReceipt(false);
    }
  };

  // Promo Code Validation Handler
  const handleApplyPromo = async () => {
    const cleanCode = promoCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      setPromoError("Please enter a promo code.");
      return;
    }
    setIsCheckingPromo(true);
    setPromoError("");
    try {
      const fpData = await getClientFingerprint();
      const totalItemCount = selectedItems.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
      const promoRequest = {
        code: cleanCode,
        itemsSubtotal,
        itemQuantity: totalItemCount,
        totalItems: totalItemCount,
        deliveryFee: courierDeliveryFee,
        customerId: tgCustomer.id,
        primeMemberId: tgCustomer.primeMemberId,
        customerTier: tgCustomer.tier || 'SILVER',
        paymentMethod: deliveryPaymentMethod === 'upon_delivery' ? 'upon_delivery' : 'upon_checkout',
        courierId: selectedCourier?.id || selectedCourierId,
        deviceId: fpData.deviceId,
        hardwareId: fpData.hardwareId,
        sessionToken: fpData.sessionToken || getOrCreateSessionToken(fpData.deviceId, tgCustomer.id)
      };
      let data: any;
      if (hasTelegramServerlessBridge()) {
        data = await callServerless<any>("validatePromo", promoRequest, 20_000);
      } else {
        const res = await authenticatedFetch("/api/promos/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(promoRequest),
        });
        data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "We couldn't check this code. Please try again.");
      }
      if (!data?.valid) {
        setPromoError(data.error || "Invalid promo code.");
        return;
      }
      if (data.customerTier) {
        setTgCustomer(prev => ({ ...prev, tier: String(data.customerTier).toUpperCase() }));
      }

      setAppliedPromo({
        code: data.code,
        title: data.title || data.code,
        promoId: data.promoId,
        voucherType: data.voucherType,
        discountAmount: Number(data.discountAmount) || 0,
        discountType: data.discountType,
        discountValue: data.discountValue,
        maxDiscountAmount: data.maxDiscountAmount,
        isFreeShipping: Boolean(data.isFreeShipping),
        shippingSubsidy: Number(data.shippingSubsidy) || 0,
        cashbackPoints: Number(data.cashbackPoints) || 0
      });
      setPromoCodeInput("");
    } catch (err: any) {
      setPromoError("We couldn't check this code right now. Please try again.");
    } finally {
      setIsCheckingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoError("");
  };

  // Referral Code Validation Handler
  const handleApplyReferral = async () => {
    const cleanCode = referralCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      setReferralError("Please enter a referral code.");
      return;
    }
    setIsCheckingReferral(true);
    setReferralError("");
    setReferralSuccess("");
    try {
      const res = await authenticatedFetch("/api/referral/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referralCode: cleanCode,
          customerId: tgCustomer.id,
          customerMemberId: tgCustomer.primeMemberId
        })
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        setReferralError(data.error || "Invalid referral code.");
        return;
      }
      setAppliedReferral({
        code: data.referrerMemberId,
        referrerName: data.referrerName || "Valued Member",
        referrerMemberId: data.referrerMemberId
      });
      setReferralSuccess(`Referred by ${data.referrerName} (${data.referrerMemberId})`);
    } catch (err: any) {
      setReferralError(err.message || "Failed to validate referral code.");
    } finally {
      setIsCheckingReferral(false);
    }
  };

  const handleRemoveReferral = () => {
    setAppliedReferral(null);
    setReferralError("");
    setReferralSuccess("");
    setReferralCodeInput("");
  };

  // Step Navigations & Validations
  const handleNextFromStep1 = () => {
    setReceiverError("");
    const cleanName = receiverName.trim();
    const cleanPhoneDigits = receiverPhone.replace(/\D/g, "");

    if (!cleanName) {
      setReceiverError("Receiver's name is required.");
      return;
    }
    if (cleanPhoneDigits.length < 11) {
      setReceiverError("Please enter a valid 11-digit phone number (e.g. 0919 123 4567).");
      return;
    }
    setCurrentStep(2);
  };

  const handleNextFromStep2 = () => {
    setAddressError("");
    const targetAddr = selectedAddress || addressSearch;

    if (!targetAddr || !hasSelectedAddress) {
      setAddressError("Please select a suggested address or drop a pin on the map.");
      return;
    }

    // Fetch couriers if not already fetched
    if (availableCouriers.length === 0) {
      fetchCouriersForLocation(coords.lat, coords.lon);
    }
    setCurrentStep(3);
  };

  const handleNextFromStep3 = () => {
    setCourierFetchError("");
    if (!selectedCourier) {
      setCourierFetchError("Please select a courier to continue.");
      return;
    }
    if (!deliveryPaymentMethod) {
      setCourierFetchError("Please select how you would like to pay for the delivery fee (Upon Checkout or Upon Delivery).");
      return;
    }
    setCurrentStep(4);
  };

  // Submit Order to API
  const handleSubmitOrder = async () => {
    if (chargesLoadError || isLoadingCharges) {
      setSubmitError("Wait for the current configured charges to load before submitting your order.");
      return;
    }
    const normalizedReceiverName = String(receiverName || "").trim();
    const normalizedReceiverPhone = String(receiverPhone || "").trim();
    if (!normalizedReceiverName || !normalizedReceiverPhone) {
      setSubmitError("Receiver's name and phone are required.");
      return;
    }
    const normalizedDeliveryPaymentMethod = String(deliveryPaymentMethod || "").trim().toLowerCase();

    // Do not send an order request with a missing delivery-payment channel.
    // Step 4 should never be able to fall through to the API in an invalid state.
    if (!selectedCourier) {
      setSubmitError("Please select a courier before placing the order.");
      return;
    }
    if (normalizedDeliveryPaymentMethod !== "upon_checkout" && normalizedDeliveryPaymentMethod !== "upon_delivery") {
      setSubmitError("Please select how the delivery fee will be paid: Upon Checkout or Upon Delivery.");
      return;
    }

    let activeOperationKey = "";
    try {
      setIsSubmittingOrder(true);
      setSubmitError("");

      // Match the total shown to the customer to the canonical charge, promo,
      // courier, and credit calculation used by createOrder.
      const freshCharges = hasTelegramServerlessBridge()
        ? await callServerless<any[]>("getPublicCharges", {})
        : await authenticatedFetch(`/api/charges?_t=${Date.now()}`, { cache: "no-store", headers: { "Pragma": "no-cache" } }).then(async (response) => {
            if (!response.ok) throw new Error("The current charge list was unavailable.");
            return response.json();
          });
      if (!Array.isArray(freshCharges)) throw new Error("The current charge list was unavailable.");
      setActiveCharges(freshCharges);
      setChargesLoadError("");
      const freshChargeBreakdown = calculateChargesBreakdown(freshCharges, itemsSubtotal);
      const reviewEffectiveDeliveryFee = appliedPromo?.isFreeShipping ? 0
        : Math.max(0, courierDeliveryFee - Number(appliedPromo?.shippingSubsidy || 0));
      const reviewPayableBeforeCredits = Math.max(0, itemsSubtotal - promoDiscountAmount) + freshChargeBreakdown.totalChargesAmount +
        (deliveryPaymentMethod === "upon_checkout" ? reviewEffectiveDeliveryFee : 0);
      const reviewCredits = Math.min(useStoreCredits ? availableStoreCredits : 0, reviewPayableBeforeCredits);
      const reviewPayableNow = Math.max(0, reviewPayableBeforeCredits - reviewCredits);
      const reviewPayableOnDelivery = deliveryPaymentMethod === "upon_delivery" ? reviewEffectiveDeliveryFee : 0;
      const reviewTotal = reviewPayableNow + reviewPayableOnDelivery;
      if (Math.abs(reviewTotal - overallOrderValue) > 0.01) {
        throw new Error("The current total changed while checkout was open. Review the updated charges and submit again.");
      }

      const fpData = await getClientFingerprint();

      // Precise location is optional and only exists when the customer explicitly
      // used "Use My Location". No geolocation request is made at order submission.
      const orderLocationSnapshot = deviceGps
        ? {
            lat: Number(deviceGps.lat),
            lon: Number(deviceGps.lon),
            latitude: Number(deviceGps.lat),
            longitude: Number(deviceGps.lon),
            ...(Number.isFinite(Number(deviceGps.accuracy))
              ? { accuracy: Number(deviceGps.accuracy) }
              : {}),
            source: "Use My Location snapshot",
            capturedAt: String(deviceGps.capturedAt || new Date().toISOString()),
            reverseGeocodedAddress:
              String(deviceGps.reverseGeocodedAddress || deviceGpsAddress || "").trim() || null,
          }
        : null;

      const orderData = {
        items: selectedItems.map((it) => {
          const isFree = Boolean(it.isFree || Number(it.price) === 0);
          return {
            id: it.id,
            productId: it.productId || (typeof it.id === 'string' && it.id.includes('_') ? it.id.split('_')[0] : it.id),
            variantId: it.variantId || (typeof it.id === 'string' && it.id.includes('_') ? it.id.split('_')[1] : 'default'),
            name: it.name,
            price: isFree ? 0 : (Number(it.price) || 0),
            originalPrice: Number(it.originalPrice || it.price || 0),
            isFree,
            quantity: Number(it.quantity) || 1,
            imageUrl: it.imageUrl || "",
          };
        }),
        customerId: tgCustomer.id,
        customerName: tgCustomer.name,
        customerUsername: tgCustomer.username,
        primeMemberId: tgCustomer.primeMemberId,
        subTotal: itemsSubtotal,
        appliedCharges: computedCharges.map((c) => ({
          id: c.id,
          name: c.name,
          amount: c.computedAmount,
          rate: c.rate,
          type: c.type,
        })),
        deliveryFee: courierDeliveryFee,
        deliveryFeePaymentMethod: normalizedDeliveryPaymentMethod,
        receiverName: receiverName.trim().toUpperCase(),
        receiverPhone: receiverPhone.trim(),
        deliveryAddress: {
          formatted: selectedAddress,
          lat: coords.lat,
          lon: coords.lon,
          unitDetails: unitDetails.trim() || "Non",
        },
        courier: selectedCourier ? {
          id: selectedCourier.id,
          name: selectedCourier.name,
          type: selectedCourier.type,
          logo: selectedCourier.logo || "",
          distanceKm: calculatedDistance,
          fee: courierDeliveryFee,
        } : null,
        totalAmount: overallOrderValue,
        payableNow,
        payableOnDelivery,
        expectedTotalAmount: reviewTotal,
        expectedPayableNow: reviewPayableNow,
        expectedPayableOnDelivery: reviewPayableOnDelivery,
        promoCode: appliedPromo ? appliedPromo.code : null,
        promoDiscount: promoDiscountAmount,
        promoTitle: appliedPromo?.title || null,
        promoId: appliedPromo?.promoId || null,
        isFreeShipping: Boolean(appliedPromo?.isFreeShipping),
        appliedStoreCredits: creditsDeducted,
        storeCreditsUsed: creditsDeducted,
        referralCode: appliedReferral?.code || (existingReferrer?.memberId || null),
        notes: customerNotes.trim() || "Non",
        deviceId: fpData.deviceId,
        sessionToken: fpData.sessionToken || getOrCreateSessionToken(fpData.deviceId, tgCustomer.id),
        coordinates: `${coords.lat}, ${coords.lon}`,
        deviceSnapshot: {
          ...fpData,
          deviceGps: orderLocationSnapshot,
          deviceId: fpData.deviceId,
          sessionToken: fpData.sessionToken || getOrCreateSessionToken(fpData.deviceId, tgCustomer.id),
        },
      };

      let orderResult: any;
      if (hasTelegramServerlessBridge()) {
        const operationKey = getOrCreateServerlessCheckoutKey(String(tgCustomer.id));
        activeOperationKey = operationKey;
        orderResult = await callServerless<any>("createOrder", {
          ...orderData,
          operationKey,
        }, 60_000);
        if (!orderResult || orderResult.success === false) {
          throw new Error(orderResult?.error || "We couldn't submit your order. Please try again.");
        }
        clearPendingServerlessCheckoutKey(String(tgCustomer.id), operationKey);
      } else {
        const res = await authenticatedFetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to submit order.");
        }
        orderResult = await res.json();
      }
      setCompletedOrder(orderResult);

      // Save to localStorage for instant customer Order History accessibility
      try {
        const stored = JSON.parse(localStorage.getItem("prime_customer_orders") || "[]");
        const updated = [orderResult, ...stored.filter((o: any) => o.id !== orderResult.id && o.orderNumber !== orderResult.orderNumber)];
        localStorage.setItem("prime_customer_orders", JSON.stringify(updated));
        window.dispatchEvent(new Event("prime_orders_updated"));
      } catch (e) {
        console.warn("Failed to persist order to local storage", e);
      }

      setCurrentStep(5);
      onOrderSuccess(orderResult);

    } catch (err: any) {
      console.error("Order submission failed:", err);
      if (activeOperationKey && String(err?.message || "").includes("payable amount changed while checkout was open")) {
        clearPendingServerlessCheckoutKey(String(tgCustomer.id), activeOperationKey);
      }
      setSubmitError(err.message || "Order submission failed. Please try again.");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div ref={overlayRef} className="prime-checkout w-full bg-gray-50 flex justify-center py-0">
      <div 
        className="prime-checkout__dialog bg-white w-full shadow-sm overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="false"
      >
        {/* Header with Step Tracker */}
        <div className="prime-checkout__header border-b border-gray-100 bg-white px-2.5 sticky top-0 z-30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="prime-checkout__title text-base font-heading font-bold text-gray-900 uppercase">
                <span className="inline-flex min-w-0 items-center gap-2">
                  {currentStep === 1 && <User className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  {currentStep === 2 && <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  {currentStep === 3 && <Truck className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  {currentStep === 4 && <Receipt className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  {currentStep === 5 && <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  <span className="truncate">
                    {currentStep === 1 && "Customer & Receiver Details"}
                    {currentStep === 2 && "Delivery Details"}
                    {currentStep === 3 && "Delivery & Handling"}
                    {currentStep === 4 && "Review"}
                    {currentStep === 5 && "Order Submitted"}
                  </span>
                </span>
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-none text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Close Checkout"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div ref={scrollContainerRef} className="prime-checkout__scroll flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-2.5">

          {/* ================= STEP 1: IDENTITY & RECEIVER ================= */}
          {currentStep === 1 && (
            <div className="space-y-2.5">
              {receiverError && (
                <div className="text-xs font-mono text-red-600 flex items-center gap-1.5 py-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{receiverError}</span>
                </div>
              )}

              {/* Telegram Identity (Read-Only) */}
              <div className="p-3.5 sm:p-2.5 rounded-none border border-gray-200 bg-gray-50/70">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 font-heading mb-3">
                  Telegram Identity
                </h4>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  {/* Telegram Name (Left) */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                      Telegram Name
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={tgCustomer.name || "Loading..."}
                      className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-xs font-mono text-gray-700 cursor-default focus:outline-none"
                    />
                  </div>

                  {/* Telegram Handle (Right) */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                      Telegram Handle
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={tgCustomer.username ? (tgCustomer.username.startsWith('@') ? tgCustomer.username : `@${tgCustomer.username}`) : "Not provided"}
                      className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-xs font-mono text-gray-700 cursor-default focus:outline-none"
                    />
                  </div>

                  {/* PRIME Member ID (Left) */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                      PRIME Member ID
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={tgCustomer.primeMemberId || (isLoadingProfile ? "Loading..." : "No ID")}
                      className="prime-checkout__field-value w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-xs font-mono font-bold text-amber-800 cursor-default focus:outline-none"
                    />
                  </div>

                  {/* Membership Tier (Right) */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                      Membership Tier
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={tgCustomer.tier ? `${tgCustomer.tier.charAt(0)}${tgCustomer.tier.slice(1).toLowerCase()}` : (isLoadingTier ? "Loading..." : "Unavailable")}
                      className="prime-checkout__field-value w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-xs font-mono text-gray-700 cursor-default focus:outline-none"
                    />
                  </div>
                </div>

                {(availableStoreCredits > 0 || existingReferrer) && (
                  <div className="mt-3 pt-2.5 border-t border-gray-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                    {availableStoreCredits > 0 ? (
                      <span className="text-amber-800 font-bold flex items-center gap-1.5 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                        <Coins className="w-3.5 h-3.5 text-amber-600" />
                        Available Store Credits: {formatPHP(availableStoreCredits)}
                      </span>
                    ) : <span />}
                    {existingReferrer && (
                      <span className="text-gray-600 flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                        <Gift className="w-3 h-3 text-blue-600" />
                        Referred by: <strong className="text-gray-800 font-bold">{existingReferrer.memberId}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Receiver Information (Editable) */}
              <div className="p-3.5 sm:p-3 rounded-none border border-gray-200 bg-white shadow-sm">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 font-heading mb-3">
                  Receiver Information
                </h4>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  {/* Receiver Name (Left) */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                      Receiver's Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={receiverName}
                      onChange={(e) => setReceiverName(e.target.value.toUpperCase())}
                      placeholder="JUAN DELA CRUZ"
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-mono uppercase text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black"
                      required
                    />
                  </div>

                  {/* Receiver Phone (Right) */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                      Receiver's Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={receiverPhone}
                      onChange={(e) => setReceiverPhone(formatPhoneNumber(e.target.value))}
                      placeholder="0919 123 4567"
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 2: ADDRESS & MAP ================= */}
          {currentStep === 2 && (
            <div className="space-y-2.5">
              {addressError && (
                <div className="text-xs font-mono text-red-600 flex items-center gap-1.5 py-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{addressError}</span>
                </div>
              )}
              {locationNotice && (
                <div className="prime-checkout__location-notice flex items-center gap-1.5 border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs leading-tight text-sky-900">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{locationNotice}</span>
                </div>
              )}

              {/* Address Search with Geoapify Autocomplete */}
              <div className="space-y-1 relative z-50">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                  Search Street Address / Landmark
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={addressSearch}
                    onChange={(e) => handleAddressSearch(e.target.value)}
                    placeholder="Type address, street, building, or landmark in the Philippines..."
                    className="w-full pl-9 pr-9 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black transition-all"
                  />
                  {isSearchingAddress && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                    </div>
                  )}
                </div>

                {/* Autocomplete Suggestions Dropdown */}
                {addressSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-none shadow-lg z-[100] max-h-56 overflow-y-auto divide-y divide-gray-100">
                    {addressSuggestions.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectSuggestion(item)}
                        className="w-full text-left px-3.5 py-2 hover:bg-gray-50 transition-colors flex items-start gap-2.5 cursor-pointer"
                      >
                        <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">
                            {item.name || item.formatted}
                          </p>
                          <p className="text-[11px] text-gray-500 truncate font-mono">
                            {item.formatted}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Keep unit and landmark details beside address search, before the map. */}
              <div className="space-y-1 pt-0.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                  Unit, Floor, Building or Landmark
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Building className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={unitDetails}
                    onChange={(e) => setUnitDetails(e.target.value)}
                    placeholder="e.g. Unit 402, Tower B, near the main gate"
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 font-heading">
                  Rider Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  placeholder="Gate codes, landmarks, or delivery preferences..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-none text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              {/* Rectangular Map Container with Zoom, Drag, Use My Location, & Drop Pin */}
              <div className="space-y-1 relative z-0">
                <AddressPickerMap
                  lat={coords.lat}
                  lon={coords.lon}
                  onLocationChange={handleLocationChange}
                  onUseMyLocation={handleUseMyLocation}
                  isLocating={isLocating}
                  pinDropArmed={pinDropArmed}
                  onPinDropArmedChange={setPinDropArmed}
                />
              </div>

              {/* Selected Formatted Address Confirmation Badge */}
              {selectedAddress && (
                <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200 flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-black mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block font-heading">
                      Selected Delivery Location
                    </span>
                    <p className="text-xs font-mono text-gray-900 break-words mt-0.5">
                      {selectedAddress}
                    </p>
                  </div>
                </div>
              )}

              {/* Real-Time Address Validation Status Banner Removed */}
            </div>
          )}

          {/* ================= STEP 3: COURIER & DELIVERY PAYMENT ================= */}
          {currentStep === 3 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 border-b border-gray-100 pb-2">
                <div className="min-w-0 border border-slate-200 bg-slate-50 px-2.5 py-2 text-center">
                  <span className="block text-[9px] uppercase tracking-wide text-slate-500 font-heading">Estimated distance</span>
                  <span className="block text-sm font-mono font-bold text-slate-900">{calculatedDistance > 0 ? `${calculatedDistance} km` : "Calculating"}</span>
                </div>
                <div className="min-w-0 border border-slate-200 bg-slate-50 px-2.5 py-2 text-center">
                  <span className="block text-[9px] uppercase tracking-wide text-slate-500 font-heading">Estimated travel time</span>
                  <span className="block text-sm font-mono font-bold text-slate-900">{estimatedTravelMinutes !== null ? `~${estimatedTravelMinutes} min` : "Unavailable"}</span>
                </div>
                <p className="col-span-2 text-center text-[9px] leading-tight text-slate-500 font-mono">PRIME constantly pools road traffic data every 30 minutes. The indicated travel time is still an estimate and may change depending on actual traffic conditions.</p>
              </div>

              {courierFetchError && (
                <div className="text-xs font-mono text-red-600 flex items-center gap-1.5 py-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{courierFetchError}</span>
                </div>
              )}

              {/* Courier Tiles Grid */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 font-heading">
                  Available Couriers
                </label>

                {isLoadingCouriers ? (
                  <div className="p-8 text-center bg-gray-50 rounded-none border border-gray-200 flex flex-col items-center justify-center gap-2 text-xs font-mono text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin text-black" />
                    <span>Checking delivery rates and travel time...</span>
                  </div>
                ) : availableCouriers.length === 0 ? (
                  <div className="p-6 text-center bg-amber-50 rounded-none border border-amber-200 text-xs font-mono text-amber-800">
                    No couriers currently available for this route. Please re-adjust address or contact support.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                    {availableCouriers.map((courier) => {
                      const isSelected = selectedCourierId === courier.id;
                      return (
                        <div key={courier.id} className="flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedCourierId(courier.id)}
                            aria-pressed={isSelected}
                            className={`group w-full aspect-[2/1] rounded-lg border-0 transition-all flex items-center justify-center p-0 relative overflow-hidden bg-white shadow-sm hover:shadow-md ${
                              isSelected
                                ? "bg-slate-50 shadow-md ring-2 ring-slate-900"
                                : "bg-white"
                            }`}
                          >
                            <CourierTileLogo reference={String(courier.logo || "")} name={courier.name} selected={isSelected} />
                          </button>
                          <div className="w-full text-center leading-tight">
                            <span className="block truncate text-[9px] sm:text-[10px] font-heading font-black uppercase tracking-wide text-slate-900">
                              {formatCourierName(courier.name)}
                            </span>
                            <span className="block text-xs sm:text-[13px] font-mono font-bold text-slate-950 tracking-tight">
                              {formatPHP(courier.calculatedFee || 0)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Delivery Fee Payment Option: Upon Checkout vs Upon Delivery */}
              {selectedCourier && (
                <div className="space-y-3 pt-2">
                  <div className="border-b border-slate-100 pb-3 mb-4 text-center">
                    <p className="text-xs text-slate-700 font-mono leading-relaxed max-w-lg mx-auto">
                      You have chosen <span className="font-bold text-slate-900">{selectedCourier?.name}</span> to handle your delivery from PRIME Fulfillment Hub with a corresponding charge of <span className="font-bold text-slate-900 font-mono">{formatPHP(courierDeliveryFee)}</span>. How would you like to pay for the charge?
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <button
                      type="button"
                      onClick={() => setDeliveryPaymentMethod("upon_checkout")}
                      className={`px-3.5 py-2.5 rounded-none shadow-sm hover:shadow-md text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer text-center border ${
                        deliveryPaymentMethod === "upon_checkout"
                          ? "bg-slate-900 border-slate-900 text-white hover:bg-black"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      UPON CHECKOUT
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryPaymentMethod("upon_delivery")}
                      className={`px-3.5 py-2.5 rounded-none shadow-sm hover:shadow-md text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer text-center border ${
                        deliveryPaymentMethod === "upon_delivery"
                          ? "bg-slate-900 border-slate-900 text-white hover:bg-black"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      UPON DELIVERY
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= STEP 4: ORDER BREAKDOWN & CONFIRM ================= */}
          {currentStep === 4 && (
            <div className="space-y-3">
              <div className="prime-checkout__review-warning border-2 border-amber-400 bg-amber-50 px-2.5 py-2 text-amber-950">
                <span className="prime-checkout__review-warning-icon" aria-hidden="true">
                  <svg viewBox="0 0 48 48" role="presentation">
                    <circle cx="24" cy="24" r="21" fill="#facc15" stroke="#fbbf24" strokeWidth="2" />
                    <path d="M24 12c-5 0-8 4-8 9v6l-3 4v2h22v-2l-3-4v-6c0-5-3-9-8-9Zm-3 24h6a3 3 0 0 1-6 0Z" fill="#713f12" />
                    <path d="M10 18c-2 2-2 7 0 9m28-9c2 2 2 7 0 9" fill="none" stroke="#713f12" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M24 8V6" stroke="#713f12" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </span>
                <p className="text-xs text-left text-amber-950 font-mono" style={{ fontSize: "calc(1em - 0.5pt)" }}>
                  Double-check all order details before submitting. Orders are confirmed only after payment is completed and proof of payment is uploaded and validated within one hour of order submission.
                </p>
              </div>

              {submitError && (
                <div className="text-xs font-mono text-red-600 flex items-center gap-1.5 py-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Delivery Information */}
              <div className="p-2.5 rounded-none border border-slate-200 bg-slate-50 space-y-2.5 text-xs font-mono">
                <div className="flex justify-between items-start">
                  <span className="text-gray-500 uppercase text-[10px]">Receiver</span>
                  <span className="prime-checkout__review-value font-bold text-gray-900 text-right">
                    {receiverName} ({receiverPhone})
                  </span>
                </div>

                <div className="flex justify-between items-start pt-1 border-t border-gray-200">
                  <span className="text-gray-500 uppercase text-[10px] flex items-center gap-1">
                    <span>Address</span>
                  </span>
                  <span className="prime-checkout__review-value text-gray-900 text-right max-w-xs break-words">
                    {selectedAddress}
                    <span className="block text-gray-500 text-[11px]">Unit/Landmark: {unitDetails.trim() || "Non"}</span>
                  </span>
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                  <span className="text-gray-500 uppercase text-[10px]">Courier</span>
                  <span className="prime-checkout__review-value font-bold text-gray-900">
                    {selectedCourier?.name} ({calculatedDistance} km)
                  </span>
                </div>
              </div>



              {/* Items Recap */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 font-heading">
                  Selected Items ({selectedItems.length})
                </span>
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-none bg-gray-50/50 p-2 max-h-48 overflow-y-auto">
                  {selectedItems.map((item) => {
                    const isFreeItem = Boolean(item.isFree || Number(item.price) === 0);
                    return (
                      <div key={item.id} className="p-2 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={item.imageUrl || "https://picsum.photos/seed/prime/100"}
                            alt={item.name}
                            className="w-10 h-10 object-cover rounded bg-white border border-gray-200 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="min-w-0">
                              <p className="prime-checkout__review-value text-gray-900 truncate">
                                {item.productName || (item.variantName ? item.name : item.name.includes(" - ") ? item.name.slice(0, item.name.lastIndexOf(" - ")) : item.name)}
                              </p>
                              {(item.variantName || (!item.productName && !item.variantName && item.name.includes(" - ") ? item.name.slice(item.name.lastIndexOf(" - ") + 3) : "")) && (
                                <p className="prime-checkout__review-value text-[11px] font-mono text-gray-500 truncate">{item.variantName || item.name.slice(item.name.lastIndexOf(" - ") + 3)}</p>
                              )}
                              <div className="flex items-center gap-1.5">
                              {isFreeItem && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                                  FREE
                                </span>
                              )}
                              </div>
                            </div>
                            <p className="prime-checkout__review-value text-[11px] font-mono text-gray-500">
                              {item.quantity} × {isFreeItem ? <span className="text-emerald-600 font-bold">FREE</span> : formatPHP(item.price || 0)}
                            </p>
                          </div>
                        </div>
                        <span className={`prime-checkout__review-value font-mono shrink-0 ${isFreeItem ? "text-emerald-600" : "text-gray-900"}`}>
                          {isFreeItem ? "FREE" : formatPHP((item.price || 0) * (item.quantity || 1))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>



              {/* Comprehensive Charges Breakdown */}
              <div className="prime-checkout__charges border border-gray-200 rounded-none p-2.5 bg-white space-y-1.5">
                <h4 className="text-xs font-bold tracking-wider text-gray-900 font-heading uppercase border-b border-gray-100 pb-2">
                  Breakdown of charges
                </h4>
                {chargesLoadError && <p className="border border-red-200 bg-red-50 p-2 text-xs text-red-700">{chargesLoadError}</p>}
                {isLoadingCharges && <p className="text-xs text-slate-500">Refreshing configured charges…</p>}

                {/* Subtotal */}
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="prime-checkout__charge-label">Items Subtotal:</span>
                  <span className="prime-checkout__charge-value font-semibold text-gray-900">{formatPHP(itemsSubtotal)}</span>
                </div>

                {/* Active Admin Charges */}
                {computedCharges.map((charge) => (
                  <div key={charge.id} className="flex justify-between items-center text-xs font-mono">
                    <span className="prime-checkout__charge-label flex items-center gap-1">
                      {charge.name}:
                      {charge.type === "percentage" && (
                        <span className="text-[10px] text-gray-400">({charge.rate || (charge as any).amount}%)</span>
                      )}
                    </span>
                    <span className="prime-checkout__charge-value font-semibold text-gray-900">{formatPHP(charge.computedAmount)}</span>
                  </div>
                ))}

                {/* Courier Delivery Fee */}
                <div className="flex justify-between items-start text-xs font-mono pt-1 border-t border-gray-100">
                  <div>
                    <span className="prime-checkout__charge-label block">
                      Delivery Fee ({selectedCourier?.name ? formatCourierName(selectedCourier.name) : "Courier"}):
                    </span>
                    {deliveryPaymentMethod === "upon_delivery" && (
                      <span className="prime-checkout__charge-label text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-block mt-0.5">
                        To be paid upon delivery
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    {appliedPromo?.isFreeShipping ? (
                      <div>
                        <span className="line-through text-gray-400 text-[11px] mr-1.5 font-mono">{formatPHP(courierDeliveryFee)}</span>
                        <span className="prime-checkout__charge-value font-bold text-emerald-600 font-mono">FREE</span>
                      </div>
                    ) : appliedPromo?.shippingSubsidy && appliedPromo.shippingSubsidy > 0 ? (
                      <div>
                        <span className="line-through text-gray-400 text-[11px] mr-1.5 font-mono">{formatPHP(courierDeliveryFee)}</span>
                        <span className="prime-checkout__charge-value font-semibold text-gray-900 font-mono">{formatPHP(effectiveCourierDeliveryFee)}</span>
                        <span className="text-[10px] text-emerald-600 block font-mono">(-{formatPHP(appliedPromo.shippingSubsidy)} subsidy)</span>
                      </div>
                    ) : (
                      <span className="prime-checkout__charge-value font-semibold text-gray-900 font-mono">
                        {formatPHP(courierDeliveryFee)}
                      </span>
                    )}
                  </div>
                </div>



              </div>

              {/* Side-by-Side Voucher (Left) and Referral (Right) Code Inputs */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {/* Voucher / Promo Code (Left) */}
                <div className="border border-gray-200 rounded-none p-3 sm:p-3.5 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-heading font-bold uppercase tracking-wider text-gray-900">
                      <Tag className="w-3.5 h-3.5 text-slate-700" />
                      <span>Voucher Code</span>
                    </div>
                    {appliedPromo && (
                      <span className="text-[10px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-300">
                        Applied
                      </span>
                    )}
                  </div>

                  {appliedPromo ? (
                    <div className="p-2 bg-emerald-50/80 border border-emerald-200 rounded-lg flex items-center justify-between text-xs font-mono">
                      <div className="min-w-0 flex-1 pr-1">
                        <span className="font-bold text-emerald-950 uppercase block truncate">{appliedPromo.code}</span>
                        <span className="text-[10px] text-emerald-700 font-semibold block truncate">
                          {appliedPromo.isFreeShipping
                            ? "Free Shipping"
                            : appliedPromo.discountType === "percentage"
                            ? `${appliedPromo.discountValue}% OFF`
                            : `₱${appliedPromo.discountAmount.toLocaleString()} OFF`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAppliedPromo(null);
                          setPromoCodeInput("");
                          setPromoError("");
                        }}
                        className="p-1 text-emerald-700 hover:text-emerald-900 rounded transition-colors cursor-pointer shrink-0"
                        title="Remove voucher"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={promoCodeInput}
                          onChange={(e) => {
                            setPromoCodeInput(e.target.value.toUpperCase());
                            if (promoError) setPromoError("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleApplyPromo();
                            }
                          }}
                          placeholder="ENTER CODE"
                          aria-label="Voucher code"
                          className="min-w-0 flex-1 pl-2.5 pr-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[10px] sm:text-xs font-mono uppercase text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black"
                        />
                        <button type="button" onClick={handleApplyPromo} disabled={isCheckingPromo || !promoCodeInput.trim()} className="shrink-0 px-2 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-[9px] font-heading font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed">
                          {isCheckingPromo ? "..." : "Apply"}
                        </button>
                      </div>

                      {promoError && (
                        <div className="text-[10px] font-mono text-red-600 flex items-center gap-1 bg-red-50 p-1.5 rounded border border-red-200">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span className="truncate">{promoError}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Referral Code (Right) */}
                <div className="border border-gray-200 rounded-none p-3 sm:p-3.5 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-heading font-bold uppercase tracking-wider text-gray-900">
                      <Gift className="w-3.5 h-3.5 text-slate-700" />
                      <span>Referral Code</span>
                    </div>
                    {(existingReferrer || appliedReferral) && (
                      <span className="text-[10px] font-mono font-bold uppercase bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200">
                        Linked
                      </span>
                    )}
                  </div>

                  {existingReferrer ? (
                    <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-mono flex items-center justify-between">
                      <div className="truncate">
                        <span className="text-gray-500 text-[9px] uppercase block">Referred By</span>
                        <span className="font-bold text-gray-900 truncate block">{existingReferrer.name || "Member"} ({existingReferrer.memberId})</span>
                      </div>
                      <span className="text-[9px] text-gray-400 font-mono uppercase shrink-0">Permanent</span>
                    </div>
                  ) : appliedReferral ? (
                    <div className="p-2 bg-blue-50/80 border border-blue-200 rounded-lg flex items-center justify-between text-xs font-mono">
                      <div className="min-w-0 flex-1 pr-1">
                        <span className="text-blue-600 text-[9px] uppercase font-bold block">Referral Applied</span>
                        <span className="font-bold text-blue-950 truncate block">{appliedReferral.referrerName} ({appliedReferral.code})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAppliedReferral(null);
                          setReferralCodeInput("");
                          setReferralError("");
                          setReferralSuccess("");
                        }}
                        className="p-1 text-blue-600 hover:text-blue-900 rounded transition-colors cursor-pointer shrink-0"
                        title="Remove referral code"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={referralCodeInput}
                          onChange={(e) => {
                            setReferralCodeInput(e.target.value.toUpperCase());
                            if (referralError) setReferralError("");
                            if (referralSuccess) setReferralSuccess("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleApplyReferral();
                            }
                          }}
                          placeholder="ENTER CODE"
                          aria-label="Referral code"
                          className="min-w-0 flex-1 pl-2.5 pr-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[10px] sm:text-xs font-mono uppercase text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black"
                        />
                        <button type="button" onClick={handleApplyReferral} disabled={isCheckingReferral || !referralCodeInput.trim()} className="shrink-0 px-2 py-2 bg-slate-900 hover:bg-black text-white rounded-lg text-[9px] font-heading font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed">
                          {isCheckingReferral ? "..." : "Apply"}
                        </button>
                      </div>

                      {referralError && (
                        <div className="text-[10px] font-mono text-red-600 flex items-center gap-1 bg-red-50 p-1.5 rounded border border-red-200">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span className="truncate">{referralError}</span>
                        </div>
                      )}
                      {referralSuccess && (
                        <div className="text-[10px] font-mono text-blue-700 flex items-center gap-1 bg-blue-50 p-1.5 rounded border border-blue-200">
                          <Check className="w-3 h-3 shrink-0" />
                          <span className="truncate">{referralSuccess}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>



              {/* PRIME Store Credits Section */}
              {availableStoreCredits > 0 && (
                <div className="border border-amber-200/80 rounded-none p-3.5 sm:p-2.5 bg-amber-50/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-heading font-bold uppercase tracking-wider text-amber-950">
                      <Coins className="w-3.5 h-3.5 text-amber-700" />
                      <span>PRIME Store Credits</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-900">
                      ₱{availableStoreCredits.toLocaleString()} Available
                    </span>
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer select-none bg-white p-2.5 rounded-lg border border-amber-200">
                    <input
                      type="checkbox"
                      checked={useStoreCredits}
                      onChange={(e) => setUseStoreCredits(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <div className="text-xs font-mono flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">
                          Apply Store Credits to this order
                        </span>
                        {useStoreCredits && creditsDeducted > 0 && (
                          <span className="font-bold text-emerald-700 font-mono">
                            -{formatPHP(creditsDeducted)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {useStoreCredits
                          ? (payableBeforeCredits <= availableStoreCredits
                              ? "Full payable amount covered by your store credits."
                              : `Deducting ₱${creditsDeducted.toLocaleString()} from your payable total.`)
                          : "Use your accumulated PRIME Store Credits for instant order deduction."}
                      </p>
                    </div>
                  </label>
                </div>
              )}



              {/* Final Total & Applied Benefits */}
              <div className="border border-slate-200 rounded-none p-2.5 bg-slate-50 space-y-2">
                {/* Promo Code Discount */}
                {appliedPromo && promoDiscountAmount > 0 && (
                  <div className="flex justify-between items-center text-xs font-mono text-emerald-700 pt-1 border-t border-gray-100">
                    <span className="font-medium flex items-center gap-1">
                      <Tag className="w-3 h-3 text-emerald-600" />
                      Promo Discount ({appliedPromo.code}):
                    </span>
                    <span className="prime-checkout__review-value font-mono">-{formatPHP(promoDiscountAmount)}</span>
                  </div>
                )}

                {/* Points Cashback Voucher Reward */}
                {appliedPromo && (appliedPromo as any).cashbackPoints > 0 && (
                  <div className="flex justify-between items-center text-xs font-mono text-amber-800 pt-1 border-t border-gray-100 bg-amber-50/50 p-1.5 rounded">
                    <span className="font-medium flex items-center gap-1">
                      <Coins className="w-3 h-3 text-amber-600" />
                      Cashback Points to Earn ({appliedPromo.code}):
                    </span>
                    <span className="prime-checkout__review-value font-mono text-amber-900">+{(appliedPromo as any).cashbackPoints.toLocaleString()} PTS</span>
                  </div>
                )}


                {useStoreCredits && creditsDeducted > 0 && (
                  <div className="flex justify-between items-center text-xs font-mono text-emerald-700 pt-1 border-t border-gray-200">
                    <span className="font-medium flex items-center gap-1">
                      <Coins className="w-3 h-3 text-emerald-600" />
                      Store Credits Applied:
                    </span>
                    <span className="font-bold font-mono">-{formatPHP(creditsDeducted)}</span>
                  </div>
                )}
                {/* Total Amounts Section */}
                <div className="pt-3 border-t border-gray-200 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-heading font-bold uppercase tracking-wide text-gray-900 text-sm">
                      Total Payable Now:
                    </span>
                    <span className="prime-checkout__review-value text-2xl text-black font-mono">
                      {formatPHP(payableNow)}
                    </span>
                  </div>

                  {deliveryPaymentMethod === "upon_delivery" && (
                    <div className="flex justify-between items-center text-xs font-mono text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                      <span className="font-medium">To be paid to Courier upon delivery:</span>
                      <span className="font-bold font-mono">
                        {appliedPromo?.isFreeShipping ? "FREE" : formatPHP(courierDeliveryFee)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ================= STEP 5: ORDER CONFIRMATION ================= */}
          {currentStep === 5 && completedOrder && (
            <div className="py-2.5 px-1 space-y-3">
              {/* Pending payment banner */}
              <div className="prime-checkout__pending-banner">
                <div className="prime-checkout__pending-animation" aria-hidden="true">
                  <Store className="prime-checkout__cashier-icon" />
                  <Banknote className="prime-checkout__cash-note" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xl font-heading font-bold text-gray-900 uppercase tracking-wide leading-tight">
                    Order Is Awaiting Payment
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 font-mono leading-snug">
                    Your order ({completedOrder.orderNumber || completedOrder.id}) has been successfully submitted and is waiting for your payment.
                  </p>
                  <p className="mt-1.5 text-sm text-gray-600 font-mono leading-snug">
                    Stocks will be reserved for you for one hour and will be automatically released back to inventory if no payment is made.
                  </p>
                </div>
              </div>

              {/* Order summary collapsible card */}
              <div className="bg-gray-50 border border-gray-200 rounded-none p-2.5 font-mono text-xs space-y-2.5 w-full">
                <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                  <span className="text-gray-400 uppercase text-[9px] font-bold">Order Identifier</span>
                  <span className="font-bold text-gray-900">{completedOrder.orderNumber || completedOrder.id}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                  <span className="text-gray-400 uppercase text-[9px] font-bold">Receiver Name</span>
                  <span className="font-medium text-gray-900 uppercase">{completedOrder.receiverName}</span>
                </div>
                {completedOrder.promoDiscount > 0 && (
                  <div className="flex justify-between items-center border-b border-gray-200 pb-2 text-emerald-700">
                    <span className="text-gray-400 uppercase text-[9px] font-bold">Promo Discount ({completedOrder.promoCode})</span>
                    <span className="font-bold">-{formatPHP(completedOrder.promoDiscount)}</span>
                  </div>
                )}
                {completedOrder.storeCreditsUsed > 0 && (
                  <div className="flex justify-between items-center border-b border-gray-200 pb-2 text-emerald-700">
                    <span className="text-gray-400 uppercase text-[9px] font-bold">Store Credits Used</span>
                    <span className="font-bold">-{formatPHP(completedOrder.storeCreditsUsed)}</span>
                  </div>
                )}
                <div className="border-b border-gray-200 pb-2 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 uppercase text-[9px] font-bold">Payable amount</span>
                    <span className="font-bold text-slate-900 text-sm font-mono">
                      {formatPHP(currentPayableNow)}
                    </span>
                  </div>
                  {completedOrder.deliveryFeePaymentMethod === "upon_delivery" && (
                    <div className="flex justify-between items-center text-[10px] text-amber-800 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                      <span>Delivery Fee to Courier on arrival:</span>
                      <span className="font-bold font-mono">{formatPHP(completedOrder.deliveryFee || 0)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Live Courier Tracking Interactive Card */}
              {completedOrder.trackingUrl && (
                <div className="bg-blue-50/80 border border-blue-200 rounded-none p-2.5 w-full space-y-3 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Truck className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-blue-950">
                        Shipment &amp; Courier Tracking
                      </h4>
                      <p className="text-[10px] font-mono text-blue-700">
                        Live tracking URL provided by administrator
                      </p>
                    </div>
                  </div>

                  <a
                    href={completedOrder.trackingUrl.startsWith("http") ? completedOrder.trackingUrl : `https://${completedOrder.trackingUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-heading font-bold uppercase tracking-wider text-xs rounded-none flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Track Shipment</span>
                  </a>
                </div>
              )}

              {completedOrder.paymentDeadlineAt && (
                <div className="prime-checkout__deadline p-3 bg-red-50 border-2 border-red-400 rounded-lg text-center">
                  <p className="text-sm font-mono font-bold uppercase tracking-wider text-red-900">
                    Payment Proof Deadline
                  </p>
                  <p className="mt-1 text-sm font-mono leading-snug text-red-800">
                    Settle the total payable amount and upload the receipt on or before {formatPaymentDeadline(completedOrder.paymentDeadlineAt)} to avoid cancellation.
                  </p>
                </div>
              )}

              {/* Settle Payment Section */}
              {Number(completedOrder.payableNow || 0) === 0 && Number(completedOrder.storeCreditsUsed || 0) > 0 ? (
                <div className="border-t border-gray-200 pt-3">
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-none text-center space-y-1.5 w-full">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-heading font-bold uppercase tracking-wider text-emerald-950">
                      Fully Settled via Store Credits
                    </h4>
                    <p className="text-xs font-mono text-emerald-800 leading-relaxed">
                      Your order total was completely covered by your PRIME Store Credits. No bank or e-wallet transfer is required. Your order is queued for fulfillment!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="border-t border-gray-200 pt-3 space-y-2.5">
                  <div className="text-center">
                    <h4 className="text-sm font-heading font-bold uppercase tracking-wider text-gray-900">
                      Available Payment Method
                    </h4>
                  </div>

                {isLoadingPaymentMethods ? (
                  <div className="p-8 text-center bg-gray-50 border border-gray-200 rounded-none flex flex-col items-center justify-center gap-2 text-xs font-mono text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin text-black" />
                    <span>Loading payment options...</span>
                  </div>
                ) : paymentMethods.length === 0 ? (
                  <div className="p-6 text-center bg-gray-50 rounded-none border border-gray-200 text-xs font-mono text-gray-600">
                    No active payment methods are currently configured by the administrator. Please contact shop support to settle payment manually.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {/* Method Tiles Selection (4 columns per row, max 2 rows per page, swipe left/right + dot indicators) */}
                    {(() => {
                      const itemsPerPage = 8;
                      const totalPages = Math.ceil(paymentMethods.length / itemsPerPage);
                      
                      // Safety: if the current page is out of bounds, clip it
                      const pageIndex = Math.min(currentPaymentPage, Math.max(0, totalPages - 1));
                      const slicedMethods = paymentMethods.slice(pageIndex * itemsPerPage, (pageIndex + 1) * itemsPerPage);

                      return (
                        <div className="space-y-3">
                          {/* Outer Container with Swipe Events */}
                          <div 
                            className="relative overflow-hidden w-full select-none cursor-grab active:cursor-grabbing"
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={() => handleTouchEnd(totalPages)}
                          >
                            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                              {slicedMethods.map((method) => {
                                const isOffline = method.isActive === false;
                                const isSelected = !isOffline && selectedPaymentMethod?.id === method.id;
                                const pType = (method.paymentType || method.type || "").toLowerCase();
                                const isQr = pType === "qr_code" || pType === "qr" || pType.includes("qr");
                                const qrImg = method.qrCodeImage || method.qrCode || method.qrImage || method.qr_code_image || "";

                                return (
                                  <div key={method.id} className="flex flex-col items-center gap-1.5">
                                    <button
                                      type="button"
                                      disabled={isOffline}
                                      onClick={() => {
                                        if (isOffline) return;
                                        setSelectedPaymentMethod(method);
                                        setProofSubmitSuccess(false);
                                        setUploadedProofImage("");
                                        // If it is a QR payment method, pop up the QR Code immediately
                                        if (isQr && qrImg) {
                                          setZoomedPaymentMethod(method);
                                          setIsPaymentQrModalOpen(true);
                                        }
                                      }}
                                      className={`group w-full aspect-[2/1] rounded-none border transition-all flex items-center justify-center p-0 relative overflow-hidden bg-white shadow-sm hover:shadow-md select-none ${
                                        isOffline
                                          ? "border-red-200/70 bg-slate-100 cursor-not-allowed opacity-90"
                                          : isSelected
                                          ? "border-slate-900 shadow-md ring-1 ring-slate-900 cursor-pointer"
                                          : "border-gray-200 bg-white hover:border-gray-300 cursor-pointer"
                                      }`}
                                      title={isOffline ? `${method.name} is currently offline` : method.name}
                                    >
                                      {method.logo ? (
                                        <TelegramMediaImage
                                          src={method.logo}
                                          alt={method.name}
                                          className={`absolute inset-0 z-[2] w-full h-full object-fill rounded-md shadow-sm transition-transform duration-200 ${isOffline ? "filter blur-[1px] opacity-40 grayscale-[30%]" : ""}`}
                                          referrerPolicy="no-referrer"
                                        />
                                      ) : (
                                        <CreditCard className={`relative z-[2] w-5 h-5 text-gray-400 ${isOffline ? "filter blur-[1px] opacity-40" : ""}`} />
                                      )}


                                      {/* Offline Overlay */}
                                      {isOffline && (
                                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-[0.5px]">
                                          <span className="font-heading font-black text-[9px] sm:text-[11px] text-red-500 uppercase tracking-widest bg-red-950/90 border border-red-500/70 px-1 sm:px-1.5 py-0.5 rounded shadow-xs leading-none">
                                            OFFLINE
                                          </span>
                                        </div>
                                      )}
                                    </button>
                                    <span className={`text-xs sm:text-[13px] font-heading font-bold truncate w-full text-center leading-tight ${
                                      isOffline ? "text-gray-400" : "text-gray-900"
                                    }`}>
                                      {method.name}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Page indicators */}
                          {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-1.5 py-1">
                              {Array.from({ length: totalPages }).map((_, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setCurrentPaymentPage(idx)}
                                  className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
                                    idx === pageIndex ? "bg-black w-3" : "bg-gray-300 hover:bg-gray-400"
                                  }`}
                                  title={`Go to page ${idx + 1}`}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Expandable Selected Method Details */}
                    {(() => {
                      if (!selectedPaymentMethod) return null;
                      const pType = (selectedPaymentMethod.paymentType || selectedPaymentMethod.type || "").toLowerCase();
                      const isQr = pType === "qr_code" || pType === "qr" || pType.includes("qr");
                      const isManual = pType === "manual_transfer" || pType === "manual" || pType === "bank_transfer" || pType === "transfer";
                      const isCrypto = pType === "crypto";
                      const isApi = pType === "api" || pType === "webhook";
                      const qrImg = selectedPaymentMethod.qrCodeImage || selectedPaymentMethod.qrCode || selectedPaymentMethod.qrImage || selectedPaymentMethod.qr_code_image || "";

                      return (
                        <div className="p-2.5 rounded-none border border-gray-200 bg-white space-y-2.5 animate-in fade-in slide-in-from-top-3 duration-200 text-left">
                          <div className="border-b border-gray-100 pb-2 flex items-center justify-between">
                            <h5 className="text-xs font-heading font-black uppercase text-gray-900">
                              Instructions for {selectedPaymentMethod.name}
                            </h5>
                            <span className="text-[10px] font-mono text-gray-400 uppercase">
                              {isQr && "Static QR"}
                              {isManual && "Manual Transfer"}
                              {isCrypto && "Wallet Deposit"}
                              {isApi && "Integrated Webhook"}
                            </span>
                          </div>

                          {/* Manual Transfer (Bank / E-Wallet) Block */}
                          {isManual && (
                            <div className="space-y-3">
                              <div className="bg-amber-50/80 border border-amber-200/80 rounded-none p-3 space-y-1">
                                <span className="text-[11px] font-heading font-black text-amber-900 uppercase tracking-wide block">
                                  Transfer Payment Details
                                </span>
                                <p className="text-[11px] text-amber-800 font-mono leading-relaxed">
                                  Transfer <strong>{formatPHP(currentPayableNow)}</strong> using your bank or e-wallet app to the account details below, then attach your screenshot or receipt.
                                </p>
                              </div>

                              {/* Account Name */}
                              <div className="space-y-1">
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 font-heading">
                                  Account Name
                                </label>
                                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 p-2.5 rounded-lg">
                                  <span className="font-heading font-bold text-xs sm:text-sm text-gray-900 flex-1 truncate select-all">
                                    {selectedPaymentMethod.accountName || "Store Official Account"}
                                  </span>
                                  {selectedPaymentMethod.accountName && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(selectedPaymentMethod.accountName || "");
                                        setCopiedField("name");
                                        setTimeout(() => setCopiedField(null), 2000);
                                      }}
                                      className="px-2.5 py-1.5 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-md transition-colors cursor-pointer shrink-0 flex items-center gap-1 text-[10px] font-mono font-bold"
                                      title="Copy Account Name"
                                    >
                                      {copiedField === "name" ? (
                                        <span className="text-emerald-600 font-bold uppercase">Copied!</span>
                                      ) : (
                                        <>
                                          <Copy className="w-3.5 h-3.5" />
                                          <span>Copy</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Account Number */}
                              <div className="space-y-1">
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 font-heading">
                                  Account / Mobile Number
                                </label>
                                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 p-2.5 rounded-lg">
                                  <span className="font-mono font-black text-sm sm:text-base text-gray-900 tracking-wider flex-1 truncate select-all">
                                    {selectedPaymentMethod.accountNumber || "—"}
                                  </span>
                                  {selectedPaymentMethod.accountNumber && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(selectedPaymentMethod.accountNumber || "");
                                        setCopiedField("number");
                                        setTimeout(() => setCopiedField(null), 2000);
                                      }}
                                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-md transition-colors cursor-pointer shrink-0 flex items-center gap-1 text-[10px] font-mono font-bold"
                                      title="Copy Account Number"
                                    >
                                      {copiedField === "number" ? (
                                        <span className="text-emerald-400 font-bold uppercase">Copied!</span>
                                      ) : (
                                        <>
                                          <Copy className="w-3.5 h-3.5" />
                                          <span>Copy</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Crypto Block */}
                          {isCrypto && (
                            <div className="space-y-2">
                              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-heading">
                                Wallet Deposit Address
                              </label>
                              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 p-2.5 rounded-lg">
                                <span className="font-mono text-xs text-gray-700 break-all select-all flex-1">
                                  {selectedPaymentMethod.walletAddress || "No wallet address specified"}
                                </span>
                                {selectedPaymentMethod.walletAddress && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(selectedPaymentMethod.walletAddress || "");
                                      setCopiedText(true);
                                      setTimeout(() => setCopiedText(false), 2000);
                                    }}
                                    className="p-2 bg-white hover:bg-gray-100 border border-gray-200 text-gray-600 rounded-md transition-colors cursor-pointer shrink-0"
                                    title="Copy address"
                                  >
                                    {copiedText ? (
                                      <span className="text-[10px] font-bold text-emerald-600 uppercase">Copied!</span>
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Maya Hosted Checkout */}
                          {isApi && (
                            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-none space-y-3">
                              <div className="space-y-1">
                                <p className="text-xs text-blue-950 font-heading font-black uppercase tracking-wide">
                                  Maya Checkout is ready
                                </p>
                                <p className="text-[11px] text-blue-700 font-mono leading-relaxed">
                                  Continue to Maya's secure hosted payment page. The final payment status is confirmed from Maya's server-to-server webhook.
                                </p>
                              </div>

                              {mayaCheckoutError && (
                                <div className="text-[10px] font-mono text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                                  {mayaCheckoutError}
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={handleStartMayaCheckout}
                                disabled={isStartingMayaCheckout || Number(completedOrder?.payableNow ?? currentPayableNow ?? 0) <= 0}
                                className="w-full px-3.5 py-3 bg-slate-900 hover:bg-black text-white rounded-none text-xs font-heading font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                              >
                                {isStartingMayaCheckout ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Opening Maya Checkout...</span>
                                  </>
                                ) : (
                                  <>
                                    <ExternalLink className="w-4 h-4" />
                                    <span>Continue to Maya Checkout</span>
                                  </>
                                )}
                              </button>

                              <p className="text-[9px] text-blue-600 font-mono text-center">
                                PRIME will mark the order paid only after the Maya webhook is received and validated.
                              </p>
                            </div>
                          )}
                          {!isApi && (
                          <div className="space-y-3">
                          <div className="border-t border-gray-100 pt-4 space-y-3">
                            <input
                              type="file"
                              accept="image/*"
                              ref={proofInputRef}
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (file.size > 10 * 1024 * 1024) {
                                    alert(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 10MB limit per image.`);
                                    return;
                                  }
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    const b64 = reader.result as string;
                                    setUploadedProofImage(b64);
                                    setOcrAnalysis(null);
                                    analyzeReceiptImage(b64);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                            
                            {!uploadedProofImage ? (
                              <button
                                type="button"
                                onClick={() => proofInputRef.current?.click()}
                                className="w-full px-3.5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-95 flex items-center justify-center gap-2"
                              >
                                <Scan className="w-4 h-4" />
                                <span>Attach & Scan Payment Proof</span>
                              </button>
                            ) : (
                              <div className="space-y-3 animate-in fade-in duration-200">
                                {/* Image Action Row */}
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setIsPreviewProofOpen(true)}
                                    className="flex-1 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-heading font-bold uppercase tracking-wider text-xs rounded-lg transition-all cursor-pointer shadow-2xs flex justify-center items-center gap-1.5 active:scale-95"
                                  >
                                    <Receipt className="w-3.5 h-3.5" />
                                    <span>PREVIEW</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (uploadedProofImage) {
                                        analyzeReceiptImage(uploadedProofImage);
                                      }
                                    }}
                                    disabled={isAnalyzingReceipt}
                                    className="flex-1 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-heading font-bold uppercase tracking-wider text-xs rounded-lg transition-all cursor-pointer shadow-2xs flex justify-center items-center gap-1.5 active:scale-95 disabled:opacity-50"
                                    title="Re-scan receipt hashes and normalized pixel sample"
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzingReceipt ? "animate-spin text-slate-900" : ""}`} />
                                    <span>RE-SCAN</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => proofInputRef.current?.click()}
                                    disabled={isAnalyzingReceipt || isSubmittingProof}
                                    className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-heading font-bold uppercase tracking-wider text-xs rounded-lg transition-all cursor-pointer shadow-2xs flex justify-center items-center active:scale-95"
                                  >
                                    <span>REPLACE</span>
                                  </button>
                                </div>

                                {/* Live receipt forensics state */}
                                {isAnalyzingReceipt && (
                                  <div className="p-3.5 bg-slate-900 text-white rounded-none border border-slate-800 space-y-2 animate-in fade-in duration-200">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <div className="prime-receipt-scan" aria-hidden="true">
                                          <Receipt className="prime-receipt-scan__icon" />
                                          <span className="prime-receipt-scan__line" />
                                        </div>
                                        <span className="text-[11px] font-heading font-bold uppercase tracking-wider text-slate-200">
                                          Automated Forensics Analysis
                                        </span>
                                      </div>
                                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800 animate-pulse">
                                        ANALYZING...
                                      </span>
                                    </div>
                                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                      <div className="bg-emerald-400 h-full w-2/3 animate-[pulse_1s_ease-in-out_infinite]" />
                                    </div>
                                    <p className="text-[10px] font-mono text-slate-400">
                                      Automated Image Forensics Analysis is in progress. Do not minimize or close this page. Please wait patiently as this could take up to 30 seconds.
                                    </p>
                                  </div>
                                )}

                                {/* Analysis-complete prompt */}
                                {ocrAnalysis && !isAnalyzingReceipt && (
                                  <div className="p-3.5 rounded-none border border-emerald-200 bg-emerald-50/80 space-y-2 animate-in fade-in zoom-in-98 duration-200 text-left">
                                    <div className="flex items-center gap-1.5 border-b border-emerald-200/80 pb-2">
                                      <FileCheck className="w-4 h-4 text-emerald-700" />
                                      <span className="text-[11px] font-heading font-black uppercase tracking-wider text-emerald-950">Analysis Completed</span>
                                    </div>
                                    <p className="text-xs font-mono text-emerald-950">The receipt file hash and normalized pixel sample are recorded. Secure upload will compare for exact image reuse and replacement against prior evidence.</p>
                                    <p className="text-[10px] font-mono text-amber-900">This analysis cannot prove a receipt is authentic or detect every edit. Staff will verify the payment manually; the scan never marks an order Paid.</p>
                                    {ocrError && <p className="text-xs text-red-700">{ocrError}</p>}
                                  </div>
                                )}
                                {ocrError && !ocrAnalysis && !isAnalyzingReceipt && <p className="p-2 text-xs text-red-700 bg-red-50 border border-red-200">{ocrError}</p>}
                                
                                <button
                                  type="button"
                                  disabled={isSubmittingProof || isAnalyzingReceipt || !ocrAnalysis || !selectedPaymentMethod?.id}
                                  onClick={async () => {
                                    try {
                                      setIsSubmittingProof(true);
                                      if (hasTelegramServerlessBridge()) {
                                        await uploadPaymentReceiptDataUrl(
                                          uploadedProofImage,
                                          String(completedOrder.id || ""),
                                          String(selectedPaymentMethod.id),
                                          false,
                                          ocrAnalysis,
                                        );
                                      } else {
                                        const response = await authenticatedFetch("/api/orders", {
                                          method: "PUT",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            orderId: completedOrder.id || completedOrder.orderNumber,
                                            paymentMethodId: selectedPaymentMethod.id,
                                            paymentMethodName: selectedPaymentMethod.name,
                                            paymentProofImage: uploadedProofImage,
                                            ocrAnalysis,
                                          }),
                                        });
                                        if (!response.ok) {
                                          const result = await response.json().catch(() => ({}));
                                          throw new Error(result.error || "Failed to submit payment proof.");
                                        }
                                      }
                                      setProofSubmitSuccess(true);
                                    } catch (e) {
                                      console.error(e);
                                      alert(e instanceof Error ? e.message : "Submission failed. Please try again.");
                                    } finally {
                                      setIsSubmittingProof(false);
                                    }
                                  }}
                                  className="w-full px-3.5 py-2.5 bg-slate-900 hover:bg-black text-white font-heading font-bold uppercase tracking-wider text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                                >
                                  {isSubmittingProof ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                      <span>Uploading for Forensics &amp; Manual Review...</span>
                                    </>
                                  ) : (
                                      <span>Submit Receipt</span>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                          </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            </div>
          )}

        </div>

        {/* Modal Bottom Action Bar */}
        {currentStep < 5 && (
          <div className="prime-checkout__actions border-t border-gray-100 bg-white px-3.5 py-2.5 flex items-center justify-between gap-3">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                className="bg-slate-900 hover:bg-black text-white font-heading font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            {currentStep === 1 && (
              <button
                type="button"
                onClick={handleNextFromStep1}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer shadow-xs"
              >
                <span>Continue</span>
              </button>
            )}

            {currentStep === 2 && (
              <button
                type="button"
                onClick={handleNextFromStep2}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer shadow-xs"
              >
                <span>Continue</span>
              </button>
            )}

            {currentStep === 3 && (
              <button
                type="button"
                onClick={handleNextFromStep3}
                disabled={!selectedCourier || !deliveryPaymentMethod}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Continue</span>
              </button>
            )}

            {currentStep === 4 && (
              <div className="prime-checkout__confirm flex flex-col sm:flex-row items-end sm:items-center gap-2">
                {submitError && (
                  <span className="text-xs font-mono text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg max-w-xs truncate">
                    {submitError}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSubmitOrder}
                  disabled={isSubmittingOrder || isLoadingCharges || Boolean(chargesLoadError)}
                  className="prime-checkout__submit px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingOrder ? (
                    <span>Submitting...</span>
                  ) : (
                    <span>Submit Order</span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Upload Proof Preview Modal */}
      {isPreviewProofOpen && uploadedProofImage && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-2.5 bg-black/95 backdrop-blur-md animate-in fade-in duration-200">
          <button 
            onClick={() => setIsPreviewProofOpen(false)} 
            className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img 
            src={uploadedProofImage} 
            alt="Payment Proof Preview" 
            className="max-w-full max-h-[85vh] object-contain rounded-none shadow-lg"
          />
        </div>
      )}

      {/* Success Submission Animated Modal */}
      {proofSubmitSuccess && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-2.5 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-lg text-center space-y-2.5 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="font-heading font-black text-xl uppercase tracking-widest text-slate-900">
              Submitted
            </h3>
            <p className="text-xs font-mono text-slate-600 leading-relaxed">
              Your payment proof has been submitted and will undergo verification. 
              You can monitor the status of your order in <strong className="text-black">MY ORDERS</strong>. 
              You will receive a notification via Telegram chat as your order progresses.
            </p>
            <button
              type="button"
              onClick={() => {
                setProofSubmitSuccess(false);
                onClose();
              }}
              className="mt-4 w-full px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs"
            >
              Got it, thanks!
            </button>
          </div>
        </div>
      )}

      {/* Enlarged Payment QR Code Pop-up Modal */}
      {isPaymentQrModalOpen && zoomedPaymentMethod && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-2.5 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full shadow-lg space-y-2.5 text-center animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-left">
                <QrCode className="w-5 h-5 text-black shrink-0" />
                <div>
                  <h3 className="font-heading font-black text-sm uppercase tracking-wider text-slate-900">
                    Payment QR Code
                  </h3>
                  <p className="text-[10px] font-mono text-slate-500">
                    Scan or download to make payment
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPaymentQrModalOpen(false);
                  setZoomedPaymentMethod(null);
                }}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-mono font-bold cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-none flex flex-col items-center justify-center space-y-3">
              {(zoomedPaymentMethod.qrCodeImage || zoomedPaymentMethod.qrCode || zoomedPaymentMethod.qrImage || zoomedPaymentMethod.qr_code_image) ? (
                <div className="p-3 bg-white rounded-none shadow-xs border border-slate-200">
                  <TelegramMediaImage
                    src={zoomedPaymentMethod.qrCodeImage || zoomedPaymentMethod.qrCode || zoomedPaymentMethod.qrImage || zoomedPaymentMethod.qr_code_image}
                    alt={`${zoomedPaymentMethod.name} QR Code`}
                    className="w-48 h-48 object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="w-48 h-48 bg-white border border-slate-200 rounded-none flex items-center justify-center text-slate-400 font-mono text-xs">
                  No QR image uploaded
                </div>
              )}

              <div>
                <span className="font-heading font-black text-lg text-slate-900 tracking-tight block">
                  {zoomedPaymentMethod.name}
                </span>
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block mt-0.5">
                  {zoomedPaymentMethod.accountNumber ? `Account: ${zoomedPaymentMethod.accountNumber}` : "Static QR Code"}
                </span>
              </div>
            </div>

            {zoomedPaymentMethod.accountName && (
              <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-none text-left text-[11px] font-mono text-gray-700">
                <div className="font-bold text-gray-400 uppercase text-[9px] tracking-wider">Account Name</div>
                <div className="font-bold uppercase text-slate-800 mt-0.5">{zoomedPaymentMethod.accountName}</div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              {(zoomedPaymentMethod.qrCodeImage || zoomedPaymentMethod.qrCode || zoomedPaymentMethod.qrImage || zoomedPaymentMethod.qr_code_image) && (
                <button
                  type="button"
                  onClick={() => {
                    const url = zoomedPaymentMethod.qrCodeImage || zoomedPaymentMethod.qrCode || zoomedPaymentMethod.qrImage || zoomedPaymentMethod.qr_code_image;
                    const filename = `PRIME_QR_${zoomedPaymentMethod.name.replace(/\\s+/g, "_")}.png`;
                    const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
                    const link = document.createElement("a");
                    link.href = proxyUrl;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}

                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-none text-xs font-bold uppercase tracking-wider font-mono transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsPaymentQrModalOpen(false);
                  setZoomedPaymentMethod(null);
                }}
                className="flex-1 px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
