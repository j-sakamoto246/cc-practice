import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  title: "UI/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <Tabs defaultValue="stock" className="w-96">
      <TabsList>
        <TabsTrigger value="stock">在庫</TabsTrigger>
        <TabsTrigger value="movements">入出庫履歴</TabsTrigger>
        <TabsTrigger value="alerts">アラート</TabsTrigger>
      </TabsList>
      <TabsContent value="stock">現在庫: 412 点</TabsContent>
      <TabsContent value="movements">直近 24 時間: 18 件</TabsContent>
      <TabsContent value="alerts">低在庫: 2 商品</TabsContent>
    </Tabs>
  ),
};

export const LineVariant: Story = {
  render: () => (
    <Tabs defaultValue="products" className="w-96">
      <TabsList variant="line">
        <TabsTrigger value="products">商品</TabsTrigger>
        <TabsTrigger value="orders">受注</TabsTrigger>
      </TabsList>
      <TabsContent value="products">商品マスタ管理</TabsContent>
      <TabsContent value="orders">受注一覧</TabsContent>
    </Tabs>
  ),
};
