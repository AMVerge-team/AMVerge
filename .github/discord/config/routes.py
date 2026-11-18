def resolve_channel(event_name, event):
    """
    Returns 'updates' for high-signal milestones and 'feed' for continuous activity.
    """
    if event_name == "release":
        return "updates"

    if event_name == "push":
        return "updates"

    if event_name == "pull_request":
        action = event.get("action", "")
        pr = event.get("pull_request") or {}
        # Only merged PRs go to #github-updates
        if action == "closed" and pr.get("merged", False):
            return "updates"
        return "feed"

    # All issues, reviews, comments, stars, and branch events go to #github-feed
    return "feed"
