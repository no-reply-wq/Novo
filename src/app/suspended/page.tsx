export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
          <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-slate-900 mb-2">This account is currently suspended</h1>
        <p className="text-sm text-slate-500 mb-6">
          Access to this ERP has been paused. If you believe this is a mistake, or need to resolve
          an outstanding issue, please reach out to Novo support.
        </p>
        <a href="mailto:support@lrbc-erp.com" className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">
          Contact Support
        </a>
      </div>
    </div>
  );
}
