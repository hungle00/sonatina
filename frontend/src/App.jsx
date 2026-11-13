import { useState } from "react";
import { renderScore } from "./services/scoreApi";
import ScoreViewer from "./components/ScoreViewer/ScoreViewer";
import "./style.css";

export default function App() {
    const [pages, setPages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    async function handleUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        setLoading(true);
        setError("");
        setPages([]);

        try {
            const result = await renderScore(file);
            setPages(result.pages);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <main>
            <header>
                <h1>Music Toolkit</h1>
                <span>Score Viewer</span>
            </header>

            <section className="upload">
                <input
                    type="file"
                    accept=".musicxml,.xml"
                    onChange={handleUpload}
                />
                {loading && <p>Rendering score...</p>}
                {error && <p className="error">{error}</p>}
            </section>

            {pages.length > 0 && <ScoreViewer pages={pages} />}
        </main>
    );
}
