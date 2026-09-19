"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Film,
  Play,
  Pause,
  X,
  Search,
  Eye,
  Clock,
  Share2,
  Sparkles,
  Volume2,
  VolumeX,
  Maximize,
  Check,
  Send,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  RefreshCw
} from "lucide-react";

export interface GalleryVideo {
  id: string;
  title: string;
  description?: string;
  category: string;
  tags?: string[];
  telegramFileId?: string;
  directUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  views?: number;
  featured?: boolean;
  createdAt?: string;
}

interface VideoGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
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

export default function VideoGalleryModal({ isOpen, onClose }: VideoGalleryModalProps) {
  const [videos, setVideos] = useState<GalleryVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeVideo, setActiveVideo] = useState<GalleryVideo | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [copiedLink, setCopiedLink] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch published videos
  const loadGallery = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/media/videos");
      if (!res.ok) throw new Error("Failed to fetch gallery videos");
      const data = await res.json();
      setVideos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error loading video gallery:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadGallery();
    }
  }, [isOpen]);

  // When active video changes, increment view count
  useEffect(() => {
    setVideoError(null);
    if (activeVideo) {
      setIsPlaying(true);
      // Fire view counter increment
      fetch(`/api/media/videos/${activeVideo.id}/view`, { method: "POST" }).catch(() => {});
    } else {
      setIsPlaying(false);
    }
  }, [activeVideo]);

  // Format Duration
  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return "01:30";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Copy share link
  const handleShare = (video: GalleryVideo) => {
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/?tab=media&v=${video.id}`;
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  // Filtered list
  const filteredVideos = videos.filter((video) => {
    if (selectedCategory !== "All" && video.category?.toLowerCase() !== selectedCategory.toLowerCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = video.title?.toLowerCase().includes(q);
      const descMatch = video.description?.toLowerCase().includes(q);
      const tagMatch = Array.isArray(video.tags) && video.tags.some((t) => t.toLowerCase().includes(q));
      if (!titleMatch && !descMatch && !tagMatch) return false;
    }
    return true;
  });

  // Featured video for Hero banner
  const featuredVideo = videos.find((v) => v.featured) || (videos.length > 0 ? videos[0] : null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center">
      <div className="w-full max-w-[430px] h-full bg-slate-950 flex flex-col overflow-hidden text-slate-100 shadow-2xl relative sm:border-x sm:border-slate-800">
        {/* 1. TOP NAVIGATION HEADER */}
      <header className="sticky top-0 z-20 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md px-4 py-3 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-heading font-black text-sm uppercase tracking-wider text-white">
                PRIME Media Vault
              </span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-mono font-black uppercase">
                FREE HD
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-400 hidden sm:block">
              Free streaming powered by Telegram Cloud CDN
            </p>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 max-w-md hidden md:block">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search videos, reviews, and product guides..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-800/80 border border-slate-700/80 rounded-xl text-xs font-mono text-white placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Back to Store"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* 2. CATEGORY PILLS & MOBILE SEARCH */}
      <div className="bg-slate-900/60 border-b border-slate-800/80 px-4 py-2.5 sm:px-6 space-y-2">
        {/* Mobile Search */}
        <div className="relative md:hidden">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-800/80 border border-slate-700 rounded-lg text-xs font-mono text-white placeholder-slate-400 focus:outline-hidden"
          />
        </div>

        {/* Category Scroll */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? "bg-emerald-500 text-slate-950 shadow-xs"
                  : "bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 3. MAIN GALLERY SCROLL AREA */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 max-w-7xl w-full mx-auto space-y-8">
        {/* HERO FEATURED VIDEO BANNER (if available and no specific search) */}
        {!searchQuery && selectedCategory === "All" && featuredVideo && (
          <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-gradient-to-t from-slate-950 via-slate-900 to-slate-900/60 shadow-xl group">
            <div className="relative aspect-video sm:aspect-21/9 max-h-[360px] w-full overflow-hidden">
              <img
                src={
                  featuredVideo.thumbnailUrl ||
                  "https://images.unsplash.com/photo-1544816155-12df9643f363?w=1200&q=80"
                }
                alt={featuredVideo.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-60"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent"></div>

              {/* Center Play Button */}
              <button
                onClick={() => setActiveVideo(featuredVideo)}
                className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-2xl transform group-hover:scale-110 transition-all cursor-pointer"
                title="Play Featured Video"
              >
                <Play className="w-7 h-7 fill-current ml-1" />
              </button>
            </div>

            {/* Banner Caption */}
            <div className="p-4 sm:p-6 absolute bottom-0 left-0 right-0 space-y-2 pointer-events-none">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-mono font-black uppercase flex items-center gap-1">
                  <Sparkles className="w-3 h-3 fill-current" /> Featured Premiere
                </span>
                <span className="px-2 py-0.5 rounded bg-black/60 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono uppercase">
                  {featuredVideo.category}
                </span>
              </div>
              <h2 className="text-lg sm:text-2xl font-heading font-black text-white leading-tight">
                {featuredVideo.title}
              </h2>
              {featuredVideo.description && (
                <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 max-w-2xl font-sans">
                  {featuredVideo.description}
                </p>
              )}
            </div>
          </div>
        )}

        {/* VIDEOS GRID */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Film className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {selectedCategory === "All" ? "All Videos" : selectedCategory} ({filteredVideos.length})
              </span>
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              100% Free Streaming • No Account Required
            </span>
          </div>

          {loading ? (
            <div className="p-16 text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-500 mb-3" />
              <p className="text-xs font-mono text-slate-400">Streaming Telegram Video Index...</p>
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="p-16 text-center border border-dashed border-slate-800 rounded-2xl space-y-2">
              <Film className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-sm font-heading font-bold text-slate-300">No Videos Found</p>
              <p className="text-xs font-mono text-slate-500">
                Check back soon or select a different category.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVideos.map((video) => (
                <div
                  key={video.id}
                  onClick={() => setActiveVideo(video)}
                  className="bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden transition-all duration-200 flex flex-col group cursor-pointer shadow-xs hover:shadow-lg hover:-translate-y-0.5"
                >
                  {/* Thumbnail / Aspect Ratio */}
                  <div className="relative aspect-video bg-slate-950 overflow-hidden">
                    <img
                      src={
                        video.thumbnailUrl ||
                        "https://images.unsplash.com/photo-1544816155-12df9643f363?w=800&q=80"
                      }
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80 group-hover:opacity-100"
                    />

                    {/* Dark gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/30"></div>

                    {/* Play hover button */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-11 h-11 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                        <Play className="w-5 h-5 fill-current ml-0.5" />
                      </div>
                    </div>

                    {/* Category pill */}
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 backdrop-blur-xs text-white text-[9px] font-mono font-bold uppercase tracking-wider">
                      {video.category}
                    </span>

                    {/* Duration badge */}
                    <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/85 backdrop-blur-xs text-white text-[9px] font-mono">
                      {formatDuration(video.duration)}
                    </span>
                  </div>

                  {/* Card Content */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-2">
                    <div className="space-y-1">
                      <h4 className="font-heading font-black text-sm text-white line-clamp-2 leading-snug group-hover:text-emerald-400 transition-colors">
                        {video.title}
                      </h4>
                      {video.description && (
                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                          {video.description}
                        </p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span className="flex items-center gap-1 text-slate-400">
                        <Eye className="w-3.5 h-3.5 text-emerald-400" /> {video.views || 0} views
                      </span>
                      <span className="text-emerald-400/80 text-[10px] font-bold">FREE VIEW</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. ACTIVE THEATER VIDEO PLAYER MODAL                                       */}
      {/* ========================================================================= */}
      {activeVideo && (
        <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-[430px] overflow-hidden shadow-2xl flex flex-col max-h-[95vh]">
            {/* Top Bar */}
            <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3 text-white">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold shrink-0">
                  {activeVideo.category}
                </span>
                <h3 className="font-heading font-black text-sm uppercase tracking-wide truncate">
                  {activeVideo.title}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleShare(activeVideo)}
                  title="Share video"
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-mono flex items-center gap-1 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{copiedLink ? "Copied!" : "Share"}</span>
                </button>
                <button
                  onClick={() => setActiveVideo(null)}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Video Frame */}
            <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              {videoError ? (
                <div className="p-6 text-center space-y-2 max-w-sm">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto">
                    <Film className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-mono font-bold text-red-400">Stream Connection Notice</p>
                  <p className="text-[11px] font-sans text-slate-300 leading-normal">
                    {videoError}
                  </p>
                  <button
                    onClick={() => {
                      setVideoError(null);
                      if (videoRef.current) {
                        videoRef.current.load();
                        videoRef.current.play().catch(() => {});
                      }
                    }}
                    className="mt-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-mono text-emerald-400 rounded-lg cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry Stream
                  </button>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain"
                  src={
                    activeVideo.directUrl ||
                    `/api/media/stream/${activeVideo.telegramFileId || activeVideo.id}`
                  }
                  onError={async () => {
                    // Test stream API directly to get detailed error message
                    try {
                      const checkRes = await fetch(
                        `/api/media/stream/${activeVideo.telegramFileId || activeVideo.id}`
                      );
                      if (!checkRes.ok) {
                        const errMsg = await checkRes.text();
                        setVideoError(errMsg || "Video stream unavailable from Telegram.");
                      } else {
                        setVideoError("Unable to decode video format in this browser.");
                      }
                    } catch {
                      setVideoError("Network error while connecting to media stream.");
                    }
                  }}
                >
                  Your browser does not support HTML5 video streaming.
                </video>
              )}
            </div>

            {/* Video Info & Controls Panel */}
            <div className="p-4 sm:p-5 bg-slate-900/70 overflow-y-auto space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-emerald-400" /> {(activeVideo.views || 0) + 1} views
                  </span>
                  <span>•</span>
                  <span>Storage: Telegram Cloud CDN</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-bold">1080P HD Free</span>
                </div>

                {/* Speed selector */}
                <div className="flex items-center gap-1 text-[11px] font-mono">
                  <span className="text-slate-500 mr-1">Speed:</span>
                  {[1, 1.25, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      onClick={() => {
                        setPlaybackSpeed(spd);
                        if (videoRef.current) {
                          videoRef.current.playbackRate = spd;
                        }
                      }}
                      className={`px-1.5 py-0.5 rounded cursor-pointer ${
                        playbackSpeed === spd ? "bg-emerald-500 text-slate-950 font-bold" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {activeVideo.description && (
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
                  {activeVideo.description}
                </p>
              )}

              {activeVideo.tags && activeVideo.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {activeVideo.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 rounded"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Up Next Recommendation Strip */}
              {videos.filter((v) => v.id !== activeVideo.id).length > 0 && (
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
                    Up Next in Gallery
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {videos
                      .filter((v) => v.id !== activeVideo.id)
                      .slice(0, 4)
                      .map((rec) => (
                        <div
                          key={rec.id}
                          onClick={() => setActiveVideo(rec)}
                          className="bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-xl p-2 flex flex-col gap-1.5 cursor-pointer transition-colors"
                        >
                          <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-900">
                            <img
                              src={rec.thumbnailUrl || "https://images.unsplash.com/photo-1544816155-12df9643f363?w=400&q=80"}
                              alt={rec.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                              <Play className="w-3.5 h-3.5 text-white fill-current" />
                            </div>
                          </div>
                          <p className="text-[11px] font-heading font-bold text-white truncate">
                            {rec.title}
                          </p>
                          <span className="text-[9px] font-mono text-slate-400">
                            {formatDuration(rec.duration)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
