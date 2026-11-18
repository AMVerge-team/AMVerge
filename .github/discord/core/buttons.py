def make_buttons(buttons):
    """
    Creates Discord ActionRow link buttons from a list of (label, url) tuples.
    """
    items = []
    for label, link in buttons:
        items.append({"type": 2, "style": 5, "label": label, "url": link})
    return [{"type": 1, "components": items}] if items else []
