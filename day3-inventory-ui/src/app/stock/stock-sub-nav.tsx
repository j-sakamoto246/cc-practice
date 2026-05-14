"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRightLeftIcon, BoxesIcon, LayersIcon, PackageCheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/stock", label: "入出庫", icon: PackageCheckIcon, exact: true },
  { href: "/stock/inventory", label: "在庫一覧", icon: BoxesIcon },
  { href: "/stock/lots", label: "ロット", icon: LayersIcon },
  { href: "/stock/transfer", label: "倉庫間移動", icon: ArrowRightLeftIcon },
];

export function StockSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b pb-2">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
              active ? "bg-muted text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
