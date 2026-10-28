import { useCallback, useEffect, useRef, useState } from 'react';

// Runs an async loader when `deps` change and tracks loading/error/data.
// Results from stale calls (deps changed mid-flight) are ignored.
export function useAsync(loader, deps) {
    const [ state, setState ] = useState({ data: null, error: null, loading: true });
    const callId = useRef(0);

    const run = useCallback(() => {
        const id = ++callId.current;
        setState(prev => ({ ...prev, loading: true, error: null }));
        return loader()
            .then(data => {
                if (id === callId.current) setState({ data, error: null, loading: false });
                return data;
            })
            .catch(error => {
                if (id === callId.current) setState(prev => ({ ...prev, error, loading: false }));
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => {
        run();
    }, [ run ]);

    const setData = useCallback((updater) => {
        setState(prev => ({ ...prev, data: typeof updater === 'function' ? updater(prev.data) : updater }));
    }, []);

    return { ...state, reload: run, setData };
}
