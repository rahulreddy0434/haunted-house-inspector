// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { UseInspectionReturn } from "@/hooks/useInspection";
import { emergencyResult, normalResult } from "@/test/inspectionFixtures";
import { EMERGENCY_MESSAGE } from "./EmergencyBanner";

const hook = vi.hoisted(() => ({ value: null as unknown as UseInspectionReturn }));
vi.mock("@/hooks/useInspection", () => ({ useInspection: () => hook.value }));

import { ResultsView } from "./ResultsView";

function setHook(v: Partial<UseInspectionReturn>) {
  hook.value = { result: null, loading: false, error: null, notFound: false, ...v };
}

beforeEach(() => cleanup());

describe("ResultsView", () => {
  it("shows a loading status", () => {
    setHook({ loading: true });
    render(<ResultsView id="x" />);
    expect(screen.getByRole("status").textContent).toBe("Loading your result…");
  });

  it("renders a normal result", () => {
    setHook({ result: normalResult });
    render(<ResultsView id="x" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Your inspection result");
    expect(screen.getByText("A dripping pipe under the sink.")).toBeTruthy();
    expect(screen.getByText("AI confidence in this diagnosis")).toBeTruthy();
    expect(screen.getByText("~70%")).toBeTruthy();
    expect(screen.getByTestId("cost-label").textContent).toBe("rough range, not a quote");
    expect(screen.getByRole("button", { name: "Copy job brief" })).toBeTruthy();
    expect(screen.getByText("This is a likely diagnosis, not a certain one.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start a new inspection" }).getAttribute("href")).toBe("/");
  });

  it.each([
    ["fixture", emergencyResult],
    [
      "with costs, brief and steps",
      { ...emergencyResult, costRangeLow: 100, costRangeHigh: 900, jobBrief: "Brief text", diySteps: ["Do a thing"] },
    ],
  ])("emergency (%s): banner first, nothing else competing", (_n, result) => {
    setHook({ result });
    const { container } = render(<ResultsView id="x" />);
    const banner = screen.getByText(EMERGENCY_MESSAGE);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(banner.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const main = container.querySelector("main")!;
    expect(main.firstElementChild?.contains(banner)).toBe(true);
    expect(container.textContent).not.toContain("CA$");
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
    expect(screen.queryByText("Things you can safely try")).toBeNull();
    expect(screen.queryByText("AI confidence in this diagnosis")).toBeNull();
  });

  it("shows not found with a new-inspection link", () => {
    setHook({ notFound: true });
    render(<ResultsView id="x" />);
    expect(screen.getByText("Result could not be found")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start a new inspection" })).toBeTruthy();
  });

  it("shows only the error when there is no result", () => {
    setHook({ error: "Something went wrong" });
    render(<ResultsView id="x" />);
    expect(screen.getByRole("alert").textContent).toBe("Something went wrong");
    expect(screen.queryByText("A dripping pipe under the sink.")).toBeNull();
    expect(screen.getByRole("link", { name: "Start a new inspection" })).toBeTruthy();
  });

  it("keeps showing the result when a refresh fails", () => {
    setHook({ result: normalResult, error: "boom", notFound: true });
    render(<ResultsView id="x" />);
    expect(screen.getByText("A dripping pipe under the sink.")).toBeTruthy();
    expect(screen.queryByText("Result could not be found")).toBeNull();
    expect(screen.queryByText("boom")).toBeNull();
  });
});
