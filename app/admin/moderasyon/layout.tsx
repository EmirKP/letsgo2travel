import { requireAdminServer } from '@/lib/admin-server';

export default async function ModerasyonLayout({ children }: { children: React.ReactNode }) {
  await requireAdminServer(["moderator", "admin", "super_admin"]);

  return (
    <div className="admin-protected-route">
      {/* Admin Warning Banner */}
      <div style={{ background: '#ef4444', color: '#fff', padding: '8px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600 }}>
        GİZLİ ALAN: Yalnızca yetkili moderatörler erişebilir. Log kayıtları tutulmaktadır.
      </div>
      {children}
    </div>
  );
}
