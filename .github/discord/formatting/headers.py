def format_card_header(repo_name, repo_url, action_line):
    """
    Standard card top header: # [Repo](url) followed by plain white action line.
    """
    return f"# [{repo_name}]({repo_url})\n{action_line}"
