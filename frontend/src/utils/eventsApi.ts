import { invoke } from "@tauri-apps/api/core";

import type {
  DiscordProfile,
  EventMutationResult,
  EventSubmission,
  EventsResult,
} from "../components/events/types";


/**
 * Thin wrappers over the Rust commands. The webview's CSP blocks every remote
 * host, so this is the only way events reach the app — and it keeps the session
 * token on the Rust side, where the webview cannot read it.
 */

export function fetchEvents(scope: "active" | "past"): Promise<EventsResult> {
  return invoke<EventsResult>("fetch_events", { scope });
}

export function fetchMyEvents(): Promise<EventsResult> {
  return invoke<EventsResult>("fetch_my_events");
}

export function submitEventRequest(submission: EventSubmission): Promise<EventMutationResult> {
  return invoke<EventMutationResult>("submit_event_request", { submission });
}

export function updateEventRequest(
  eventId: string,
  submission: EventSubmission
): Promise<EventMutationResult> {
  return invoke<EventMutationResult>("update_event_request", { eventId, submission });
}

export function deleteEventRequest(eventId: string): Promise<EventMutationResult> {
  return invoke<EventMutationResult>("delete_event_request", { eventId });
}

export function acknowledgeEventDenial(eventId: string): Promise<EventMutationResult> {
  return invoke<EventMutationResult>("acknowledge_event_denial", { eventId });
}

export function acknowledgeEventApproval(eventId: string): Promise<EventMutationResult> {
  return invoke<EventMutationResult>("acknowledge_event_approval", { eventId });
}

/** Returns the Discord authorize URL to open in the system browser. */
export function beginDiscordLogin(): Promise<string> {
  return invoke<string>("begin_discord_login");
}

export function cancelDiscordLogin(): Promise<void> {
  return invoke<void>("cancel_discord_login");
}

export function readDiscordSession(): Promise<DiscordProfile | null> {
  return invoke<DiscordProfile | null>("discord_session");
}

export function discordLogout(): Promise<void> {
  return invoke<void>("discord_logout");
}
