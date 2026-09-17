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
  ShoppingBag,
  Copy,
  Download,
  QrCode,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  XCircle
} from "lucide-react";
import { formatPHP } from "@/lib/currency";
import { calculateChargesBreakdown, type ComputedCharge } from "@/lib/charges";
import { getClientFingerprint, getClientLocation, getOrCreateSessionToken } from "./fingerprint-collector";
import { validateAddressLocally, type AddressValidationResult } from "@/lib/address-validation";

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

// Auto-format phone to 0919 123 4567
export function formatPhoneNumber(val: string): string {
  const digits = val.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

// Convert courier name to Title Case nicely (e.g. LALAMOVE -> Lalamove)
export function formatCourierName(name: string): string {
  if (!name) return "";
  return name.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
  const [currentPaymentPage, setCurrentPaymentPage] = useState(0);
  const [isPaymentQrModalOpen, setIsPaymentQrModalOpen] = useState(false);
  const [zoomedPaymentMethod, setZoomedPaymentMethod] = useState<any>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const [isPreviewProofOpen, setIsPreviewProofOpen] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

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
  const [addressValidation, setAddressValidation] = useState<AddressValidationResult | null>(null);
  const [isValidatingAddress, setIsValidatingAddress] = useState<boolean>(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

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

  // Fetch active payment methods when step becomes 5 (order placed) or when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const fetchPaymentMethods = async () => {
      try {
        setIsLoadingPaymentMethods(true);
        const res = await fetch(`/api/admin/payments?_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Pragma": "no-cache" }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            // Only show active payment methods
            setPaymentMethods(data.filter((m: any) => m.isActive !== false));
          }
        }
      } catch (e) {
        console.warn("Could not fetch payment methods:", e);
      } finally {
        setIsLoadingPaymentMethods(false);
      }
    };
    fetchPaymentMethods();
  }, [isOpen]);

  // Reset payment states when closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedPaymentMethod(null);
      setUploadedProofImage("");
      setProofSubmitSuccess(false);
      setIsSubmittingProof(false);
      setCurrentPaymentPage(0);
      setIsPaymentQrModalOpen(false);
      setZoomedPaymentMethod(null);
    }
  }, [isOpen]);

  // Live real-time sync for order updates & courier tracking button when on Step 5
  useEffect(() => {
    if (currentStep !== 5 || !completedOrder) return;
    const orderId = completedOrder.id || completedOrder.orderNumber;
    if (!orderId) return;

    const syncInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders?_t=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          const orders = await res.json();
          if (Array.isArray(orders)) {
            const found = orders.find((o: any) => o.id === orderId || o.orderNumber === orderId);
            if (found) {
              setCompletedOrder((prev: any) => ({ ...prev, ...found }));
            }
          }
        }
      } catch (err) {
        // silent background sync error
      }
    }, 3500);

    return () => clearInterval(syncInterval);
  }, [currentStep, completedOrder?.id, completedOrder?.orderNumber]);

  // Perform full address validation (local logic + online Geoapify verification)
  const performAddressValidation = async (targetAddr: string, unit: string, currentCoords: { lat: number; lon: number }) => {
    setIsValidatingAddress(true);
    const localResult = validateAddressLocally(targetAddr, unit, currentCoords);
    setAddressValidation(localResult);

    if (localResult.isValid && targetAddr && targetAddr.trim().length >= 5) {
      try {
        const res = await fetch("/api/geoapify/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: targetAddr,
            unitDetails: unit,
            lat: currentCoords.lat,
            lon: currentCoords.lon,
          }),
        });
        if (res.ok) {
          const apiData = await res.json();
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
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
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
      const locData = await getClientLocation(1500);

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
        deliveryFeePaymentMethod: deliveryPaymentMethod,
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
        notes: customerNotes.trim() || "Non",
        deviceId: fpData.deviceId,
        sessionToken: fpData.sessionToken || getOrCreateSessionToken(fpData.deviceId, tgCustomer.id),
        coordinates: coords.lat && coords.lon ? `${coords.lat}, ${coords.lon}` : (locData.lat && locData.lon ? `${locData.lat}, ${locData.lon}` : ""),
        deviceSnapshot: {
          ...fpData,
          deviceId: fpData.deviceId,
          sessionToken: fpData.sessionToken || getOrCreateSessionToken(fpData.deviceId, tgCustomer.id),
          location: {
            ...locData,
            lat: coords.lat || locData.lat,
            lon: coords.lon || locData.lon,
            latitude: coords.lat || locData.lat,
            longitude: coords.lon || locData.lon,
          },
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
      setSubmitError(err.message || "Order submission failed. Please try again.");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
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
                {currentStep === 5 && "Order Submitted - Awaiting Payment"}
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
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">

          {/* ================= STEP 1: IDENTITY & RECEIVER ================= */}
          {currentStep === 1 && (
            <div className="space-y-4">
              {receiverError && (
                <div className="text-xs font-mono text-red-600 flex items-center gap-1.5 py-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{receiverError}</span>
                </div>
              )}

              {/* Telegram Identity (Read-Only) */}
              <div className="p-3.5 sm:p-4 rounded-xl border border-gray-200 bg-gray-50/70">
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
                      className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-xs font-mono font-bold text-amber-800 cursor-default focus:outline-none"
                    />
                  </div>

                  {/* Linked Phone Number (Right) */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-700 font-heading">
                      Linked Phone No.
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={tgCustomer.contactNumber ? formatPhoneNumber(tgCustomer.contactNumber) : "No Phone No. Linked"}
                      className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-xs font-mono text-gray-700 cursor-default focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Receiver Information (Editable) */}
              <div className="p-3.5 sm:p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
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
            <div className="space-y-3.5">
              <div className="border-b border-gray-100 pb-2">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900 font-heading">
                  Delivery Destination & Location
                </h3>
                <p className="text-xs text-gray-500 font-mono">
                  Search address or pinpoint your exact gate/drop-off point on the map
                </p>
              </div>

              {addressError && (
                <div className="text-xs font-mono text-red-600 flex items-center gap-1.5 py-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{addressError}</span>
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

              {/* Real-Time Address Validation Status Banner Removed */}
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
                  <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200 flex flex-col items-center justify-center gap-2 text-xs font-mono text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin text-black" />
                    <span>Calculating real-time rates with Geoapify routing...</span>
                  </div>
                ) : availableCouriers.length === 0 ? (
                  <div className="p-6 text-center bg-amber-50 rounded-xl border border-amber-200 text-xs font-mono text-amber-800">
                    No couriers currently available for this route. Please re-adjust address or contact support.
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {availableCouriers.map((courier) => {
                      const isSelected = selectedCourierId === courier.id || availableCouriers.length === 1;
                      return (
                        <div key={courier.id} className="flex flex-col items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedCourierId(courier.id)}
                            className={`w-full aspect-video rounded-xl border-2 transition-all flex flex-col items-center justify-center p-0.5 relative overflow-hidden ${
                              isSelected
                                ? "border-slate-900 shadow-sm ring-1 ring-slate-900"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                          >
                            {courier.logo ? (
                              <img
                                src={courier.logo}
                                alt={courier.name}
                                className={`w-full h-full object-cover rounded-[10px]`}
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <Truck className={`w-8 h-8 ${isSelected ? 'text-gray-400' : 'text-gray-300 opacity-30'}`} />
                            )}
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="font-heading font-black text-gray-900 text-[11px] sm:text-sm drop-shadow-md bg-white/70 px-1 rounded-sm">
                                {formatPHP(courier.calculatedFee || 0)}
                              </span>
                            </div>
                            {isSelected && (
                              <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-black rounded-full flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-white" />
                              </div>
                            )}
                          </button>
                          <span className="text-[9px] sm:text-[10px] font-heading font-bold text-gray-900 truncate w-full text-center leading-tight">
                            {formatCourierName(courier.name)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Delivery Fee Payment Option: Upon Checkout vs Upon Delivery */}
              {selectedCourier && (
                <div className="space-y-3 pt-2">
                  
                  <div className="border-b border-slate-100 pb-3 mb-4">
                    <p className="text-xs text-slate-700 font-mono leading-relaxed">
                      You have chosen <span className="font-bold text-slate-900">{selectedCourier?.name}</span> to handle your delivery from PRIME Network Distribution &amp; Fulfillment Center with a corresponding charge of <span className="font-bold text-slate-900">{formatPHP(courierDeliveryFee)}</span>. How would you like to pay for the charge?
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => setDeliveryPaymentMethod("upon_checkout")}
                      className={`flex-1 px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs text-center border ${
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
                      className={`flex-1 px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs text-center border ${
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
                <div className="text-xs font-mono text-red-600 flex items-center gap-1.5 py-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Items Recap */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 font-heading">
                  Selected Items ({selectedItems.length})
                </span>
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl bg-gray-50/50 p-2 max-h-48 overflow-y-auto">
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
                            <div className="flex items-center gap-1.5">
                              <p className="font-heading font-medium uppercase text-gray-900 truncate">
                                {item.name}
                              </p>
                              {isFreeItem && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                                  FREE
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-mono text-gray-500">
                              {item.quantity} × {isFreeItem ? <span className="text-emerald-600 font-bold">FREE</span> : formatPHP(item.price || 0)}
                            </p>
                          </div>
                        </div>
                        <span className={`font-mono font-semibold shrink-0 ${isFreeItem ? "text-emerald-600 font-bold" : "text-gray-900"}`}>
                          {isFreeItem ? "FREE" : formatPHP((item.price || 0) * (item.quantity || 1))}
                        </span>
                      </div>
                    );
                  })}
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
                  <span className="text-gray-500 uppercase text-[10px] flex items-center gap-1">
                    <span>Address</span>
                  </span>
                  <span className="font-medium text-gray-900 text-right max-w-xs break-words">
                    {selectedAddress}
                    <span className="block text-gray-500 text-[11px]">Unit/Landmark: {unitDetails.trim() || "Non"}</span>
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
              <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-1.5">
                <h4 className="text-xs font-bold tracking-wider text-gray-900 font-heading border-b border-gray-100 pb-2">
                  Breakdown of charges
                </h4>

                {/* Subtotal */}
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-gray-600 font-medium">Items Subtotal:</span>
                  <span className="font-semibold text-gray-900 font-ibm-condensed">{formatPHP(itemsSubtotal)}</span>
                </div>

                {/* Active Admin Charges */}
                {computedCharges.map((charge) => (
                  <div key={charge.id} className="flex justify-between items-center text-xs font-mono">
                    <span className="text-gray-600 flex items-center gap-1">
                      {charge.name}:
                      {charge.type === "percentage" && (
                        <span className="text-[10px] text-gray-400">({charge.rate || (charge as any).amount}%)</span>
                      )}
                    </span>
                    <span className="font-semibold text-gray-900 font-ibm-condensed">{formatPHP(charge.computedAmount)}</span>
                  </div>
                ))}

                {/* Courier Delivery Fee */}
                <div className="flex justify-between items-start text-xs font-mono pt-1 border-t border-gray-100">
                  <div>
                    <span className="text-gray-700 font-medium block">
                      Delivery Fee ({selectedCourier?.name ? formatCourierName(selectedCourier.name) : "Courier"}):
                    </span>
                    {deliveryPaymentMethod === "upon_delivery" && (
                      <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 inline-block mt-0.5">
                        To be paid upon delivery
                      </span>
                    )}
                  </div>
                  <span className="font-semibold text-gray-900 font-ibm-condensed">
                    {formatPHP(courierDeliveryFee)}
                  </span>
                </div>

                {/* Total Amounts Section */}
                <div className="pt-3 border-t border-gray-200 space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-heading font-bold uppercase tracking-wide text-gray-900 text-sm">
                      Total Payable Now:
                    </span>
                    <span className="font-heading font-bold text-2xl text-black font-ibm-condensed">
                      {formatPHP(payableNow)}
                    </span>
                  </div>

                  {deliveryPaymentMethod === "upon_delivery" && (
                    <div className="flex justify-between items-center text-xs font-mono text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                      <span className="font-medium">To be paid to Courier upon delivery:</span>
                      <span className="font-bold font-ibm-condensed">{formatPHP(courierDeliveryFee)}</span>
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
            <div className="py-4 px-1 space-y-6">
              {/* Success Banner */}
              <div className="text-center space-y-2.5">
                <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto border-2 border-amber-200">
                  <Clock className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-heading font-bold text-gray-900 uppercase tracking-wide">
                    Order Submitted - Pending Review
                  </h3>
                  <p className="text-xs text-gray-500 font-mono mt-1">
                    Your order #{completedOrder.id || completedOrder.orderNumber} is registered as <strong className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">PENDING</strong> and awaits payment verification.
                  </p>
                </div>
              </div>

              {/* Order summary collapsible card */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 font-mono text-xs space-y-2.5 max-w-md mx-auto">
                <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                  <span className="text-gray-400 uppercase text-[9px] font-bold">Order Identifier</span>
                  <span className="font-bold text-gray-900">{completedOrder.id || completedOrder.orderNumber}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                  <span className="text-gray-400 uppercase text-[9px] font-bold">Receiver Name</span>
                  <span className="font-medium text-gray-900 uppercase">{completedOrder.receiverName}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-200 pb-2">
                  <span className="text-gray-400 uppercase text-[9px] font-bold">Payable amount</span>
                  <span className="font-bold text-slate-900 text-sm font-ibm-condensed">{formatPHP(completedOrder.totalAmount || 0)}</span>
                </div>
              </div>

              {/* Live Courier Tracking Interactive Card */}
              {completedOrder.trackingUrl && (
                <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 max-w-md mx-auto space-y-3 shadow-xs">
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
                    className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-heading font-bold uppercase tracking-wider text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Track Shipment</span>
                  </a>
                </div>
              )}

              {/* Settle Payment Section */}
              <div className="border-t border-gray-200 pt-6 space-y-4">
                <div className="text-center">
                  <h4 className="text-sm font-heading font-bold uppercase tracking-wider text-gray-900">
                    Settle Your Payment
                  </h4>
                  <p className="text-xs text-gray-500 font-mono mt-1">
                    Select a payment method from the configured options below:
                  </p>
                </div>

                {isLoadingPaymentMethods ? (
                  <div className="p-8 text-center bg-gray-50 border border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-xs font-mono text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin text-black" />
                    <span>Loading payment options...</span>
                  </div>
                ) : paymentMethods.length === 0 ? (
                  <div className="p-6 text-center bg-gray-50 rounded-xl border border-gray-200 text-xs font-mono text-gray-600">
                    No active payment methods are currently configured by the administrator. Please contact shop support to settle payment manually.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Method Tiles Selection (5 columns per row, max 2 rows per page, swipe left/right + dot indicators) */}
                    {(() => {
                      const itemsPerPage = 10;
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
                            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                              {slicedMethods.map((method) => {
                                const isSelected = selectedPaymentMethod?.id === method.id;
                                const pType = (method.paymentType || method.type || "").toLowerCase();
                                const isQr = pType === "qr_code" || pType === "qr" || pType.includes("qr");
                                const qrImg = method.qrCodeImage || method.qrCode || method.qrImage || method.qr_code_image || "";

                                return (
                                  <div key={method.id} className="flex flex-col items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedPaymentMethod(method);
                                        setProofSubmitSuccess(false);
                                        setUploadedProofImage("");
                                        // If it is a QR payment method, pop up the QR Code immediately
                                        if (isQr && qrImg) {
                                          setZoomedPaymentMethod(method);
                                          setIsPaymentQrModalOpen(true);
                                        }
                                      }}
                                      className={`w-full aspect-video rounded-xl border-2 transition-all flex items-center justify-center p-0.5 cursor-pointer relative overflow-hidden ${
                                        isSelected
                                          ? "border-slate-900 shadow-sm ring-1 ring-slate-900"
                                          : "border-gray-200 bg-white hover:border-gray-300"
                                      }`}
                                    >
                                      {method.logo ? (
                                        <img
                                          src={method.logo}
                                          alt={method.name}
                                          className="w-full h-full object-cover rounded-[10px]"
                                          referrerPolicy="no-referrer"
                                        />
                                      ) : (
                                        <CreditCard className="w-6 h-6 text-gray-400" />
                                      )}
                                    </button>
                                    <span className="text-[9px] sm:text-[10px] font-heading font-bold text-gray-900 truncate w-full text-center">
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
                      const isCrypto = pType === "crypto";
                      const isApi = pType === "api" || pType === "webhook";
                      const qrImg = selectedPaymentMethod.qrCodeImage || selectedPaymentMethod.qrCode || selectedPaymentMethod.qrImage || selectedPaymentMethod.qr_code_image || "";

                      return (
                        <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-4 animate-in fade-in slide-in-from-top-3 duration-200 text-left">
                          <div className="border-b border-gray-100 pb-2 flex items-center justify-between">
                            <h5 className="text-xs font-heading font-black uppercase text-gray-900">
                              Instructions for {selectedPaymentMethod.name}
                            </h5>
                            <span className="text-[10px] font-mono text-gray-400 uppercase">
                              {isQr && "Static QR"}
                              {isCrypto && "Wallet Deposit"}
                              {isApi && "Integrated Webhook"}
                            </span>
                          </div>

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

                          {/* API Block */}
                          {isApi && (
                            <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg space-y-1">
                              <p className="text-xs text-blue-900 font-medium">
                                Online checkout API is active.
                              </p>
                              <p className="text-[11px] text-blue-700 font-mono">
                                Public Key: {selectedPaymentMethod.publicKey ? `${selectedPaymentMethod.publicKey.slice(0, 8)}...` : "None"}
                              </p>
                            </div>
                          )}

                          {/* Upload Proof of Payment Container */}
                          <div className="border-t border-gray-100 pt-4 space-y-3">
                            <input
                              type="file"
                              accept="image/*"
                              ref={proofInputRef}
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    setUploadedProofImage(reader.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                            
                            {!uploadedProofImage ? (
                              <button
                                type="button"
                                onClick={() => proofInputRef.current?.click()}
                                className="w-full px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider transition-all cursor-pointer shadow-xs"
                              >
                                <span>Attach Payment Proof</span>
                              </button>
                            ) : (
                              <div className="space-y-3 animate-in fade-in duration-200">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setIsPreviewProofOpen(true)}
                                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-heading font-bold uppercase tracking-wider text-[10px] sm:text-xs rounded-xl transition-all cursor-pointer flex justify-center items-center"
                                  >
                                    <span>Preview</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => proofInputRef.current?.click()}
                                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-heading font-bold uppercase tracking-wider text-[10px] sm:text-xs rounded-xl transition-all cursor-pointer flex justify-center items-center"
                                  >
                                    <span>Replace</span>
                                  </button>
                                </div>
                                
                                <button
                                  type="button"
                                  disabled={isSubmittingProof}
                                  onClick={async () => {
                                    try {
                                      setIsSubmittingProof(true);
                                      const res = await fetch("/api/orders", {
                                        method: "PUT",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                          orderId: completedOrder.id || completedOrder.orderNumber,
                                          paymentMethodId: selectedPaymentMethod.id,
                                          paymentMethodName: selectedPaymentMethod.name,
                                          paymentProofImage: uploadedProofImage,
                                        })
                                      });
                                      if (res.ok) {
                                        setProofSubmitSuccess(true);
                                      } else {
                                        const errData = await res.json().catch(() => ({}));
                                        alert(errData.error || "Failed to submit payment proof");
                                      }
                                    } catch (e) {
                                      console.error(e);
                                      alert("Submission failed. Please try again.");
                                    } finally {
                                      setIsSubmittingProof(false);
                                    }
                                  }}
                                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-heading font-bold uppercase tracking-wider text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                                >
                                  {isSubmittingProof ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                      <span>Verifying...</span>
                                    </>
                                  ) : (
                                    <span>Submit for Verification</span>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
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
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer shadow-xs"
              >
                <span>Continue to Address</span>
              </button>
            )}

            {currentStep === 2 && (
              <button
                type="button"
                onClick={handleNextFromStep2}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer shadow-xs"
              >
                <span>Select Courier</span>
              </button>
            )}

            {currentStep === 3 && (
              <button
                type="button"
                onClick={handleNextFromStep3}
                disabled={!selectedCourier}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Review Order</span>
              </button>
            )}

            {currentStep === 4 && (
              <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                {submitError && (
                  <span className="text-xs font-mono text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg max-w-xs truncate">
                    {submitError}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSubmitOrder}
                  disabled={isSubmittingOrder}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white rounded-lg text-xs font-heading font-bold uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingOrder ? (
                    <span>Submitting...</span>
                  ) : (
                    <span>Confirm & Place Order</span>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Upload Proof Preview Modal */}
      {isPreviewProofOpen && uploadedProofImage && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md animate-in fade-in duration-200">
          <button 
            onClick={() => setIsPreviewProofOpen(false)} 
            className="absolute top-6 right-6 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img 
            src={uploadedProofImage} 
            alt="Payment Proof Preview" 
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}

      {/* Success Submission Animated Modal */}
      {proofSubmitSuccess && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center space-y-4 animate-in zoom-in-95 duration-300">
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
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center animate-in zoom-in-95 duration-150">
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

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col items-center justify-center space-y-3">
              {(zoomedPaymentMethod.qrCodeImage || zoomedPaymentMethod.qrCode || zoomedPaymentMethod.qrImage || zoomedPaymentMethod.qr_code_image) ? (
                <div className="p-3 bg-white rounded-xl shadow-xs border border-slate-200">
                  <img
                    src={zoomedPaymentMethod.qrCodeImage || zoomedPaymentMethod.qrCode || zoomedPaymentMethod.qrImage || zoomedPaymentMethod.qr_code_image}
                    alt={`${zoomedPaymentMethod.name} QR Code`}
                    className="w-48 h-48 object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="w-48 h-48 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 font-mono text-xs">
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
              <div className="p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-left text-[11px] font-mono text-gray-700">
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

                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold uppercase tracking-wider font-mono transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200"
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
