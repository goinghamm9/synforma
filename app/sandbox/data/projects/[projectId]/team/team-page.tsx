"use client";
import * as React from "react";
import { useParams } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { MoreVertical, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CURRENT_USER,
  MEMBER_ROLES,
  formatDate,
  getProject,
  inviteMember,
  isEmail,
  removeMember,
  updateMemberRole,
  useDb,
  type Member,
  type MemberRole,
} from "../../../_lib/db";
import { usePageTitle } from "../../../_lib/use-page-title";
import { useUi } from "../../../_lib/ui-version";
import { DataDialog } from "../../../_components/dialog";
import { ProjectNotFound } from "../../../_components/not-found";
import { Badge, Button, Card, Field, PageHeader, PageSkeleton, Table, inputClass, selectClass, type BadgeTone } from "../../../_components/ui";
import s from "../../../data.module.css";

const ROLE_TONE: Record<MemberRole, BadgeTone> = { Owner: "green", Admin: "blue", Editor: "gray", Viewer: "gray" };

export function TeamPage() {
  const params = useParams<{ projectId: string }>();
  const db = useDb();
  const { labels, prefix } = useUi();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<MemberRole>("Viewer");
  const [emailError, setEmailError] = React.useState("");
  const [roleTarget, setRoleTarget] = React.useState<Member | null>(null);
  const [nextRole, setNextRole] = React.useState<MemberRole>("Viewer");
  const [removeTarget, setRemoveTarget] = React.useState<Member | null>(null);
  const [status, setStatus] = React.useState("");
  usePageTitle("Team");

  if (!db) return <PageSkeleton />;
  const project = getProject(db, params.projectId);
  if (!project) return <ProjectNotFound projectId={params.projectId} />;

  function closeInvite() {
    setInviteOpen(false);
    setEmail("");
    setRole("Viewer");
    setEmailError("");
  }

  function submitInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    if (!value) return setEmailError("Enter an email address");
    if (!isEmail(value)) return setEmailError("Enter a valid email address");
    if (db?.members.some((m) => m.email.toLowerCase() === value)) return setEmailError(`${value} is already a member`);
    inviteMember(value, role);
    setStatus(`Invitation sent to ${value} as ${role}.`);
    closeInvite();
  }

  const openLater = (fn: () => void) => () => {
    window.setTimeout(fn, 0);
  };

  return (
    <>
      <PageHeader
        title="Team"
        description={`${db.members.length} members of ${project.org} with access to ${project.name}`}
        actions={
          <Button variant="primary" onClick={() => setInviteOpen(true)}>
            <UserPlus size={14} aria-hidden="true" />
            {labels.inviteMember}
          </Button>
        }
      />
      {status ? (
        <p role="status" className={cn(s.bannerSuccess, "mb-4")}>
          {status}
        </p>
      ) : null}
      <Card title="Members" bodyClassName={s.cardBodyFlush}>
        <Table caption="Team members">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Joined</th>
              <th scope="col">
                <span className={s.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {db.members.map((member) => {
              const isSelf = member.email === CURRENT_USER.email;
              const display = member.name || member.email;
              return (
                <tr key={member.id}>
                  <td>
                    <span className="font-semibold">{member.name || <span className={s.faint}>Pending</span>}</span>
                    {isSelf ? <span className={cn(s.muted, "ml-1 text-xs")}>(you)</span> : null}
                    <span className={cn(s.muted, "block text-xs")}>{member.id}</span>
                  </td>
                  <td>{member.email}</td>
                  <td>
                    <Badge tone={ROLE_TONE[member.role]}>{member.role}</Badge>
                  </td>
                  <td>{member.status === "Active" ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Invited</Badge>}</td>
                  <td className={s.num}>{formatDate(member.joinedAt)}</td>
                  <td className={s.tdRight}>
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button type="button" className={s.btnIcon} aria-label={`${labels.actionsMenu} for ${display}`} title={labels.actionsMenu}>
                          <MoreVertical size={16} aria-hidden="true" />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className={s.menuContent} align="end" sideOffset={4}>
                          <DropdownMenu.Item
                            className={s.menuItem}
                            disabled={isSelf}
                            onSelect={openLater(() => {
                              setNextRole(member.role);
                              setRoleTarget(member);
                            })}
                          >
                            Change role
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator className={s.menuSeparator} />
                          <DropdownMenu.Item className={s.menuItemDanger} disabled={isSelf} onSelect={openLater(() => setRemoveTarget(member))}>
                            Remove member
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <DataDialog
        open={inviteOpen}
        onOpenChange={(open) => (open ? setInviteOpen(true) : closeInvite())}
        title={labels.inviteMember}
        description="The invitee receives an email with a link to join this project."
      >
        <form onSubmit={submitInvite} noValidate className="mt-4 grid gap-4">
          <Field id={`${prefix}-invite-email`} label="Email" required error={emailError}>
            {({ id, describedBy, invalid }) => (
              <input
                id={id}
                type="email"
                name="email"
                className={inputClass}
                value={email}
                autoComplete="off"
                placeholder="name@example.com"
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError("");
                }}
              />
            )}
          </Field>
          <Field id={`${prefix}-invite-role`} label="Role" help="Editors can change tables and policies; Viewers are read-only.">
            {({ id, describedBy }) => (
              <select id={id} name="role" className={selectClass} value={role} aria-describedby={describedBy} onChange={(event) => setRole(event.target.value as MemberRole)}>
                {MEMBER_ROLES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={closeInvite}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Send invite
            </Button>
          </div>
        </form>
      </DataDialog>

      <DataDialog
        open={roleTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRoleTarget(null);
        }}
        title="Change role"
        description={roleTarget ? `Choose the role for ${roleTarget.name || roleTarget.email}.` : ""}
        footer={
          <>
            <Button type="button" onClick={() => setRoleTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                if (roleTarget) {
                  updateMemberRole(roleTarget.id, nextRole);
                  setStatus(`${roleTarget.name || roleTarget.email} is now ${nextRole}.`);
                }
                setRoleTarget(null);
              }}
            >
              Save role
            </Button>
          </>
        }
      >
        <Field id={`${prefix}-change-role`} label="Role" className="mt-4">
          {({ id }) => (
            <select id={id} name="nextRole" className={selectClass} value={nextRole} onChange={(event) => setNextRole(event.target.value as MemberRole)}>
              {MEMBER_ROLES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
        </Field>
      </DataDialog>

      <DataDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title="Remove member"
        description={removeTarget ? `Remove ${removeTarget.name || removeTarget.email} from ${project.name}? They lose access immediately.` : ""}
        footer={
          <>
            <Button type="button" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                if (removeTarget) {
                  removeMember(removeTarget.id);
                  setStatus(`${removeTarget.name || removeTarget.email} removed.`);
                }
                setRemoveTarget(null);
              }}
            >
              Remove member
            </Button>
          </>
        }
      />
    </>
  );
}
