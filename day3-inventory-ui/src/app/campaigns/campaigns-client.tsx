"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { PlusIcon, TagIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Campaign } from "@/modules/campaign";
import type { Order } from "@/modules/order";

const CreateCampaignDialog = dynamic(() =>
  import("./campaign-dialogs").then((m) => m.CreateCampaignDialog),
);
const ApplyCampaignDialog = dynamic(() =>
  import("./campaign-dialogs").then((m) => m.ApplyCampaignDialog),
);

type Props = {
  initialCampaigns: Campaign[];
  initialOrders: Order[];
};

function todayString(): string {
  return new Date().toISOString().split("T")[0]!;
}

function isCampaignActive(campaign: Campaign, today: string): boolean {
  return campaign.active === 1 && campaign.start_date <= today && today <= campaign.end_date;
}

function formatDiscount(campaign: Campaign): string {
  if (campaign.discount_type === "percentage") {
    return `${campaign.discount_value}%`;
  }
  return `¥${campaign.discount_value.toLocaleString()}`;
}

export function CampaignsClient({ initialCampaigns, initialOrders }: Props) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [orders, setOrders] = useState<Order[]>(initialOrders);

  const [createOpen, setCreateOpen] = useState(false);
  const [createMounted, setCreateMounted] = useState(false);
  const [applyTarget, setApplyTarget] = useState<Campaign | null>(null);
  const [applyMounted, setApplyMounted] = useState(false);

  function openCreate() {
    setCreateMounted(true);
    setCreateOpen(true);
  }
  function openApply(c: Campaign) {
    setApplyMounted(true);
    setApplyTarget(c);
  }

  const today = todayString();

  async function refresh() {
    const [campaignsRes, ordersRes] = await Promise.all([
      fetch("/api/campaigns", { cache: "no-store" }),
      fetch("/api/orders", { cache: "no-store" }),
    ]);
    if (campaignsRes.ok) {
      const data = (await campaignsRes.json()) as { campaigns: Campaign[] };
      setCampaigns(data.campaigns);
    }
    if (ordersRes.ok) {
      const data = (await ordersRes.json()) as { orders: Order[] };
      setOrders(data.orders);
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <PlusIcon />
          新規キャンペーン作成
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>キャンペーン一覧</CardTitle>
          <CardDescription>
            登録済みのキャンペーンを表示します。期間内かつ有効なものは「有効」として扱われます。
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">名前</TableHead>
                <TableHead>種別</TableHead>
                <TableHead className="text-right">割引値</TableHead>
                <TableHead>期間</TableHead>
                <TableHead>状態</TableHead>
                <TableHead className="w-[1%] pr-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                    キャンペーンが登録されていません
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((c) => {
                  const active = isCampaignActive(c, today);
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="pl-4 font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant={c.discount_type === "percentage" ? "secondary" : "outline"}>
                          {c.discount_type === "percentage" ? "割引率" : "定額割引"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatDiscount(c)}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {c.start_date} 〜 {c.end_date}
                      </TableCell>
                      <TableCell>
                        {active ? (
                          <Badge variant="secondary">有効</Badge>
                        ) : (
                          <Badge variant="outline">無効</Badge>
                        )}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openApply(c)}
                        >
                          <TagIcon />
                          適用
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {createMounted && (
        <CreateCampaignDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={refresh} />
      )}

      {applyMounted && (
        <ApplyCampaignDialog
          campaign={applyTarget}
          orders={orders}
          onClose={() => setApplyTarget(null)}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}
