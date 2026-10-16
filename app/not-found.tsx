import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
      <h2 className="text-2xl font-bold mb-2">Page Not Found</h2>
      <p className="text-gray-400 mb-6">Could not find requested resource</p>
      <Link
        href="/"
        className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-medium transition-colors"
      >
        Return Home
      </Link>
    </div>
  );
}
