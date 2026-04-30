import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Loader2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { completenessScore, useTfpStore } from "@/lib/tfp/store";
import { categorizeNotification, filterNotificationsForRole } from "@/lib/tfp/notify";
import type { GoLiveChecklist, Notification, Review, Role, ShapingItem, Signal } from "@/lib/tfp/types";
import { procreaFlag } from "./_app.clinics";
import { HomePage } from "./_app.index";
import { buildCrumbs } from "@/components/tfp/AppShell";

export const Route = createFileRoute("/_app/self-test")({
  component: SelfTestPage,
});

type TestStatus = "pending" | "running" | "passed" | "failed";
type TestStep = {
  id: number;
  name: string;
  description: string;
  run: (ctx: TestContext) => void | Promise<void>;
};
type TestContext = {
  signalId?: string;
  shapingId?: string;
  reviewId?: string;
  secondSignalId?: string;
  notificationBaseline: number;
  originalDemoMode?: boolean;
  originalUserId?: string;
};
type RowState = { status: TestStatus; error?: string };

const TEST_LABEL = "e2e-test";
const AUTO_RUN_KEY = "tfp-self-test-autorun-v1";

function SelfTestPage() {
  const [rows, setRows] = useState<Record<number, RowState>>(() =>
    Object.fromEntries(TESTS.map((step) => [step.id, { status: "pending" }] as const)),
  );
  const [running, setRunning] = useState(false);
  const [autoRun, setAutoRun] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(AUTO_RUN_KEY) === "true",
  );

  const passed = useMemo(
    () => Object.values(rows).filter((row) => row.status === "passed").length,
    [rows],
  );

  useEffect(() => {
    window.localStorage.setItem(AUTO_RUN_KEY, String(autoRun));
  }, [autoRun]);

  useEffect(() => {
    if (autoRun) void runAll();
  }, []);

  async function runAll() {
    if (running) return;
    setRunning(true);
    resetRows();
    const ctx: TestContext = {
      notificationBaseline: useTfpStore.getState().notifications.length,
      originalDemoMode: useTfpStore.getState().flags.demoModeEnabled,
      originalUserId: useTfpStore.getState().currentUserId,
    };
    useTfpStore.getState().setDemoMode(false);
    for (const step of TESTS) {
      setRows((current) => ({ ...current, [step.id]: { status: "running" } }));
      try {
        await step.run(ctx);
        setRows((current) => ({ ...current, [step.id]: { status: "passed" } }));
      } catch (error) {
        setRows((current) => ({
          ...current,
          [step.id]: {
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          },
        }));
      }
    }
    useTfpStore.getState().setDemoMode(Boolean(ctx.originalDemoMode));
    if (ctx.originalUserId) useTfpStore.getState().setCurrentUser(ctx.originalUserId);
    setRunning(false);
  }

  function resetRows() {
    setRows(Object.fromEntries(TESTS.map((step) => [step.id, { status: "pending" }] as const)));
  }

  function resetState() {
    useTfpStore.setState((state) => {
      const testSignalIds = state.signals
        .filter((signal) => signal.labels.includes(TEST_LABEL))
        .map((signal) => signal.id);
      const testShapingIds = state.shaping
        .filter((item) => testSignalIds.includes(item.signal_id))
        .map((item) => item.id);
      const testReviewIds = state.reviews
        .filter(
          (review) =>
            testShapingIds.includes(review.shaping_id) || testSignalIds.includes(review.signal_id),
        )
        .map((review) => review.id);
      return {
        signals: state.signals.filter((signal) => !testSignalIds.includes(signal.id)),
        shaping: state.shaping.filter((item) => !testShapingIds.includes(item.id)),
        reviews: state.reviews.filter((review) => !testReviewIds.includes(review.id)),
        notifications: state.notifications.filter(
          (note) =>
            !testSignalIds.includes(note.entity_id ?? "") &&
            !testShapingIds.includes(note.entity_id ?? "") &&
            !note.body.includes("E2E test") &&
            !note.title.includes("E2E test"),
        ),
        jiraEvents: state.jiraEvents.filter((event) => !testShapingIds.includes(event.shaping_id)),
        audit: state.audit.filter(
          (entry) =>
            !testSignalIds.includes(entry.entity_id) &&
            !testShapingIds.includes(entry.entity_id) &&
            !testReviewIds.includes(entry.entity_id),
        ),
        sprint: {
          ...state.sprint,
          allocated_pts: Math.max(
            0,
            state.sprint.allocated_pts -
              state.shaping
                .filter((item) => testShapingIds.includes(item.id) && item.in_sprint)
                .reduce((sum, item) => sum + (item.tech_estimate_pts ?? 0), 0),
          ),
        },
      };
    });
    resetRows();
    toast.success("Self-test state reset");
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Hidden QA</p>
          <h1 className="mt-1 font-display text-3xl">Workflow self-test</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Runs the TFP workflow end to end against disposable e2e-test records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-md border border-input bg-surface px-3 py-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoRun}
              onChange={(event) => setAutoRun(event.target.checked)}
            />
            Run automatically on page load
          </label>
          <button
            onClick={resetState}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-surface px-3 py-1.5 text-sm hover:bg-accent/40"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset state
          </button>
          <button
            disabled={running}
            onClick={runAll}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            Run all tests
          </button>
        </div>
      </header>

      <section className="overflow-hidden rounded-md border border-border bg-surface/50">
        {TESTS.map((step) => (
          <TestRow key={step.id} step={step} state={rows[step.id]} />
        ))}
      </section>
      <p className="mt-4 text-sm font-medium">
        {passed} of {TESTS.length} passed.
      </p>

      {/* Hidden mount of HomePage so DOM-based tests can inspect it without navigation */}
      <div
        id="self-test-home-preview"
        aria-hidden="true"
        style={{
          position: "fixed",
          left: -99999,
          top: 0,
          width: 1280,
          height: 800,
          overflow: "hidden",
          pointerEvents: "none",
          opacity: 0,
        }}
      >
        <HomePage />
      </div>
    </div>
  );
}

