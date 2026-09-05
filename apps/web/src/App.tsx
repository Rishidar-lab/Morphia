import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoadingScreen } from "./components/LoadingScreen";

// ── Lazy-loaded pages (route-level code splitting) ──────
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Operations = lazy(() => import("./pages/Operations"));
const SignIn = lazy(() => import("./pages/SignIn"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Runs = lazy(() => import("./pages/Runs"));
const RunDetail = lazy(() => import("./pages/RunDetail"));
const Agents = lazy(() => import("./pages/Agents"));
const Evidence = lazy(() => import("./pages/Evidence"));
const Findings = lazy(() => import("./pages/Findings"));
const Reports = lazy(() => import("./pages/Reports"));
const Workflows = lazy(() => import("./pages/Workflows"));
const Approvals = lazy(() => import("./pages/Approvals"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/operations" replace />} />
            <Route path="/operations" element={<Operations />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/runs" element={<Runs />} />
            <Route path="/runs/:id" element={<RunDetail />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/evidence" element={<Evidence />} />
            <Route path="/findings" element={<Findings />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          {/* 404 lives outside the auth guard so a bad URL never forces a login. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
