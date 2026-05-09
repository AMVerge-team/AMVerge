import ReactMarkdown from "react-markdown";
import changelog from "../../data/CHANGELOG.md?raw";

export default function PatchNotes() {
    return (
        <section className="panel menu-panel">
            <h3>Patch notes</h3>
            <div className="about-content">
                <div className="patchnotes-content">
                    <ReactMarkdown>{changelog}</ReactMarkdown>
                </div>
            </div>
        </section>
    )
}