export default function ScoreProperties({ analysis, analysisError }) {
    return (
        <section className="inspector-properties">
            <h3>Score overview</h3>
            {analysis ? (
                <dl>
                    <div>
                        <dt>Key</dt>
                        <dd>{analysis.key}</dd>
                    </div>
                    <div>
                        <dt>Time signature</dt>
                        <dd>{analysis.time_signature}</dd>
                    </div>
                    <div>
                        <dt>Tempo</dt>
                        <dd>{analysis.tempo}</dd>
                    </div>
                    <div>
                        <dt>Parts</dt>
                        <dd>{analysis.parts}</dd>
                    </div>
                </dl>
            ) : (
                <p className="inspector-empty" role="status">
                    {analysisError || "Score analysis is unavailable."}
                </p>
            )}
        </section>
    );
}
