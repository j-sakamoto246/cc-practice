"use client";

import { useEffect } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ProductsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="container mx-auto flex flex-1 flex-col gap-4 px-4 py-8">
      <div
        role="alert"
        className="border-destructive/30 bg-destructive/5 text-destructive flex flex-col gap-3 rounded-lg border p-4"
      >
        <div className="flex items-center gap-2 font-medium">
          <TriangleAlertIcon className="size-4" />
          商品一覧の読み込みに失敗しました
        </div>
        <p className="text-sm">{error.message}</p>
        <div>
          <Button variant="outline" onClick={reset}>
            再試行
          </Button>
        </div>
      </div>
    </main>
  );
}
