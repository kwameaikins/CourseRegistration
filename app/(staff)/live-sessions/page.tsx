import * as coursesService from '@/modules/courses/service';
import * as liveSessionsService from '@/modules/live-sessions/service';
import * as usersService from '@/modules/users/service';

import { LiveSessionsWorkspace } from './LiveSessionsWorkspace';

export const dynamic = 'force-dynamic';

export default async function LiveSessionsPage() {
  const staffUser = await usersService.requireRole(['admin', 'management']);
  const [liveSessions, batches] = await Promise.all([
    liveSessionsService.getLiveSessions(),
    coursesService.getBatches(),
  ]);

  return (
    <LiveSessionsWorkspace
      initialLiveSessions={liveSessions}
      batches={batches.map((batch) => ({
        id: batch.id,
        cohortLabel: batch.cohortLabel,
        startDate: batch.startDate,
      }))}
      canManage={staffUser.role === 'admin'}
    />
  );
}