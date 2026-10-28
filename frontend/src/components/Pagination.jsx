export default function Pagination({ page, hasPrevious, hasNext, onChange, label }) {
    if (!hasPrevious && !hasNext) return null;
    return (
        <nav className="pagination" aria-label="Pagination">
            <button type="button" className="btn btn--ghost btn--small" disabled={!hasPrevious} onClick={() => onChange(page - 1)}>← Previous</button>
            <span>{label || `Page ${page}`}</span>
            <button type="button" className="btn btn--ghost btn--small" disabled={!hasNext} onClick={() => onChange(page + 1)}>Next →</button>
        </nav>
    );
}
