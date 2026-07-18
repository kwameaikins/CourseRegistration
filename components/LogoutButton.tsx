'use client';

import { useRouter } from 'next/navigation';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function LogoutButton({ staffName }: { staffName: string }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground">{staffName}</span>
      <Button variant="outline" size="sm" onClick={handleLogout}>
        Log out
      </Button>
    </div>
  );
}
