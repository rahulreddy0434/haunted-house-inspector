// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { UseInspectionReturn } from "@/hooks/useInspection";
import { emergencyResult, normalResult } from "@/test/inspectionFixtures";
import { EMERGENCY_MESSAGE } from "./EmergencyBanner";

const hook = vi.hoisted(() => ({ value: null as unknown as UseInspectionReturn }));
vi.mock("@/hooks/useInspection", () => ({ useInspection: () => hook.value }));

const panel = vi.hoisted(() => ({
  calls: [] as { id: string }[],
  pollingOptions: [] as { onEmergency?: () => void }[],
}));
vi.mock("@/hooks/useStatusPolling", () => ({
  useStatusPolling: (_id: string, options: { onEmergency?: () => void }) => {
    panel.pollingOptions.push(options);
    return { view: null, gone: false, applyView: () => {} };
  },
}));
vi.mock("./StatusPanel", () => ({
  StatusPanelBody: (props: { id: string }) => {
    panel.calls.push(props);
    return <div data-testid="status-panel-mock" />;
  },
}));
vi.mock("@/components/ui/chat/ChatPanel", () => ({
  ChatPanel: () => <div data-testid="chat-panel-mock" />,
}));
import { ResultsView } from "./ResultsView";
import { RESULTS_PAGE_NOTICE } from "@/lib/jobs/copy";

function setHook(v: Partial<UseInspectionReturn>) {
  hook.value = { result: null, loading: false, error: null, notFound: false, markEmergency: () => {}, ...v };
}

beforeEach(() => {
  cleanup();
  panel.calls.length = 0;
  panel.pollingOptions.length = 0;
});

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
  ])("emergency (%s): only banner, h1, badge and likely issue", (_n, base) => {
    const result = {
      ...base,
      likelyIssue: "MARKER_ISSUE gas smell near boiler",
      trade: "MARKER_TRADE_gasfitter",
      followUpQuestions: ["MARKER_Q1 first?", "MARKER_Q2 second?"] as [string, string],
      jobBrief: "MARKER_BRIEF",
      diySteps: ["MARKER_DIY"],
    };
    setHook({ result });
    const { container } = render(<ResultsView id="x" />);
    const banner = screen.getByText(EMERGENCY_MESSAGE);
    expect(banner.textContent).toBe(EMERGENCY_MESSAGE);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(banner.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const main = container.querySelector("main")!;
    expect(main.firstElementChild?.contains(banner)).toBe(true);
    expect(screen.getByText("Emergency")).toBeTruthy();
    expect(screen.getByText("MARKER_ISSUE gas smell near boiler")).toBeTruthy();
    const text = container.textContent ?? "";
    for (const absent of [
      "MARKER_TRADE",
      "MARKER_Q1",
      "MARKER_Q2",
      "MARKER_BRIEF",
      "MARKER_DIY",
      "Questions that could help",
      "Who to call",
      "AI confidence",
      "CA$",
      "Things you can safely try",
    ]) {
      expect(text).not.toContain(absent);
    }
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Start a new inspection" })).toBeTruthy();
  });

  it("mounts the status panel with the id for a non-emergency result, after the job brief", () => {
    setHook({ result: normalResult });
    render(<ResultsView id="job-42" />);
    const mock = screen.getByTestId("status-panel-mock");
    expect(screen.getAllByTestId("status-panel-mock")).toHaveLength(1);
    expect(panel.calls.at(-1)?.id).toBe("job-42");
    const copy = screen.getByRole("button", { name: "Copy job brief" });
    expect(copy.compareDocumentPosition(mock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("passes markEmergency from the hook to the panel as onEmergency", () => {
    const markEmergency = vi.fn();
    setHook({ result: normalResult, markEmergency });
    render(<ResultsView id="x" />);
    expect(panel.pollingOptions.at(-1)?.onEmergency).toBe(markEmergency);
  });

  it.each([
    ["urgency", { ...emergencyResult }],
    ["isEmergency alone", { ...normalResult, isEmergency: true }],
  ])("does not mount the status panel for an emergency by %s", (_n, result) => {
    setHook({ result });
    render(<ResultsView id="x" />);
    expect(screen.queryByTestId("status-panel-mock")).toBeNull();
    expect(panel.calls).toHaveLength(0);
    expect(screen.getByText(EMERGENCY_MESSAGE)).toBeTruthy();
    expect(screen.getByText("Emergency")).toBeTruthy();
    expect(screen.getByText(result.likelyIssue)).toBeTruthy();
  });

  it("keeps the diagnosis notice and new-inspection link in the normal view", () => {
    setHook({ result: normalResult });
    render(<ResultsView id="x" />);
    expect(screen.getByText("This is a likely diagnosis, not a certain one.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start a new inspection" }).getAttribute("href")).toBe("/");
  });

  it("shows the Results_Page_Notice with the exact text, once (9.8, 21.16)", () => {
    setHook({ result: normalResult });
    render(<ResultsView id="x" />);
    const expected =
      "Anyone with this page's link can see it and send messages in the chat. Your photos and messages are deleted after 30 days.";
    expect(RESULTS_PAGE_NOTICE).toBe(expected);
    expect(screen.getAllByText(expected)).toHaveLength(1);
    expect(screen.getByText(expected).textContent).toBe(expected);
  });

  it("shows no Results_Page_Notice on the loading, not-found and error views (9.9)", () => {
    for (const v of [{ loading: true }, { notFound: true }, { error: "boom" }]) {
      cleanup();
      setHook(v);
      render(<ResultsView id="x" />);
      expect(screen.queryByText(RESULTS_PAGE_NOTICE)).toBeNull();
    }
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
