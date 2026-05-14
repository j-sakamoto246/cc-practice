import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "./button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "UI/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>在庫サマリー</CardTitle>
        <CardDescription>東京倉庫 / 2026-05-14 時点</CardDescription>
      </CardHeader>
      <CardContent>
        <p>総在庫数: 412 / 在庫金額: ¥185,400</p>
      </CardContent>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>低在庫アラート</CardTitle>
        <CardDescription>最低在庫を下回っている商品</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline">
            詳細
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="text-muted-foreground list-disc space-y-1 pl-4">
          <li>CF-001 コーヒー豆 1kg (残 3)</li>
          <li>SY-004 バニラシロップ (残 2)</li>
        </ul>
      </CardContent>
      <CardFooter>
        <Button size="sm">発注を作成</Button>
      </CardFooter>
    </Card>
  ),
};

export const Compact: Story = {
  render: () => (
    <Card size="sm" className="w-64">
      <CardHeader>
        <CardTitle>受注 #1024</CardTitle>
        <CardDescription>株式会社サンプル</CardDescription>
      </CardHeader>
      <CardContent>¥18,900 (3 点)</CardContent>
    </Card>
  ),
};
