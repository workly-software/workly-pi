import { lazy, Suspense } from 'react';
import { LoadingState } from './components/ui/Feedback';
import { Route, Routes } from 'react-router';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import RouteAlias from './routes/RouteAlias.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import { routeDefinitions } from './routes/routeDefinitions.js';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import GuestRoute from './components/GuestRoute.jsx';
import HomePage from './pages/HomePage.jsx';
import CategoryPage from './pages/CategoryPage.jsx';
import ServiceDetailPage from './pages/ServiceDetailPage.jsx';
import AllServicesPage from './pages/AllServicesPage.jsx';

import ProfilePage from './pages/ProfilePage.jsx';
import PublicProfilePage from './pages/PublicProfilePage.jsx';

import ServiceEditorPage from './pages/ServiceEditorPage.jsx';
import HirePage from './pages/HirePage.jsx';
import ProposalPage from './pages/ProposalPage.jsx';
import ContractsPage from './pages/ContractsPage.jsx';
const MessagesPage = lazy(() => import('./pages/MessagesPage.jsx'));
const ContractChatPage = lazy(() => import('./pages/ContractChatPage.jsx'));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage.jsx'));
const AboutPage = lazy(() => import('./pages/AboutPage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'));
function SocialPage({ Page }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <Page />
    </Suspense>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/categorias" element={<CategoryPage />} />
      <Route path="/detalhe-servico" element={<ServiceDetailPage />} />
      <Route path="/perfil-publico" element={<PublicProfilePage />} />
      <Route path="/todos-servicos" element={<AllServicesPage />} />
      <Route path="/sobre" element={<SocialPage Page={AboutPage} />} />
      <Route path="/redefinir-senha" element={<SocialPage Page={ResetPasswordPage} />} />
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cadastro" element={<RegisterPage />} />
      </Route>
      {routeDefinitions.map((route) => (
        <Route
          key={route.alias}
          path={route.alias}
          caseSensitive
          element={<RouteAlias destination={route.path} />}
        />
      ))}
      <Route element={<ProtectedRoute />}>
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/anuncio" element={<ServiceEditorPage />} />
        <Route path="/editar-servico" element={<ServiceEditorPage editing />} />
        <Route path="/contratar-servico" element={<HirePage />} />
        <Route path="/negociar-servico" element={<ProposalPage />} />
        <Route path="/contratos" element={<ContractsPage />} />
        <Route path="/mensagens" element={<SocialPage Page={MessagesPage} />} />
        <Route path="/contrato-chat" element={<SocialPage Page={ContractChatPage} />} />
        <Route path="/favoritos" element={<SocialPage Page={FavoritesPage} />} />
      </Route>
      <Route element={<AppLayout />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
