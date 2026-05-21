"use client";

import { useMemo, useState, useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ApplyCampaignResult, Campaign } from "@/modules/campaign";
import type { Order } from "@/modules/order";

export function CreateCampaignDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") ?? "").trim(),
      discount_type: discountType,
      discount_value: Number(data.get("discount_value")),
      start_date: String(data.get("start_date") ?? ""),
      end_date: String(data.get("end_date") ?? ""),
    };

    const localErrors: Record<string, string> = {};
    if (!payload.name) localErrors.name = "キャンペーン名は必須です";
    if (!Number.isFinite(payload.discount_value) || payload.discount_value <= 0)
      localErrors.discount_value = "0より大きい値を入力してください";
    if (payload.discount_type === "percentage" && payload.discount_value > 100)
      localErrors.discount_value = "割引率は100以下を指定してください";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.start_date))
      localErrors.start_date = "YYYY-MM-DD 形式で入力してください";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.end_date))
      localErrors.end_date = "YYYY-MM-DD 形式で入力してください";
    if (!localErrors.start_date && !localErrors.end_date && payload.end_date < payload.start_date)
      localErrors.end_date = "終了日は開始日以降を指定してください";

    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "キャンペーンの作成に失敗しました");
        return;
      }
      toast.success(`キャンペーンを作成しました: ${payload.name}`);
      form.reset();
      setDiscountType("percentage");
      onOpenChange(false);
      await onSuccess();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setErrors({});
          setDiscountType("percentage");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新規キャンペーン作成</DialogTitle>
          <DialogDescription>キャンペーンの情報を入力してください。</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="campaign-name">名前</FieldLabel>
              <Input id="campaign-name" name="name" required disabled={pending} />
              {errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="campaign-discount-type">割引タイプ</FieldLabel>
              <Select
                value={discountType}
                onValueChange={(v) => {
                  if (v === "percentage" || v === "fixed") setDiscountType(v);
                }}
                disabled={pending}
              >
                <SelectTrigger id="campaign-discount-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">割引率 (percentage)</SelectItem>
                  <SelectItem value="fixed">定額割引 (fixed)</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                割引率は 0〜100 の % 値、定額割引は金額を入力します。
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="campaign-discount-value">割引値</FieldLabel>
              <Input
                id="campaign-discount-value"
                name="discount_value"
                type="number"
                step="1"
                min="1"
                required
                disabled={pending}
              />
              {errors.discount_value && <FieldError>{errors.discount_value}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="campaign-start-date">開始日</FieldLabel>
              <Input
                id="campaign-start-date"
                name="start_date"
                type="date"
                required
                disabled={pending}
              />
              {errors.start_date && <FieldError>{errors.start_date}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="campaign-end-date">終了日</FieldLabel>
              <Input
                id="campaign-end-date"
                name="end_date"
                type="date"
                required
                disabled={pending}
              />
              {errors.end_date && <FieldError>{errors.end_date}</FieldError>}
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
              {pending ? "作成中..." : "作成"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ApplyCampaignDialog({
  campaign,
  orders,
  onClose,
  onSuccess,
}: {
  campaign: Campaign | null;
  orders: Order[];
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const pendingOrders = useMemo(() => orders.filter((o) => o.status === "pending"), [orders]);
  const [orderId, setOrderId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  function handleApply() {
    if (!campaign) return;
    if (!orderId) {
      toast.error("受注を選択してください");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/campaigns/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, campaign_id: campaign.id }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "キャンペーンの適用に失敗しました");
        return;
      }
      const body = (await res.json()) as { result: ApplyCampaignResult };
      const r = body.result;
      toast.success(
        `キャンペーンを適用しました (元金額 ¥${r.original_amount.toLocaleString()} / 割引 ¥${r.discount_amount.toLocaleString()} / 最終 ¥${r.final_amount.toLocaleString()})`,
      );
      setOrderId("");
      onClose();
      await onSuccess();
    });
  }

  const hasPending = pendingOrders.length > 0;

  return (
    <Dialog
      open={campaign !== null}
      onOpenChange={(o) => {
        if (!o) {
          setOrderId("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>キャンペーンを適用</DialogTitle>
          <DialogDescription>
            {campaign
              ? `${campaign.name} を pending な受注に適用します。`
              : "キャンペーンを受注に適用します。"}
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="apply-order">受注</FieldLabel>
            <Select
              value={orderId}
              onValueChange={(v) => {
                if (typeof v === "string") setOrderId(v);
              }}
              disabled={pending || !hasPending}
            >
              <SelectTrigger id="apply-order" className="w-full">
                <SelectValue placeholder="受注を選択" />
              </SelectTrigger>
              <SelectContent>
                {pendingOrders.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.customer_name} / ¥{o.total_amount.toLocaleString()} ({o.id.slice(0, 8)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!hasPending && (
              <FieldDescription>適用可能な受注 (pending) がありません</FieldDescription>
            )}
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
          <Button type="button" onClick={handleApply} disabled={pending || !hasPending || !orderId}>
            {pending ? "適用中..." : "適用する"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
