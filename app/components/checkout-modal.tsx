"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { 
  X, 
  ArrowLeft, 
  ArrowRight, 
  Check, 
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
  Clock, 
  Sparkles,
  ShoppingBag
} from "lucide-react";
import { formatPHP } from "@/lib/currency";
import { calculateChargesBreakdown, type ComputedCharge } from "@/lib/charges";
import { getClientFingerprint, getClientLocation } from "./fingerprint-collector";

// Dynamic map import to ensure zero SSR conflicts
const AddressPickerMap = dynamic(() => import("./address-picker-map"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-44 sm:h-48 md:h-52 rounded-xl bg-gray-100 flex flex-col items-center justify-center text-gray-400 font-mono text-xs gap-2 border border-gray-200">
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

// Auto-format phone to 0919 1234 8765
export function formatPhoneNumber(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
}

export default function CheckoutModal({
  isOpen,
  onClose,
  selectedItems = [],
  onOrderSuccess,
}: CheckoutModalProps) {
  // Step state: 1 = Contact & Receiver, 2 = Address & Map, 3 = Courier & Delivery Fee, 4 = Review & Place Order, 5 = Confirmation
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Telegram Identity State
  const [tgCustomer, setTgCustomer] = useState<{
    id: string;
    name: string;
    username: string;
    primeMemberId: string;
    contactNumber: string;
  }>({
    id: "",
    name: "",
    username: "",
    primeMemberId: "",
    contactNumber: "",
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

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
  const [hasSelectedAddress, setHasSelectedAddress] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [addressError, setAddressError] = useState("");
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Step 3: Couriers & Delivery Pricing State
  const [availableCouriers, setAvailableCouriers] = useState<any[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState<string>("");
  const [calculatedDistance, setCalculatedDistance] = useState<number>(0);
  const [isLoadingCouriers, setIsLoadingCouriers] = useState<boolean>(false);
  const [courierFetchError, setCourierFetchError] = useState<string>("");
  const [deliveryPaymentMethod, setDeliveryPaymentMethod] = useState<"upon_checkout" | "upon_delivery">("upon_checkout");

  // Step 4: Admin Charges State
  const [activeCharges, setActiveCharges] = useState<any[]>([]);
  const [isLoadingCharges, setIsLoadingCharges] = useState<boolean>(false);
  const [customerNotes, setCustomerNotes] = useState<string>("");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>("");
  const [completedOrder, setCompletedOrder] = useState<any>(null);

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
      });

      // Synchronize directly with Firestore customer record to guarantee primeMemberId hydration
      if (resolvedId) {
        setIsLoadingProfile(true);
        fetch(`/api/admin/customers?id=${encodeURIComponent(resolvedId)}`)
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

              if (!receiverName && realName) {
                setReceiverName(realName.toUpperCase());
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

      // Pre-fill receiver if empty
      if (!receiverName && resolvedName && resolvedName !== "Customer") {
        setReceiverName(resolvedName.toUpperCase());
      }
      if (!receiverPhone && resolvedPhone) {
        setReceiverPhone(formatPhoneNumber(resolvedPhone));
      }
    }
  }, [isOpen]);

  // Fetch admin configured charges with fresh no-cache fetch
  useEffect(() => {
    if (!isOpen) return;
    const fetchCharges = async () => {
      try {
        setIsLoadingCharges(true);
        const res = await fetch(`/api/admin/charges?_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Pragma": "no-cache" }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setActiveCharges(data);
          }
        }
      } catch (e) {
        console.warn("Could not fetch active charges", e);
      } finally {
        setIsLoadingCharges(false);
      }
    };
    fetchCharges();
  }, [isOpen]);

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
        const res = await fetch(`/api/geoapify/autocomplete?text=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setAddressSuggestions(data.results || []);
        }
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
      const res = await fetch(`/api/geoapify/reverse?lat=${lat}&lon=${lon}`);
      if (res.ok) {
        const data = await res.json();
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
    reverseGeocode(lat, lon);
    fetchCouriersForLocation(lat, lon);
  };

  // "Use My Location" GPS Feature
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setAddressError("Geolocation is not supported by your device or browser.");
      return;
    }
    setIsLocating(true);
    setAddressError("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setCoords({ lat, lon });
        setHasSelectedAddress(true);
        reverseGeocode(lat, lon);
        fetchCouriersForLocation(lat, lon);
      },
      (err) => {
        setIsLocating(false);
        setAddressError("Unable to retrieve GPS location. Please allow location access or type your address.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Fetch Couriers & Rates when destination is selected
  const fetchCouriersForLocation = async (lat: number, lon: number) => {
    try {
      setIsLoadingCouriers(true);
      setCourierFetchError("");

      const res = await fetch("/api/checkout/delivery-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationLat: lat, destinationLon: lon }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to calculate courier rates");
      }

      const data = await res.json();
      setCalculatedDistance(data.distanceKm || 0);

      const couriersList = Array.isArray(data.couriers) && data.couriers.length > 0
        ? data.couriers
        : data.courier ? [data.courier] : [];

      setAvailableCouriers(couriersList);

      // Default select first courier if none selected
      if (couriersList.length > 0 && !selectedCourierId) {
        setSelectedCourierId(couriersList[0].id);
      }
    } catch (err: any) {
      console.error("Courier pricing error:", err);
      setCourierFetchError(err.message || "Failed to calculate delivery fee.");
    } finally {
      setIsLoadingCouriers(false);
    }
  };

  // Current selected courier object
  const selectedCourier = useMemo(() => {
    return availableCouriers.find((c) => c.id === selectedCourierId) || availableCouriers[0] || null;
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

  // Payable calculations based on user's choice: upon_checkout vs upon_delivery
  const payableNow = useMemo(() => {
    const base = itemsSubtotal + totalChargesAmount;
    if (deliveryPaymentMethod === "upon_checkout") {
      return base + courierDeliveryFee;
    }
    return base;
  }, [itemsSubtotal, totalChargesAmount, courierDeliveryFee, deliveryPaymentMethod]);

  const payableOnDelivery = useMemo(() => {
    if (deliveryPaymentMethod === "upon_delivery") {
      return courierDeliveryFee;
    }
    return 0;
  }, [deliveryPaymentMethod, courierDeliveryFee]);

  const overallOrderValue = useMemo(() => {
    return itemsSubtotal + totalChargesAmount + courierDeliveryFee;
  }, [itemsSubtotal, totalChargesAmount, courierDeliveryFee]);

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
      setReceiverError("Please enter a valid 11-digit phone number (e.g. 0919 1234 8765).");
      return;
    }
    setCurrentStep(2);
  };

  const handleNextFromStep2 = () => {
    setAddressError("");
    if (!selectedAddress || !hasSelectedAddress) {
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
    if (!selectedCourier) {
      setCourierFetchError("Please select a courier to continue.");
      return;
    }
    setCurrentStep(4);
  };

  // Submit Order to API
  const handleSubmitOrder = async () => {
    try {
      setIsSubmittingOrder(true);
      setSubmitError("");

      const fpData = await getClientFingerprint();
      const locData = await getClientLocation();

      const orderData = {
        items: selectedItems.map((it) => ({
          id: it.id,
          name: it.name,
          price: Number(it.price) || 0,
          quantity: Number(it.quantity) || 1,
          imageUrl: it.imageUrl || "",
        })),
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
        deliveryFeePaymentMethod: deliveryPaymentMethod,
        receiverName: receiverName.trim().toUpperCase(),
        receiverPhone: receiverPhone.trim(),
        deliveryAddress: {
          formatted: selectedAddress,
          lat: coords.lat,
          lon: coords.lon,
          unitDetails: unitDetails.trim(),
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
        notes: customerNotes.trim() || `Delivery for ${receiverName.trim().toUpperCase()}`,
        deviceSnapshot: {
          ...fpData,
          location: locData,
        },
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to submit order.");
      }

      const orderResult = await res.json();
      setCompletedOrder(orderResult);
      setCurrentStep(5);
      onOrderSuccess(orderResult);

    } catch (err: any) {
      console.error("Order submission failed:", err);
      setSubmitError(err.message || "Order submission failed. Please try again.");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header with Step Tracker */}
        <div className="border-b border-gray-100 bg-white px-5 py-4 sticky top-0 z-30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {currentStep > 1 && currentStep < 5 && (
              <button
                onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
                title="Go back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              {currentStep < 5 && (
                <div className="text-xs text-gray-500 font-mono">
                  {Math.min(currentStep, 4)}/4
                </div>
              )}
              <h2 className="text-lg font-heading font-bold text-gray-900 tracking-wide uppercase mt-0.5">
                {currentStep === 1 && "Identity & Receiver Info"}
                {currentStep === 2 && "Delivery Address & Pin"}
                {currentStep === 3 && "Courier & Delivery Option"}
                {currentStep === 4 && "Order Breakdown & Confirm"}
                {currentStep === 5 && "Order Confirmed!"}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
            aria-label="Close Checkout"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        {currentStep < 5 && (
          <div className="w-full bg-gray-100 h-1">
            <div
              className="bg-black h-1 transition-all duration-300 ease-out"
              style={{ width: `${(currentStep / 4) * 100}%` }}
            />
          </div>
        )}

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">

          {/* ================= STEP 1: IDENTITY & RECEIVER ================= */}
          {currentStep === 1 && (
            <div className="space-y-3">
              {receiverError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs font-mono text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{receiverError}</span>
                </div>
              )}

              <div className="p-3.5 sm:p-4 rounded-xl border border-gray-200 bg-gray-50/70">
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  {/* Telegram Name (Left) */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                      Telegram Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={receiverName}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setReceiverName(val);
                        setTgCustomer(prev => ({ ...prev, name: val }));
                      }}
                      placeholder="JUAN DELA CRUZ"
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-mono uppercase text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black"
                      required
                    />
                  </div>

                  {/* Telegram Handle (Right) */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                      Telegram Handle
                    </label>
                    <input
                      type="text"
                      value={tgCustomer.username ? (tgCustomer.username.startsWith('@') ? tgCustomer.username : `@${tgCustomer.username}`) : ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/^@/, '');
                        setTgCustomer(prev => ({ ...prev, username: val }));
                      }}
                      placeholder="@username"
                      className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black"
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
                      value={tgCustomer.primeMemberId || (isLoadingProfile ? "Loading..." : "PRM-MEMBER")}
                      className="w-full px-3 py-2 bg-gray-100/90 border border-gray-300 rounded-lg text-xs font-mono font-bold text-amber-800 cursor-default select-none focus:outline-none"
                    />
                  </div>

                  {/* Phone Number (Right) */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                      Phone Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={receiverPhone}
                      onChange={(e) => setReceiverPhone(formatPhoneNumber(e.target.value))}
                      placeholder="0919 1234 8765"
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
            <div className="space-y-3.5">
              <div className="border-b border-gray-100 pb-1.5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 font-heading">
                  Delivery Destination & Location <span className="text-red-500">*</span>
                </h3>
                <p className="text-xs text-gray-500 font-mono">
                  Search address or pinpoint your exact gate/drop-off point on the map
                </p>
              </div>

              {addressError && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs font-mono text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{addressError}</span>
                </div>
              )}

              {/* Address Search with Geoapify Autocomplete */}
              <div className="space-y-1 relative z-50">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                  Search Street Address / Landmark <span className="text-red-500">*</span>
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
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl z-[100] max-h-56 overflow-y-auto divide-y divide-gray-100">
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

              {/* Rectangular Map Container with Zoom, Drag, Use My Location, & Drop Pin */}
              <div className="space-y-1 relative z-0">
                <AddressPickerMap
                  lat={coords.lat}
                  lon={coords.lon}
                  onLocationChange={handleLocationChange}
                  onUseMyLocation={handleUseMyLocation}
                  isLocating={isLocating}
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
                    <p className="text-xs font-mono text-gray-900 break-words mt-0.5 font-medium">
                      {selectedAddress}
                    </p>
                  </div>
                </div>
              )}

              {/* Additional Information: Unit No, Floor No, Apartment No, Company Name */}
              <div className="space-y-1 pt-0.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                  Unit No., Floor No., Apartment, Company Name, Landmarks
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Building className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={unitDetails}
                    onChange={(e) => setUnitDetails(e.target.value)}
                    placeholder="e.g. Unit 402, 4th Floor, Tower B / Near 7-Eleven gate"
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black transition-all"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 3: COURIER & DELIVERY PAYMENT ================= */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="border-b border-gray-100 pb-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 font-heading">
                  Choose Courier & Delivery Fee Option <span className="text-red-500">*</span>
                </h3>
                <p className="text-xs text-gray-500 font-mono">
                  Real-time calculated rates based on {calculatedDistance > 0 ? `${calculatedDistance} km` : "driving route"}
                </p>
              </div>

              {courierFetchError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-mono text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{courierFetchError}</span>
                </div>
              )}

              {/* Courier Tiles Grid */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 font-heading">
                  Available Couriers
                </label>

                {isLoadingCouriers ? (
                  <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200 flex flex-col items-center justify-center gap-2 text-xs font-mono text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin text-black" />
                    <span>Calculating real-time rates with Geoapify routing...</span>
                  </div>
                ) : availableCouriers.length === 0 ? (
                  <div className="p-6 text-center bg-amber-50 rounded-xl border border-amber-200 text-xs font-mono text-amber-800">
                    No couriers currently available for this route. Please re-adjust address or contact support.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {availableCouriers.map((courier) => {
                      const isSelected = selectedCourierId === courier.id || availableCouriers.length === 1;
                      return (
                        <div
                          key={courier.id}
                          onClick={() => setSelectedCourierId(courier.id)}
                          className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? "border-black bg-black/5 shadow-sm"
                              : "border-gray-200 bg-white hover:border-gray-300"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {courier.logo ? (
                              <img
                                src={courier.logo}
                                alt={courier.name}
                                className="w-12 h-12 object-contain rounded-lg bg-white border border-gray-100 p-1 shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                                <Truck className="w-6 h-6" />
                              </div>
                            )}

                            <div>
                              <h4 className="text-sm font-heading font-bold text-gray-900 uppercase">
                                {courier.name}
                              </h4>
                              <p className="text-[11px] text-gray-500 font-mono">
                                {courier.type || "Express Delivery"}
                              </p>
                              <span className="text-[10px] text-gray-400 font-mono">
                                {calculatedDistance > 0 ? `${calculatedDistance} km` : "Standard Distance"}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-base font-heading font-bold text-gray-900 block">
                              {formatPHP(courier.calculatedFee || 0)}
                            </span>
                            <div className="mt-1 flex justify-end">
                              <div
                                className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                                  isSelected
                                    ? "bg-black border-black text-white"
                                    : "border-gray-300 bg-white"
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3" />}
                              </div>
                            </div>
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
                  <div className="border-b border-gray-100 pb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 font-heading">
                      Delivery Fee Payment Preference
                    </label>
                    <p className="text-[11px] text-gray-500 font-mono">
                      Choose when and how you want to settle the delivery fee
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Option 1: Upon Checkout */}
                    <div
                      onClick={() => setDeliveryPaymentMethod("upon_checkout")}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                        deliveryPaymentMethod === "upon_checkout"
                          ? "border-black bg-black/5"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase font-heading text-gray-900">
                          Pay Upon Checkout
                        </span>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            deliveryPaymentMethod === "upon_checkout"
                              ? "bg-black border-black text-white"
                              : "border-gray-300 bg-white"
                          }`}
                        >
                          {deliveryPaymentMethod === "upon_checkout" && <Check className="w-2.5 h-2.5" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-600 font-mono mb-2">
                        Added to your total order bill now. Settle everything at checkout.
                      </p>
                      <span className="text-xs font-mono font-bold text-gray-900">
                        +{formatPHP(courierDeliveryFee)} included in total
                      </span>
                    </div>

                    {/* Option 2: Upon Delivery */}
                    <div
                      onClick={() => setDeliveryPaymentMethod("upon_delivery")}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                        deliveryPaymentMethod === "upon_delivery"
                          ? "border-black bg-black/5"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase font-heading text-gray-900">
                          Pay Upon Delivery
                        </span>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            deliveryPaymentMethod === "upon_delivery"
                              ? "bg-black border-black text-white"
                              : "border-gray-300 bg-white"
                          }`}
                        >
                          {deliveryPaymentMethod === "upon_delivery" && <Check className="w-2.5 h-2.5" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-600 font-mono mb-2">
                        Pay cash directly to the courier rider when the package arrives.
                      </p>
                      <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-block">
                        To be paid upon delivery
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= STEP 4: ORDER BREAKDOWN & CONFIRM ================= */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="border-b border-gray-100 pb-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 font-heading">
                  Full Order Details & Complete Breakdown
                </h3>
                <p className="text-xs text-gray-500 font-mono">
                  Review all charges, delivery details, and items before placing order
                </p>
              </div>

              {submitError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-mono text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Items Recap */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 font-heading">
                  Selected Items ({selectedItems.length})
                </span>
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl bg-gray-50/50 p-2 max-h-48 overflow-y-auto">
                  {selectedItems.map((item) => (
                    <div key={item.id} className="p-2 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={item.imageUrl || "https://picsum.photos/seed/prime/100"}
                          alt={item.name}
                          className="w-10 h-10 object-cover rounded bg-white border border-gray-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-heading font-medium uppercase text-gray-900 truncate">
                            {item.name}
                          </p>
                          <p className="text-[11px] font-mono text-gray-500">
                            {item.quantity} × {formatPHP(item.price || 0)}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono font-semibold text-gray-900 shrink-0">
                        {formatPHP((item.price || 0) * (item.quantity || 1))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery & Receiver Summary */}
              <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-2 text-xs font-mono">
                <div className="flex justify-between items-start">
                  <span className="text-gray-500 uppercase text-[10px]">Receiver</span>
                  <span className="font-bold text-gray-900 text-right">
                    {receiverName} ({receiverPhone})
                  </span>
                </div>

                <div className="flex justify-between items-start pt-1 border-t border-gray-200">
                  <span className="text-gray-500 uppercase text-[10px]">Address</span>
                  <span className="font-medium text-gray-900 text-right max-w-xs break-words">
                    {selectedAddress}
                    {unitDetails && <span className="block text-gray-500 text-[11px]">{unitDetails}</span>}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-gray-200">
                  <span className="text-gray-500 uppercase text-[10px]">Courier</span>
                  <span className="font-bold text-gray-900">
                    {selectedCourier?.name} ({calculatedDistance} km)
                  </span>
                </div>
              </div>

              {/* Comprehensive Charges Breakdown */}
              <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 font-heading border-b border-gray-100 pb-2">
                  Financial Breakdown
                </h4>

                {/* Subtotal */}
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-gray-500 uppercase">Items Subtotal:</span>
                  <span className="font-semibold text-gray-900">{formatPHP(itemsSubtotal)}</span>
                </div>

                {/* Active Admin Charges */}
                {computedCharges.map((charge) => (
                  <div key={charge.id} className="flex justify-between items-center text-xs font-mono">
                    <span className="text-gray-600 uppercase flex items-center gap-1">
                      {charge.name}:
                      {charge.type === "percentage" && (
                        <span className="text-[10px] text-gray-400">({charge.rate || (charge as any).amount}%)</span>
                      )}
                    </span>
                    <span className="font-semibold text-gray-900">{formatPHP(charge.computedAmount)}</span>
                  </div>
                ))}

                {/* Courier Delivery Fee */}
                <div className="flex justify-between items-start text-xs font-mono pt-1 border-t border-gray-100">
                  <div>
                    <span className="text-gray-700 uppercase font-medium block">
                      Delivery Fee ({selectedCourier?.name || "Courier"}):
                    </span>
                    {deliveryPaymentMethod === "upon_delivery" && (
                      <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-block mt-0.5">
                        To be paid upon delivery
                      </span>
                    )}
                  </div>
                  <span className="font-semibold text-gray-900">
                    {formatPHP(courierDeliveryFee)}
                  </span>
                </div>

                {/* Total Amounts Section */}
                <div className="pt-3 border-t border-gray-200 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-heading font-bold uppercase tracking-wide text-gray-900 text-sm">
                      Total Payable Now:
                    </span>
                    <span className="font-heading font-bold text-2xl text-black">
                      {formatPHP(payableNow)}
                    </span>
                  </div>

                  {deliveryPaymentMethod === "upon_delivery" && (
                    <div className="flex justify-between items-center text-xs font-mono text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                      <span className="font-medium">To be paid to Courier upon delivery:</span>
                      <span className="font-bold">{formatPHP(courierDeliveryFee)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Optional Notes */}
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 font-heading">
                  Order / Rider Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  placeholder="Special instructions for packing, gate codes, landmarks, or contact preferences..."
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
            </div>
          )}

          {/* ================= STEP 5: ORDER CONFIRMATION ================= */}
          {currentStep === 5 && completedOrder && (
            <div className="py-6 px-2 text-center space-y-5">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-200">
                <Check className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl font-heading font-bold text-gray-900 uppercase tracking-wide">
                  Order Successfully Placed!
                </h3>
                <p className="text-xs text-gray-500 font-mono mt-1">
                  Thank you for shopping with PRIME Shop.
                </p>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 max-w-md mx-auto text-left font-mono text-xs space-y-3">
                <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                  <span className="text-gray-400 uppercase text-[10px]">Order Number</span>
                  <span className="font-bold text-sm text-black">{completedOrder.id || completedOrder.orderNumber}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-400 uppercase text-[10px]">Receiver</span>
                  <span className="font-medium text-gray-900">{completedOrder.receiverName}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-400 uppercase text-[10px]">Total Amount</span>
                  <span className="font-bold text-gray-900">{formatPHP(completedOrder.totalAmount || 0)}</span>
                </div>

                {completedOrder.payableOnDelivery > 0 && (
                  <div className="p-2 bg-amber-50 rounded border border-amber-200 text-amber-800 text-[11px]">
                    Note: <strong>{formatPHP(completedOrder.payableOnDelivery)}</strong> delivery fee is payable directly to your courier rider upon arrival.
                  </div>
                )}
              </div>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-8 py-3.5 bg-black hover:bg-gray-800 text-white font-bold font-heading uppercase tracking-widest text-xs rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
                >
                  Continue Shopping
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Modal Bottom Action Bar */}
        {currentStep < 5 && (
          <div className="border-t border-gray-100 bg-white px-5 py-4 flex items-center justify-between gap-3">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
                className="px-4 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 font-mono text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
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
                className="px-6 py-3 bg-black hover:bg-gray-800 text-white font-heading font-bold uppercase tracking-wider text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer"
              >
                <span>Continue to Address</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {currentStep === 2 && (
              <button
                type="button"
                onClick={handleNextFromStep2}
                className="px-6 py-3 bg-black hover:bg-gray-800 text-white font-heading font-bold uppercase tracking-wider text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer"
              >
                <span>Select Courier</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {currentStep === 3 && (
              <button
                type="button"
                onClick={handleNextFromStep3}
                disabled={!selectedCourier}
                className="px-6 py-3 bg-black hover:bg-gray-800 text-white font-heading font-bold uppercase tracking-wider text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Review Order</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            {currentStep === 4 && (
              <button
                type="button"
                onClick={handleSubmitOrder}
                disabled={isSubmittingOrder}
                className="px-8 py-3.5 bg-black hover:bg-gray-800 text-white font-heading font-bold uppercase tracking-widest text-xs rounded-xl flex items-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingOrder ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting Order...</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Place Order</span>
                    <Check className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
