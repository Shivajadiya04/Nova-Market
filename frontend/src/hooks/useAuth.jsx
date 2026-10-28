import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authApi } from '../services/backend';
import { setUnauthorizedHandler } from '../services/api';

const AuthContext = createContext(null);

// The backend keeps the JWT in an httpOnly cookie, so the frontend never sees the token.
// It learns who is logged in from GET /auth/me (decoded JWT) or the login/register response.
export function AuthProvider({ children }) {
    const [ user, setUser ] = useState(null);
    const [ loading, setLoading ] = useState(true);
    const [ sessionExpired, setSessionExpired ] = useState(false);

    useEffect(() => {
        authApi.me()
            .then(data => setUser(data.user))
            .catch(() => setUser(null))
            .finally(() => setLoading(false));
    }, []);

    const userRef = useRef(null);
    userRef.current = user;

    useEffect(() => {
        setUnauthorizedHandler(() => {
            if (userRef.current) setSessionExpired(true);
            setUser(null);
        });
        return () => setUnauthorizedHandler(null);
    }, []);

    const login = useCallback(async (credentials) => {
        const data = await authApi.login(credentials);
        setSessionExpired(false);
        setUser(data.user);
        return data.user;
    }, []);

    const register = useCallback(async (payload) => {
        const data = await authApi.register(payload);
        setSessionExpired(false);
        setUser(data.user);
        return data.user;
    }, []);

    const logout = useCallback(async () => {
        try {
            await authApi.logout();
        } finally {
            setUser(null);
        }
    }, []);

    const value = useMemo(() => ({
        user,
        loading,
        sessionExpired,
        isSeller: user?.role === 'seller',
        isCustomer: user?.role === 'user',
        login,
        register,
        logout,
        clearSessionExpired: () => setSessionExpired(false),
    }), [ user, loading, sessionExpired, login, register, logout ]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
    return context;
}
