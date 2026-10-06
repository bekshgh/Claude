import { Sidebar } from "@/components/Sidebar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
        <div className="mx-auto w-full max-w-[1180px] animate-fade-up">{children}</div>
      </main>
    </div>
  );
}
