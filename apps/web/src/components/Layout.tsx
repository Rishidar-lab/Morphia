import { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { useQueryClient } from "@tanstack/react-query";
import { setUnauthorizedHandler } from "@/lib/api";
import { fetchCurrentUser, logout } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { User } from "@/lib/types";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: "◉" },
  { to: "/projects", label: "Projects", icon: "◫" },
  { to: "/runs", label: "Runs", icon: "▶" },
  { to: "/agents", label: "Agents", icon: "◈" },
  { to: "/workflows", label: "Workflows", icon: "⬡" },
  { to: "/approvals", label: "Approvals", icon: "✓" },
  { to: "/evidence", label: "Evidence", icon: "◧" },
  { to: "/findings", label: "Findings", icon: "⚑" },
  { to: "/reports", label: "Reports", icon: "◱" },
  { to: "/audit", label: "Audit Log", icon: "◎" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

type AuthState = "checking" | "authed" | "anon";

export function Layout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [authState, setAuthState] = useState<AuthState>(
    getCurrentUser() ? "authed" : "checking",
  );
  const [user, setUser] = useState<User | null>(getCurrentUser());

  useEffect(() => {
    // Any 401 from anywhere in the app drops us back to sign-in.
    setUnauthorizedHandler(() => {
      setAuthState("anon");
      queryClient.clear();
      navigate("/sign-in", { replace: true });
    });
  }, [navigate, queryClient]);

  useEffect(() => {
    // If we just signed in (or navigated within an authenticated session) the
    // session store already holds the user — trust it. A dead session still
    // gets caught: the first real API call returns 401 and the global
    // unauthorized handler above redirects. Only when we have *no* user
    // (a cold page load) do we resolve it from the cookie here.
    const known = getCurrentUser();
    if (known) {
      setUser(known);
      setAuthState("authed");
      return;
    }
    let cancelled = false;
    fetchCurrentUser().then((u) => {
      if (cancelled) return;
      if (u) {
        setUser(u);
        setAuthState("authed");
      } else {
        setAuthState("anon");
        navigate("/sign-in", { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    navigate("/sign-in", { replace: true });
  };

  if (authState === "checking") return <LoadingScreen />;
  if (authState === "anon") return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 flex-shrink-0 border-r border-gray-800 bg-[#0d1117] flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold tracking-wider text-blue-400">MORPHIA</h1>
          <p className="text-[10px] text-gray-500 tracking-widest mt-0.5">
            AUTHORIZED SECURITY RESEARCH
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-blue-500/10 text-blue-400 border-r-2 border-blue-400"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50",
                )
              }
            >
              <span className="text-xs w-4 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-800 space-y-2">
          {user && (
            <div className="px-2">
              <p className="text-xs text-gray-300 truncate" title={user.email}>
                {user.display_name}
              </p>
              <p className="text-[10px] text-gray-600 truncate">
                {user.email} · {user.role}
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full text-left text-xs text-gray-500 hover:text-gray-300 px-2 py-1.5 rounded transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-[#0a0e17]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
