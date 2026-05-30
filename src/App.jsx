import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import PrivateRoute from './components/PrivateRoute'
import ClientLayout from './components/ClientLayout'

// Pages
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Catalog from './pages/client/Catalog'
import Cart from './pages/client/Cart'
import OrderConfirmed from './pages/client/OrderConfirmed'
import AdminDashboard from './pages/admin/Dashboard'
import AdminOrders from './pages/admin/Orders'
import AdminOrderDetail from './pages/admin/OrderDetail'
import AdminClients from './pages/admin/Clients'
import AdminProducts from './pages/admin/Products'
import AdminImport from './pages/admin/ImportExcel'
import AdminVendedores from './pages/admin/Vendedores'
import AdminConfiguracion from './pages/admin/Configuracion'
import AdminPromociones from './pages/admin/Promociones'
import AdminCobranza from './pages/admin/Cobranza'
import MyOrders from './pages/client/MyOrders'
import VendedorLayout from './pages/vendedor/VendedorLayout'
import MisVisitas from './pages/vendedor/MisVisitas'
import NuevoPedido from './pages/vendedor/NuevoPedido'
import MiPerfil from './pages/vendedor/MiPerfil'
import EditarPedido from './pages/vendedor/EditarPedido'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/olvide-contrasena" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Rutas del cliente — CartProvider envuelve todas para estado compartido */}
          <Route path="/" element={<PrivateRoute role="cliente" />}>
            <Route element={<ClientLayout />}>
              <Route index element={<Catalog />} />
              <Route path="carrito" element={<Cart />} />
              <Route path="pedido-confirmado/:id" element={<OrderConfirmed />} />
              <Route path="mis-pedidos" element={<MyOrders />} />
            </Route>
          </Route>

          {/* Rutas del administrador */}
          <Route path="/admin" element={<PrivateRoute role="admin" />}>
            <Route index element={<AdminDashboard />} />
            <Route path="pedidos" element={<AdminOrders />} />
            <Route path="pedidos/:id" element={<AdminOrderDetail />} />
            <Route path="clientes" element={<AdminClients />} />
            <Route path="vendedores" element={<AdminVendedores />} />
            <Route path="productos" element={<AdminProducts />} />
            <Route path="importar" element={<AdminImport />} />
            <Route path="promociones" element={<AdminPromociones />} />
            <Route path="cobranza" element={<AdminCobranza />} />
            <Route path="configuracion" element={<AdminConfiguracion />} />
          </Route>

          {/* Rutas del vendedor — mobile-first, bottom nav */}
          <Route path="/vendedor" element={<PrivateRoute role="vendedor" />}>
            <Route element={<VendedorLayout />}>
              <Route index element={<MisVisitas />} />
              <Route path="pedido" element={<NuevoPedido />} />
              <Route path="editar/:id" element={<EditarPedido />} />
              <Route path="perfil" element={<MiPerfil />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
