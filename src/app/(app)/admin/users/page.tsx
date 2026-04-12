"use client";

import { useEffect, useState } from "react";
import { fmtDate } from "@/lib/fmt";

type User = {
  id: string;
  auth_user_id: string;
  email: string | null;
  display_name: string | null;
  user_type: string | null;
  role: string | null;
  vendor_id: string | null;
  buyer_id: string | null;
  vendor_name: string | null;
  vendor_code: string | null;
  buyer_name: string | null;
  buyer_code: string | null;
  status: string | null;
  created_at: string | null;
};

type CreateForm = {
  email: string;
  display_name: string;
  user_type: string;
  role: string;
  password: string;
  vendor_id: string;
  buyer_id: string;
};

const USER_TYPE_OPTIONS = ["all", "internal", "vendor", "buyer", "wms"];
const STATUS_OPTIONS = ["all", "ACTIVE", "INACTIVE", "LOCKED"];

const ROLE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  internal: [
    { value: "internal_admin", label: "Admin" },
    { value: "internal_operator", label: "Operator" },
  ],
  vendor: [
    { value: "vendor_user", label: "Vendor User" },
  ],
  buyer: [
    { value: "buyer_user", label: "Buyer User" },
  ],
  wms: [
    { value: "wms_operator", label: "WMS Operator" },
  ],
};

const NAME_LABEL: Record<string, string> = {
  internal: "담당자명 *",
  vendor: "담당자명 *",
  buyer: "담당자명 *",
  wms: "담당자명 *",
};

