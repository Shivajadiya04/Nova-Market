import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import ShopPage from './pages/ShopPage';
import ProductPage from './pages/ProductPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import AccountPage from './pages/AccountPage';
import AssistantPage from './pages/AssistantPage';
import SellerDashboardPage from './pages/seller/SellerDashboardPage';
import SellerProductsPage from './pages/seller/SellerProductsPage';
import ProductFormPage from './pages/seller/ProductFormPage';
import SellerOrdersPage from './pages/seller/SellerOrdersPage';
import NotFoundPage from './pages/NotFoundPage';

// Roles match the backend: "user" = customer, "seller" = seller.
const customer = (page) => <ProtectedRoute roles={[ 'user' ]}>{page}</ProtectedRoute>;
const seller = (page) => <ProtectedRoute roles={[ 'seller' ]}>{page}</ProtectedRoute>;

export default function App() {
    return (
        <Routes>
            <Route element={<Layout />}>
                <Route index element={<ShopPage />} />
                <Route path="products/:id" element={<ProductPage />} />
                <Route path="login" element={<LoginPage />} />
                <Route path="register" element={<RegisterPage />} />

                <Route path="account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />

                <Route path="cart" element={customer(<CartPage />)} />
                <Route path="checkout" element={customer(<CheckoutPage />)} />
                <Route path="orders" element={customer(<OrdersPage />)} />
                <Route path="orders/:id" element={customer(<OrderDetailPage />)} />
                <Route path="assistant" element={customer(<AssistantPage />)} />

                <Route path="seller" element={seller(<SellerDashboardPage />)} />
                <Route path="seller/products" element={seller(<SellerProductsPage />)} />
                <Route path="seller/products/new" element={seller(<ProductFormPage />)} />
                <Route path="seller/products/:id/edit" element={seller(<ProductFormPage />)} />
                <Route path="seller/orders" element={seller(<SellerOrdersPage />)} />

                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    );
}
