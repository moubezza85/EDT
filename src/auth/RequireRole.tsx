import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { UserRole } from "@/api/authApi";

function defaultFallback(role: UserRole) {
  if (role === "formateur") return "/virtuel";
  return "/";
}

export default function RequireRole({
  roles,
  children,
  fallbackPath,
}: {
  roles: UserRole[];
  children: React.ReactNode;
  fallbackPath?: string;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-600">Chargement…</div>
    );
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate to={fallbackPath ?? defaultFallback(user.role)} replace />;
  }

  return <>{children}</>;
}
