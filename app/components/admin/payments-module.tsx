"use client";
import React, { useState, useEffect } from "react";
import { 
  CreditCard, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  Loader2, 
  AlertCircle, 
  QrCode, 
  Webhook, 
  Coins, 
  Landmark,
  Eye, 
  EyeOff,
  Image as ImageIcon,
  GripVertical,
  ChevronUp,
  ChevronDown
} from "lucide-react";

interface PaymentMethod {
  id: string;
  name: string;
  logo: string;
  paymentType: "qr_code" | "manual_transfer" | "api" | "crypto";
  qrCodeImage?: string;
  webhookUrl?: string;
  publicKey?: string;
  secretKey?: string;
  secretKeyConfigured?: boolean;
  walletAddress?: string;
  accountName?: string;
  accountNumber?: string;
  sortOrder?: number;
  isActive: boolean;
}

const Base64ImageUploader = ({
  label,
  value,
  onChange,
  required = false
}: {
  label: string;
  value: string;
  onChange: (base64: string) => void;
  required?: boolean;
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

  const handleFile = (file: File) => {
    setErrorMessage("");
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please upload an image file only.");
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
      setErrorMessage(`File size (${fileSizeMB}MB) exceeds the maximum 10MB limit per image.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        onChange(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="admin-feature-module space-y-1">
      <div className="flex items-center justify-between">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-heading">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <span className="text-[9px] font-mono text-slate-400">Max 10MB</span>
      </div>
      {value ? (
        <div className="relative border border-slate-200 rounded-none p-3 bg-slate-50 flex items-center gap-3">
          <img
            src={value}
            alt="Uploaded Preview"
            className="w-16 h-16 object-contain rounded-none border border-slate-200 bg-white"
          />
          <div className="flex-1 min-w-0">
            <span className="text-[9px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold uppercase">
              Image Loaded
            </span>
            <p className="text-[9px] text-slate-400 font-mono mt-1 truncate">
              Raw Base64 Image Representation
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setErrorMessage("");
              onChange("");
            }}
            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-none text-[9px] font-bold uppercase tracking-wider font-mono cursor-pointer transition-colors"
          >
            Remove
          </button>
        </div>
      ) : (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-none p-3 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all ${
            errorMessage
              ? "border-red-300 bg-red-50/50"
              : dragActive
              ? "border-black bg-slate-50"
              : "border-slate-200 hover:border-slate-400 hover:bg-slate-50/50"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
            accept="image/*"
            className="hidden"
          />
          <ImageIcon className={`w-5 h-5 ${errorMessage ? "text-red-400" : "text-slate-400"}`} />
          <div className="text-center">
            <span className="font-bold text-slate-900 text-[10px] uppercase tracking-wider block">
              Choose File
            </span>
            <p className="text-[9px] text-slate-400 mt-0.5 font-mono">
              Drag image here or click to browse (up to 10MB per image)
            </p>
          </div>
        </div>
      )}
      {errorMessage && (
        <p className="text-[10px] font-mono text-red-600 font-bold mt-1">
          {errorMessage}
        </p>
      )}
    </div>
  );
};

export default function PaymentsModule() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isReordering, setIsReordering] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Editor/Add State
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");
  const [paymentType, setPaymentType] = useState<"qr_code" | "manual_transfer" | "api" | "crypto">("qr_code");
  const [qrCodeImage, setQrCodeImage] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [secretKeyConfigured, setSecretKeyConfigured] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [isActive, setIsActive] = useState(true);

  const fetchMethods = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/payments?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Pragma": "no-cache" }
      });
      if (res.ok) {
        setMethods(await res.json());
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMethods();
  }, []);

  const handleDragStart = (index: number, e: React.DragEvent) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Set transparent drag image or standard payload
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = async (targetIndex: number, e: React.DragEvent) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...methods];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    setMethods(updated);
    setDraggedIndex(null);
    setDragOverIndex(null);

    try {
      setIsReordering(true);
      const reorderPayload = updated.map((m, idx) => ({ id: m.id, sortOrder: idx }));
      const res = await fetch("/api/admin/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder: reorderPayload })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to persist payment method order (HTTP ${res.status})`);
      }
    } catch (e) {
      console.error("Failed to persist reorder", e);
    } finally {
      setIsReordering(false);
    }
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= methods.length) return;

    const updated = [...methods];
    const [movedItem] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, movedItem);

    setMethods(updated);

    try {
      setIsReordering(true);
      const reorderPayload = updated.map((m, idx) => ({ id: m.id, sortOrder: idx }));
      await fetch("/api/admin/payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder: reorderPayload })
      });
    } catch (e) {
      console.error("Failed to persist reorder", e);
    } finally {
      setIsReordering(false);
    }
  };

  const resetForm = () => {
    setName("");
    setLogo("");
    setPaymentType("qr_code");
    setQrCodeImage("");
    setWebhookUrl("");
    setPublicKey("");
    setSecretKey("");
    setSecretKeyConfigured(false);
    setWalletAddress("");
    setAccountName("");
    setAccountNumber("");
    setIsActive(true);
    setEditingId(null);
    setErrorMsg("");
  };

  const handleEdit = (m: PaymentMethod) => {
    setEditingId(m.id);
    setName(m.name);
    setLogo(m.logo);
    setPaymentType(m.paymentType || "qr_code");
    setQrCodeImage(m.qrCodeImage || "");
    setWebhookUrl(m.webhookUrl || "");
    setPublicKey(m.publicKey || "");
    setSecretKey("");
    setSecretKeyConfigured(Boolean(m.secretKeyConfigured));
    setWalletAddress(m.walletAddress || "");
    setAccountName(m.accountName || "");
    setAccountNumber(m.accountNumber || "");
    setIsActive(m.isActive);
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Payment method name is required");
      return;
    }

    if (paymentType === "manual_transfer" && (!accountName.trim() || !accountNumber.trim())) {
      setErrorMsg("Account Name and Account Number are required for Manual Transfer");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg("");

      const payload = {
        name,
        logo,
        paymentType,
        qrCodeImage: paymentType === "qr_code" ? qrCodeImage : "",
        webhookUrl: paymentType === "api" ? webhookUrl : "",
        publicKey: paymentType === "api" ? publicKey : "",
        secretKey: paymentType === "api" ? secretKey : "",
        walletAddress: paymentType === "crypto" ? walletAddress : "",
        accountName: paymentType === "manual_transfer" ? accountName.trim() : "",
        accountNumber: paymentType === "manual_transfer" ? accountNumber.trim() : "",
        isActive
      };

      let res;
      if (editingId) {
        res = await fetch("/api/admin/payments", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...payload })
        });
      } else {
        res = await fetch("/api/admin/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        setIsOpen(false);
        resetForm();
        await fetchMethods();
      } else {
        const errData = await res.json().catch(() => ({}));
        setErrorMsg(errData.error || "Failed to save payment method");
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this payment method?")) return;
    try {
      const res = await fetch(`/api/admin/payments?id=${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        await fetchMethods();
      } else {
        alert("Failed to delete payment method");
      }
    } catch (e) {
      console.error(e);
      alert("Error deleting method");
    }
  };

  return (
    <div className="space-y-3">
      {/* Header and Add Action */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-heading font-black uppercase text-slate-900 tracking-wider">
            Payment Systems Configurator
          </h3>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Configure transaction routes, QR codes, API integrations, and wallet details.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsOpen(true);
          }}
          className="px-3.5 py-2 bg-black hover:bg-slate-800 text-white font-heading font-bold text-xs uppercase tracking-wider rounded-none flex items-center gap-1.5 transition-colors cursor-pointer shadow-none"
        >
          <Plus className="w-4 h-4" />
          <span>Add Method</span>
        </button>
      </div>

      {/* Main List & Active Panel */}
      {loading ? (
        <div className="p-2.5 text-center bg-white border border-slate-200 rounded-none flex flex-col items-center justify-center gap-2 font-mono text-xs text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-black" />
          <span>Syncing payment providers with Firestore...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* List Section (Left 2/3) */}
          <div className="md:col-span-2 space-y-3">
            {methods.length > 1 && (
              <div className="flex items-center justify-between px-1 py-1 text-[11px] font-mono text-slate-500">
                <span className="flex items-center gap-1">
                  <GripVertical className="w-3.5 h-3.5 text-slate-400" />
                  Drag cards or use arrows to rearrange customer display order
                </span>
                {isReordering && (
                  <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Saving arrangement...
                  </span>
                )}
              </div>
            )}

            {methods.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-none p-3 text-center space-y-2">
                <CreditCard className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="font-heading font-bold uppercase text-slate-900 text-xs">
                  No payment methods configured
                </h4>
                <p className="text-xs text-slate-500 font-mono">
                  Click the "Add Method" button to set up your first gateway.
                </p>
              </div>
            ) : (
              methods.map((method, index) => {
                const isDragging = draggedIndex === index;
                const isDragOver = dragOverIndex === index;

                return (
                  <div
                    key={method.id}
                    draggable
                    onDragStart={(e) => handleDragStart(index, e)}
                    onDragOver={(e) => handleDragOver(index, e)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(index, e)}
                    className={`bg-white border rounded-none p-3.5 sm:p-2.5 flex items-center justify-between gap-3 shadow-xs hover:shadow-none transition-all cursor-move select-none ${
                      isDragging
                        ? "opacity-40 border-dashed border-black bg-slate-100 scale-[0.99]"
                        : isDragOver
                        ? "border-black ring-2 ring-black/10 bg-slate-50"
                        : method.isActive
                        ? "border-slate-200"
                        : "border-slate-200 bg-slate-50/70 opacity-80"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
                      {/* Drag Handle & Order Indicator */}
                      <div className="flex items-center gap-1 text-slate-400 hover:text-slate-900 cursor-grab active:cursor-grabbing shrink-0">
                        <GripVertical className="w-4 h-4" />
                        <span className="text-[10px] font-mono font-bold text-slate-400 w-4 text-center">
                          #{index + 1}
                        </span>
                      </div>

                      {method.logo ? (
                        <img
                          src={method.logo}
                          alt={method.name}
                          className="w-11 h-11 object-contain p-1 rounded-none bg-white border border-slate-100 shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 bg-slate-100 text-slate-700 flex items-center justify-center rounded-none shrink-0 border border-slate-200">
                          <CreditCard className="w-5 h-5" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-heading font-black text-sm text-slate-900 truncate">
                            {method.name}
                          </span>
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                            method.isActive 
                              ? "bg-emerald-100 text-emerald-800" 
                              : "bg-red-100 text-red-700 border border-red-200"
                          }`}>
                            {method.isActive ? "Active" : "Offline"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 font-mono text-[10px] text-slate-400 mt-1">
                          <span className="font-bold text-slate-600 uppercase flex items-center gap-1 shrink-0">
                            {method.paymentType === "qr_code" && (
                              <>
                                <QrCode className="w-3 h-3 text-slate-500" />
                                Static QR
                              </>
                            )}
                            {method.paymentType === "manual_transfer" && (
                              <>
                                <Landmark className="w-3 h-3 text-slate-500" />
                                Manual Transfer
                              </>
                            )}
                            {method.paymentType === "api" && (
                              <>
                                <Webhook className="w-3 h-3 text-slate-500" />
                                Online API
                              </>
                            )}
                            {method.paymentType === "crypto" && (
                              <>
                                <Coins className="w-3 h-3 text-slate-500" />
                                Crypto
                              </>
                            )}
                          </span>
                          <span>&bull;</span>
                          <span className="truncate max-w-[180px] sm:max-w-[260px]">
                            {method.paymentType === "qr_code" && (method.qrCodeImage ? "QR Uploaded" : "No QR Uploaded")}
                            {method.paymentType === "manual_transfer" && (
                              method.accountName || method.accountNumber 
                                ? `${method.accountName || 'No Name'} • ${method.accountNumber || 'No Acc'}`
                                : "No details configured"
                            )}
                            {method.paymentType === "crypto" && (method.walletAddress ? method.walletAddress : "No wallet address")}
                            {method.paymentType === "api" && (method.webhookUrl ? method.webhookUrl : "No webhook")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Move and Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="flex flex-col gap-0.5 border-r border-slate-200 pr-1.5 mr-0.5">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMove(index, "up")}
                          className="p-1 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 rounded transition-colors"
                          title="Move up"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={index === methods.length - 1}
                          onClick={() => handleMove(index, "down")}
                          className="p-1 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 rounded transition-colors"
                          title="Move down"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        onClick={() => handleEdit(method)}
                        className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-none transition-colors cursor-pointer"
                        title="Edit payment method"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(method.id)}
                        className="p-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-none transition-colors cursor-pointer"
                        title="Delete payment method"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Stats/Tip panel (Right 1/3) */}
          <div className="bg-slate-100 border border-slate-200 rounded-none p-3 space-y-2.5">
            <h4 className="font-heading font-black text-xs uppercase text-slate-900 tracking-wider">
              Payments Overview
            </h4>
            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center bg-white p-2.5 rounded-none border border-slate-200">
                <span className="text-slate-400">Total gateways:</span>
                <span className="font-bold text-slate-900">{methods.length}</span>
              </div>
              <div className="flex justify-between items-center bg-white p-2.5 rounded-none border border-slate-200">
                <span className="text-slate-400">Active gateways:</span>
                <span className="font-bold text-slate-900">
                  {methods.filter((m) => m.isActive).length}
                </span>
              </div>
            </div>

            <div className="p-3 bg-white rounded-none border border-slate-200 space-y-1.5">
              <p className="text-[11px] font-bold text-slate-900 uppercase tracking-wide">
                Secure Image Rules
              </p>
              <p className="text-[10px] text-slate-500 leading-relaxed font-mono">
                All Logos and QR codes are stored inside Firestore documents securely in base64 format without referencing insecure external URL dependencies. This prevents image loading failures.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Side Sheet Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2.5 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 w-full max-w-[430px] h-full rounded-none overflow-y-auto shadow-none p-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <h4 className="font-heading font-black uppercase text-slate-900 text-sm tracking-wide">
                  {editingId ? "Modify Gateway" : "Create Payment Gateway"}
                </h4>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-slate-100 rounded-none text-slate-500 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-none flex items-center gap-1.5 font-mono">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} id="payment-gateway-form" className="space-y-2.5">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-heading">
                    Method Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Lalamove Pay, GCash QR, Metamask"
                    className="w-full px-3 py-2 border border-slate-200 rounded-none text-xs font-medium focus:outline-none focus:border-slate-900"
                  />
                </div>

                {/* Logo Image Uploader */}
                <Base64ImageUploader
                  label="Provider Logo (No URLs Allowed)"
                  value={logo}
                  onChange={(base64) => setLogo(base64)}
                  required
                />

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-heading">
                    Payment Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-none text-xs font-medium focus:outline-none focus:border-slate-900"
                  >
                    <option value="qr_code">Static QR Code Scan</option>
                    <option value="manual_transfer">Manual Transfer (Online Banking / E-Wallet)</option>
                    <option value="api">Maya Checkout API / Webhook</option>
                    <option value="crypto">Cryptocurrency Wallet Deposit</option>
                  </select>
                </div>

                {/* Conditional fields based on type */}
                {paymentType === "qr_code" && (
                  <Base64ImageUploader
                    label="Static QR Code (No URLs Allowed)"
                    value={qrCodeImage}
                    onChange={(base64) => setQrCodeImage(base64)}
                    required
                  />
                )}

                {paymentType === "manual_transfer" && (
                  <div className="space-y-3 p-3.5 bg-slate-50 border border-slate-200 rounded-none">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 font-heading">
                        Account Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="e.g. Juan Dela Cruz / Store Official"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-none text-xs font-medium focus:outline-none focus:border-slate-900"
                      />
                      <p className="text-[9px] text-slate-400 font-mono">
                        Registered name on the receiving bank account or e-wallet.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 font-heading">
                        Account / Mobile Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        placeholder="e.g. 0917-123-4567 or 1234-5678-9012"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-none text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-slate-900"
                      />
                      <p className="text-[9px] text-slate-400 font-mono">
                        Account number or mobile number for customers to copy and transfer payment.
                      </p>
                    </div>

                    <div className="p-2.5 bg-amber-50/60 border border-amber-200/60 rounded-none">
                      <p className="text-[10px] text-amber-800 leading-snug font-mono">
                        Customers will be shown this Account Name and Account Number with one-click copy buttons at checkout to transfer payment via their online banking or e-wallet apps.
                      </p>
                    </div>
                  </div>
                )}

                {paymentType === "crypto" && (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-heading">
                      Wallet Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      placeholder="e.g. 0x71C... or bc1q..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-none text-xs font-mono focus:outline-none focus:border-slate-900"
                    />
                  </div>
                )}

                {paymentType === "api" && (
                  <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-none">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-heading">
                        Webhook Endpoint
                      </label>
                      <input
                        type="url"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="https://api.example.com/payment/webhook"
                        className="w-full px-3 py-2 border border-slate-200 rounded-none text-xs font-mono focus:outline-none focus:border-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-heading">
                        Public API Key
                      </label>
                      <input
                        type="text"
                        value={publicKey}
                        onChange={(e) => setPublicKey(e.target.value)}
                        placeholder="pk_test_..."
                        className="w-full px-3 py-2 border border-slate-200 rounded-none text-xs font-mono focus:outline-none focus:border-slate-900"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-heading">
                        Secret API Key {secretKeyConfigured && (
                          <span className="ml-1 text-emerald-700">(Already configured — leave blank to keep)</span>
                        )}
                      </label>
                      <input
                        type="password"
                        value={secretKey}
                        onChange={(e) => setSecretKey(e.target.value)}
                        placeholder={secretKeyConfigured ? "•••••••••••••••• (leave blank to keep existing key)" : "sk_test_..."}
                        className="w-full px-3 py-2 border border-slate-200 rounded-none text-xs font-mono focus:outline-none focus:border-slate-900"
                      />
                    </div>
                  </div>
                )}

                {/* Toggle switch for active */}
                <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-none">
                  <div>
                    <span className="text-xs font-bold uppercase text-slate-900 font-heading">
                      Gateway Status
                    </span>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      Toggle whether customers can checkout using this method.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    className={`w-11 h-6 rounded-full p-1 transition-all flex items-center cursor-pointer ${
                      isActive ? "bg-slate-900 justify-end" : "bg-slate-200 justify-start"
                    }`}
                  >
                    <span className="w-4 h-4 bg-white rounded-full shadow-none" />
                  </button>
                </div>
              </form>
            </div>

            <div className="border-t border-slate-100 pt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex-1 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-heading font-bold text-xs uppercase tracking-wider rounded-none transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="payment-gateway-form"
                disabled={submitting}
                className="flex-1 py-2 bg-black hover:bg-slate-800 text-white font-heading font-bold text-xs uppercase tracking-wider rounded-none transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-none"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Gateway</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
