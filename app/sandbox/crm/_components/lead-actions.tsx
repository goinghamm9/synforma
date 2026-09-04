"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { ChevronDown, MoreVertical } from "lucide-react";
import { OWNERS, assignLeadOwner, updateLeadStatus, type Lead, type Owner } from "../_lib/db";
import { useUi } from "../_lib/ui-version";
import { Button, Field, selectClass } from "./ui";
import { CrmDialog } from "./dialog";
import s from "../crm.module.css";

export function LeadActions({ lead }: { lead: Lead }) {
  const router = useRouter();
  const { version, labels } = useUi();
  const [nurtureOpen, setNurtureOpen] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [owner, setOwner] = React.useState<Owner>(lead.owner);

  const convertHref = `/sandbox/crm/opportunities/new?lead=${lead.id}`;

  // Open dialogs on the next tick so the menu finishes closing and returns focus first.
  const openLater = (setter: (open: boolean) => void) => () => {
    window.setTimeout(() => setter(true), 0);
  };

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          {version === "v2" ? (
            <button type="button" className={s.btnIcon} aria-label={labels.actionsMenu} title={labels.actionsMenu}>
              <MoreVertical size={16} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className={s.btnSecondary}>
              {labels.actionsMenu}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={s.menuContent} align="end" sideOffset={4}>
            <DropdownMenu.Item className={s.menuItem} onSelect={() => router.push(convertHref)}>
              {labels.convertToOpportunity}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={s.menuItem} onSelect={openLater(setNurtureOpen)} disabled={lead.status === "Nurturing"}>
              {labels.markAsNurturing}
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={s.menuSeparator} />
            <DropdownMenu.Item
              className={s.menuItem}
              onSelect={() => {
                setOwner(lead.owner);
                openLater(setAssignOpen)();
              }}
            >
              {labels.assignOwner}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <CrmDialog
        open={nurtureOpen}
        onOpenChange={setNurtureOpen}
        title="Mark as nurturing"
        description={`Move ${lead.name} to the Nurturing status? The lead stays assigned to ${lead.owner} and can be worked again later.`}
        footer={
          <>
            <Button type="button" onClick={() => setNurtureOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                updateLeadStatus(lead.id, "Nurturing");
                setNurtureOpen(false);
              }}
            >
              Mark as nurturing
            </Button>
          </>
        }
      />

      <CrmDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title="Assign owner"
        description="Choose the person responsible for this lead."
        footer={
          <>
            <Button type="button" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                assignLeadOwner(lead.id, owner);
                setAssignOpen(false);
              }}
            >
              Assign
            </Button>
          </>
        }
      >
        <Field id="assign-owner" label="Owner" className="mt-4">
          {({ id }) => (
            <select id={id} name="owner" className={selectClass} value={owner} onChange={(event) => setOwner(event.target.value as Owner)}>
              {OWNERS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </CrmDialog>
    </>
  );
}
