import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "UI/Input",
  component: Input,
  tags: ["autodocs"],
  args: { placeholder: "入力してください" },
  argTypes: {
    type: { control: "select", options: ["text", "number", "email", "password"] },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Number: Story = { args: { type: "number", placeholder: "数量" } };
export const Disabled: Story = { args: { disabled: true, defaultValue: "編集不可" } };
export const Invalid: Story = {
  args: { "aria-invalid": true, defaultValue: "不正な値" },
};

export const WithLabel: Story = {
  render: (args) => (
    <div className="grid w-64 gap-2">
      <Label htmlFor="sku">SKU</Label>
      <Input id="sku" {...args} placeholder="例: CF-001" />
    </div>
  ),
};
