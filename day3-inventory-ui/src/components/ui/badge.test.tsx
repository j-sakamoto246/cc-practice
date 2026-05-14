import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./badge";

describe("Badge", () => {
  it("子要素を表示する", () => {
    render(<Badge>有効</Badge>);
    expect(screen.getByText("有効")).toBeInTheDocument();
  });

  it("variant に応じてクラスが切り替わる", () => {
    const { rerender } = render(<Badge variant="secondary">A</Badge>);
    const a = screen.getByText("A");
    expect(a.className).toMatch(/bg-secondary/);

    rerender(<Badge variant="destructive">B</Badge>);
    const b = screen.getByText("B");
    expect(b.className).toMatch(/destructive/);
  });
});
