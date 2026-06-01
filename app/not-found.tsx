import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-slate-100">
      <Card className="w-full max-w-md p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10 text-blue-200">
          <SearchX className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold text-white">Page not found</h1>
        <p className="mt-2 text-sm text-slate-400">
          The page you opened is not available in EduTest AI.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Go Home</Link>
        </Button>
      </Card>
    </main>
  );
}
