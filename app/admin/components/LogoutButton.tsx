"use client";

import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  };

  return (
    <button
      onClick={handleLogout}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        background: "#EF4444",
        color: "#fff",
        border: "none",
        padding: "10px 16px",
        borderRadius: "8px",
        fontWeight: "600",
        cursor: "pointer",
        marginTop: "16px",
      }}
    >
      <LogOut size={16} />
      Çıkış Yap
    </button>
  );
}
