"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-slate-100">
      <Card className="w-full max-w-md p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10 text-red-200">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold text-white">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          EduTest AI could not finish that request.
        </p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </Card>
    </main>
  );
}
