import { describe, expect, it } from "vitest";
import * as copy from "@/lib/jobs/copy";

// Every expected string below is a literal copied from requirements.md or the
// design error table. Do not import expected values from copy.ts.
const EMERGENCY_LITERAL =
  "This may be dangerous. Get everyone to safety and call 911. For a gas smell, leave the home first, then call 911 or your gas utility from outside.";
const PRO_EMERGENCY_LITERAL = "Emergency: the homeowner was told to call 911";

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
  return out;
}

describe("copy: Pro status labels (Requirement 6.5)", () => {
  it("matches the exact labels", () => {
    expect(copy.PRO_STATUS_LABEL).toEqual({
      new: "New",
      info_requested: "Waiting for the homeowner's reply",
      accepted: "Accepted, waiting for the homeowner to pick a time",
      declined: "Declined",
      booked: "Booked",
      emergency: "Emergency",
    });
  });
});

describe("copy: homeowner status texts (Requirement 8.3)", () => {
  it("matches the exact texts and has no emergency entry", () => {
    expect(copy.HOMEOWNER_STATUS_TEXT).toEqual({
      new: "Waiting for a tradesperson to look at your job",
      info_requested: "A tradesperson has a question for you",
      accepted: "A tradesperson can take your job. Pick a time that suits you.",
      declined: "This tradesperson can't take your job right now",
      booked: "Your booking is confirmed",
    });
    expect(Object.keys(copy.HOMEOWNER_STATUS_TEXT)).not.toContain("emergency");
  });
});

describe("copy: fixed messages", () => {
  it("STATUS_SAFETY_LINE (8.19)", () => {
    expect(copy.STATUS_SAFETY_LINE).toBe(
      "If something changes, start a new inspection. If you smell gas, see sparks or hear a CO alarm, leave the home and call 911.",
    );
  });
  it("REPLY_RETENTION_NOTE (14.14)", () => {
    expect(copy.REPLY_RETENTION_NOTE).toBe(
      "Your replies are deleted after 30 days, like your photos.",
    );
  });
  it("STATUS_REFRESH_FAILED (8)", () => {
    expect(copy.STATUS_REFRESH_FAILED).toBe("We couldn't update the status. We'll try again.");
  });
  it("JOB_CHANGED_NOTICE (9.21)", () => {
    expect(copy.JOB_CHANGED_NOTICE).toBe("This job has changed. Here is the latest.");
  });
  it("REPLY_TOO_LARGE_MESSAGE (9.22)", () => {
    expect(copy.REPLY_TOO_LARGE_MESSAGE).toBe("Please shorten your reply.");
  });
  it("reply messages (9.12)", () => {
    expect(copy.REPLY_TOO_LONG_MESSAGE).toBe(
      "Your reply is too long. Please shorten it to 500 characters or fewer.",
    );
    expect(copy.REPLY_EMPTY_MESSAGE).toBe("Please write a reply before sending.");
  });
});

describe("copy: ERROR_MESSAGES (design error table)", () => {
  it("matches the table exactly", () => {
    expect(copy.ERROR_MESSAGES).toEqual({
      UNAUTHORIZED: "Access is needed, or your session has ended.",
      INVALID_CODE: "That code isn't right.",
      TOO_MANY_ATTEMPTS: "Too many attempts. Please wait a few minutes and try again.",
      PRO_DISABLED: "Tradesperson access isn't available right now.",
      LOGIN_FAILED: "Login failed. Please try again later.",
      INVALID_REQUEST: "We couldn't read that request.",
      PAYLOAD_TOO_LARGE: "That request is too large.",
      NOT_FOUND: "We couldn't find that job.",
      LOAD_FAILED: {
        list: "We couldn't load the jobs. Please try again.",
        detail: "We couldn't load this job. Please try again.",
        status: "We couldn't load this status. Please try again.",
      },
      RESULT_INVALID: "This job could not be loaded.",
      ILLEGAL_TRANSITION: "This job has changed. Refresh to see its latest status.",
      JOB_IS_EMERGENCY: {
        pro: PRO_EMERGENCY_LITERAL,
        homeowner: EMERGENCY_LITERAL,
      },
      REPLY_LIMIT_REACHED: "This job has reached the limit of 5 replies.",
      SLOT_NOT_OFFERED: "That time isn't one of the times offered.",
      SLOT_EXPIRED: "That time has passed. Please pick another.",
      ACTION_FAILED: "Something went wrong. Please try again.",
    });
  });

  it("covers every ApiErrorCode with a non-empty message", () => {
    const codes = [
      "INVALID_REQUEST", "PAYLOAD_TOO_LARGE", "UNAUTHORIZED", "INVALID_CODE", "TOO_MANY_ATTEMPTS",
      "PRO_DISABLED", "LOGIN_FAILED", "NOT_FOUND", "LOAD_FAILED", "RESULT_INVALID",
      "ILLEGAL_TRANSITION", "JOB_IS_EMERGENCY", "REPLY_LIMIT_REACHED",
      "SLOT_NOT_OFFERED", "SLOT_EXPIRED", "ACTION_FAILED",
    ];
    expect(Object.keys(copy.ERROR_MESSAGES).sort()).toEqual([...codes].sort());
    for (const code of codes) {
      const entry = (copy.ERROR_MESSAGES as Record<string, unknown>)[code];
      const strings = collectStrings(entry);
      expect(strings.length, code).toBeGreaterThan(0);
      for (const s of strings) expect(s.trim().length, code).toBeGreaterThan(0);
    }
  });

  it("JOB_IS_EMERGENCY uses the exact emergency literals", () => {
    expect(copy.ERROR_MESSAGES.JOB_IS_EMERGENCY.homeowner).toBe(EMERGENCY_LITERAL);
    expect(copy.ERROR_MESSAGES.JOB_IS_EMERGENCY.pro).toBe(PRO_EMERGENCY_LITERAL);
  });
});

describe("copy: whole-module string rules (17.6)", () => {
  const all = collectStrings({ ...copy });

  it("finds a meaningful number of strings", () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it("has no empty strings", () => {
    for (const s of all) expect(s.trim().length).toBeGreaterThan(0);
  });

  it("contains no raw HTML", () => {
    for (const s of all) expect(s).not.toMatch(/<[^>]*>|&[a-z#0-9]+;/i);
  });

  it("never claims photos or answers are visible only to the homeowner", () => {
    const banned = [
      /only you/i,
      /only to you/i,
      /accessible only/i,
      /only the homeowner/i,
      /only visible/i,
      /visible only/i,
      /only .*can see/i,
      /private to you/i,
    ];
    for (const s of all) for (const re of banned) expect(s, String(re)).not.toMatch(re);
  });
});
