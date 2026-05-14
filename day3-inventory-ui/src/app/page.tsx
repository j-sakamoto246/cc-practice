import {
  AlertTriangleIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BoxesIcon,
  PackageIcon,
  WalletIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ensureDb } from "@/lib/db-init";
import {
  getDashboardSummary,
  getRecentMovements,
  getSalesChart,
  type SalesChartPoint,
} from "@/modules/dashboard";
import { getStockAlerts } from "@/modules/stock";

export const dynamic = "force-dynamic";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
const num = new Intl.NumberFormat("ja-JP");
const dateTime = new Intl.DateTimeFormat("ja-JP", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const monthDay = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" });

export default async function DashboardPage() {
  await ensureDb();

  const [summary, movements, alerts, salesChart] = await Promise.all([
    getDashboardSummary(),
    getRecentMovements(10),
    getStockAlerts(),
    getSalesChart(7),
  ]);

  return (
    <main className="container mx-auto flex flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">ダッシュボード</h1>
        <p className="text-muted-foreground text-sm">在庫の概況と直近の動きを確認します。</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          title="総商品数"
          value={num.format(summary.total_products)}
          unit="件"
          icon={<PackageIcon className="size-4" />}
        />
        <SummaryCard
          title="総在庫数"
          value={num.format(summary.total_quantity)}
          unit="点"
          icon={<BoxesIcon className="size-4" />}
        />
        <SummaryCard
          title="在庫金額（原価ベース）"
          value={yen.format(Math.round(summary.inventory_value))}
          icon={<WalletIcon className="size-4" />}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>最近の入出庫</CardTitle>
            <CardDescription>直近 {movements.length} 件の在庫変動</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">日時</TableHead>
                  <TableHead>商品</TableHead>
                  <TableHead>タイプ</TableHead>
                  <TableHead className="pr-4 text-right">数量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground h-24 text-center">
                      入出庫の記録がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-muted-foreground pl-4 text-xs whitespace-nowrap tabular-nums">
                        {dateTime.format(new Date(`${m.created_at}Z`))}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{m.product_name}</div>
                        <div className="text-muted-foreground font-mono text-xs">{m.sku}</div>
                      </TableCell>
                      <TableCell>
                        {m.type === "in" ? (
                          <Badge variant="secondary" className="gap-1">
                            <ArrowDownLeftIcon className="size-3" />
                            入庫
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <ArrowUpRightIcon className="size-3" />
                            出庫
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">
                        {num.format(m.quantity)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="text-destructive size-4" />
              在庫アラート
            </CardTitle>
            <CardDescription>最低在庫を下回っている商品</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">商品</TableHead>
                  <TableHead className="text-right">現在庫</TableHead>
                  <TableHead className="pr-4 text-right">最低在庫</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground h-24 text-center">
                      アラートはありません
                    </TableCell>
                  </TableRow>
                ) : (
                  alerts.map((a) => (
                    <TableRow key={a.product_id}>
                      <TableCell className="pl-4">
                        <div className="font-medium">{a.product_name}</div>
                        <div className="text-muted-foreground font-mono text-xs">{a.sku}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className="text-destructive font-medium">
                          {num.format(a.total_quantity)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground pr-4 text-right tabular-nums">
                        {num.format(a.min_quantity)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>売上グラフ</CardTitle>
          <CardDescription>直近 7 日間の売上（キャンセルを除く）</CardDescription>
        </CardHeader>
        <CardContent>
          <SalesBarChart points={salesChart} />
        </CardContent>
      </Card>
    </main>
  );
}

function SummaryCard({
  title,
  value,
  unit,
  icon,
}: {
  title: string;
  value: string;
  unit?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {icon}
          {title}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {value}
          {unit ? <span className="text-muted-foreground ml-1 text-base">{unit}</span> : null}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function SalesBarChart({ points }: { points: SalesChartPoint[] }) {
  const max = points.reduce((m, p) => Math.max(m, p.total), 0);
  const total = points.reduce((sum, p) => sum + p.total, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-muted-foreground flex items-baseline gap-2 text-sm">
        <span>合計</span>
        <span className="text-foreground text-lg font-semibold tabular-nums">
          {yen.format(Math.round(total))}
        </span>
      </div>
      <div className="flex h-48 items-end gap-2 sm:gap-4">
        {points.map((p) => {
          const ratio = max > 0 ? p.total / max : 0;
          const heightPct = max > 0 ? Math.max(ratio * 100, p.total > 0 ? 4 : 0) : 0;
          return (
            <div key={p.date} className="flex flex-1 flex-col items-center gap-1">
              <div className="text-muted-foreground text-xs tabular-nums">
                {p.total > 0 ? `¥${num.format(Math.round(p.total))}` : ""}
              </div>
              <div
                className="bg-primary/80 hover:bg-primary w-full rounded-t transition-colors"
                style={{ height: `${heightPct}%`, minHeight: p.total > 0 ? "4px" : "0" }}
                title={`${p.date}: ${yen.format(Math.round(p.total))} (${p.order_count}件)`}
              />
              <div className="text-muted-foreground text-xs tabular-nums">
                {monthDay.format(new Date(`${p.date}T00:00:00Z`))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
