"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Product } from "@/modules/product";

export function AddProductDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      sku: String(data.get("sku") ?? "").trim(),
      name: String(data.get("name") ?? "").trim(),
      description: String(data.get("description") ?? ""),
      price: Number(data.get("price")),
      cost: Number(data.get("cost")),
      minQuantity: data.get("minQuantity") ? Number(data.get("minQuantity")) : 0,
    };

    const localErrors: Record<string, string> = {};
    if (!payload.sku) localErrors.sku = "SKU は必須です";
    if (!payload.name) localErrors.name = "商品名は必須です";
    if (!Number.isFinite(payload.price) || payload.price < 0)
      localErrors.price = "0 以上の数値を入力してください";
    if (!Number.isFinite(payload.cost) || payload.cost < 0)
      localErrors.cost = "0 以上の数値を入力してください";

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "商品の追加に失敗しました");
        return;
      }
      toast.success(`商品を追加しました: ${payload.name}`);
      form.reset();
      onOpenChange(false);
      await onSuccess();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>商品を追加</DialogTitle>
          <DialogDescription>新しい商品の情報を入力してください。</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="add-sku">SKU</FieldLabel>
              <Input id="add-sku" name="sku" required disabled={pending} />
              {errors.sku && <FieldError>{errors.sku}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="add-name">商品名</FieldLabel>
              <Input id="add-name" name="name" required disabled={pending} />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="add-description">説明</FieldLabel>
              <Input id="add-description" name="description" disabled={pending} />
            </Field>
            <Field>
              <FieldLabel htmlFor="add-price">価格</FieldLabel>
              <Input
                id="add-price"
                name="price"
                type="number"
                step="1"
                min="0"
                required
                disabled={pending}
              />
              {errors.price && <FieldError>{errors.price}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="add-cost">原価</FieldLabel>
              <Input
                id="add-cost"
                name="cost"
                type="number"
                step="1"
                min="0"
                required
                disabled={pending}
              />
              {errors.cost && <FieldError>{errors.cost}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="add-minQuantity">最低在庫数</FieldLabel>
              <Input
                id="add-minQuantity"
                name="minQuantity"
                type="number"
                step="1"
                min="0"
                defaultValue={0}
                disabled={pending}
              />
              <FieldDescription>未設定の場合は 0 が使われます。</FieldDescription>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={pending}>
                  キャンセル
                </Button>
              }
            />
            <Button type="submit" disabled={pending}>
              {pending ? "追加中..." : "追加"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditProductDialog({
  product,
  onClose,
  onSuccess,
}: {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!product) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") ?? "").trim(),
      description: String(data.get("description") ?? ""),
      price: Number(data.get("price")),
      cost: Number(data.get("cost")),
      minQuantity: Number(data.get("minQuantity")),
      leadTimeDays: Number(data.get("leadTimeDays")),
    };

    const localErrors: Record<string, string> = {};
    if (!payload.name) localErrors.name = "商品名は必須です";
    if (!Number.isFinite(payload.price) || payload.price < 0)
      localErrors.price = "0 以上の数値を入力してください";
    if (!Number.isFinite(payload.cost) || payload.cost < 0)
      localErrors.cost = "0 以上の数値を入力してください";
    if (!Number.isInteger(payload.minQuantity) || payload.minQuantity < 0)
      localErrors.minQuantity = "0 以上の整数を入力してください";
    if (!Number.isInteger(payload.leadTimeDays) || payload.leadTimeDays < 0)
      localErrors.leadTimeDays = "0 以上の整数を入力してください";

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "商品の更新に失敗しました");
        return;
      }
      toast.success(`商品を更新しました: ${payload.name}`);
      onClose();
      await onSuccess();
    });
  }

  return (
    <Dialog open={product !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>商品を編集</DialogTitle>
          <DialogDescription>SKU は変更できません。</DialogDescription>
        </DialogHeader>

        {product && (
          <form key={product.id} onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="edit-sku">SKU</FieldLabel>
                <Input id="edit-sku" value={product.sku} disabled readOnly />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-name">商品名</FieldLabel>
                <Input
                  id="edit-name"
                  name="name"
                  defaultValue={product.name}
                  required
                  disabled={pending}
                />
                {errors.name && <FieldError>{errors.name}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-description">説明</FieldLabel>
                <Input
                  id="edit-description"
                  name="description"
                  defaultValue={product.description}
                  disabled={pending}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-price">価格</FieldLabel>
                <Input
                  id="edit-price"
                  name="price"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={product.price}
                  required
                  disabled={pending}
                />
                {errors.price && <FieldError>{errors.price}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-cost">原価</FieldLabel>
                <Input
                  id="edit-cost"
                  name="cost"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={product.cost}
                  required
                  disabled={pending}
                />
                {errors.cost && <FieldError>{errors.cost}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-minQuantity">最低在庫数</FieldLabel>
                <Input
                  id="edit-minQuantity"
                  name="minQuantity"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={product.min_quantity}
                  required
                  disabled={pending}
                />
                <FieldDescription>下回ると在庫アラートに表示されます。</FieldDescription>
                {errors.minQuantity && <FieldError>{errors.minQuantity}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-leadTimeDays">リードタイム (日)</FieldLabel>
                <Input
                  id="edit-leadTimeDays"
                  name="leadTimeDays"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={product.lead_time_days}
                  required
                  disabled={pending}
                />
                <FieldDescription>需要予測の安全在庫・発注点計算に使われます。</FieldDescription>
                {errors.leadTimeDays && <FieldError>{errors.leadTimeDays}</FieldError>}
              </Field>
            </FieldGroup>

            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="outline" disabled={pending}>
                    キャンセル
                  </Button>
                }
              />
              <Button type="submit" disabled={pending}>
                {pending ? "更新中..." : "更新"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProductDialog({
  product,
  onClose,
  onSuccess,
}: {
  product: Product | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!product) return;
    startTransition(async () => {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "商品の削除に失敗しました");
        return;
      }
      toast.success(`商品を削除しました: ${product.name}`);
      onClose();
      await onSuccess();
    });
  }

  return (
    <Dialog open={product !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>商品を削除しますか?</DialogTitle>
          <DialogDescription>
            この操作は取り消せません。商品の在庫データに影響する可能性があります。
          </DialogDescription>
        </DialogHeader>

        {product && (
          <div className="bg-muted/30 rounded-lg border p-3 text-sm">
            <div className="font-medium">{product.name}</div>
            <div className="text-muted-foreground font-mono text-xs">{product.sku}</div>
          </div>
        )}

        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline" disabled={pending}>
                キャンセル
              </Button>
            }
          />
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={pending}>
            {pending ? "削除中..." : "削除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
