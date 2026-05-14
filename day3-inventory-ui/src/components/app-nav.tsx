"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3Icon,
  BoxesIcon,
  ClipboardListIcon,
  PackageIcon,
  ReceiptIcon,
  TagIcon,
  TrendingUpIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "ダッシュボード", icon: BarChart3Icon },
  { href: "/products", label: "商品管理", icon: PackageIcon },
  { href: "/stock", label: "在庫", icon: BoxesIcon },
  { href: "/orders", label: "受注管理", icon: ClipboardListIcon },
  { href: "/forecast", label: "需要予測", icon: TrendingUpIcon },
  { href: "/campaigns", label: "キャンペーン", icon: TagIcon },
  { href: "/reports", label: "レポート", icon: ReceiptIcon },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="bg-background/95 sticky top-0 z-40 border-b backdrop-blur">
      <div className="container mx-auto flex min-h-14 flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <BoxesIcon className="size-5" />
          Inventory UI
        </Link>
        <nav className="flex gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "hover:bg-muted inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
                  active ? "bg-muted text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
