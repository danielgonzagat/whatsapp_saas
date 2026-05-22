'use client';

import { type AdminUserPermission, type AdminUserRecord } from '@/lib/api/admin-iam-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionEditor } from './ConfigPermissionEditor';
import { CONFIG_PAGE_COPY, ROLE_VARIANT, STATUS_VARIANT, formatDateTime } from './config-constants';

export type UserAccessSectionProps = {
  error: unknown;
  isLoading: boolean;
  permissions: AdminUserPermission[] | null;
  selectedUserId: string | null;
  users: AdminUserRecord[];
  onPermissionsSaved: () => Promise<void> | void;
  onSelectUser: (userId: string | null) => void;
};

export function UserAccessSection(props: UserAccessSectionProps) {
  const { error, isLoading, permissions, selectedUserId, users, onPermissionsSaved, onSelectUser } =
    props;

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{CONFIG_PAGE_COPY.adminsTitle}</CardTitle>
          <CardDescription>{CONFIG_PAGE_COPY.adminsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : error ? (
            <p
              role="alert"
              className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
            >
              {error instanceof AdminApiClientError
                ? error.message
                : CONFIG_PAGE_COPY.adminsLoadError}
            </p>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {CONFIG_PAGE_COPY.adminsEmpty}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.name}</th>
                    <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.role}</th>
                    <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.status}</th>
                    <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.mfa}</th>
                    <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.lastLogin}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => onSelectUser(user.id)}
                      className={
                        'cursor-pointer hover:bg-accent/40 ' +
                        (selectedUserId === user.id ? 'bg-primary/10' : '')
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{user.name}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={ROLE_VARIANT[user.role] ?? 'default'}>{user.role}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[user.status] ?? 'default'}>
                          {user.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {user.mfaEnabled ? (
                          <span className="text-emerald-400">
                            {CONFIG_PAGE_COPY.mfaState.active}
                          </span>
                        ) : user.mfaPendingSetup ? (
                          <span className="text-amber-400">
                            {CONFIG_PAGE_COPY.mfaState.pending}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {CONFIG_PAGE_COPY.mfaState.disabled}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(user.lastLoginAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedUserId ? (
        <PermissionEditor
          key={selectedUserId}
          user={users.find((user) => user.id === selectedUserId) ?? null}
          permissions={permissions}
          onSaved={onPermissionsSaved}
          onCancel={() => onSelectUser(null)}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{CONFIG_PAGE_COPY.permissionsTitle}</CardTitle>
            <CardDescription>{CONFIG_PAGE_COPY.permissionsSelect}</CardDescription>
          </CardHeader>
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            {CONFIG_PAGE_COPY.permissionsEmpty}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
