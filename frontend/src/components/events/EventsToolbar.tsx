import { FaCalendarPlus, FaDiscord, FaSearch, FaSignOutAlt, FaSyncAlt, FaTimes } from "react-icons/fa";

import Dropdown, { type DropdownOption } from "../common/Dropdown";
import Tooltip from "../common/Tooltip";
import InfoButton from "../common/InfoButton";
import { useEventsStore, type EventFilter, type EventSort } from "../../stores/eventsStore";
import { useUIStateStore } from "../../stores/UIStore";

const FILTER_OPTIONS: DropdownOption<EventFilter>[] = [
  { value: "all", label: "All events", description: "Everything, running or finished" },
  { value: "mine", label: "My events", description: "Events you host, including ones in review" },
  { value: "hc", label: "HC only", description: "Hour Challenges only" },
  { value: "ec", label: "EC only", description: "Long Contests only" },
];

const SORT_OPTIONS: DropdownOption<EventSort>[] = [
  { value: "date-desc", label: "Date, latest", description: "Latest start date first" },
  { value: "date-asc", label: "Date, oldest", description: "Earliest start date first" },
  { value: "prize-desc", label: "Prize pool, largest", description: "Largest prize first" },
  { value: "prize-asc", label: "Prize pool, smallest", description: "Smallest prize first" },
];

/**
 * Takes the place of the import row on the Events page: hosting, Discord
 * identity, search, and the filter. Mirrors `.clips-import`'s right padding so
 * its controls line up with the grid's right edge as the divider moves.
 */
