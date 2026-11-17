'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, File, RefreshCw, Search, Upload, X } from 'lucide-react';
import TelegramMediaImage from '@/app/components/telegram-media-image';
import { getTelegramServerlessSession } from '@/lib/telegram-serverless-client';
import { assetAccessUrl, isReusableImage, listLibraryAssets, uploadLibraryAsset, type LibraryAsset } from '@/lib/asset-library';
import './asset-library.css';

function fileSize(size: number) { return size >= 1048576 ? `${(size / 1048576).toFixed(1)} MiB` : `${Math.ceil(size / 1024)} KiB`; }
type Props = { onBack: () => void; onSelect?: (asset: LibraryAsset) => void };
export default function AssetLibraryPanel({ onBack, onSelect }: Props) {
  const [authorized, setAuthorized] = useState(false), [assets, setAssets] = useState<LibraryAsset[]>([]), [loading, setLoading] = useState(true), [uploading, setUploading] = useState(false), [progress, setProgress] = useState(0), [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [page, setPage] = useState(1), [error, setError] = useState(''), [warning, setWarning] = useState(''), [notice, setNotice] = useState(''), [preview, setPreview] = useState<{ asset: LibraryAsset; url: string } | null>(null);
  const uploadLock = useRef(false), mounted = useRef(true), pendingFile = useRef<globalThis.File | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await listLibraryAssets(); if (mounted.current) { setAssets(result.assets); setWarning(result.warning); } }
    catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Assets could not be loaded.'); }
    finally { if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    getTelegramServerlessSession().then(session => {
      if (!active) return;
      if (!session.authenticated || !session.isAdmin) { setError('Verified admin access is required.'); setLoading(false); return; }
      setAuthorized(true); void load();
    }).catch(err => { if (active) { setError(err?.message || 'Admin access could not be checked.'); setLoading(false); } });
    return () => { active = false; };
  }, [load]);
  useEffect(() => { setPage(1); }, [search, filter]);
  const matches = assets.filter(asset => (!onSelect || isReusableImage(asset)) && `${asset.name} ${asset.contentType}`.toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || filter === 'image' && asset.contentType.startsWith('image/') || filter === 'video' && asset.contentType.startsWith('video/') || filter === 'other' && !/^(image|video)\//.test(asset.contentType)));
  const pageCount = Math.max(1, Math.ceil(matches.length / 15)), currentPage = Math.min(page, pageCount);
  const upload = async (file: globalThis.File) => {
    if (uploadLock.current) return;
    uploadLock.current = true; pendingFile.current = file; setUploading(true); setProgress(0); setError(''); setNotice('');
    try {
      const asset = await uploadLibraryAsset(file, setProgress);
      if (mounted.current) { setAssets(rows => [asset, ...rows.filter(row => row.storageType !== asset.storageType || row.id !== asset.id)]); setPage(1); setSearch(''); setFilter('all'); setNotice(`${asset.name} saved to Assets.`); }
      pendingFile.current = null;
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Upload failed.'); }
    finally { uploadLock.current = false; if (mounted.current) setUploading(false); }
  };
  const open = async (asset: LibraryAsset, download = false) => {
    setError('');
    try {
      const url = await assetAccessUrl(asset);
      if (!mounted.current) return;
      if (download || !/^(image|video|audio)\//.test(asset.contentType)) {
        const link = document.createElement('a'); link.href = url + (asset.storageType === 'r2' ? (url.includes('?') ? '&' : '?') + 'download=1' : ''); link.download = asset.name; link.target = '_blank'; link.rel = 'noopener noreferrer'; document.body.append(link); link.click(); link.remove();
      } else setPreview({ asset, url });
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'File could not be opened.'); }
  };
  return <main className="serverless-admin-panel asset-library mx-auto w-full max-w-[430px] text-slate-900" aria-label={onSelect ? 'Choose image from Assets' : 'Asset storage'}>
    <header className="serverless-panel-header"><div className="flex min-w-0 items-center gap-2"><button type="button" className="serverless-action" aria-label={onSelect ? 'Close Assets' : 'Back to Dashboard'} disabled={uploading} onClick={onBack}>{onSelect ? <X /> : <ArrowLeft />}</button><h1 className="font-heading font-normal">{onSelect ? 'Choose Image' : 'Assets'}</h1></div><button type="button" className="serverless-action" aria-label="Refresh Assets" disabled={!authorized || loading || uploading} onClick={() => void load()}><RefreshCw /></button></header>
    {error && <p role="alert" className="asset-message asset-error">{error}</p>}{warning && <p role="status" className="asset-message">{warning}</p>}{notice && <p role="status" className="asset-message">{notice}</p>}
    {authorized && <>
      <div className="asset-controls"><label className="serverless-search"><Search /><input aria-label="Search Assets" placeholder="Search files" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Asset type" value={onSelect ? 'image' : filter} disabled={Boolean(onSelect)} onChange={event => setFilter(event.target.value)}><option value="all">All Files</option><option value="image">Images</option><option value="video">Videos</option><option value="other">Other Files</option></select></div>
      {!onSelect && <div className="asset-upload"><label className="serverless-action"><Upload />{uploading ? `Uploading ${progress}%` : 'Upload File'}<input type="file" className="sr-only" aria-label="Upload asset file" disabled={uploading || loading} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file); }} /></label><small>Up to 90 MiB. Images are available for shop use; other files stay private.</small></div>}
      {pendingFile.current && !uploading && <button type="button" className="serverless-action" onClick={() => { if (pendingFile.current) void upload(pendingFile.current); }}>Retry Upload</button>}
      {uploading && <progress aria-label="Upload progress" max="100" value={progress} />}
      <p className="asset-caption">{loading ? 'Loading Assets…' : `${matches.length} ${onSelect ? 'images' : 'files'}`}</p>
      <div className="asset-list">{matches.slice((currentPage - 1) * 15, currentPage * 15).map(asset => <article className="asset-row" key={`${asset.storageType}:${asset.id}`}>
        <button type="button" className="asset-preview" aria-label={`Preview ${asset.name}`} onClick={() => void open(asset)}>{isReusableImage(asset) ? <TelegramMediaImage src={asset.reference} alt={asset.name} loading="lazy" /> : <File />}</button>
        <div className="asset-copy"><strong>{asset.name}</strong><small>{fileSize(asset.size)} · {asset.storageType === 'r2' ? 'R2' : 'Telegram'}</small><small>{asset.contentType}</small></div>
        {onSelect ? <button type="button" className="serverless-action" aria-label={`Use ${asset.name}`} onClick={() => onSelect(asset)}>Use</button> : <button type="button" className="serverless-action" aria-label={`Download ${asset.name}`} onClick={() => void open(asset, true)}><Download /></button>}
      </article>)}</div>
      {!loading && !matches.length && <p className="asset-message">{onSelect ? 'No reusable images found. Upload an image in Admin → Assets first.' : 'No files match. Upload a file to start your library.'}</p>}
      {matches.length > 15 && <nav className="asset-pagination" aria-label="Asset pages"><button type="button" className="serverless-action" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage}/{pageCount}</span><button type="button" className="serverless-action" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
    </>}
    {loading && !authorized && <p className="asset-message" role="status">Checking admin access…</p>}
    {preview && <div className="asset-preview-backdrop"><section role="dialog" aria-modal="true" aria-label={`Preview ${preview.asset.name}`} className="asset-preview-dialog"><header><strong>{preview.asset.name}</strong><button type="button" aria-label="Close file preview" onClick={() => setPreview(null)}><X /></button></header>{preview.asset.contentType.startsWith('image/') ? <img src={preview.url} alt={preview.asset.name} /> : preview.asset.contentType.startsWith('video/') ? <video src={preview.url} controls playsInline /> : <audio src={preview.url} controls />}</section></div>}
  </main>;
}

export function AssetPickerButton({ onSelect, disabled = false }: { onSelect: (reference: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="serverless-action asset-picker-trigger" disabled={disabled} onClick={() => setOpen(true)}>Choose from Assets</button>{open && <div className="asset-picker-backdrop"><section className="asset-picker-dialog" role="dialog" aria-modal="true" aria-label="Asset image picker"><AssetLibraryPanel onBack={() => setOpen(false)} onSelect={asset => { onSelect(asset.reference); setOpen(false); }} /></section></div>}</>;
}
