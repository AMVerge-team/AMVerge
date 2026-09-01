import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent,
} from "react";
import {
  getConsoleLogsSnapshot,
  serializeConsoleLogs,
  subscribeToConsoleLogs,
  type ConsoleEntry,
} from "../../utils/appConsole";
import Dropdown, { type DropdownOption } from "../common/Dropdown";
import Tooltip from "../common/Tooltip";
import { useDiscordRPCStatus } from "../../hooks/useDiscordRPC";
import { useEventsStore } from "../../stores/eventsStore";
import {
  FaBug,
  FaPaperPlane,
  FaSpinner,
  FaFileVideo,
  FaDesktop,
  FaImage,
  FaDiscord,
  FaGithub,
  FaInfoCircle,
  FaMicrochip,
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

type AutofillButtonProps = {
  icon: ReactNode;
  label: string;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  /** `discord` tints the hover with the brand colour. */
  variant?: "discord";
};

/** The "fill this field for me" button that rides on a field's label line. */
function AutofillButton({
  icon,
  label,
  tooltip,
  onClick,
  disabled,
  variant,
}: AutofillButtonProps) {
  return (
    // 420: the default cap wraps both of these hints onto a second line.
    <Tooltip placement="top-end" maxWidth={420} content={tooltip}>
      <button
        type="button"
        className={`bugreport-autofill-btn${variant ? ` ${variant}` : ""}`}
        onClick={onClick}
        disabled={disabled}
      >
        {icon}
        {label}
      </button>
    </Tooltip>
  );
}

export default function BugReport() {
  const [bugType, setBugType] = useState("Issue with video");
  const [issueText, setIssueText] = useState("");
  const [PCSpecs, setPCSpecs] = useState("");
  const [contact, setContact] = useState("");
  const [screenShots, setScreenshots] = useState<FileList | null>(null);
  const [videoReference, setVideoReference] = useState("");
  const [logs, setLogs] = useState<ConsoleEntry[]>(() => getConsoleLogsSnapshot());
  const [isDetectingSpecs, setIsDetectingSpecs] = useState(false);
  const [specsError, setSpecsError] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<number | null>(() =>
    readLastSubmittedAt()
  );
  const [nowTs, setNowTs] = useState(() => Date.now());
  const discordStatus = useDiscordRPCStatus();
  // The signed-in account from Community Events, which is a real authenticated
  // identity rather than whatever Rich Presence happens to be reporting. It is
  // preferred so the field fills for anyone signed in, whether or not they run
  // Rich Presence at all.
  const eventsProfile = useEventsStore((state) => state.profile);

  // The handle, not the display name: a display name cannot be searched for,
  // and it carries capitals the account itself does not have.
  const discordUser =
    eventsProfile?.username ?? discordStatus?.user_handle ?? discordStatus?.user ?? null;
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const issueTextRef = useRef<HTMLTextAreaElement | null>(null);

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

  const screenshotLabel = useMemo(() => {
    const files = screenShots ? Array.from(screenShots) : [];
    if (files.length === 0) return "No screenshot selected";
    if (files.length === 1) return files[0].name;
    return `${files.length} screenshots selected`;
  }, [screenShots]);

  async function onAutoFillSpecs() {
    setSpecsError(null);

    try {
      setIsDetectingSpecs(true);
      const specs = await invoke<string>("detect_pc_specs");
      setPCSpecs(specs);
    } catch (err) {
      console.error(err);
      setSpecsError("Could not read your specs. Please type them in.");
    } finally {
      setIsDetectingSpecs(false);
    }
  }

  function onFillDiscordContact() {
    if (!discordUser) {
      setContactError(
        "Discord isn't connected. Sign in on the Events page or turn on Rich Presence, or type your username."
      );
      return;
    }

    setContactError(null);
    setContact(discordUser);
  }

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setIssueError(null);

    if (!issueText.trim()) {
      setIssueError("Please describe the issue before submitting.");
      issueTextRef.current?.focus();
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
      setIssueError(null);
      setPCSpecs("");
      setContact("");
      setContactError(null);
      setScreenshots(null);
      if (screenshotInputRef.current) {
        screenshotInputRef.current.value = "";
      }
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

      <div className="bugreport-alt-banner">
        <div className="bugreport-alt-text">
          <FaInfoCircle className="bugreport-alt-icon" />
          <span>
            Prefer reporting directly? You can also open an issue on GitHub or chat with us in our Discord server:
          </span>
        </div>
        <div className="bugreport-alt-buttons">
          <button
            type="button"
            className="bugreport-alt-btn discord"
            onClick={() => void open("https://discord.gg/bmXjTgsAaN")}
          >
            <FaDiscord style={{ marginRight: 6, fontSize: "0.95rem" }} />
            Discord Community
          </button>
          <button
            type="button"
            className="bugreport-alt-btn github"
            onClick={() => void open("https://github.com/AMVerge-team/AMVerge/issues")}
          >
            <FaGithub style={{ marginRight: 6, fontSize: "0.95rem" }} />
            GitHub Issues
          </button>
        </div>
      </div>

      {/* noValidate: the browser's own "field required" bubble is written in the
          system's language, which pops French wording into an English app. We
          check the fields ourselves and say it in our own words. */}
      <form onSubmit={onSubmit} className="bugreport-grid" noValidate>
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
              ref={issueTextRef}
              rows={6}
              value={issueText}
              placeholder="What happened, what did you expect, and how can we reproduce it?"
              onChange={(e) => {
                setIssueText(e.target.value);
                if (issueError) setIssueError(null);
              }}
              aria-required="true"
              aria-invalid={issueError ? "true" : undefined}
            />
            {issueError && <p className="bugreport-field-error">{issueError}</p>}
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
              <h4>Screen Recording (Optional)</h4>
            </div>
            <div className="bugreport-field">
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
            <div className="bugreport-field">
              <div className="bugreport-label-row">
                <label htmlFor="pc-specs" className="bugreport-label">
                  PC Specs
                </label>
                <AutofillButton
                  icon={isDetectingSpecs ? <FaSpinner className="spin" /> : <FaMicrochip />}
                  label={isDetectingSpecs ? "Reading this PC..." : "Fill with my PC specs"}
                  tooltip="Fills in this computer's OS, CPU, RAM and GPU"
                  onClick={() => void onAutoFillSpecs()}
                  disabled={isDetectingSpecs}
                />
              </div>
              <input
                id="pc-specs"
                type="text"
                value={PCSpecs}
                placeholder="e.g. RTX 3080, Win 11"
                onChange={(e) => setPCSpecs(e.target.value)}
              />
              {specsError && <p className="bugreport-field-error">{specsError}</p>}
            </div>

            <div className="bugreport-field">
              <div className="bugreport-label-row">
                <label htmlFor="contact" className="bugreport-label">
                  Contact
                </label>
                <AutofillButton
                  icon={<FaDiscord />}
                  label="Fill with my Discord"
                  tooltip={
                    discordUser
                      ? "Fills in your Discord username"
                      : "Needs Discord Rich Presence on and Discord running"
                  }
                  onClick={onFillDiscordContact}
                  variant="discord"
                />
              </div>
              <input
                id="contact"
                type="text"
                value={contact}
                placeholder="Discord username / email"
                onChange={(e) => {
                  setContact(e.target.value);
                  if (contactError) setContactError(null);
                }}
              />
              {contactError && <p className="bugreport-field-error">{contactError}</p>}
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
              {/* The native file input labels itself in the system's language,
                  which leaves French wording in an English app. Our own button
                  drives the hidden input instead. */}
              <div className="bugreport-file-row">
                <button
                  type="button"
                  className="bugreport-file-btn"
                  onClick={() => screenshotInputRef.current?.click()}
                >
                  <FaImage />
                  Choose screenshots
                </button>
                <Tooltip content={screenShots?.length ? screenshotLabel : ""}>
                  <span className="bugreport-file-status">{screenshotLabel}</span>
                </Tooltip>
              </div>
              <input
                id="screenshots"
                ref={screenshotInputRef}
                className="bugreport-file-input"
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