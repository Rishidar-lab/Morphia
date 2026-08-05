import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Dashboard() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get("/api/v1/projects"),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Research orchestration command center
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Active Projects", value: projects?.length ?? 0, color: "blue" },
          { label: "Pending Approvals", value: 0, color: "amber" },
          { label: "Active Runs", value: 0, color: "green" },
          { label: "Verified Findings", value: 0, color: "cyan" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-gray-900/50 border border-gray-800 rounded-lg p-4"
          >
            <p className="text-xs text-gray-500 uppercase tracking-wider">
              {stat.label}
            </p>
            <p className="text-2xl font-bold text-gray-100 mt-1">
              {isLoading ? "—" : stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-medium text-gray-300 mb-4">
            Recent Activity
          </h2>
          <p className="text-sm text-gray-500">No recent activity.</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-medium text-gray-300 mb-4">
            Pending Actions
          </h2>
          <p className="text-sm text-gray-500">No pending actions.</p>
        </div>
      </div>
    </div>
  );
}
