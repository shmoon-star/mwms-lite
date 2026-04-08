import Link from "next/link";
import { headers } from "next/headers";
import StatusBadge from "@/components/common/status-badge";
import VendorUserActions from "@/components/admin/vendor-user-actions";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function getVendorDetail(id: string) {
  const headerStore = await headers();
  const host = headerStore.get("host");
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";

  const [vendorRes, usersRes] = await Promise.all([
    fetch(`${protocol}://${host}/api/admin/vendors/${id}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        cookie: headerStore.get("cookie") ?? "",
      },
    }),
    fetch(`${protocol}://${host}/api/admin/vendors/${id}/users`, {
      method: "GET",
      cache: "no-store",
      headers: {
        cookie: headerStore.get("cookie") ?? "",
      },
    }),
  ]);

  const vendorJson = await vendorRes.json();
  const usersJson = await usersRes.json();

  if (!vendorRes.ok || !vendorJson.ok) {
    throw new Error(vendorJson.error || "Failed to load vendor detail");
  }

  if (!usersRes.ok || !usersJson.ok) {
    throw new Error(usersJson.error || "Failed to load vendor users");
  }

  return {
    vendor: vendorJson.vendor ?? usersJson.vendor_id,
    users: usersJson.items ?? [],
  };
}

export default async function AdminVendorDetailPage({ params }: PageProps) {
  const { id } = await params;
  const data = await getVendorDetail(id);

  const { vendor, users } = data;
const vendor_id = vendor?.id;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vendor Detail</h1>
          <div className="text-sm text-gray-500">
            {vendor.vendor_code} / {vendor.vendor_name}
          </div>
        </div>

        <Link
          href={`/admin/vendors/${vendor.id}/users/new`}
          className="border rounded px-4 py-2"
        >
          Create Vendor User
        </Link>
      </div>

      <div className="border rounded p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><strong>Vendor Code:</strong> {vendor.vendor_code}</div>
          <div><strong>Status:</strong> <StatusBadge status={vendor.status} /></div>
          <div><strong>Vendor Name:</strong> {vendor.vendor_name}</div>
          <div><strong>Brand Name:</strong> {vendor.brand_name ?? "-"}</div>
        </div>
      </div>

      <div className="border rounded overflow-hidden">
        <div className="p-4 border-b font-medium">Vendor Users</div>

        {users.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No vendor users found.</div>
        ) : (
          <div className="divide-y">
            {users.map((user: any) => (
              <div key={user.id} className="p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 text-sm">
                  <div>
                    <div className="text-gray-500">Email</div>
                    <div>{user.email}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Role</div>
                    <div>{user.role}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Status</div>
                    <div><StatusBadge status={user.status} /></div>
                  </div>

                  <div>
                    <div className="text-gray-500">First Login</div>
                    <div>
                      {user.first_login_at
                        ? new Date(user.first_login_at).toLocaleString()
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500">Last Login</div>
                    <div>
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleString()
                        : "-"}
                    </div>
                  </div>
                </div>

                <VendorUserActions user={user} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}