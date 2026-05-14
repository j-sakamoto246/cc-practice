import type { ReactNode } from "react";

import { StockSubNav } from "./stock-sub-nav";

export default function StockLayout({ children }: { children: ReactNode }) {
  return (
    <main className="container mx-auto flex flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">在庫</h1>
          <p className="text-muted-foreground text-sm">
            入出庫・在庫一覧・ロット・倉庫間移動を切り替えて操作します。
          </p>
        </div>
        <StockSubNav />
      </header>
      {children}
    </main>
  );
}
