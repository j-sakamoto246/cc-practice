"use client";

import { memo, useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Product } from "@/modules/product";

const AddProductDialog = dynamic(() => import("./product-dialogs").then((m) => m.AddProductDialog));
const EditProductDialog = dynamic(() =>
  import("./product-dialogs").then((m) => m.EditProductDialog),
);
const DeleteProductDialog = dynamic(() =>
  import("./product-dialogs").then((m) => m.DeleteProductDialog),
);

type SortKey = "sku" | "name" | "price" | "cost" | "min_quantity" | "lead_time_days" | "created_at";
type SortDir = "asc" | "desc";

type Props = { initialProducts: Product[] };

export function ProductsClient({ initialProducts }: Props) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [addOpen, setAddOpen] = useState(false);
  const [addMounted, setAddMounted] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [editMounted, setEditMounted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteMounted, setDeleteMounted] = useState(false);

  const openAdd = useCallback(() => {
    setAddMounted(true);
    setAddOpen(true);
  }, []);
  const openEdit = useCallback((p: Product) => {
    setEditMounted(true);
    setEditTarget(p);
  }, []);
  const openDelete = useCallback((p: Product) => {
    setDeleteMounted(true);
    setDeleteTarget(p);
  }, []);
  const closeEdit = useCallback(() => setEditTarget(null), []);
  const closeDelete = useCallback(() => setDeleteTarget(null), []);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? products.filter(
          (p) =>
            p.sku.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q),
        )
      : products;

    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [products, filter, sortKey, sortDir]);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey((curKey) => {
      if (curKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return curKey;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/products", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { products: Product[] };
      setProducts(data.products);
    }
    router.refresh();
  }, [router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="SKU・商品名・説明で絞り込み"
          aria-label="SKU・商品名・説明で絞り込み"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full max-w-sm"
        />
        <Button onClick={openAdd}>
          <PlusIcon />
          商品を追加
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                sortKey="sku"
                label="SKU"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <SortableHead
                sortKey="name"
                label="商品名"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
              <TableHead>説明</TableHead>
              <SortableHead
                sortKey="price"
                label="価格"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="text-right"
              />
              <SortableHead
                sortKey="cost"
                label="原価"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="text-right"
              />
              <SortableHead
                sortKey="min_quantity"
                label="最低在庫"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="text-right"
              />
              <SortableHead
                sortKey="lead_time_days"
                label="リードタイム"
                activeKey={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="text-right"
              />
              <TableHead className="w-[1%] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground h-24 text-center">
                  {products.length === 0 ? "商品が登録されていません" : "該当する商品がありません"}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((p) => (
                <ProductRow key={p.id} product={p} onEdit={openEdit} onDelete={openDelete} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {addMounted && (
        <AddProductDialog open={addOpen} onOpenChange={setAddOpen} onSuccess={refresh} />
      )}

      {editMounted && (
        <EditProductDialog product={editTarget} onClose={closeEdit} onSuccess={refresh} />
      )}

      {deleteMounted && (
        <DeleteProductDialog product={deleteTarget} onClose={closeDelete} onSuccess={refresh} />
      )}
    </div>
  );
}

const ProductRow = memo(function ProductRow({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: (p: Product) => void;
  onDelete: (p: Product) => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{product.sku}</TableCell>
      <TableCell className="font-medium">{product.name}</TableCell>
      <TableCell className="text-muted-foreground max-w-xs truncate">
        {product.description || "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">¥{product.price.toLocaleString()}</TableCell>
      <TableCell className="text-right tabular-nums">¥{product.cost.toLocaleString()}</TableCell>
      <TableCell className="text-right tabular-nums">{product.min_quantity}</TableCell>
      <TableCell className="text-right tabular-nums">{product.lead_time_days} 日</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(product)}
            aria-label={`${product.name} を編集`}
          >
            <PencilIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(product)}
            aria-label={`${product.name} を削除`}
          >
            <TrashIcon />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

const SortableHead = memo(function SortableHead({
  sortKey,
  label,
  activeKey,
  dir,
  onSort,
  className,
}: {
  sortKey: SortKey;
  label: string;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="hover:text-foreground inline-flex items-center gap-1 text-left font-medium"
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUpIcon className="size-3" />
          ) : (
            <ArrowDownIcon className="size-3" />
          )
        ) : (
          <ArrowUpDownIcon className="text-muted-foreground/60 size-3" />
        )}
      </button>
    </TableHead>
  );
});
