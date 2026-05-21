import Link from "next/link";
import { UploadIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { ensureDb } from "@/lib/db-init";
import { Profiler } from "@/lib/profiler";
import { listProducts } from "@/modules/product";

import { ProductsClient } from "./products-client";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  await ensureDb();
  const products = await listProducts();

  return (
    <main className="container mx-auto flex flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">商品管理</h1>
          <p className="text-muted-foreground text-sm">商品の追加・編集・削除を行います。</p>
        </div>
        <Link href="/products/import" className={buttonVariants({ variant: "outline" })}>
          <UploadIcon />
          CSV インポート
        </Link>
      </header>

      <Profiler id="ProductsClient">
        <ProductsClient initialProducts={products} />
      </Profiler>
    </main>
  );
}
