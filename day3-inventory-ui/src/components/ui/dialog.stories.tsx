import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

const meta = {
  title: "UI/Dialog",
  component: Dialog,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger render={<Button>商品を追加</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>商品を追加</DialogTitle>
          <DialogDescription>
            SKU と商品名を入力してください。あとから編集できます。
          </DialogDescription>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">フォーム本体はこのデモでは省略しています。</p>
        <DialogFooter>
          <DialogClose render={<Button>追加</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Default: Story = {
  render: () => <DialogDemo />,
};

export const OpensAndCloses: Story = {
  name: "Interaction: open → close",
  render: () => <DialogDemo />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await step("トリガーボタンをクリックしてダイアログを開く", async () => {
      await userEvent.click(canvas.getByRole("button", { name: "商品を追加" }));
      await waitFor(async () => {
        await expect(body.getByRole("dialog")).toBeVisible();
      });
      await expect(
        body.getByText("商品を追加", { selector: "[data-slot=dialog-title]" }),
      ).toBeVisible();
    });

    await step("Close ボタンでダイアログを閉じる", async () => {
      await userEvent.click(body.getByRole("button", { name: "Close" }));
      await waitFor(async () => {
        await expect(body.queryByRole("dialog")).toBeNull();
      });
    });
  },
};