export default function EventsToolbar() {
  const previewCollapsed = useUIStateStore((s) => s.previewCollapsed);
  const setPreviewCollapsed = useUIStateStore((s) => s.setPreviewCollapsed);
  const previewSplitPct = useUIStateStore((s) => s.previewSplitPct);
  const sidebarEnabled = useUIStateStore((s) => s.sidebarEnabled);
  const setSidebarEnabled = useUIStateStore((s) => s.setSidebarEnabled);

  const profile = useEventsStore((s) => s.profile);
  const loginPending = useEventsStore((s) => s.loginPending);
  const search = useEventsStore((s) => s.search);
  const filter = useEventsStore((s) => s.filter);
  const sort = useEventsStore((s) => s.sort);
  const loading = useEventsStore((s) => s.loading);

  const setSearch = useEventsStore((s) => s.setSearch);
  const setFilter = useEventsStore((s) => s.setFilter);
  const setSort = useEventsStore((s) => s.setSort);
  const startLogin = useEventsStore((s) => s.startLogin);
  const logout = useEventsStore((s) => s.logout);
  const openHostForm = useEventsStore((s) => s.openHostForm);
  const loadEvents = useEventsStore((s) => s.loadEvents);

  return (
    <main
      className="clips-import events-toolbar-shell"
      style={
        previewCollapsed
          ? undefined
          : { paddingRight: `calc(max(280px, ${100 - previewSplitPct}%) + 10px)` }
      }
    >
      <div className="events-toolbar-rows">
        <div className="import-buttons-container events-toolbar-row">
          <Tooltip content={sidebarEnabled ? "Hide episode panel" : "Show episode panel"}>
          <button
            type="button"
            className={`import-button panel-toggle-button episode-panel-toggle${sidebarEnabled ? " active" : ""}`}
            onClick={() => setSidebarEnabled(!sidebarEnabled)}
            aria-label={sidebarEnabled ? "Hide episode panel" : "Show episode panel"}
            aria-pressed={sidebarEnabled}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
              {sidebarEnabled && (
                <rect x="3.9" y="4.9" width="4.2" height="14.2" rx="1" fill="currentColor" stroke="none" />
              )}
            </svg>
          </button>
        </Tooltip>

        <button type="button" className="import-button events-action-button" onClick={() => openHostForm(null)}>
          <FaCalendarPlus aria-hidden="true" />
          Host Event
        </button>

        <InfoButton title="Community Events">
          <p>
            The community is big, and editing contests get lost in the noise. This page
            gathers them in one place so editors can find opportunities worth entering,
            and hosts reach the people most likely to show up. Better turnout makes for
            better events, and events that go well encourage the next person to run one.
          </p>

          <h4>Hour Challenge (HC)</h4>
          <p>
            A short, fixed window. Editors get a set number of hours, usually on a single
            day, to make an edit from start to finish. These are lower commitment and I personally
            love participating in these (-crptk)
          </p>

          <h4>Editing Contest (EC)</h4>
          <p>
            A longer format that runs at least a day and often much more. There is room to
            plan and refine, usually less rules and restrictions, and the prizes tend to be
            bigger.
          </p>

          <h4>Hosting an event</h4>
          <ol>
            <li>Sign in with Discord using the Login button so you can manage the event going forward. 
              All logins are done through Discord's official API, so we have no access to your data.
            </li>
            <li>Press Host Event and pick the format: HC for a timed contest, EC for a longer contest.</li>
            <li>
              Fill in the title, cover image, description, dates, and an invite to the
              Discord server where the event actually happens. Add a prize pool if there
              is one.
            </li>
            <li>
              Send it for review. A moderator checks every submission before it goes live,
              which usually takes a short while.
            </li>
            <li>
              You will get a notice once it is approved. After that you can still correct
              the dates, invite link, or prize pool yourself; changing the title,
              description, or cover sends it back for another quick review.
            </li>
          </ol>
        </InfoButton>

        <Tooltip content="Refresh events">
          <button
            type="button"
            className="import-button refresh-button"
            onClick={() => void loadEvents()}
            disabled={loading}
            aria-label="Refresh events"
          >
            <FaSyncAlt aria-hidden="true" />
          </button>
        </Tooltip>

        {/* Right end of the row, over the pane it controls - the mirror of the
            episode panel toggle at the far left, same as the import row. */}
        <div className="events-toolbar-right">
          {profile ? (
            <div className="events-connected">
              <FaDiscord aria-hidden="true" className="events-connected-icon" />
              <span className="events-connected-label">
                Connected: <strong>{profile.username}</strong>
              </span>
              <Tooltip content="Sign out">
                <button
                  type="button"
                  className="events-connected-signout"
                  onClick={() => void logout()}
                  aria-label="Sign out of Discord"
                >
                  <FaSignOutAlt aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          ) : (
            <button
              type="button"
              className="import-button events-action-button events-login-button"
              onClick={() => void startLogin()}
              disabled={loginPending}
            >
              <FaDiscord aria-hidden="true" className="events-discord-icon" />
              {loginPending ? "Waiting..." : "Login"}
            </button>
          )}

          {/* Last in the row, so it sits over the pane it controls. */}
          <Tooltip
            content={previewCollapsed ? "Show preview panel" : "Hide preview panel"}
            placement="bottom-end"
          >
            <button
              type="button"
              className={`import-button panel-toggle-button${previewCollapsed ? "" : " active"}`}
              onClick={() => setPreviewCollapsed(!previewCollapsed)}
              aria-label={previewCollapsed ? "Show preview panel" : "Hide preview panel"}
              aria-pressed={!previewCollapsed}
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M15 3v18" />
                {!previewCollapsed && (
                  <rect x="15.9" y="4.9" width="4.2" height="14.2" rx="1" fill="currentColor" stroke="none" />
                )}
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="import-buttons-container events-toolbar-row">
        <div className="events-search">
          <FaSearch aria-hidden="true" className="events-search-icon" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Event"
            aria-label="Search events"
          />
          {search && (
            <button
              type="button"
              className="events-search-clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <FaTimes aria-hidden="true" />
            </button>
          )}
        </div>

          <Dropdown
            options={FILTER_OPTIONS}
            value={filter}
            onChange={setFilter}
            className="events-filter-dropdown"
            showTriggerDescription={false}
          />

          <Dropdown
            options={SORT_OPTIONS}
            value={sort}
            onChange={setSort}
            className="events-filter-dropdown"
            showTriggerDescription={false}
          />
        </div>
      </div>
    </main>
  );
}
