import { useId } from 'react';

// Labelled form control with an accessible error message.
export default function Field({ label, error, hint, as = 'input', children, ...props }) {
    const id = useId();
    const describedBy = [ error && `${id}-error`, hint && `${id}-hint` ].filter(Boolean).join(' ') || undefined;
    const Control = as;

    return (
        <div className={`field${error ? ' field--invalid' : ''}`}>
            <label htmlFor={id}>{label}</label>
            {children
                ? <Control id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy} {...props}>{children}</Control>
                : <Control id={id} aria-invalid={Boolean(error)} aria-describedby={describedBy} {...props} />}
            {hint && <small id={`${id}-hint`} className="field__hint">{hint}</small>}
            {error && <small id={`${id}-error`} className="field__error">{error}</small>}
        </div>
    );
}
