import { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { setUnauthorizedHandler } from "@/lib/api";
import { fetchCurrentUser, logout } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { LoadingScreen } from "@/components/LoadingScreen";
import type { User } from "@/lib/types";

type NavSection = {
  label: string;
  items: { to: string; label: string; icon: string; mono?: boolean }[];
};

const navSections: NavSection[] = [
  {
    label: "Operations",
    items: [
      { to: "/operations", label: "Operations", icon: "◉" },
      { to: "/dashboard", label: "Overview", icon: "⬡" },
    ],
  },
  {
    label: "Work",
    items: [
      { to: "/projects", label: "Engagements", icon: "◫" },
      { to: "/runs", label: "Runs", icon: "▶" },
      { to: "/approvals", label: "Approvals", icon: "✓" },
    ],
  },
  {
    label: "Evidence & Analysis",
    items: [
      { to: "/evidence", label: "Evidence", icon: "◧" },
      { to: "/findings", label: "Findings", icon: "⚑" },
      { to: "/reports", label: "Reports", icon: "◱" },
    ],
  },
  {
    label: "Governance",
    items: [
      { to: "/audit", label: "Audit Log", icon: "◎" },
      { to: "/agents", label: "Agents", icon: "◈" },
      { to: "/workflows", label: "Workflows", icon: "⬢" },
    ],
  },
];

type AuthState = "checking" | "authed" | "anon";

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [authState, setAuthState] = useState<AuthState>(
    getCurrentUser() ? "authed" : "checking",
  );
  const [user, setUser] = useState<User | null>(getCurrentUser());

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthState("anon");
      queryClient.clear();
      navigate("/sign-in", { replace: true });
    });
  }, [navigate, queryClient]);

  useEffect(() => {
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

  const onOperations = location.pathname.startsWith("/operations");

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-0)" }}>
      {/* ── Left rail ─────────────────────────────────────────────── */}
      <aside
        className="w-[224px] flex-shrink-0 flex flex-col select-none"
        style={{
          background: "var(--bg-1)",
          borderRight: "1px solid var(--border-default)",
        }}
      >
        {/* Wordmark */}
        <div
          className="px-4 pt-5 pb-4"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-[16px] font-bold tracking-[0.18em] text-[#e6ebf5]">MORPHIA</span>
            <span
              className="text-[9px] font-medium tracking-[0.12em] px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(16,185,129,0.12)",
                border: "1px solid rgba(16,185,129,0.25)",
                color: "#6ee7b7",
              }}
            >
              v0.2 α
            </span>
          </div>
          <p className="text-[10px] tracking-[0.14em] mt-1.5" style={{ color: "var(--text-faint)" }}>
            HUMAN-GOVERNED ORCHESTRATION
          </p>
          <p className="mono text-[10px] mt-2 leading-none" style={{ color: "var(--text-faint)" }}>
            scope → plan → approval → execution → evidence
          </p>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
          {navSections.map((section) => (
            <div key={section.label}>
              <p
                className="text-[10px] tracking-[0.12em] font-medium px-2 mb-1.5"
                style={{ color: "var(--text-faint)" }}
              >
                {section.label.toUpperCase()}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-2.5 py-1.5 text-[13px] rounded-[4px] transition-colors ${
                        isActive ? "font-medium" : ""
                      }`
                    }
                    style={({ isActive }) =>
                      isActive
                        ? {
                            background: "var(--bg-panel)",
                            border: "1px solid var(--border-default)",
                            color: "var(--text-primary)",
                          }
                        : {
                            color: "var(--text-muted)",
                            border: "1px solid transparent",
                          }
                    }
                  >
                    <span className="text-[11px] w-3.5 text-center opacity-70">{item.icon}</span>
                    <span className={item.mono ? "mono text-[12px]" : ""}>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Operation status strip */}
        <div
          className="mx-2 mb-2 rounded-[6px] px-3 py-2.5"
          style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p className="text-[10px] tracking-[0.1em] font-medium" style={{ color: "var(--text-faint)" }}>
            OPERATION STATUS
          </p>
          <p className="text-xs mt-1 font-medium" style={{ color: onOperations ? "var(--active)" : "var(--text-secondary)" }}>
            {onOperations ? "●  Command center active" : "○  Standby"}
          </p>
          <p className="mono text-[10px] mt-1" style={{ color: "var(--text-faint)" }}>
            Nothing executes without approval
          </p>
        </div>

        <div className="px-3 py-3 flex items-center gap-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="h-7 w-7 rounded-[6px] flex items-center justify-center text-[11px] font-medium flex-shrink-0" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>
            {user?.display_name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate leading-none" style={{ color: "var(--text-primary)" }}>{user?.display_name}</p>
            <p className="mono text-[10px] truncate" style={{ color: "var(--text-faint)" }}>{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-[11px] px-2 py-1 rounded-[4px] flex-shrink-0"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
          >
            Exit
          </button>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top rule */}
        <div className="h-7 flex-shrink-0 flex items-center justify-between px-4 text-[11px]" style={{ background: "var(--bg-1)", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-faint)" }}>
          <span className="mono tracking-wide">
            AUTHORIZATION BOUNDARY ENFORCED · DUAL VALIDATION · AUDIT TRAIL ACTIVE
          </span>
          <span className="hidden sm:inline mono">
            {new Date().toISOString().slice(0, 10)} · {user?.email}
          </span>
        </div>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1440px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
