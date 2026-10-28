// Small building blocks for loading, error, success and empty states.

export function Loader({ label = 'Loading…' }) {
    return (
        <div className="loader" role="status" aria-live="polite">
            <span className="loader__spinner" aria-hidden="true" />
            <span>{label}</span>
        </div>
    );
}

export function Alert({ type = 'error', children, onRetry, onClose }) {
    if (!children) return null;
    return (
        <div className={`alert alert--${type}`} role={type === 'error' ? 'alert' : 'status'}>
            <span>{children}</span>
            {onRetry && <button type="button" className="btn btn--small btn--ghost" onClick={onRetry}>Try again</button>}
            {onClose && <button type="button" className="alert__close" onClick={onClose} aria-label="Dismiss">×</button>}
        </div>
    );
}

export function EmptyState({ title, children, action }) {
    return (
        <div className="empty-state">
            <h2>{title}</h2>
            {children && <p>{children}</p>}
            {action}
        </div>
    );
}

export function StatusBadge({ status }) {
    return <span className={`badge badge--${String(status || 'unknown').toLowerCase()}`}>{status || 'UNKNOWN'}</span>;
}
