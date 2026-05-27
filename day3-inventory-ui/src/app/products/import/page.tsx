import { ensureDb } from "@/lib/db-init";

import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function ProductImportPage() {
  await ensureDb();

  return (
    <main id="main-content" className="container mx-auto flex flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">CSV 商品インポート</h1>
        <p className="text-muted-foreground text-sm">CSV ファイルから商品を一括登録します。</p>
      </header>

      <ImportClient />
    </main>
  );
}
