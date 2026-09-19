"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { DropdownMenu, Switch } from "radix-ui";
import { ChevronDown, MoreVertical } from "lucide-react";
import { addPolicy, deleteTable, setTableRls, updateTableDescription, type DataTable } from "../_lib/db";
import { projectPath, useUi } from "../_lib/ui-version";
import { DataDialog } from "./dialog";
import { DEFAULT_POLICY, PolicyFields, validatePolicy, type PolicyDraft, type PolicyErrors } from "./policy-fields";
import { Button, Field, textareaClass } from "./ui";
import s from "../data.module.css";

/** "Add policy" dialog, shared by the header menu and the Policies tab. */
export function AddPolicyDialog({ table, open, onOpenChange }: { table: DataTable; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { labels, prefix } = useUi();
  const [policy, setPolicy] = React.useState<PolicyDraft>({ ...DEFAULT_POLICY });
  const [errors, setErrors] = React.useState<PolicyErrors>({});

  function close() {
    onOpenChange(false);
    setPolicy({ ...DEFAULT_POLICY });
    setErrors({});
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validatePolicy(policy, true);
    setErrors(next);
    if (next.name || next.using) return;
    addPolicy(table.id, { name: policy.name.trim(), role: policy.role, command: policy.command, using: policy.using.trim() });
    close();
  }

  return (
    <DataDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={labels.addPolicy}
      description={`Policies restrict which rows of ${table.name} each role can access.`}
    >
      <form onSubmit={submit} noValidate className="mt-4 grid gap-4">
        <PolicyFields
          idPrefix={`${prefix}-add`}
          value={policy}
          onChange={(next) => {
            setPolicy(next);
            if (errors.name || errors.using) setErrors({});
          }}
          errors={errors}
          nameRequired
        />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            {labels.addPolicy}
          </Button>
        </div>
      </form>
    </DataDialog>
  );
}

export function TableActions({ table }: { table: DataTable }) {
  const router = useRouter();
  const { version, labels, prefix } = useUi();
  const [disableOpen, setDisableOpen] = React.useState(false);
  const [policyOpen, setPolicyOpen] = React.useState(false);
  const [descriptionOpen, setDescriptionOpen] = React.useState(false);
  const [description, setDescription] = React.useState(table.description);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const rlsId = `${prefix}-table-rls`;

  // Open dialogs on the next tick so the menu finishes closing and returns focus first.
  const openLater = (setter: (open: boolean) => void) => () => {
    window.setTimeout(() => setter(true), 0);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <label htmlFor={rlsId} className={s.labelInline}>
          {labels.rls}
        </label>
        <Switch.Root
          id={rlsId}
          className={s.switch}
          checked={table.rlsEnabled}
          onCheckedChange={(checked) => {
            if (checked) setTableRls(table.id, true);
            else setDisableOpen(true);
          }}
        >
          <Switch.Thumb className={s.switchThumb} />
        </Switch.Root>
      </div>

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
            <DropdownMenu.Item className={s.menuItem} onSelect={openLater(setPolicyOpen)}>
              {labels.addPolicy}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={s.menuItem}
              onSelect={() => {
                setDescription(table.description);
                openLater(setDescriptionOpen)();
              }}
            >
              Edit description
            </DropdownMenu.Item>
            <DropdownMenu.Item className={s.menuItem} onSelect={() => router.push(`${projectPath(table.projectId, "/sql")}?table=${table.name}`)}>
              Query in SQL editor
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={s.menuSeparator} />
            <DropdownMenu.Item className={s.menuItemDanger} onSelect={openLater(setDeleteOpen)}>
              Delete table
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <DataDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        title={`Disable ${labels.rls.toLowerCase()}?`}
        description={`Every row of ${table.name} becomes readable and writable through the API by any client holding the anon key. Existing policies are kept but no longer enforced.`}
        footer={
          <>
            <Button type="button" onClick={() => setDisableOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setTableRls(table.id, false);
                setDisableOpen(false);
              }}
            >
              Disable {labels.rls.toLowerCase()}
            </Button>
          </>
        }
      />

      <AddPolicyDialog table={table} open={policyOpen} onOpenChange={setPolicyOpen} />

      <DataDialog
        open={descriptionOpen}
        onOpenChange={setDescriptionOpen}
        title="Edit description"
        footer={
          <>
            <Button type="button" onClick={() => setDescriptionOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                updateTableDescription(table.id, description.trim());
                setDescriptionOpen(false);
              }}
            >
              Save description
            </Button>
          </>
        }
      >
        <Field id={`${prefix}-edit-description`} label="Description">
          {({ id }) => <textarea id={id} rows={3} className={textareaClass} value={description} onChange={(event) => setDescription(event.target.value)} />}
        </Field>
      </DataDialog>

      <DataDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete table"
        description={`Delete ${table.name} (${table.id})? Its rows and ${table.policies.length} policies will be removed. This cannot be undone.`}
        footer={
          <>
            <Button type="button" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                deleteTable(table.id);
                setDeleteOpen(false);
                router.push(projectPath(table.projectId, "/tables"));
              }}
            >
              Delete table
            </Button>
          </>
        }
      />
    </>
  );
}
