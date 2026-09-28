import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2">The page you are looking for does not exist or was removed.</p>
      <Link href="/" className="btn btn-primary mt-6">
        Go to the start page
      </Link>
    </main>
  );
}
