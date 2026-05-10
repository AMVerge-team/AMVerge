import { invoke } from "@tauri-apps/api/core"
import { useEffect, useMemo, useState, type SubmitEvent } from "react"
import {
    getConsoleLogsSnapshot,
    serializeConsoleLogs,
    subscribeToConsoleLogs,
    type ConsoleEntry,
} from "../../utils/appConsole"

type BugReportRequest = {
    bugType: string;
    issueText: string;
    pcSpecs?: string | null;
    contact?: string | null;
    videoUrl?: string | null;
    screenshotNames: string[];
    consoleLogs?: string;
    consoleLogCount?: number;
    redactionApplied?: boolean;
};

type BugReportResponse = {
    ok: boolean;
    message: string;
    reportId?: string;
}

export default function BugReport() {
    const [bugType, setBugType] = useState("Issue with video")
    const [issueText, setIssueText] = useState("")
    const [PCSpecs, setPCSpecs] = useState("")
    const [contact, setContact] = useState("")
    const [screenShots, setScreenshots] = useState<FileList | null>(null)
    const [video, setVideo] = useState("")
    const [logs, setLogs] = useState<ConsoleEntry[]>(() => getConsoleLogsSnapshot())
    const [includeConsoleLogs, setIncludeConsoleLogs] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

    useEffect(() => {
        return subscribeToConsoleLogs(setLogs)
    }, [])

    const redactedConsoleLogs = useMemo(() => {
        const serialized = serializeConsoleLogs(logs)
        if (!serialized) return ""

        // Redact common local path shapes that can expose usernames and directories.
        return serialized
            .replace(/[A-Za-z]:\\[^\r\n\t]*/g, "[REDACTED_PATH]")
            .replace(/\/(Users|home)\/[^/\s]+\/[^\r\n]*/g, "[REDACTED_PATH]")
    }, [logs])


    async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
        e.preventDefault()
        setSubmitError(null)
        setSubmitSuccess(null)

        if (!issueText.trim()) {
            setSubmitError("Please describe the issue before submitting.")
            return;
        }
        
        if (bugType === "Issue with video" && !video.trim()) {
            setSubmitError("Please provide a public video download link for video-related issues.")
            return;
        }

        const request: BugReportRequest = {
            bugType,
            issueText: issueText.trim(),
            pcSpecs: PCSpecs.trim() || null,
            contact: contact.trim() || null,
            videoUrl: video.trim() || null,
            screenshotNames: screenShots ? Array.from(screenShots).map((f) => f.name) : [],
        };

        if (includeConsoleLogs && redactedConsoleLogs.trim()) {
            request.consoleLogs = redactedConsoleLogs
            request.consoleLogCount = logs.length
            request.redactionApplied = true
        }

        try { 
            setIsSubmitting(true)
            const res = await invoke<BugReportResponse>("submit_bug_report", { request });
            if (!res.ok) {
                setSubmitError(res.message || "Failed to submit bug report.")
                return;
            }

            setSubmitSuccess(res.message || "Bug report submitted.")
            setIssueText("")
            setPCSpecs("")
            setContact("")
            setScreenshots(null)
            setVideo("")
        } catch (err) {
            console.error(err);
            setSubmitError("Could not submit bug report. Please try again.")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <section className="panel menu-panel">
            <h3>Report a bug</h3>
            <div className="bugreport-wrapper">
                <form onSubmit={onSubmit}>
                    <div className="bugreport-row">
                        <label htmlFor="bug-type">Select the type of bug you have</label>
                        <select
                         id="bug-type"
                         value={bugType}
                         onChange={(e) => setBugType(e.target.value)}
                        >
                            <option value="Issue with video">Issue with video</option>
                            <option value="Issue with app">Issue with app</option>
                        </select>
                    </div>
                    <div className="bugreport-row">
                        <label htmlFor="issue-text">Please describe your issue in as much detail as possible</label>
                        <input
                         type="text"
                         value={issueText}
                         placeholder="My issue is with.."
                         onChange={(e) => setIssueText(e.target.value)}
                        />
                    </div>
                    { bugType === "Issue with video" && 
                    <div className="bugreport-row">
                        <label htmlFor="video-link">Please paste a link where we can download video that 
                            has the issue<br/>This can be in a Google Drive, Mega, any file sharing link. Ensure the link is public, and feel free to delete it after 2 days to free up space.
                        </label>
                        <input
                         type="url"
                         onChange={(e) => setVideo(e.target.value)}
                         />
                    </div>
                    }
                    <div className="bugreport-row">
                        <label htmlFor="pc-specs">(OPTIONAL) Please provide your PC specifications</label>
                        <input
                         type="text"
                         value={PCSpecs}
                         placeholder="e.g RTX 3060, Ryzen 5600X, 32GB RAM"
                         onChange={(e) => setPCSpecs(e.target.value)}
                        />
                    </div>
                    <div className="bugreport-row">
                        <label htmlFor="contact-info">(OPTIONAL) Please type in your discord in case we need more details</label>
                        <input
                         type="text"
                         value={contact}
                         placeholder="e.g @onepathonly"
                         onChange={(e) => setContact(e.target.value)}
                         />
                    </div>
                    <div className="bugreport-row">
                        <label htmlFor="screenshots">(OPTIONAL) Please attach any screenshots if relevant</label>
                        <input
                         id="screenshots"
                         type="file"
                         multiple
                         accept="image/*"
                         onChange={(e) => setScreenshots(e.target.files)}
                        />
                    </div>
                    <div className="bugreport-row">
                        <label htmlFor="include-console-logs">
                            Include current console logs with this report ({logs.length} log entries)
                        </label>
                        <input
                         id="include-console-logs"
                         type="checkbox"
                         checked={includeConsoleLogs}
                         onChange={(e) => setIncludeConsoleLogs(e.target.checked)}
                        />
                        <small>
                            Console logs may include local file paths and usernames. Paths are redacted before sending.
                        </small>
                    </div>
                    {submitError && (
                        <div className="bugreport-row">
                            <p role="alert">{submitError}</p>
                        </div>
                    )}
                    {submitSuccess && (
                        <div className="bugreport-row">
                            <p>{submitSuccess}</p>
                        </div>
                    )}
                    <div className="bugreport-row">
                        <button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Submitting..." : "Submit Report"}
                        </button>
                    </div>
                </form>
            </div>
        </section>
    )
}