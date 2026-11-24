import { PanelLeftIcon, PanelRightIcon } from "../icons/chrome/ChromeIcons";
import { Trans, useTranslation } from "react-i18next";
import { FaBan, FaBell, FaCalendarPlus, FaDiscord, FaSearch, FaSignOutAlt, FaSyncAlt, FaTimes } from '../icons/animated';

import Dropdown, { type DropdownOption } from "../common/Dropdown";
import Tooltip from "../common/Tooltip";
import InfoButton from "../common/InfoButton";
import { useEventsStore, type EventFilter, type EventSort } from "../../stores/eventsStore";
import { useUIStateStore } from "../../stores/UIStore";
import { formatCooldown, useCooldown } from "./useCooldown";

type Translate = (key: string) => string;

const getFilterOptions = (t: Translate): DropdownOption<EventFilter>[] => [
  { value: "all", label: t("events.filter.all"), description: t("events.filter.allDescription") },
  { value: "mine", label: t("events.filter.mine"), description: t("events.filter.mineDescription") },
  { value: "hc", label: t("events.filter.hc"), description: t("events.filter.hcDescription") },
  { value: "ec", label: t("events.filter.ec"), description: t("events.filter.ecDescription") },
];

const getSortOptions = (t: Translate): DropdownOption<EventSort>[] => [
  { value: "date-desc", label: t("events.sort.dateDesc"), description: t("events.sort.dateDescDescription") },
  { value: "date-asc", label: t("events.sort.dateAsc"), description: t("events.sort.dateAscDescription") },
  { value: "prize-desc", label: t("events.sort.prizeDesc"), description: t("events.sort.prizeDescDescription") },
  { value: "prize-asc", label: t("events.sort.prizeAsc"), description: t("events.sort.prizeAscDescription") },
];

/** the Events page's toolbar in place of the import row: hosting, Discord identity, search, filter */
export default function EventsToolbar() {
  const { t } = useTranslation("scout");
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
  const submitCooldownUntil = useEventsStore((s) => s.submitCooldownUntil);
  const ban = useEventsStore((s) => s.ban);
  const openBanNotice = useEventsStore((s) => s.openBanNotice);
  const notificationsMuted = useEventsStore((s) => s.notificationsMuted);
  const setNotificationsMuted = useEventsStore((s) => s.setNotificationsMuted);

  // hosting limits are enforced server-side; this only shows them
  const cooldownRemaining = useCooldown(submitCooldownUntil);
  const isBanned = Boolean(ban?.banned);

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
          <Tooltip content={sidebarEnabled ? t("events.hideEpisodePanel") : t("events.showEpisodePanel")}>
          <button
            type="button"
            className={`import-button panel-toggle-button episode-panel-toggle${sidebarEnabled ? " active" : ""}`}
            onClick={() => setSidebarEnabled(!sidebarEnabled)}
            aria-label={sidebarEnabled ? t("events.hideEpisodePanel") : t("events.showEpisodePanel")}
            aria-pressed={sidebarEnabled}
          >
            <PanelLeftIcon filled={sidebarEnabled} />
          </button>
        </Tooltip>

        <Tooltip
          content={
            isBanned
              ? t("events.bannedHint")
              : cooldownRemaining > 0
                ? t("events.cooldownHint", { time: formatCooldown(cooldownRemaining) })
                : t("events.requestHint")
          }
        >
          {/* a ban leaves the button live so it can explain itself; only the
              cooldown actually disables it */}
          <button
            type="button"
            className={`import-button events-action-button${isBanned ? " is-banned" : ""}`}
            onClick={() => (isBanned ? openBanNotice() : openHostForm(null))}
            disabled={!isBanned && cooldownRemaining > 0}
          >
            {isBanned ? <FaBan aria-hidden="true" /> : <FaCalendarPlus aria-hidden="true" />}
            {isBanned
              ? t("events.banned")
              : cooldownRemaining > 0
                ? formatCooldown(cooldownRemaining)
                : t("events.host")}
          </button>
        </Tooltip>

        <Tooltip content={notificationsMuted ? t("events.unmuteNotifications") : t("events.muteNotifications")}>
          <button
            type="button"
            className={`import-button refresh-button events-mute-button${notificationsMuted ? " is-muted" : ""}`}
            onClick={() => setNotificationsMuted(!notificationsMuted)}
            aria-label={notificationsMuted ? t("events.unmuteNotifications") : t("events.muteNotifications")}
            aria-pressed={notificationsMuted}
          >
            <FaBell aria-hidden="true" muted={notificationsMuted} />
          </button>
        </Tooltip>

        <Tooltip content={t("events.refresh")}>
          <button
            type="button"
            className="import-button refresh-button"
            onClick={() => void loadEvents()}
            disabled={loading}
            aria-label={t("events.refresh")}
          >
            <FaSyncAlt aria-hidden="true" />
          </button>
        </Tooltip>

        <InfoButton title={t("events.info.title")} variant="toolbar" icon="question">
          <p>{t("events.info.intro")}</p>

          <h4>{t("events.info.hcTitle")}</h4>
          <p>{t("events.info.hc")}</p>

          <h4>{t("events.info.ecTitle")}</h4>
          <p>{t("events.info.ec")}</p>

          <h4>{t("events.info.hostTitle")}</h4>
          <ol>
            <li>{t("events.info.step1")}</li>
            <li>{t("events.info.step2")}</li>
            <li>{t("events.info.step3")}</li>
            <li>{t("events.info.step4")}</li>
            <li>{t("events.info.step5")}</li>
          </ol>
        </InfoButton>

        {/* Right end of the row, over the pane it controls - the mirror of the
            episode panel toggle at the far left, same as the import row. */}
        <div className="events-toolbar-right">
          {profile ? (
            <div className="events-connected">
              <FaDiscord aria-hidden="true" className="events-connected-icon" />
              <span className="events-connected-label">
                <Trans t={t} i18nKey="events.connected" values={{ name: profile.username }} components={{ strong: <strong /> }} />
              </span>
              <Tooltip content={t("events.signOut")}>
                <button
                  type="button"
                  className="events-connected-signout"
                  onClick={() => void logout()}
                  aria-label={t("events.signOutDiscord")}
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
              {loginPending ? t("events.waiting") : t("events.login")}
            </button>
          )}

          {/* Last in the row, so it sits over the pane it controls. */}
          <Tooltip
            content={previewCollapsed ? t("panels.showPreviewPanel") : t("panels.hidePreviewPanel")}
            placement="bottom-end"
          >
            <button
              type="button"
              className={`import-button panel-toggle-button${previewCollapsed ? "" : " active"}`}
              onClick={() => setPreviewCollapsed(!previewCollapsed)}
              aria-label={previewCollapsed ? t("panels.showPreviewPanel") : t("panels.hidePreviewPanel")}
              aria-pressed={!previewCollapsed}
            >
              <PanelRightIcon filled={!previewCollapsed} />
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
            placeholder={t("events.searchPlaceholder")}
            aria-label={t("events.searchLabel")}
          />
          {search && (
            <button
              type="button"
              className="events-search-clear"
              onClick={() => setSearch("")}
              aria-label={t("events.clearSearch")}
            >
              <FaTimes aria-hidden="true" />
            </button>
          )}
        </div>

          <Dropdown
            options={getFilterOptions(t)}
            value={filter}
            onChange={setFilter}
            className="events-filter-dropdown"
            showTriggerDescription={false}
          />

          <Dropdown
            options={getSortOptions(t)}
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
