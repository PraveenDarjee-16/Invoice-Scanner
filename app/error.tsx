"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2">The page could not be loaded. This is usually temporary.</p>
      <button type="button" className="btn btn-primary mt-6" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
