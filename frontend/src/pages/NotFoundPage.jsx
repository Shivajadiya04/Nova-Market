import { Link } from 'react-router-dom';
import { EmptyState } from '../components/Feedback';

export default function NotFoundPage() {
    return (
        <EmptyState title="Page not found" action={<Link to="/" className="btn btn--primary">Go to the shop</Link>}>
            The page you are looking for does not exist.
        </EmptyState>
    );
}
