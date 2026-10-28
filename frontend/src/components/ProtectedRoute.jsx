import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { EmptyState, Loader } from './Feedback';

// Guards a page by login and, optionally, by role. The backend enforces the same rules;
// this only keeps users away from pages whose API calls would be rejected.
export default function ProtectedRoute({ roles, children }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) return <Loader label="Checking your session…" />;

    if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

    if (roles && !roles.includes(user.role)) {
        return (
            <EmptyState title="Not available for your account">
                This page is for {roles.map(r => (r === 'user' ? 'customers' : `${r}s`)).join(' and ')} only.
            </EmptyState>
        );
    }

    return children;
}
