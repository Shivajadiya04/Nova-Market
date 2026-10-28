import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Alert } from './Feedback';

export default function Layout() {
    const { user, isSeller, isCustomer, logout, sessionExpired, clearSessionExpired } = useAuth();
    const [ menuOpen, setMenuOpen ] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => setMenuOpen(false), [ location.pathname ]);

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    return (
        <div className="app">
            <header className="header">
                <div className="container header__inner">
                    <Link to="/" className="brand">
                        <span className="brand__mark" aria-hidden="true">N</span>
                        Nova Market
                    </Link>

                    <button
                        type="button"
                        className="header__toggle"
                        aria-expanded={menuOpen}
                        aria-controls="main-nav"
                        onClick={() => setMenuOpen(open => !open)}
                    >
                        <span className="sr-only">Toggle navigation</span>
                        <span aria-hidden="true">☰</span>
                    </button>

                    <nav id="main-nav" className={`nav${menuOpen ? ' nav--open' : ''}`} aria-label="Main">
                        <NavLink to="/" end>Shop</NavLink>
                        {isCustomer && (
                            <>
                                <NavLink to="/cart">Cart</NavLink>
                                <NavLink to="/orders">Orders</NavLink>
                                <NavLink to="/assistant">Assistant</NavLink>
                            </>
                        )}
                        {isSeller && (
                            <>
                                <NavLink to="/seller" end>Dashboard</NavLink>
                                <NavLink to="/seller/products">My products</NavLink>
                                <NavLink to="/seller/orders">Sales</NavLink>
                            </>
                        )}
                        {user ? (
                            <>
                                <NavLink to="/account">{user.username}</NavLink>
                                <button type="button" className="btn btn--ghost btn--small" onClick={handleLogout}>Log out</button>
                            </>
                        ) : (
                            <>
                                <NavLink to="/login">Log in</NavLink>
                                <Link to="/register" className="btn btn--primary btn--small">Sign up</Link>
                            </>
                        )}
                    </nav>
                </div>
            </header>

            <main className="container main">
                {sessionExpired && (
                    <Alert type="warning" onClose={clearSessionExpired}>
                        Your session has expired. <Link to="/login" state={{ from: location }}>Log in again</Link> to continue.
                    </Alert>
                )}
                <Outlet />
            </main>

            <footer className="footer">
                <div className="container">Nova Market · demo storefront</div>
            </footer>
        </div>
    );
}
