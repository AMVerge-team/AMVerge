import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState, type SubmitEvent } from "react";
import {
  getConsoleLogsSnapshot,
  serializeConsoleLogs,
  subscribeToConsoleLogs,
  type ConsoleEntry,
} from "../../utils/appConsole";
import Dropdown, { type DropdownOption } from "../common/Dropdown";
import {
  FaBug,
  FaPaperPlane,
  FaSpinner,
  FaFileVideo,
  FaDesktop,
  FaImage,
} from "react-icons/fa";

const ENABLE_SUBMIT_COOLDOWN = false;
const BUG_REPORT_COOLDOWN_MS = 60 * 60 * 1000;
const BUG_REPORT_COOLDOWN_STORAGE_KEY = "amverge_bug_report_last_submitted_at";
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

const BUG_TYPE_OPTIONS: DropdownOption<string>[] = [
  {
    value: "Issue with video",
    label: "Issue with video",
    description: "Import, playback, GOP cuts, audio desync, or export glitches",
  },
  {
    value: "Issue with app",
    label: "Issue with app",
    description: "UI bug, crash, settings, AI dependency installer, or freezes",
  },
  {
    value: "Feature request",
    label: "Feature request",
    description: "Suggestions or workflow improvements for AMVerge",
  },
];

function readLastSubmittedAt(): number | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(BUG_REPORT_COOLDOWN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function formatCooldown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function fileToBase64Data(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error(`Failed to read ${file.name}`));
        return;
      }

      const commaIndex = result.indexOf(",");
      if (commaIndex === -1) {
        reject(new Error(`Invalid data URL for ${file.name}`));
        return;
      }

      resolve(result.slice(commaIndex + 1));
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    };

    reader.readAsDataURL(file);
  });
}

type ScreenshotAttachment = {
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
};

type BugReportRequest = {
  bugType: string;
  issueText: string;
  pcSpecs?: string | null;
  contact?: string | null;
  videoReference?: string | null;
  screenshotNames: string[];
  screenshots: ScreenshotAttachment[];
  consoleLogs: string;
  consoleLogCount: number;
  redactionApplied: boolean;
};

type BugReportResponse = {
  ok: boolean;
  message: string;
  reportId?: string;
};

