import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Badge } from "./badge";

const meta = {
  title: "UI/Badge",
  component: Badge,
  tags: ["autodocs"],
  args: { children: "ラベル" },
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "secondary", "destructive", "outline", "ghost", "link"],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Secondary: Story = { args: { variant: "secondary", children: "下書き" } };
export const Destructive: Story = { args: { variant: "destructive", children: "在庫切れ" } };
export const Outline: Story = { args: { variant: "outline", children: "確定" } };

export const StatusGroup: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>新規</Badge>
      <Badge variant="secondary">確定</Badge>
      <Badge variant="outline">発送済み</Badge>
      <Badge variant="destructive">在庫不足</Badge>
    </div>
  ),
};
