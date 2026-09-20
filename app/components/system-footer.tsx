export default function SystemFooter() {
  return (
    <footer
      id="system-wide-proprietary-footer" data-system-footer="true"
      className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto z-50 bg-slate-900 text-white py-1 px-3 text-center pointer-events-auto select-none"
    >
      <p className="font-heading font-normal uppercase text-[10px] tracking-wider truncate text-slate-200 whitespace-nowrap leading-tight">
        USE OF PRIME SYSTEM IS PROPRIETARY. DO NOT DISTRIBUTE OR COPY.
      </p>
    </footer>
  );
}
