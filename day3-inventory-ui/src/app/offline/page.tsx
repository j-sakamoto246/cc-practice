import Link from "next/link";
import { WifiOffIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-static";

export const metadata = {
  title: "オフライン | Inventory UI",
};

export default function OfflinePage() {
  return (
    <main
      id="main-content"
      className="container mx-auto flex flex-1 items-center justify-center px-4 py-12"
    >
      <Card className="w-full max-w-lg">
        <CardHeader className="items-center text-center">
          <div
            className="bg-muted mb-4 flex size-16 items-center justify-center rounded-full"
            aria-hidden
          >
            <WifiOffIcon className="size-8" />
          </div>
          <CardTitle>オフラインです</CardTitle>
          <CardDescription>
            ネットワークに接続できないため、このページは表示できません。
            オンライン復帰後にキャッシュしたデータを再取得します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ul className="text-muted-foreground list-inside list-disc space-y-1">
            <li>キャッシュされたページは引き続き閲覧できます。</li>
            <li>オフライン中の作成・編集はキューに保存され、復帰時に自動同期されます。</li>
            <li>同期完了は画面上部のステータスバナーで通知されます。</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className={buttonVariants()}>
              ダッシュボードに戻る
            </Link>
            <Link href="/stock" className={buttonVariants({ variant: "outline" })}>
              在庫を見る
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
