"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Film,
  Upload,
  Plus,
  Search,
  Filter,
  Play,
  Pause,
  Eye,
  Trash2,
  Edit2,
  CheckCircle,
  AlertCircle,
  Clock,
  HardDrive,
  Copy,
  Star,
  ExternalLink,
  RefreshCw,
  X,
  Volume2,
  VolumeX,
  Maximize,
  Sparkles,
  Layers,
  Send,
  Link as LinkIcon
} from "lucide-react";

interface VideoItem {
  id: string;
  title: string;
  description?: string;
  category: string;
  tags?: string[];
  telegramFileId?: string;
  telegramMessageId?: string | number;
  storageType?: string;
  directUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  fileSize?: number;
  width?: number;
  height?: number;
  views?: number;
  isPublished?: boolean;
  featured?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const CATEGORIES = [
  "All",
  "Product Demos",
  "Unboxing",
  "Customer Reviews",
  "Tutorials",
  "Behind The Scenes",
  "Exclusive"
];

export default function MediaModule() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft" | "featured">("all");

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<VideoItem | null>(null);
  const [editingVideo, setEditingVideo] = useState<VideoItem | null>(null);

  // Telegram bot status
  const [tgStatus, setTgStatus] = useState<{
    connected: boolean;
    bot?: { username: string; firstName: string };
    storageChatId?: string;
    error?: string;
  } | null>(null);
  const [checkingTg, setCheckingTg] = useState(false);

