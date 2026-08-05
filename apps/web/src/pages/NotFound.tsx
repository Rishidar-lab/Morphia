import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center">
        <p className="text-6xl font-bold text-gray-700 mb-4">404</p>
        <h1 className="text-xl font-semibold text-gray-300 mb-2">Page not found</h1>
        <p className="text-sm text-gray-500 mb-6">The page you requested does not exist.</p>
        <Link
          to="/dashboard"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-md transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
