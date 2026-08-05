import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { clsx } from "clsx";

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

export function Layout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    navigate("/sign-in");
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-gray-800 bg-[#0d1117] flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold tracking-wider text-blue-400">MORPHIA</h1>
          <p className="text-[10px] text-gray-500 tracking-widest mt-0.5">UNREALISTICALLY REAL</p>
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
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                )
              }
            >
              <span className="text-xs w-4 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="w-full text-left text-xs text-gray-500 hover:text-gray-300 px-2 py-1.5 rounded transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-[#0a0e17]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
