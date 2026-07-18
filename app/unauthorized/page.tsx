import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">You do not have access to that page</h1>
      <p className="text-muted-foreground">
        Your role does not permit viewing the page you requested.
      </p>
      <Link href="/" className="text-sm font-medium underline underline-offset-4">
        Go to your home page
      </Link>
    </main>
  );
}
