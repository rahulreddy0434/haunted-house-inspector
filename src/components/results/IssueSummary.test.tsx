import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { IssueSummary } from "./IssueSummary";

const base = {
  likelyIssue: "Leaking pipe under sink",
  trade: "Plumber",
  followUpQuestions: ["Is it dripping constantly?", "When did it start?"] as [
    string,
    string,
  ],
  diySteps: ["Place a bucket under the leak", "Wipe the area dry"],
};

describe("IssueSummary", () => {
  it("shows issue, trade, questions and DIY steps when not an emergency", () => {
    render(<IssueSummary {...base} urgency="soon" />);
    expect(screen.getByText("Likely issue")).toBeInTheDocument();
    expect(screen.getByText("Leaking pipe under sink")).toBeInTheDocument();
    expect(screen.getByText("Who to call")).toBeInTheDocument();
    expect(screen.getByText("Plumber")).toBeInTheDocument();
    expect(screen.getByText("Questions that could help")).toBeInTheDocument();
    expect(screen.getByText("Is it dripping constantly?")).toBeInTheDocument();
    expect(screen.getByText("When did it start?")).toBeInTheDocument();
    expect(screen.getByText("Things you can safely try")).toBeInTheDocument();
    expect(screen.getByText("Place a bucket under the leak")).toBeInTheDocument();
  });

  it("omits the DIY section when there are no steps", () => {
    render(<IssueSummary {...base} diySteps={[]} urgency="monitor" />);
    expect(screen.queryByText("Things you can safely try")).toBeNull();
  });

  it("shows only the likely issue for an emergency", () => {
    render(<IssueSummary {...base} urgency="emergency" />);
    expect(screen.getByText("Likely issue")).toBeInTheDocument();
    expect(screen.getByText("Leaking pipe under sink")).toBeInTheDocument();
    for (const text of [
      "Who to call",
      "Plumber",
      "Questions that could help",
      "Is it dripping constantly?",
      "When did it start?",
      "Things you can safely try",
      "Place a bucket under the leak",
    ]) {
      expect(screen.queryByText(text)).toBeNull();
    }
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("renders angle-bracket content as plain text", () => {
    const evil = "<img src=x onerror=alert(1)><b>bold</b>";
    const { container } = render(
      <IssueSummary {...base} likelyIssue={evil} urgency="soon" />,
    );
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});
