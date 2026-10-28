import { useState } from 'react';
import { authApi } from '../services/backend';
import { useAsync } from '../hooks/useAsync';
import { useAuth } from '../hooks/useAuth';
import { formatAddress } from '../utils/format';
import AddressForm from '../components/AddressForm';
import { Alert, Loader } from '../components/Feedback';

export default function AccountPage() {
    const { user } = useAuth();
    const addresses = useAsync(() => authApi.getAddresses(), []);
    const [ adding, setAdding ] = useState(false);
    const [ busy, setBusy ] = useState(false);
    const [ message, setMessage ] = useState('');
    const [ actionError, setActionError ] = useState('');

    const list = addresses.data?.addresses || [];

    const addAddress = async (address) => {
        setBusy(true);
        setActionError('');
        try {
            const { address: created } = await authApi.addAddress(address);
            addresses.setData(prev => ({ ...prev, addresses: [ ...(prev?.addresses || []), created ] }));
            setAdding(false);
            setMessage('Address added.');
        } catch (err) {
            setActionError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const deleteAddress = async (addressId) => {
        if (!window.confirm('Delete this address?')) return;
        setActionError('');
        try {
            const { addresses: remaining } = await authApi.deleteAddress(addressId);
            addresses.setData(prev => ({ ...prev, addresses: remaining }));
            setMessage('Address deleted.');
        } catch (err) {
            setActionError(err.message);
        }
    };

    return (
        <section className="stack">
            <div className="page-header"><h1>Your account</h1></div>

            <div className="card">
                <h2>Profile</h2>
                <dl className="details">
                    {user.fullName && <><dt>Name</dt><dd>{user.fullName.firstName} {user.fullName.lastName}</dd></>}
                    <dt>Username</dt><dd>{user.username}</dd>
                    <dt>Email</dt><dd>{user.email}</dd>
                    <dt>Account type</dt><dd>{user.role === 'seller' ? 'Seller' : 'Customer'}</dd>
                </dl>
            </div>

            <div className="card">
                <div className="card__header">
                    <h2>Saved addresses</h2>
                    {!adding && <button type="button" className="btn btn--primary btn--small" onClick={() => { setAdding(true); setMessage(''); }}>Add address</button>}
                </div>
                <Alert type="success" onClose={() => setMessage('')}>{message}</Alert>
                <Alert onClose={() => setActionError('')}>{actionError}</Alert>

                {addresses.loading && !addresses.data && <Loader label="Loading addresses…" />}
                {addresses.error && <Alert onRetry={addresses.reload}>{addresses.error.message}</Alert>}

                {adding && (
                    <AddressForm onSubmit={addAddress} onCancel={() => setAdding(false)} showPhone showDefault busy={busy} />
                )}

                {addresses.data && list.length === 0 && !adding && <p className="muted">No saved addresses yet.</p>}

                <ul className="address-list">
                    {list.map(address => (
                        <li key={address._id}>
                            <span>
                                {formatAddress(address)}
                                {address.isDefault && <span className="badge badge--default">Default</span>}
                            </span>
                            <button type="button" className="btn btn--link text-error" onClick={() => deleteAddress(address._id)}>Delete</button>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