/** Wait one paint so the hidden HomePage re-renders after a store update. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

async function withCurrentUser(userId: string): Promise<HTMLElement> {
  useTfpStore.getState().setCurrentUser(userId);
  await nextFrame();
  const root = document.getElementById("self-test-home-preview");
  if (!root) throw new Error("Hidden home preview not mounted");
  return root;
}

function TestRow({ step, state }: { step: TestStep; state: RowState }) {
  return (
    <div className="border-b border-border p-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <StatusIcon status={state.status} />
        <div>
          <h2 className="text-sm font-semibold">
            STEP {step.id} — {step.name}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
          {state.error && (
            <p className="mt-2 text-xs font-medium text-destructive">{state.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: TestStatus }) {
  if (status === "running") return <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />;
  if (status === "passed")
    return <CheckCircle2 className="mt-0.5 h-4 w-4 text-[var(--color-status-proceed)]" />;
  if (status === "failed") return <XCircle className="mt-0.5 h-4 w-4 text-destructive" />;
  return <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />;
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getSignal(id: string): Signal {
  const signal = useTfpStore.getState().signals.find((item) => item.id === id);
  expect(signal, `Signal ${id} not found`);
  return signal;
}

function getShaping(id: string): ShapingItem {
  const shaping = useTfpStore.getState().shaping.find((item) => item.id === id);
  expect(shaping, `Shaping item ${id} not found`);
  return shaping;
}

function getReview(id: string): Review {
  const review = useTfpStore.getState().reviews.find((item) => item.id === id);
  expect(review, `Review ${id} not found`);
  return review;
}

const TESTS: TestStep[] = [
  {
    id: 1,
    name: "Create a test signal",
    description: "Verifies a new Internal Platform signal is created in New status.",
    run: (ctx) => {
      const signal = useTfpStore.getState().createSignal({
        title: "E2E test signal",
        description: "Self-test signal created by automated check.",
        source: "Internal",
        product: "Platform",
        priority: "P2",
        tier_override: "P2",
        displacement_flag: false,
        displacement_note: null,
        labels: [TEST_LABEL],
      });
      ctx.signalId = signal.id;
      expect(getSignal(signal.id).status === "New", "Signal was not created with status New");
    },
  },
  {
    id: 2,
    name: "Triage to Proceed",
    description: "Verifies Proceed transition creates an Unshaped shaping item.",
    run: (ctx) => {
      expect(ctx.signalId, "Missing test signal id");
      const result = useTfpStore
        .getState()
        .updateSignal(ctx.signalId, { status: "Proceed", triage_reason: "E2E test" });
      expect(result.ok, result.error ?? "Status update failed");
      const signal = getSignal(ctx.signalId);
      const shaping = useTfpStore.getState().shaping.find((item) => item.signal_id === signal.id);
      expect(signal.status === "Proceed", "Signal did not move to Proceed");
      expect(shaping?.shaping_status === "Unshaped", "Unshaped shaping item was not created");
      ctx.shapingId = shaping.id;
    },
  },
  {
    id: 3,
    name: "Fill the 7 shaping fields",
    description:
      "Verifies shaping completeness reaches 5/5 with required and optional brief fields populated.",
    run: (ctx) => {
      expect(ctx.shapingId, "Missing shaping id");
      useTfpStore.getState().updateShaping(ctx.shapingId, {
        problem_what: "E2E problem statement with enough detail to pass validation.",
        problem_why: "E2E why-now rationale with enough context to pass validation.",
        problem_who: "E2E affected users include clinics and product operators.",
        solution_criteria: "E2E success criteria are explicit measurable and complete.",
        solution_approach: "E2E solution approach describes the high level delivery plan.",
        solution_questions: "E2E open questions are captured for traceability.",
        problem_out_of_scope: "E2E out of scope items are documented for clarity.",
      });
      expect(completenessScore(getShaping(ctx.shapingId)) === 5, "Completeness did not reach 5/5");
    },
  },
  {
    id: 4,
    name: "Send to tech review",
    description:
      "Verifies Waseem is assigned and the item enters Tech Review, with role-routed notification.",
    run: (ctx) => {
      expect(ctx.shapingId, "Missing shaping id");
      useTfpStore.getState().updateShaping(ctx.shapingId, {
        tech_reviewer_id: "u-waseem",
        shaping_status: "In Tech Review",
      });
      useTfpStore.getState().pushNotification({
        trigger: "tech_review_ready",
        title: "E2E test tech review assigned",
        body: "E2E test",
        link_to: "/shaping",
        for_user_id: "u-waseem",
        entity_id: ctx.shapingId,
      });
      const shaping = getShaping(ctx.shapingId);
      expect(
        shaping.tech_reviewer_id === "u-waseem" && shaping.shaping_status === "In Tech Review",
        "Tech review assignment did not persist",
      );
    },
  },
  {
    id: 5,
    name: "Complete tech review",
    description: "Verifies tech notes, estimate, sign-off timestamp, and Ready for Sprint status.",
    run: (ctx) => {
      expect(ctx.shapingId, "Missing shaping id");
      useTfpStore.getState().updateShaping(ctx.shapingId, {
        tech_review_notes: "E2E tech review completed.",
        tech_estimate_pts: 5,
        tech_concerns: "",
        tech_signed_off_at: new Date().toISOString(),
        shaping_status: "Ready for Sprint",
      });
      expect(
        getShaping(ctx.shapingId).shaping_status === "Ready for Sprint",
        "Item is not Ready for Sprint",
      );
    },
  },
  {
    id: 6,
    name: "Push to Jira",
    description: "Verifies the existing Jira push action assigns a Jira key.",
    run: (ctx) => {
      expect(ctx.shapingId, "Missing shaping id");
      useTfpStore.getState().pushToJira(ctx.shapingId);
      expect(Boolean(getShaping(ctx.shapingId).jira_key), "Jira key was not set");
    },
  },
  {
    id: 7,
    name: "Add to sprint",
    description: "Verifies the item is added to sprint in To Do status.",
    run: (ctx) => {
      expect(ctx.shapingId, "Missing shaping id");
      const added = useTfpStore.getState().addToSprint(ctx.shapingId, "E2E test sprint add");
      const shaping = getShaping(ctx.shapingId);
      expect(
        added && shaping.in_sprint === true && shaping.delivery_status === "To Do",
        "Item was not added to sprint as To Do",
      );
    },
  },
  {
    id: 8,
    name: "Move through delivery",
    description: "Verifies delivery status can move through In Progress, In QA, and Done.",
    run: (ctx) => {
      expect(ctx.shapingId, "Missing shaping id");
      useTfpStore.getState().updateShaping(ctx.shapingId, { delivery_status: "In Progress" });
      useTfpStore.getState().updateShaping(ctx.shapingId, { delivery_status: "In QA" });
      useTfpStore.getState().updateShaping(ctx.shapingId, { delivery_status: "Done" });
      expect(
        getShaping(ctx.shapingId).delivery_status === "Done",
        "Final delivery status is not Done",
      );
    },
  },
  {
    id: 9,
    name: "Verify outcome review created",
    description: "Verifies a Pending review exists for the Done item.",
    run: (ctx) => {
      expect(ctx.shapingId, "Missing shaping id");
      useTfpStore.getState().ensureOutcomeReview(ctx.shapingId);
      const review = useTfpStore
        .getState()
        .reviews.find((item) => item.shaping_id === ctx.shapingId);
      expect(review?.status === "Pending", "Pending outcome review was not created");
      ctx.reviewId = review.id;
    },
  },
  {
    id: 10,
    name: "Complete outcome review",
    description: "Verifies the outcome review can be marked Completed with a Met rating.",
    run: (ctx) => {
      expect(ctx.reviewId, "Missing review id");
      useTfpStore.getState().updateReview(ctx.reviewId, {
        status: "Completed",
        outcome_rating: "Met",
        what_worked: "Test passed",
        what_didnt: "",
        notes: "Test passed",
        completed_at: new Date().toISOString(),
      });
      expect(getReview(ctx.reviewId).status === "Completed", "Review status is not Completed");
    },
  },
  {
    id: 11,
    name: "Verify sprint can close",
    description: "Verifies the test item has no unresolved work and no missing review gate.",
    run: (ctx) => {
      expect(ctx.shapingId, "Missing shaping id");
      const shaping = getShaping(ctx.shapingId);
      const review = useTfpStore
        .getState()
        .reviews.find((item) => item.shaping_id === ctx.shapingId && item.status === "Completed");
      expect(
        shaping.delivery_status === "Done" && Boolean(review),
        "Test item would block sprint close",
      );
    },
  },
  {
    id: 12,
    name: "Verify role-routed notifications",
    description: "Verifies at least one notification was routed to Waseem during this run.",
    run: (ctx) => {
      const created = useTfpStore
        .getState()
        .notifications.slice(
          0,
          Math.max(0, useTfpStore.getState().notifications.length - ctx.notificationBaseline),
        );
      expect(
        created.some((note) => note.for_user_id === "u-waseem"),
        "No notification was routed to u-waseem",
      );
    },
  },
  {
    id: 13,
    name: "Verify Procrea QC compliance flag",
    description: "Verifies Procrea QC item 12 returns the French + Law 25 message.",
    run: () => {
      const clinic = { release_name: "Procrea QC Go-Live" } as GoLiveChecklist;
      const flag = procreaFlag(clinic, "12. Confirm patient-facing copy");
      expect(
        flag ===
          "French language review required + Law 25 (Quebec) compliance sign-off needed before closing.",
        "Procrea QC compliance message did not match",
      );
    },
  },
  {
    id: 14,
    name: "Verify signal reopen path",
    description: "Verifies a rejected signal can be reopened into In Review with a reason.",
    run: (ctx) => {
      const signal = useTfpStore.getState().createSignal({
        title: "E2E test reopen signal",
        description: "Self-test reopen signal created by automated check.",
        source: "Internal",
        product: "Platform",
        priority: "P2",
        tier_override: "P2",
        displacement_flag: false,
        displacement_note: null,
        labels: [TEST_LABEL],
      });
      ctx.secondSignalId = signal.id;
      useTfpStore
        .getState()
        .updateSignal(signal.id, { status: "Rejected", triage_reason: "E2E test reject" });
      const result = useTfpStore
        .getState()
        .reopenSignal(signal.id, "E2E test reopen reason long enough");
      expect(result.ok, result.error ?? "Reopen failed");
      expect(getSignal(signal.id).status === "In Review", "Signal did not reopen to In Review");
    },
  },
  {
    id: 15,
    name: "Home renders Sprint Health with three colored counts",
    description: "Verifies green, yellow, and red dots are present on the Sprint Health tile.",
    run: async () => {
      const root = await withCurrentUser("u-bazil");
      const tile = root.querySelector('[data-testid="sprint-health-tile"]');
      expect(tile, "Sprint Health tile not found");
      const dots = tile!.querySelectorAll('[data-testid="sprint-health-dot"]');
      expect(dots.length === 3, `Expected exactly 3 health dots, found ${dots.length}`);
      const colors = Array.from(dots).map((d) => d.getAttribute("data-color"));
      expect(
        colors.includes("green") && colors.includes("yellow") && colors.includes("red"),
        `Expected green/yellow/red dots, got ${colors.join(",")}`,
      );
    },
  },
  {
    id: 16,
    name: "Home renders Decisions Needed tile",
    description: "Verifies the Decisions Needed tile shows at least one item or the empty-state copy.",
    run: async () => {
      const root = await withCurrentUser("u-bazil");
      const tile = root.querySelector('[data-testid="decisions-tile"][data-variant="decisions"]');
      expect(tile, "Decisions Needed tile not found for Bazil");
      const items = tile!.querySelectorAll("li");
      const text = (tile!.textContent ?? "").trim();
      expect(
        items.length >= 1 || text.includes("Nothing waiting. Sprint health below."),
        "Decisions tile has no items and no empty-state copy",
      );
    },
  },
  {
    id: 17,
    name: "Throughput strip renders four segments and three arrows",
    description: "Verifies the throughput strip layout: 4 segments separated by 3 arrows.",
    run: async () => {
      const root = await withCurrentUser("u-bazil");
      const strip = root.querySelector('[data-testid="throughput-strip"]');
      expect(strip, "Throughput strip not found");
      const segments = strip!.querySelectorAll('[data-testid="throughput-segment"]');
      const arrows = strip!.querySelectorAll('[data-testid="throughput-arrow"]');
      expect(segments.length === 4, `Expected 4 throughput segments, found ${segments.length}`);
      expect(arrows.length === 3, `Expected 3 arrow separators, found ${arrows.length}`);
    },
  },
  {
    id: 18,
    name: "Top strip text matches exactly",
    description: "Verifies the top strip says: 'TFP Operating Model. Capture signals from clinics, ship outcomes to production.'",
    run: async () => {
      const root = await withCurrentUser("u-bazil");
      const strip = root.querySelector('[data-testid="top-strip"]');
      expect(strip, "Top strip not found");
      const text = (strip!.textContent ?? "").trim();
      expect(
        text === "TFP Operating Model. Capture signals from clinics, ship outcomes to production.",
        `Top strip text mismatch: ${JSON.stringify(text)}`,
      );
    },
  },
  {
    id: 19,
    name: "Switching to Waseem shows Tech Reviews Waiting tile",
    description: "Verifies the right tile becomes 'Tech Reviews Waiting' when viewing as Waseem.",
    run: async () => {
      const root = await withCurrentUser("u-waseem");
      const tile = root.querySelector('[data-testid="decisions-tile"]');
      expect(tile, "Right tile not found for Waseem");
      const variant = tile!.getAttribute("data-variant");
      expect(variant === "tech-reviews", `Expected tech-reviews variant, got ${variant}`);
      expect(
        (tile!.textContent ?? "").includes("Tech Reviews Waiting"),
        "Tile title does not say 'Tech Reviews Waiting'",
      );
    },
  },
  {
    id: 20,
    name: "Switching to Shahid shows Outcomes Shipped tile and hides Resume bar",
    description: "Verifies Shahid sees 'Outcomes Shipped This Sprint' and no Resume bar.",
    run: async () => {
      const root = await withCurrentUser("u-shahid");
      const tile = root.querySelector('[data-testid="decisions-tile"]');
      expect(tile, "Right tile not found for Shahid");
      const variant = tile!.getAttribute("data-variant");
      expect(variant === "outcomes-shipped", `Expected outcomes-shipped variant, got ${variant}`);
      expect(
        (tile!.textContent ?? "").includes("Outcomes Shipped This Sprint"),
        "Tile title does not say 'Outcomes Shipped This Sprint'",
      );
      const resume = root.querySelector('[data-testid="resume-bar"]');
      expect(!resume, "Resume bar should be hidden for Shahid");
    },
  },
  {
    id: 21,
    name: "Bazil's bell tray contains new-signal events",
    description: "Verifies a 'new signal captured' notification is visible to Bazil (PM).",
    run: () => {
      const note: Notification = {
        id: "n-test-21",
        ts: new Date().toISOString(),
        trigger: "monitoring_alert",
        priority: "P2",
        title: "New signal captured: E2E test signal",
        body: "E2E test — new signal arrived at intake.",
        for_user_id: null,
        link_to: "/inbox",
        read: false,
        entity_id: null,
      };
      const visible = filterNotificationsForRole([note], "PM" as Role);
      expect(visible.length === 1, "Bazil (PM) should see new-signal events");
    },
  },
  {
    id: 22,
    name: "Waseem's bell tray hides non-P0 new signals",
    description: "Verifies non-P0 'new signal captured' notifications are NOT visible to Waseem (Tech Lead).",
    run: () => {
      const note: Notification = {
        id: "n-test-22",
        ts: new Date().toISOString(),
        trigger: "monitoring_alert",
        priority: "P2",
        title: "New signal captured: routine clinic ask",
        body: "E2E test — non-P0 signal.",
        for_user_id: null,
        link_to: "/inbox",
        read: false,
        entity_id: null,
      };
      const visible = filterNotificationsForRole([note], "Tech Lead" as Role);
      expect(visible.length === 0, "Tech Lead should NOT see non-P0 new signals");
    },
  },
  {
    id: 23,
    name: "Tech review assigned to Waseem appears in his bell tray",
    description: "Verifies a tech_review_ready notification routed to Waseem is visible.",
    run: () => {
      const note: Notification = {
        id: "n-test-23",
        ts: new Date().toISOString(),
        trigger: "tech_review_ready",
        priority: "P3",
        title: "Heartland configuration ready for tech review",
        body: "E2E test — assigned to Waseem.",
        for_user_id: "u-waseem",
        link_to: "/shaping",
        read: false,
        entity_id: null,
      };
      const visible = filterNotificationsForRole([note], "Tech Lead" as Role);
      expect(visible.length === 1, "Tech Lead should see tech-review-request notifications");
      expect(
        categorizeNotification(note) === "tech_review_request",
        "Tech review notification should categorize as tech_review_request",
      );
    },
  },
  {
    id: 24,
    name: "Shahid's bell tray hides shaping field updates",
    description: "Verifies shaping_stuck / shaping update notifications are NOT visible to Shahid (Leadership).",
    run: () => {
      const note: Notification = {
        id: "n-test-24",
        ts: new Date().toISOString(),
        trigger: "shaping_stuck",
        priority: "P3",
        title: "Shaping field updated: scope refinement",
        body: "E2E test — shaping update.",
        for_user_id: null,
        link_to: "/shaping",
        read: false,
        entity_id: null,
      };
      const visible = filterNotificationsForRole([note], "Leadership" as Role);
      expect(visible.length === 0, "Leadership should NOT see shaping field updates");
    },
  },
  {
    id: 25,
    name: "P0 signal raised appears in Shahid's bell tray",
    description: "Verifies a P0 monitoring_alert / signal is visible to Shahid (Leadership).",
    run: () => {
      const note: Notification = {
        id: "n-test-25",
        ts: new Date().toISOString(),
        trigger: "monitoring_alert",
        priority: "P0",
        title: "P0 signal: production outage",
        body: "E2E test — P0 incident raised.",
        for_user_id: null,
        link_to: "/inbox",
        read: false,
        entity_id: null,
      };
      const visible = filterNotificationsForRole([note], "Leadership" as Role);
      expect(visible.length === 1, "Leadership should see P0 signals");
      expect(
        categorizeNotification(note) === "signal_new_p0",
        "P0 monitoring alert should categorize as signal_new_p0",
      );
    },
  },
  {
    id: 26,
    name: "Shahid's unread badge ≤ Bazil's on the live notification list",
    description: "Verifies the role filter makes Shahid's visible-unread count a subset of Bazil's.",
    run: () => {
      const all = useTfpStore.getState().notifications;
      const bazilForMe = all.filter((n) => n.for_user_id === null || n.for_user_id === "u-bazil");
      const shahidForMe = all.filter((n) => n.for_user_id === null || n.for_user_id === "u-shahid");
      const bazilCount = filterNotificationsForRole(bazilForMe, "PM" as Role).filter((n) => !n.read).length;
      const shahidCount = filterNotificationsForRole(shahidForMe, "Leadership" as Role).filter((n) => !n.read).length;
      expect(
        shahidCount <= bazilCount,
        `Expected Shahid unread (${shahidCount}) ≤ Bazil unread (${bazilCount})`,
      );
    },
  },
];
