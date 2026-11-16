import { open } from '@tauri-apps/plugin-shell';
import { useTranslation } from 'react-i18next';
import { FaHeart, FaGithub, FaCodeBranch } from '../icons/animated';

export default function Credits() {
    const { t } = useTranslation('menu');
    const team = [
        { name: 'Crptk', username: 'crptk', role: t('credits.roles.crptk') },
        { name: 'Netsuma', username: 'NetsumaInfo', role: t('credits.roles.netsuma') },
        { name: 'Moongetsu', username: 'Moongetsu', role: t('credits.roles.moongetsu') },
        { name: 'Lewis', username: 'lew-is', role: t('credits.roles.lewis') },
        { name: '0xkhaosoccured', username: '0xkhaosoccured', role: t('credits.roles.khaos') },
        { name: 'TOSINIRL', username: 'TOSINIRL', role: t('credits.roles.tosin') },
        { name: 'Mark Shun', username: 'Mark-Shun', role: t('credits.roles.markShun') }
    ];

    return (
        <div className="panel menu-panel credits-panel">
            <div className="credits-hero">
                <h2 className="about-hero-title">{t('credits.title')}</h2>
                <p className="about-hero-subtitle">{t('credits.subtitle')}</p>
            </div>

            <div className="credits-grid">
                <div className="about-card credits-card">
                    <div className="about-card-header">
                        <span className="about-card-icon"><FaCodeBranch /></span>
                        <h4>{t('credits.contributors')}</h4>
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
                        <h4>{t('credits.contribute')}</h4>
                    </div>
                    <p className="about-card-text">{t('credits.contributeText')}</p>
                    <div className="about-links-group" style={{ marginTop: "auto" }}>
                        <button
                            className="about-link-btn github"
                            onClick={(e) => {
                                e.preventDefault();
                                open("https://github.com/AMVerge-team/AMVerge");
                            }}
                        >
                            <FaGithub style={{ marginRight: 8, fontSize: "1.1rem" }} />
                            {t('credits.contributeGithub')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}