type Props = {
  status: string | null | undefined;
};

function getStatusClass(status: string) {
  switch (status) {
    case "DRAFT":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "SUBMITTED":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "REVIEWED":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "CONFIRMED":
      return "bg-green-100 text-green-700 border-green-200";
    case "CANCELED":
      return "bg-red-100 text-red-700 border-red-200";
    case "ACTIVE":
      return "bg-green-100 text-green-700 border-green-200";
    case "INACTIVE":
      return "bg-gray-100 text-gray-700 border-gray-200";
    case "LOCKED":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
}

export default function StatusBadge({ status }: Props) {
  const value = status ?? "-";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        getStatusClass(value),
      ].join(" ")}
    >
      {value}
    </span>
  );
}