export default function BugReport() {
  const [bugType, setBugType] = useState("Issue with video");
  const [issueText, setIssueText] = useState("");
  const [PCSpecs, setPCSpecs] = useState("");
  const [contact, setContact] = useState("");
  const [screenShots, setScreenshots] = useState<FileList | null>(null);
  const [videoReference, setVideoReference] = useState("");
  const [logs, setLogs] = useState<ConsoleEntry[]>(() => getConsoleLogsSnapshot());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<number | null>(() =>
    readLastSubmittedAt()
  );
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    return subscribeToConsoleLogs(setLogs);
  }, []);

  useEffect(() => {
    if (!ENABLE_SUBMIT_COOLDOWN || !lastSubmittedAt) return;

    const interval = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [lastSubmittedAt]);

  const redactedConsoleLogs = useMemo(() => {
    const serialized = serializeConsoleLogs(logs);
    if (!serialized) return "";

    return serialized
      .replace(/[A-Za-z]:\\[^\r\n\t]*/g, "[REDACTED_PATH]")
      .replace(/\/(Users|home)\/[^/\s]+\/[^\r\n]*/g, "[REDACTED_PATH]");
  }, [logs]);

  const cooldownRemainingMs = useMemo(() => {
    if (!ENABLE_SUBMIT_COOLDOWN || !lastSubmittedAt) return 0;
    return Math.max(0, lastSubmittedAt + BUG_REPORT_COOLDOWN_MS - nowTs);
  }, [lastSubmittedAt, nowTs]);

  const isCooldownActive = cooldownRemainingMs > 0;

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!issueText.trim()) {
      setSubmitError("Please describe the issue before submitting.");
      return;
    }

    if (isCooldownActive) {
      setSubmitError(
        `Please wait ${formatCooldown(cooldownRemainingMs)} before submitting another report.`
      );
      return;
    }

    const screenshotFiles = screenShots ? Array.from(screenShots) : [];
    if (screenshotFiles.some((file) => !file.type.startsWith("image/"))) {
      setSubmitError("Only image files are allowed for screenshots.");
      return;
    }

    if (screenshotFiles.some((file) => file.size > MAX_SCREENSHOT_BYTES)) {
      setSubmitError("One or more screenshots exceed the 8MB limit.");
      return;
    }

    const screenshotPayload = await Promise.all(
      screenshotFiles.map(async (file) => ({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        dataBase64: await fileToBase64Data(file),
      }))
    );

    const request: BugReportRequest = {
      bugType,
      issueText: issueText.trim(),
      pcSpecs: PCSpecs.trim() || null,
      contact: contact.trim() || null,
      videoReference: videoReference.trim() || null,
      screenshotNames: screenshotFiles.map((file) => file.name),
      screenshots: screenshotPayload,
      consoleLogs: redactedConsoleLogs,
      consoleLogCount: logs.length,
      redactionApplied: true,
    };

    try {
      setIsSubmitting(true);
      const res = await invoke<BugReportResponse>("submit_bug_report", { request });
      if (!res.ok) {
        setSubmitError(res.message || "Failed to submit bug report.");
        return;
      }

      setSubmitSuccess(res.message || "Bug report submitted successfully.");
      setIssueText("");
      setPCSpecs("");
      setContact("");
      setScreenshots(null);
      setVideoReference("");
      if (ENABLE_SUBMIT_COOLDOWN) {
        const submittedAt = Date.now();
        setLastSubmittedAt(submittedAt);
        setNowTs(submittedAt);
        try {
          window.localStorage.setItem(
            BUG_REPORT_COOLDOWN_STORAGE_KEY,
            submittedAt.toString()
          );
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.error(err);
      setSubmitError("Could not submit bug report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel menu-panel bugreport-panel">
      <div className="bugreport-hero">
        <h2 className="about-hero-title">Report an Issue</h2>
        <p className="about-hero-subtitle">
          Found an error or unexpected behavior? Submit details directly to the AMVerge team.
        </p>
      </div>

      <form onSubmit={onSubmit} className="bugreport-grid">
        {/* Left Column Card: Issue Description */}
        <div className="about-card bugreport-card-main">
          <div className="about-card-header">
            <span className="about-card-icon">
              <FaBug />
            </span>
            <h4>Issue Details</h4>
          </div>

          <div className="bugreport-field">
            <label className="bugreport-label">Bug Type</label>
            <Dropdown
              options={BUG_TYPE_OPTIONS}
              value={bugType}
              onChange={setBugType}
              className="bugreport-dropdown"
              showTriggerDescription={false}
            />
          </div>

          <div className="bugreport-field flex-grow">
            <label htmlFor="issue-text" className="bugreport-label">
              Description <span className="required-star">*</span>
            </label>
            <textarea
              id="issue-text"
              rows={6}
              value={issueText}
              placeholder="What happened, what did you expect, and how can we reproduce it?"
              onChange={(e) => setIssueText(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Right Column Cards: Context & Attachments */}
        <div className="bugreport-side-col">
          {/* Card: Video Reference */}
          <div className="about-card">
            <div className="about-card-header">
              <span className="about-card-icon">
                <FaFileVideo />
              </span>
              <h4>Video Details (Optional)</h4>
            </div>
            <div className="bugreport-field">
              <small className="bugreport-help">
                Sharing a sample video link, anime title, episode, or torrent helps us reproduce accurately.
              </small>
              <input
                id="video-reference"
                type="text"
                value={videoReference}
                placeholder="e.g. Google Drive link, torrent, episode..."
                onChange={(e) => setVideoReference(e.target.value)}
              />
            </div>
          </div>

          {/* Card: Specs & Contact */}
          <div className="about-card">
            <div className="about-card-header">
              <span className="about-card-icon">
                <FaDesktop />
              </span>
              <h4>System & Contact (Optional)</h4>
            </div>
            <div className="bugreport-field-inline">
              <div className="bugreport-field half">
                <label htmlFor="pc-specs" className="bugreport-label">
                  PC Specs
                </label>
                <input
                  id="pc-specs"
                  type="text"
                  value={PCSpecs}
                  placeholder="e.g. RTX 3080, Win 11"
                  onChange={(e) => setPCSpecs(e.target.value)}
                />
              </div>

              <div className="bugreport-field half">
                <label htmlFor="contact" className="bugreport-label">
                  Contact
                </label>
                <input
                  id="contact"
                  type="text"
                  value={contact}
                  placeholder="Discord username / email"
                  onChange={(e) => setContact(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Card: Screenshots & Submit */}
          <div className="about-card">
            <div className="about-card-header">
              <span className="about-card-icon">
                <FaImage />
              </span>
              <h4>Screenshots & Submit</h4>
            </div>
            <div className="bugreport-field">
              <input
                id="screenshots"
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setScreenshots(e.target.files)}
              />
            </div>

            {submitError && <div className="bugreport-alert error">{submitError}</div>}
            {submitSuccess && <div className="bugreport-alert success">{submitSuccess}</div>}

            <button
              type="submit"
              className="bugreport-submit-btn"
              disabled={isSubmitting || isCooldownActive}
            >
              {isSubmitting ? (
                <>
                  <FaSpinner className="spin" style={{ marginRight: 8 }} />
                  Submitting...
                </>
              ) : (
                <>
                  <FaPaperPlane style={{ marginRight: 8 }} />
                  Submit Bug Report
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}