"use client";

import { getServerlessVideos, resolveTelegramVideo } from "@/lib/telegram-serverless-client";
import TelegramMediaImage from "@/app/components/telegram-media-image";

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
  mediaId?: string;
  duration?: number;
  views?: number;
  rating?: number;
  publishedAt?: string;
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
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [streamAttempt, setStreamAttempt] = useState(0);
  const [theaterFullscreen, setTheaterFullscreen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch published videos
  const loadGallery = async () => {
    try {
      setLoading(true);
      setGalleryError(null);
      setVideos(await getServerlessVideos());
    } catch (err) {
      setGalleryError(err instanceof Error ? err.message : "The video gallery could not be loaded.");
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
    setStreamUrl("");
    setTheaterFullscreen(false);
    if (activeVideo) {
      setIsPlaying(false);
      let cancelled = false;
      const source = activeVideo.directUrl || (activeVideo.mediaId ? "" : activeVideo.telegramFileId || "");
      (source && !source.startsWith("tgmedia:")
        ? Promise.resolve(source)
        : resolveTelegramVideo(source.startsWith("tgmedia:") ? source : activeVideo.mediaId || activeVideo.id)
      ).then((url) => {
        if (!cancelled) { setStreamUrl(url); setIsPlaying(true); }
      }).catch((error) => {
        if (!cancelled) setVideoError(error instanceof Error ? error.message : "Video stream unavailable.");
      });
      return () => { cancelled = true; };
    } else {
      setIsPlaying(false);
    }
  }, [activeVideo, streamAttempt]);

  useEffect(() => {
    if (!activeVideo || typeof window === "undefined") return;
    type TelegramFullscreenWebApp = {
      isFullscreen?: boolean;
      onEvent?: (event: string, handler: () => void) => void;
      offEvent?: (event: string, handler: () => void) => void;
    };
    const webApp = (window as Window & { Telegram?: { WebApp?: TelegramFullscreenWebApp } }).Telegram?.WebApp;
    const syncFullscreen = () => setTheaterFullscreen(Boolean(webApp?.isFullscreen));
    webApp?.onEvent?.("fullscreenChanged", syncFullscreen);
    return () => webApp?.offEvent?.("fullscreenChanged", syncFullscreen);
  }, [activeVideo]);

  const toggleTheaterFullscreen = () => {
    type TelegramFullscreenWebApp = {
      isFullscreen?: boolean;
      requestFullscreen?: () => void;
      exitFullscreen?: () => void;
    };
    const webApp = (window as Window & { Telegram?: { WebApp?: TelegramFullscreenWebApp } }).Telegram?.WebApp;
    if (theaterFullscreen) {
      setTheaterFullscreen(false);
      if (webApp?.isFullscreen) webApp.exitFullscreen?.();
      return;
    }
    setTheaterFullscreen(true);
    try { webApp?.requestFullscreen?.(); } catch { /* Keep the in-app theater fallback. */ }
  };

  const closeActiveVideo = () => {
    if (theaterFullscreen) {
      const webApp = (window as Window & { Telegram?: { WebApp?: { isFullscreen?: boolean; exitFullscreen?: () => void } } }).Telegram?.WebApp;
      if (webApp?.isFullscreen) webApp.exitFullscreen?.();
    }
    setTheaterFullscreen(false);
    setActiveVideo(null);
  };

  // Format Duration
  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };
  const formatPublishedDate = (date?: string) => {
    if (!date) return "Date unavailable";
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
      <div className="w-full bg-gray-50 flex justify-center py-[4.8px]">
      <div className="w-full max-w-[430px] min-h-[calc(100vh-120px)] bg-gray-50 flex flex-col overflow-hidden text-slate-900 shadow-sm relative border-x border-slate-200">
        {/* 1. TOP NAVIGATION HEADER */}
      <header className="sticky top-0 z-20 bg-white/95 border-b border-slate-200 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-heading font-normal text-sm uppercase tracking-wider text-slate-900">
                PRIME Media Vault
              </span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[9px] font-mono font-black uppercase">
                FREE HD
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-500">
              Product videos and customer guides
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
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-emerald-700 transition-colors"
          />
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
          title="Back to Store"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* 2. CATEGORY PILLS & MOBILE SEARCH */}
      <div className="bg-white border-b border-slate-200 px-3 py-2.5">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(112px,0.72fr)] items-center gap-2">
          <div className="relative min-w-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search videos"
            className="h-10 w-full min-w-0 pl-8 pr-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-hidden focus:border-emerald-700"
          />
        </div>
          <select aria-label="Filter videos by category" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="h-10 min-w-0 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-mono text-slate-700 focus:outline-hidden focus:border-emerald-700">
            {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat === "All" ? "All categories" : cat}</option>)}
          </select>
        </div>
      </div>

      {/* 3. MAIN GALLERY SCROLL AREA */}
      <div className="flex-1 overflow-y-auto px-3 py-4 max-w-[430px] w-full mx-auto space-y-5">
        {/* HERO FEATURED VIDEO BANNER (if available and no specific search) */}
        {!searchQuery && selectedCategory === "All" && featuredVideo && (
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-md group">
            <div className="relative aspect-video sm:aspect-21/9 max-h-[360px] w-full overflow-hidden">
              <TelegramMediaImage
                src={featuredVideo.thumbnailUrl || "https://images.unsplash.com/photo-1544816155-12df9643f363?w=1200&q=80"}
                alt={featuredVideo.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-45"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/70 to-transparent"></div>

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
                  <span className="px-2 py-0.5 rounded bg-amber-300 text-slate-900 text-[10px] font-mono font-black uppercase flex items-center gap-1">
                  <Sparkles className="w-3 h-3 fill-current" /> Featured Premiere
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-mono uppercase">
                  {featuredVideo.category}
                </span>
              </div>
              <h2 className="text-lg font-heading font-normal text-slate-900 leading-tight">
                {featuredVideo.title}
              </h2>
              {featuredVideo.description && (
                <p className="text-xs text-slate-700 line-clamp-2 font-sans">
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
              <Film className="w-3.5 h-3.5 text-emerald-700" />
              <span>
                {selectedCategory === "All" ? "All Videos" : selectedCategory} ({filteredVideos.length})
              </span>
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              Product videos · Free to watch
            </span>
          </div>

          {loading ? (
            <div className="p-16 text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-500 mb-3" />
              <p className="text-xs font-mono text-slate-400">Streaming Telegram Video Index...</p>
            </div>
          ) : galleryError ? (
            <div className="p-8 text-center border border-amber-900/60 bg-amber-950/20 rounded-2xl space-y-2">
              <Film className="w-8 h-8 mx-auto text-amber-400" />
              <p className="text-sm font-heading font-normal text-slate-200">Gallery unavailable</p>
              <p className="text-xs font-mono text-slate-400">{galleryError}</p>
              <button onClick={() => void loadGallery()} className="px-3 py-1.5 rounded-lg bg-slate-800 text-emerald-300 text-xs font-mono">Retry</button>
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="p-10 text-center border border-dashed border-slate-300 bg-white rounded-2xl space-y-2">
              <Film className="w-10 h-10 mx-auto text-emerald-700" />
              <p className="text-sm font-heading font-normal text-slate-800">No Videos Found</p>
              <p className="text-xs font-mono text-slate-500">
                Check back soon or select a different category.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {filteredVideos.map((video) => (
                <div
                  key={video.id}
                  onClick={() => setActiveVideo(video)}
                  className="min-w-0 bg-white hover:bg-slate-50 border border-slate-200 hover:border-emerald-300 rounded-xl overflow-hidden transition-all duration-200 flex flex-col group cursor-pointer shadow-sm hover:shadow-md"
                >
                  {/* Thumbnail / Aspect Ratio */}
                  <div className="relative aspect-video bg-slate-100 overflow-hidden">
                    <TelegramMediaImage
                      src={video.thumbnailUrl || "/primefinal.png"}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90 group-hover:opacity-100"
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
                  <div className="min-w-0 p-2.5 flex-1 flex flex-col justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <h4 className="font-heading font-normal text-[13px] text-slate-900 line-clamp-2 leading-tight group-hover:text-emerald-800 transition-colors">
                        {video.title}
                      </h4>
                      <p className="flex items-center gap-1 text-[9px] font-mono text-slate-500"><Clock className="h-3 w-3 shrink-0 text-emerald-700"/><span className="truncate">{formatPublishedDate(video.publishedAt || video.createdAt)}</span></p>
                    </div>

                    <div className="grid grid-cols-2 gap-x-1 gap-y-1 border-t border-slate-100 pt-1.5 text-[9px] font-mono text-slate-600">
                      <span className="flex min-w-0 items-center gap-1"><Clock className="h-3 w-3 shrink-0 text-emerald-700"/><span>{formatDuration(video.duration)}</span></span>
                      <span className="flex min-w-0 items-center gap-1"><Sparkles className="h-3 w-3 shrink-0 text-amber-500"/><span>{typeof video.rating === "number" && video.rating > 0 ? video.rating.toFixed(1) : "—"} rating</span></span>
                      <span className="col-span-2 flex min-w-0 items-center gap-1"><Eye className="h-3 w-3 shrink-0 text-emerald-700"/><span>{(video.views || 0).toLocaleString()} views</span></span>
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
        <div className={`fixed inset-0 z-60 flex justify-center animate-in fade-in duration-200 ${theaterFullscreen ? "bg-slate-950 p-0" : "items-center bg-slate-950/65 backdrop-blur-sm p-2"}`}>
          <div role="dialog" aria-modal="true" aria-label={activeVideo.title} className={`bg-white border border-slate-200 w-full max-w-[430px] overflow-hidden shadow-2xl flex flex-col ${theaterFullscreen ? "h-[100dvh] max-h-[100dvh] rounded-none" : "max-h-[calc(100dvh-16px)] rounded-xl"}`}>
            {/* Top Bar */}
            <div className="px-3 py-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 text-slate-900">
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-mono font-bold shrink-0">
                  {activeVideo.category}
                </span>
                <h3 className="font-heading font-normal text-sm uppercase tracking-wide text-slate-900 truncate">
                  {activeVideo.title}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleShare(activeVideo)}
                  title="Share video"
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-mono flex items-center gap-1 cursor-pointer"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{copiedLink ? "Copied!" : "Share"}</span>
                </button>
                <button
                  onClick={closeActiveVideo}
                  aria-label="Close video"
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Video Frame */}
            <div className={`relative bg-slate-950 flex items-center justify-center overflow-hidden ${theaterFullscreen ? "flex-1 min-h-0" : "aspect-video"}`}>
              {videoError ? (
                <div className="p-6 text-center space-y-2 max-w-sm">
                  <div className="w-10 h-10 rounded-full bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto">
                    <Film className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-mono font-bold text-red-300">Stream connection issue</p>
                  <p className="text-[11px] font-sans text-white leading-normal">
                    {videoError}
                  </p>
                  <button
                    onClick={() => {
                      setVideoError(null);
                      setStreamUrl("");
                      setStreamAttempt((attempt) => attempt + 1);
                    }}
                    className="mt-2 px-3 py-1 bg-white hover:bg-emerald-50 text-xs font-mono text-emerald-800 rounded-lg cursor-pointer inline-flex items-center gap-1.5"
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
                  src={streamUrl || undefined}
                  onError={() => setVideoError("Unable to play this video format in the current browser.")}
                >
                  Your browser does not support HTML5 video streaming.
                </video>
              )}
              {!videoError && <button
                type="button"
                onClick={toggleTheaterFullscreen}
                aria-label={theaterFullscreen ? "Exit fullscreen video" : "View video fullscreen"}
                title={theaterFullscreen ? "Exit fullscreen" : "Fullscreen"}
                className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-md bg-slate-950/75 text-white shadow hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >{theaterFullscreen ? <X className="h-4 w-4"/> : <Maximize className="h-4 w-4"/>}</button>}
            </div>

            {/* Video Info & Controls Panel */}
            {!theaterFullscreen && <div className="p-3 bg-slate-50 border-t border-slate-200 overflow-y-auto space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-mono text-slate-600">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-emerald-700" /> {(activeVideo.views || 0) + 1} views
                  </span>
                  <span>•</span>
                  <span>Storage: Telegram Cloud CDN</span>
                  <span>•</span>
                  <span className="text-emerald-800 font-bold">1080P HD Free</span>
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
                        playbackSpeed === spd ? "bg-emerald-600 text-white font-bold" : "bg-white border border-slate-200 text-slate-600"
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>

              {activeVideo.description && (
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-sans">
                  {activeVideo.description}
                </p>
              )}

              {activeVideo.tags && activeVideo.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {activeVideo.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Up Next Recommendation Strip */}
              {videos.filter((v) => v.id !== activeVideo.id).length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
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
                          className="bg-white hover:bg-emerald-50 border border-slate-200 rounded-lg p-2 flex flex-col gap-1.5 cursor-pointer transition-colors"
                        >
                          <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-100">
                            <TelegramMediaImage
                              src={rec.thumbnailUrl || "https://images.unsplash.com/photo-1544816155-12df9643f363?w=400&q=80"}
                              alt={rec.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-slate-950/25 flex items-center justify-center">
                              <Play className="w-3.5 h-3.5 text-white fill-current" />
                            </div>
                          </div>
                          <p className="text-[11px] font-heading font-normal text-slate-900 truncate">
                            {rec.title}
                          </p>
                          <span className="text-[9px] font-mono text-slate-500">
                            {formatDuration(rec.duration)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
