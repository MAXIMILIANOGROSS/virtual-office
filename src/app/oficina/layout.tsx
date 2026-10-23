import OwnerGate from "@/components/OwnerGate";
import AdminShell from "@/components/admin/AdminShell";
export default function Layout({ children }: { children: React.ReactNode }) { return <OwnerGate><AdminShell>{children}</AdminShell></OwnerGate>; }