function statusColor(s: string | null) {
  switch (s) {
    case "ACTIVE": return { bg: "#dcfce7", color: "#166534", border: "#bbf7d0" };
    case "INACTIVE": return { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" };
    case "LOCKED": return { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" };
    default: return { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb" };
  }
}

function userTypeLabel(t: string | null) {
  switch (t) {
    case "internal": return "Internal";
    case "vendor": return "Vendor";
    case "buyer": return "Buyer";
    case "wms": return "WMS";
    default: return t || "-";
  }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [form, setForm] = useState<CreateForm>({
    email: "", display_name: "", user_type: "internal", role: "internal_admin",
    password: "", vendor_id: "", buyer_id: "",
  });

  // edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  // reset password
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetResult, setResetResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // vendor/buyer dropdown
  const [vendors, setVendors] = useState<{ id: string; vendor_code: string; vendor_name: string }[]>([]);
  const [buyers, setBuyers] = useState<{ id: string; buyer_code: string; buyer_name: string }[]>([]);

  // new vendor/buyer inline create
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [newVendorCode, setNewVendorCode] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [showNewBuyer, setShowNewBuyer] = useState(false);
  const [newBuyerCode, setNewBuyerCode] = useState("");
  const [newBuyerName, setNewBuyerName] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setUsers(json.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function loadDropdowns() {
    const [vRes, bRes] = await Promise.all([
      fetch("/api/admin/vendors-list").then(r => r.json()).catch(() => ({ items: [] })),
      fetch("/api/admin/buyers-list").then(r => r.json()).catch(() => ({ items: [] })),
    ]);
    setVendors(vRes.items ?? []);
    setBuyers(bRes.items ?? []);
  }

  async function handleCreateVendor() {
    if (!newVendorCode.trim() || !newVendorName.trim()) { alert("Vendor Code, Name 필수"); return; }
    try {
      const res = await fetch("/api/admin/vendors-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor_code: newVendorCode.trim(), vendor_name: newVendorName.trim() }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setForm({ ...form, vendor_id: json.vendor.id });
      setShowNewVendor(false);
      setNewVendorCode("");
      setNewVendorName("");
      await loadDropdowns();
    } catch (e: any) { alert(e?.message ?? "Failed"); }
  }

  async function handleCreateBuyer() {
    if (!newBuyerCode.trim() || !newBuyerName.trim()) { alert("Buyer Code, Name 필수"); return; }
    try {
      const res = await fetch("/api/admin/buyers-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer_code: newBuyerCode.trim(), buyer_name: newBuyerName.trim() }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setForm({ ...form, buyer_id: json.buyer.id });
      setShowNewBuyer(false);
      setNewBuyerCode("");
      setNewBuyerName("");
      await loadDropdowns();
    } catch (e: any) { alert(e?.message ?? "Failed"); }
  }

  useEffect(() => { load(); loadDropdowns(); }, []);

  const filtered = users.filter((u) => {
    if (filterType !== "all" && u.user_type !== filterType) return false;
    if (filterStatus !== "all" && u.status !== filterStatus) return false;
    if (keyword) {
      const q = keyword.toLowerCase();
      const haystack = [u.email, u.display_name, u.role, u.vendor_name, u.buyer_name].join(" ").toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  async function handleCreate() {
    setCreating(true);
    setCreateResult(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setCreateResult({
        type: "success",
        message: `Created: ${json.login.email} / Temp Password: ${json.login.temporary_password}`,
      });
      setForm({ email: "", display_name: "", user_type: "internal", role: "internal_admin", password: "", vendor_id: "", buyer_id: "" });
      await load();
    } catch (e: any) {
      setCreateResult({ type: "error", message: e?.message ?? "Failed" });
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit(userId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: editName, role: editRole, status: editStatus }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setEditingId(null);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(userId: string) {
    if (resetPw.length < 8) { alert("8자 이상 입력하세요"); return; }
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPw }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setResetResult({ type: "success", message: `Password reset: ${json.email} / ${json.temporary_password}` });
      setResetPw("");
    } catch (e: any) {
      setResetResult({ type: "error", message: e?.message ?? "Failed" });
    }
  }

  function startEdit(u: User) {
    setEditingId(u.id);
    setEditName(u.display_name || "");
    setEditRole(u.role || "");
    setEditStatus(u.status || "ACTIVE");
  }

  return (
    <div style={{ maxWidth: 1400 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>User Management</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            Supabase Auth + user_profiles 통합 관리
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setCreateResult(null); }}
          style={{
            padding: "8px 18px", border: "1.5px solid #111", borderRadius: 8,
            background: showCreate ? "#111" : "#fff", color: showCreate ? "#fff" : "#111",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          {showCreate ? "Cancel" : "+ Create User"}
        </button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 20, background: "#fafafa" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>New User</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Email *</label>
              <input style={inputStyle} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" />
            </div>
            <div>
              <label style={labelStyle}>{NAME_LABEL[form.user_type] || "담당자명 *"}</label>
              <input style={inputStyle} value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="담당자명" />
            </div>
            <div>
              <label style={labelStyle}>Temp Password *</label>
              <input style={inputStyle} type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 8 chars" />
            </div>
            <div>
              <label style={labelStyle}>User Type *</label>
              <select style={inputStyle} value={form.user_type} onChange={e => {
                const ut = e.target.value;
                const firstRole = ROLE_OPTIONS[ut]?.[0]?.value ?? "";
                setForm({ ...form, user_type: ut, role: firstRole, vendor_id: "", buyer_id: "" });
              }}>
                <option value="internal">Internal (SCM)</option>
                <option value="vendor">Vendor</option>
                <option value="buyer">Buyer</option>
                <option value="wms">WMS</option>
              </select>
            </div>
            {(ROLE_OPTIONS[form.user_type] ?? []).length > 1 && (
              <div>
                <label style={labelStyle}>Role *</label>
                <select style={inputStyle} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  {(ROLE_OPTIONS[form.user_type] ?? []).map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            )}
            {form.user_type === "vendor" && (
              <div>
                <label style={labelStyle}>Vendor *</label>
                {!showNewVendor ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <select style={{ ...inputStyle, flex: 1 }} value={form.vendor_id} onChange={e => setForm({ ...form, vendor_id: e.target.value })}>
                      <option value="">Select vendor...</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_code} — {v.vendor_name}</option>)}
                    </select>
                    <button type="button" onClick={() => setShowNewVendor(true)} style={{ ...btnSmall, background: "#f3f4f6", color: "#374151", whiteSpace: "nowrap", padding: "8px 12px" }}>+ New</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <input style={inputStyle} value={newVendorCode} onChange={e => setNewVendorCode(e.target.value)} placeholder="Vendor Code (e.g. VND-0005)" />
                    <input style={inputStyle} value={newVendorName} onChange={e => setNewVendorName(e.target.value)} placeholder="Vendor Name" />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" onClick={handleCreateVendor} style={btnSmall}>Create Vendor</button>
                      <button type="button" onClick={() => setShowNewVendor(false)} style={{ ...btnSmall, background: "#f3f4f6", color: "#374151" }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {form.user_type === "buyer" && (
              <div>
                <label style={labelStyle}>Buyer *</label>
                {!showNewBuyer ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <select style={{ ...inputStyle, flex: 1 }} value={form.buyer_id} onChange={e => setForm({ ...form, buyer_id: e.target.value })}>
                      <option value="">Select buyer...</option>
                      {buyers.map(b => <option key={b.id} value={b.id}>{b.buyer_code} — {b.buyer_name}</option>)}
                    </select>
                    <button type="button" onClick={() => setShowNewBuyer(true)} style={{ ...btnSmall, background: "#f3f4f6", color: "#374151", whiteSpace: "nowrap", padding: "8px 12px" }}>+ New</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <input style={inputStyle} value={newBuyerCode} onChange={e => setNewBuyerCode(e.target.value)} placeholder="Buyer Code (e.g. MUSINSA-KR)" />
                    <input style={inputStyle} value={newBuyerName} onChange={e => setNewBuyerName(e.target.value)} placeholder="Buyer Name" />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" onClick={handleCreateBuyer} style={btnSmall}>Create Buyer</button>
                      <button type="button" onClick={() => setShowNewBuyer(false)} style={{ ...btnSmall, background: "#f3f4f6", color: "#374151" }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{ padding: "8px 20px", border: "none", borderRadius: 6, background: "#111", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: creating ? 0.5 : 1 }}
            >
              {creating ? "Creating..." : "Create"}
            </button>
            {createResult && (
              <span style={{ fontSize: 12, padding: "6px 10px", borderRadius: 6, background: createResult.type === "success" ? "#dcfce7" : "#fef2f2", color: createResult.type === "success" ? "#166534" : "#991b1b" }}>
                {createResult.message}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <input
          style={{ ...inputStyle, width: 240 }}
          placeholder="Search email / name / role..."
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
        />
        <select style={{ ...inputStyle, width: 130 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          {USER_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t === "all" ? "All Types" : userTypeLabel(t)}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 130 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s === "all" ? "All Status" : s}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{filtered.length} users</span>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>Loading...</div>
      ) : error ? (
        <div style={{ padding: 20, color: "#dc2626" }}>{error}</div>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Vendor / Buyer</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={{ ...thStyle, width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const sc = statusColor(u.status);
                const isEditing = editingId === u.id;
                const isResetting = resetId === u.id;

                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={tdStyle}>{u.email || "-"}</td>
                    <td style={tdStyle}>
                      {isEditing ? (
                        <input style={{ ...inputStyle, width: 120, padding: "4px 6px" }} value={editName} onChange={e => setEditName(e.target.value)} />
                      ) : (
                        u.display_name || "-"
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#4b5563" }}>
                        {userTypeLabel(u.user_type)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {isEditing ? (
                        <select style={{ ...inputStyle, padding: "4px 6px" }} value={editRole} onChange={e => setEditRole(e.target.value)}>
                          {(ROLE_OPTIONS[u.user_type ?? "internal"] ?? []).map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: 11 }}>{u.role || "-"}</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      {u.vendor_name ? `${u.vendor_code} — ${u.vendor_name}` : u.buyer_name ? `${u.buyer_code} — ${u.buyer_name}` : "-"}
                    </td>
                    <td style={tdStyle}>
                      {isEditing ? (
                        <select style={{ ...inputStyle, padding: "4px 6px" }} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="INACTIVE">INACTIVE</option>
                          <option value="LOCKED">LOCKED</option>
                        </select>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                          {u.status || "-"}
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>{fmtDate(u.created_at) || "-"}</td>
                    <td style={tdStyle}>
                      {isEditing ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button style={btnSmall} onClick={() => handleSaveEdit(u.id)} disabled={saving}>
                            {saving ? "..." : "Save"}
                          </button>
                          <button style={{ ...btnSmall, background: "#f3f4f6", color: "#374151" }} onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      ) : isResetting ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input
                            style={{ ...inputStyle, width: 100, padding: "4px 6px", fontSize: 12 }}
                            type="password"
                            placeholder="New pw (8+)"
                            value={resetPw}
                            onChange={e => setResetPw(e.target.value)}
                          />
                          <button style={btnSmall} onClick={() => handleResetPassword(u.id)}>Set</button>
                          <button style={{ ...btnSmall, background: "#f3f4f6", color: "#374151" }} onClick={() => { setResetId(null); setResetResult(null); }}>X</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button style={{ ...btnSmall, background: "#f3f4f6", color: "#374151" }} onClick={() => startEdit(u)}>Edit</button>
                          <button style={{ ...btnSmall, background: "#fef2f2", color: "#991b1b" }} onClick={() => { setResetId(u.id); setResetPw(""); setResetResult(null); }}>Reset PW</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Reset result */}
      {resetResult && (
        <div style={{ marginTop: 10, padding: "8px 14px", borderRadius: 8, fontSize: 12, background: resetResult.type === "success" ? "#dcfce7" : "#fef2f2", color: resetResult.type === "success" ? "#166534" : "#991b1b" }}>
          {resetResult.message}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, background: "#fff" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "10px 12px" };
const btnSmall: React.CSSProperties = { padding: "4px 10px", border: "none", borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "#111", color: "#fff" };
