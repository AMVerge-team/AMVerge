import { open } from '@tauri-apps/plugin-shell';
import { FaUsers, FaHeart, FaGithub, FaCodeBranch } from 'react-icons/fa';

export default function Credits() {
    const team = [
        { name: 'Crptk', username: 'crptk', role: 'App Creator & Core Architecture' },
        { name: 'Netsuma', username: 'NetsumaInfo', role: 'UI System, Export Engine & Tooltips' },
        { name: 'Moongetsu', username: 'Moongetsu', role: 'Settings, AI Installer, Discord RPC & Multi-Platform' },
        { name: 'Lewis', username: 'lew-is', role: 'macOS Engine, Background Import & Optimization' },
        { name: '0xkhaosoccured', username: '0xkhaosoccured', role: 'Grid Virtualization & Rendering Fixes' },
        { name: 'TOSINIRL', username: 'TOSINIRL', role: 'macOS Demux & Video Compatibility' }
    ];

    return (
        <div className="panel menu-panel credits-panel">
            <div className="credits-hero">
                <h2 className="about-hero-title">The People Behind AMVerge</h2>
                <p className="about-hero-subtitle">
                    AMVerge started as one editor's side project and became something the
                    whole community builds. Nearly every feature here began as someone's
                    suggestion, bug report, or pull request, and it goes wherever the people
                    using it push it next.
                </p>
            </div>

            <div className="credits-grid">
                <div className="about-card credits-card">
                    <div className="about-card-header">
                        <span className="about-card-icon"><FaCodeBranch /></span>
                        <h4>Contributors</h4>
                    </div>
                    <div className="credits-team-grid">
                        {team.map((member) => (
                            <div
                                key={member.name}
                                className="credits-member-card"
                                onClick={() => void open(`https://github.com/${member.username}`)}
                                role="button"
                                tabIndex={0}
                            >
                                <img
                                    className="member-avatar"
                                    src={`https://github.com/${member.username}.png?size=96`}
                                    alt={member.name}
                                    onError={(e) => {
                                        // Fallback to initials if offline or image load fails
                                        e.currentTarget.style.display = 'none';
                                    }}
                                />
                                <div className="member-info">
                                    <span className="member-name">{member.name}</span>
                                    <span className="member-role">{member.role}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="about-card credits-card">
                    <div className="about-card-header">
                        <span className="about-card-icon"><FaHeart /></span>
                        <h4>Contribute & Community</h4>
                    </div>
                    <p className="about-card-text">
                        Want to help improve AMVerge? Whether it's adding new features, fixing bugs, or testing on different hardware, all contributions are welcome.
                    </p>
                    <div className="about-links-group" style={{ marginTop: "auto" }}>
                        <button
                            className="about-link-btn github"
                            onClick={(e) => {
                                e.preventDefault();
                                open("https://github.com/AMVerge-team/AMVerge");
                            }}
                        >
                            <FaGithub style={{ marginRight: 8, fontSize: "1.1rem" }} />
                            Contribute on GitHub
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}