  // Form states for Upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("Product Demos");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadThumbnail, setUploadThumbnail] = useState("");
  const [uploadIsPublished, setUploadIsPublished] = useState(true);
  const [uploadFeatured, setUploadFeatured] = useState(false);
  const [uploadChatId, setUploadChatId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Form states for Import
  const [importFileId, setImportFileId] = useState("");
  const [importDirectUrl, setImportDirectUrl] = useState("");
  const [importTitle, setImportTitle] = useState("");
  const [importCategory, setImportCategory] = useState("Product Demos");
  const [importDescription, setImportDescription] = useState("");
  const [importTags, setImportTags] = useState("");
  const [importThumbnail, setImportThumbnail] = useState("");
  const [importing, setImporting] = useState(false);

  // File input refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // Fetch videos
  const fetchVideos = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/media/videos?all=true");
      if (!res.ok) throw new Error("Failed to load videos from database");
      const data = await res.json();
      setVideos(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || "Failed to load videos");
    } finally {
      setLoading(false);
    }
  };

  // Check Telegram status
  const checkTelegramStatus = async () => {
    try {
      setCheckingTg(true);
      const res = await fetch("/api/admin/media/status");
      const data = await res.json();
      setTgStatus(data);
    } catch (err) {
      console.warn("Could not check telegram status:", err);
    } finally {
      setCheckingTg(false);
    }
  };

  useEffect(() => {
    fetchVideos();
    checkTelegramStatus();
  }, []);

  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // Format Duration
  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Format File Size
  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "—";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Handle Video Upload to Telegram
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setError("Please select a video file to upload");
      return;
    }
    if (!uploadTitle.trim()) {
      setError("Please enter a title for the video");
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setUploadProgress(20);

      const formData = new FormData();
      formData.append("video", uploadFile);
      formData.append("title", uploadTitle.trim());
      formData.append("category", uploadCategory);
      formData.append("description", uploadDescription.trim());
      formData.append("tags", uploadTags.trim());
      formData.append("thumbnailUrl", uploadThumbnail);
      formData.append("isPublished", String(uploadIsPublished));
      formData.append("featured", String(uploadFeatured));
      if (uploadChatId.trim()) {
        formData.append("chatId", uploadChatId.trim());
      }

      setUploadProgress(50);
      const res = await fetch("/api/admin/media/upload", {
        method: "POST",
        body: formData
      });

      setUploadProgress(90);
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to upload video to Telegram");
      }

      setUploadProgress(100);
      showToast(`Video "${uploadTitle}" successfully uploaded to Telegram!`);
      setIsUploadModalOpen(false);
      resetUploadForm();
      fetchVideos();
    } catch (err: any) {
      setError(err.message || "Failed to upload video");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadTitle("");
    setUploadDescription("");
    setUploadTags("");
    setUploadThumbnail("");
    setUploadCategory("Product Demos");
    setUploadIsPublished(true);
    setUploadFeatured(false);
    setUploadChatId("");
  };

  // Handle Import from Telegram File ID or URL
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importTitle.trim()) {
      setError("Please enter a title for the video");
      return;
    }
    if (!importFileId.trim() && !importDirectUrl.trim()) {
      setError("Please provide either a Telegram File ID or a direct video URL");
      return;
    }

    try {
      setImporting(true);
      setError(null);

      const res = await fetch("/api/media/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: importTitle.trim(),
          category: importCategory,
          description: importDescription.trim(),
          tags: importTags.trim(),
          telegramFileId: importFileId.trim(),
          directUrl: importDirectUrl.trim(),
          thumbnailUrl: importThumbnail.trim(),
          isPublished: true,
          featured: false
        })
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "Failed to import video");
      }

      showToast(`Video "${importTitle}" added successfully!`);
      setIsImportModalOpen(false);
      resetImportForm();
      fetchVideos();
    } catch (err: any) {
      setError(err.message || "Failed to import video");
    } finally {
      setImporting(false);
    }
  };

  const resetImportForm = () => {
    setImportFileId("");
    setImportDirectUrl("");
    setImportTitle("");
    setImportCategory("Product Demos");
    setImportDescription("");
    setImportTags("");
    setImportThumbnail("");
  };

  // Handle Edit Save
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVideo) return;

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/media/videos/${editingVideo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editingVideo.title,
          category: editingVideo.category,
          description: editingVideo.description,
          tags: editingVideo.tags,
          telegramFileId: editingVideo.telegramFileId,
          directUrl: editingVideo.directUrl,
          thumbnailUrl: editingVideo.thumbnailUrl,
          isPublished: editingVideo.isPublished,
          featured: editingVideo.featured
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update video");
      }

      showToast("Video updated successfully");
      setIsEditModalOpen(false);
      setEditingVideo(null);
      fetchVideos();
    } catch (err: any) {
      setError(err.message || "Failed to update video");
    } finally {
      setLoading(false);
    }
  };

  // Toggle Published
  const togglePublish = async (video: VideoItem) => {
    try {
      const nextStatus = !video.isPublished;
      setVideos((prev) =>
        prev.map((v) => (v.id === video.id ? { ...v, isPublished: nextStatus } : v))
      );
      await fetch(`/api/media/videos/${video.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: nextStatus })
      });
      showToast(`Video ${nextStatus ? "published" : "hidden"} successfully`);
    } catch (err) {
      fetchVideos();
    }
  };

  // Toggle Featured
  const toggleFeatured = async (video: VideoItem) => {
    try {
      const nextFeatured = !video.featured;
      setVideos((prev) =>
        prev.map((v) => (v.id === video.id ? { ...v, featured: nextFeatured } : v))
      );
      await fetch(`/api/media/videos/${video.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: nextFeatured })
      });
      showToast(nextFeatured ? "Marked as Featured" : "Removed from Featured");
    } catch (err) {
      fetchVideos();
    }
  };

  // Delete Video
  const handleDeleteVideo = async (video: VideoItem) => {
    if (!confirm(`Are you sure you want to delete "${video.title}"?`)) return;

    try {
      setLoading(true);
      const res = await fetch(`/api/media/videos/${video.id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete video");
      showToast("Video deleted successfully");
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
    } catch (err: any) {
      setError(err.message || "Failed to delete video");
    } finally {
      setLoading(false);
    }
  };

  // Seed Sample Videos (Royalty-free high quality samples for instant testing)
  const handleSeedSamples = async () => {
    try {
      setLoading(true);
      setError(null);
      const samples = [
        {
          title: "PRIME Luxury Collection Showcase & Packaging",
          category: "Product Demos",
          description: "Exclusive look at our signature authenticated packaging, anti-counterfeit seals, and unboxing standards.",
          tags: ["luxury", "packaging", "showcase", "prime"],
          directUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          thumbnailUrl: "https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&q=80",
          duration: 180,
          views: 342,
          isPublished: true,
          featured: true
        },
        {
          title: "VIP Client Unboxing & Authentication Test",
          category: "Unboxing",
          description: "Customer review and real-time fingerprint validation test in Manila.",
          tags: ["unboxing", "review", "auth", "manila"],
          directUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
          thumbnailUrl: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=800&q=80",
          duration: 215,
          views: 189,
          isPublished: true,
          featured: false
        },
        {
          title: "How to Order via Telegram Bot & Seamless Checkout",
          category: "Tutorials",
          description: "Step-by-step walkthrough of browsing products, instant courier rate estimation, and GCash payment confirmation.",
          tags: ["tutorial", "guide", "telegram", "checkout"],
          directUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
          thumbnailUrl: "https://images.unsplash.com/photo-1556742049-0a67e557224f?w=800&q=80",
          duration: 95,
          views: 520,
          isPublished: true,
          featured: false
        }
      ];

      for (const sample of samples) {
        await fetch("/api/media/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sample)
        });
      }

      showToast("Sample gallery videos added successfully!");
      fetchVideos();
    } catch (err: any) {
      setError(err.message || "Failed to seed sample videos");
    } finally {
      setLoading(false);
    }
  };

  // Filtered list
  const filteredVideos = videos.filter((video) => {
    // Category
    if (selectedCategory !== "All" && video.category?.toLowerCase() !== selectedCategory.toLowerCase()) {
      return false;
    }
    // Status
    if (statusFilter === "published" && !video.isPublished) return false;
    if (statusFilter === "draft" && video.isPublished) return false;
    if (statusFilter === "featured" && !video.featured) return false;
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = video.title?.toLowerCase().includes(q);
      const descMatch = video.description?.toLowerCase().includes(q);
      const tagMatch = Array.isArray(video.tags) && video.tags.some((t) => t.toLowerCase().includes(q));
      if (!titleMatch && !descMatch && !tagMatch) return false;
    }
    return true;
  });

  const totalViews = videos.reduce((acc, v) => acc + (v.views || 0), 0);
  const totalPublished = videos.filter((v) => v.isPublished !== false).length;

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl flex items-center justify-between text-xs font-mono animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-300 text-red-800 rounded-xl flex items-center justify-between text-xs font-mono animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TOP STATS & STORAGE INFO BAR */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Videos</p>
            <p className="text-xl font-heading font-black text-slate-900">{videos.length}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Live / Published</p>
            <p className="text-xl font-heading font-black text-emerald-700">{totalPublished}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Free Views</p>
            <p className="text-xl font-heading font-black text-slate-900">{totalViews.toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              tgStatus?.connected ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"
            }`}>
              <Send className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Storage Backend</p>
              <p className="text-xs font-mono font-bold truncate text-slate-900">
                {tgStatus?.connected ? `@${tgStatus.bot?.username || "Telegram Bot"}` : "Telegram Cloud"}
              </p>
            </div>
          </div>
          <button
            onClick={checkTelegramStatus}
            title="Refresh connection status"
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingTg ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ACTION BAR & CONTROLS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search videos by title, description, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900 transition-colors"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" /> Upload Video
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LinkIcon className="w-3.5 h-3.5" /> Import Link / ID
            </button>

            {videos.length === 0 && (
              <button
                onClick={handleSeedSamples}
                className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Load Sample Videos
              </button>
            )}

            <button
              onClick={fetchVideos}
              title="Refresh videos"
              className="p-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Category & Status Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          {/* Categories */}
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Status filters */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-mono font-bold">
            {(["all", "published", "draft", "featured"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2 py-1 rounded-md uppercase transition-all cursor-pointer ${
                  statusFilter === s ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* VIDEO GRID */}
      {loading && videos.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-400 mb-2" />
          <p className="text-xs font-mono text-slate-500">Loading Telegram Media Gallery...</p>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl space-y-3">
          <Film className="w-10 h-10 mx-auto text-slate-300" />
          <h3 className="text-base font-heading font-black uppercase text-slate-700">No Videos Found</h3>
          <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
            {searchQuery || selectedCategory !== "All"
              ? "No videos matched your current filter criteria. Try resetting filters."
              : "Upload your first product video or sample stream to launch the Telegram video gallery."}
          </p>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" /> Upload Video
            </button>
            <button
              onClick={handleSeedSamples}
              className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Load Sample Gallery
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVideos.map((video) => (
            <div
              key={video.id}
              className={`bg-white border rounded-2xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 flex flex-col ${
                video.featured ? "border-amber-300 ring-1 ring-amber-300" : "border-slate-200"
              }`}
            >
              {/* Thumbnail / Video Preview Frame */}
              <div className="relative aspect-video bg-slate-900 overflow-hidden group cursor-pointer" onClick={() => setPreviewVideo(video)}>
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = "https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&q=80";
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-400">
                    <Film className="w-10 h-10 mb-1 opacity-50" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Telegram Video</span>
                  </div>
                )}

                {/* Play Button Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/90 text-slate-950 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </div>
                </div>

                {/* Top Badges */}
                <div className="absolute top-2 left-2 flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-xs text-white text-[10px] font-mono font-bold uppercase tracking-wider">
                    {video.category}
                  </span>
                  {video.featured && (
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[9px] font-mono font-black uppercase tracking-wider flex items-center gap-0.5">
                      <Star className="w-3 h-3 fill-current" /> Featured
                    </span>
                  )}
                </div>

                {/* Bottom Duration & Storage Badges */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                  {video.duration ? (
                    <span className="px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-white text-[10px] font-mono">
                      {formatDuration(video.duration)}
                    </span>
                  ) : null}
                  <span className="px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-500/30 text-sky-300 text-[9px] font-mono flex items-center gap-1">
                    <Send className="w-2.5 h-2.5" /> TG
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-heading font-black text-sm text-slate-900 leading-snug line-clamp-2">
                      {video.title}
                    </h4>
                  </div>
                  {video.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {video.description}
                    </p>
                  )}
                  {video.tags && video.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {video.tags.slice(0, 3).map((tag, idx) => (
                        <span key={idx} className="text-[9px] font-mono text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Meta & Actions Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
                    <span className="flex items-center gap-1" title="Views">
                      <Eye className="w-3.5 h-3.5 text-slate-400" /> {video.views || 0}
                    </span>
                    <span title="File size">{formatFileSize(video.fileSize)}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {/* Featured Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleFeatured(video)}
                      title={video.featured ? "Unmark Featured" : "Mark Featured"}
                      className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                        video.featured ? "text-amber-500 hover:bg-amber-50" : "text-slate-300 hover:text-amber-500 hover:bg-slate-100"
                      }`}
                    >
                      <Star className={`w-4 h-4 ${video.featured ? "fill-current" : ""}`} />
                    </button>

                    {/* Publish/Hide Toggle */}
                    <button
                      type="button"
                      onClick={() => togglePublish(video)}
                      title={video.isPublished ? "Hide from Gallery" : "Publish to Gallery"}
                      className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold uppercase cursor-pointer transition-colors ${
                        video.isPublished
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
                      }`}
                    >
                      {video.isPublished ? "Live" : "Draft"}
                    </button>

                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingVideo(video);
                        setIsEditModalOpen(true);
                      }}
                      title="Edit Details"
                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDeleteVideo(video)}
                      title="Delete Video"
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. UPLOAD MODAL                                                            */}
      {/* ========================================================================= */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-[430px] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-400" />
                <h3 className="font-heading font-black text-sm uppercase tracking-wider">
                  Upload Video to Telegram Storage
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !uploading && setIsUploadModalOpen(false)}
                disabled={uploading}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="p-6 space-y-4">
              {/* File Dropzone */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Video File <span className="text-red-500">*</span>
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                    uploadFile ? "border-emerald-500 bg-emerald-50/50" : "border-slate-300 hover:border-slate-500 bg-slate-50"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadFile(e.target.files[0]);
                        if (!uploadTitle) {
                          // Auto set title from file name
                          const nameWithoutExt = e.target.files[0].name.replace(/\.[^/.]+$/, "");
                          setUploadTitle(nameWithoutExt);
                        }
                      }
                    }}
                    className="hidden"
                  />
                  {uploadFile ? (
                    <div className="space-y-1">
                      <Film className="w-8 h-8 mx-auto text-emerald-600" />
                      <p className="text-xs font-mono font-bold text-slate-900 truncate max-w-xs mx-auto">
                        {uploadFile.name}
                      </p>
                      <p className="text-[10px] font-mono text-slate-500">
                        {(uploadFile.size / (1024 * 1024)).toFixed(2)} MB • Ready for Telegram
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1 text-slate-500">
                      <Upload className="w-8 h-8 mx-auto text-slate-400" />
                      <p className="text-xs font-bold text-slate-700">Click to browse or drop video file</p>
                      <p className="text-[10px] font-mono text-slate-400">MP4, WebM, MOV supported</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="e.g. Unboxing Signature Model X"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                  >
                    {CATEGORIES.filter((c) => c !== "All").map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="Highlights, product details, or viewer instructions..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                />
              </div>

              {/* Tags & Thumbnail URL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={uploadTags}
                    onChange={(e) => setUploadTags(e.target.value)}
                    placeholder="e.g. unboxing, review, manila"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Custom Thumbnail Image URL (optional)
                  </label>
                  <input
                    type="text"
                    value={uploadThumbnail}
                    onChange={(e) => setUploadThumbnail(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                  />
                </div>
              </div>

              {/* Storage Channel Override */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Target Telegram Chat / Channel ID (optional)
                </label>
                <input
                  type="text"
                  value={uploadChatId}
                  onChange={(e) => setUploadChatId(e.target.value)}
                  placeholder={tgStatus?.storageChatId || "Default Bot Storage Channel"}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                />
                <span className="text-[10px] text-slate-400 font-mono">
                  Leave empty to use configured TELEGRAM_STORAGE_CHAT_ID or ADMIN_TELEGRAM_USER_ID
                </span>
              </div>

              {/* Checkboxes */}
              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-mono">
                  <input
                    type="checkbox"
                    checked={uploadIsPublished}
                    onChange={(e) => setUploadIsPublished(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-0"
                  />
                  <span>Publish immediately in Gallery</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-mono">
                  <input
                    type="checkbox"
                    checked={uploadFeatured}
                    onChange={(e) => setUploadFeatured(e.target.checked)}
                    className="rounded border-slate-300 text-amber-600 focus:ring-0"
                  />
                  <span>Mark as Featured</span>
                </label>
              </div>

              {/* Progress bar if uploading */}
              {uploading && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-600">Uploading to Telegram servers...</span>
                    <span className="font-bold text-slate-900">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Uploading...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Save to Telegram
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. IMPORT LINK / FILE ID MODAL                                             */}
      {/* ========================================================================= */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-[430px] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-sky-400" />
                <h3 className="font-heading font-black text-sm uppercase tracking-wider">
                  Import Video by Telegram ID or Link
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !importing && setIsImportModalOpen(false)}
                disabled={importing}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Telegram File ID
                </label>
                <input
                  type="text"
                  value={importFileId}
                  onChange={(e) => setImportFileId(e.target.value)}
                  placeholder="e.g. BAACAgUAAxkBAAI..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                />
                <span className="text-[10px] text-slate-400 font-mono">
                  From Telegram Bot API or forwarded video payload
                </span>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-3 text-[10px] font-mono uppercase text-slate-400 font-bold">
                  OR Direct Video URL
                </span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Direct Video Stream URL
                </label>
                <input
                  type="url"
                  value={importDirectUrl}
                  onChange={(e) => setImportDirectUrl(e.target.value)}
                  placeholder="https://example.com/video.mp4"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={importTitle}
                    onChange={(e) => setImportTitle(e.target.value)}
                    placeholder="Video Title"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={importCategory}
                    onChange={(e) => setImportCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                  >
                    {CATEGORIES.filter((c) => c !== "All").map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={importDescription}
                  onChange={(e) => setImportDescription(e.target.value)}
                  placeholder="Optional details..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Thumbnail Image URL (optional)
                </label>
                <input
                  type="url"
                  value={importThumbnail}
                  onChange={(e) => setImportThumbnail(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing || (!importFileId && !importDirectUrl)}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {importing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add to Gallery
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. EDIT VIDEO MODAL                                                        */}
      {/* ========================================================================= */}
      {isEditModalOpen && editingVideo && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-[430px] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-emerald-400" />
                <h3 className="font-heading font-black text-sm uppercase tracking-wider">
                  Edit Video Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    required
                    value={editingVideo.title}
                    onChange={(e) => setEditingVideo({ ...editingVideo, title: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={editingVideo.category}
                    onChange={(e) => setEditingVideo({ ...editingVideo, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                  >
                    {CATEGORIES.filter((c) => c !== "All").map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={editingVideo.description || ""}
                  onChange={(e) => setEditingVideo({ ...editingVideo, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={Array.isArray(editingVideo.tags) ? editingVideo.tags.join(", ") : ""}
                  onChange={(e) =>
                    setEditingVideo({
                      ...editingVideo,
                      tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean)
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Thumbnail Image URL
                </label>
                <input
                  type="text"
                  value={editingVideo.thumbnailUrl || ""}
                  onChange={(e) => setEditingVideo({ ...editingVideo, thumbnailUrl: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-slate-900"
                />
              </div>

              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-mono">
                  <input
                    type="checkbox"
                    checked={editingVideo.isPublished !== false}
                    onChange={(e) => setEditingVideo({ ...editingVideo, isPublished: e.target.checked })}
                    className="rounded border-slate-300 text-slate-900"
                  />
                  <span>Published (Visible to Customers)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-mono">
                  <input
                    type="checkbox"
                    checked={Boolean(editingVideo.featured)}
                    onChange={(e) => setEditingVideo({ ...editingVideo, featured: e.target.checked })}
                    className="rounded border-slate-300 text-amber-600"
                  />
                  <span>Featured Hero</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. PREVIEW VIDEO PLAYER MODAL                                              */}
      {/* ========================================================================= */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-[430px] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Player Header */}
            <div className="px-5 py-3.5 bg-slate-900/90 border-b border-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Film className="w-4 h-4 text-emerald-400 shrink-0" />
                <h3 className="font-heading font-black text-sm uppercase tracking-wider truncate">
                  {previewVideo.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewVideo(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Player */}
            <div className="relative aspect-video bg-black flex items-center justify-center">
              <video
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
                src={
                  previewVideo.directUrl ||
                  `/api/media/stream/${previewVideo.telegramFileId || previewVideo.id}`
                }
              >
                Your browser does not support HTML5 video playback.
              </video>
            </div>

            {/* Player Details Footer */}
            <div className="p-5 space-y-3 bg-slate-900/60 text-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-mono font-bold">
                    {previewVideo.category}
                  </span>
                  {previewVideo.featured && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current" /> Featured
                    </span>
                  )}
                  <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" /> {previewVideo.views || 0} views
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const streamUrl = `${window.location.origin}/api/media/stream/${previewVideo.telegramFileId || previewVideo.id}`;
                      navigator.clipboard.writeText(streamUrl);
                      showToast("Stream URL copied to clipboard!");
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-mono flex items-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" /> Copy Stream URL
                  </button>
                </div>
              </div>

              {previewVideo.description && (
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  {previewVideo.description}
                </p>
              )}

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Storage: Telegram Cloud CDN</span>
                {previewVideo.telegramFileId && (
                  <span className="truncate max-w-xs text-slate-400">
                    File ID: {previewVideo.telegramFileId.slice(0, 16)}...
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
