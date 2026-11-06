export const metadata = {
  title: 'Offline — Novo',
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6">
      <div className="max-w-md text-center space-y-4">
        <div className="text-5xl" aria-hidden="true">📡</div>
        <h1 className="text-2xl font-semibold text-gray-900">You&apos;re currently offline</h1>
        <p className="text-gray-600">
          Your work is saved and will sync automatically when you reconnect to the internet.
        </p>
        <p className="text-sm text-gray-400">
          Any forms you submit while offline are safely queued and will be sent once your
          connection is restored.
        </p>
      </div>
    </main>
  );
}
