"use client";
import * as React from "react";
import { DropdownMenu } from "radix-ui";
import { ChevronDown, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { archiveProject, duplicateProject, isValidProjectName, projectNameExists, type LumenDb, type Project } from "../_lib/db";
import { useUi } from "../_lib/ui-version";
import { LumenDialog } from "./dialog";
import { Button, Field, inputClass } from "./ui";
import s from "../assistant.module.css";

export type ProjectActionMode = "archive" | "duplicate" | null;
export type ProjectActionOutcome = { kind: "archived"; project: Project } | { kind: "duplicated"; project: Project; copy: Project };

/**
 * The "Actions" menu (v2: "More options") for one project: Archive project and
 * Duplicate project. Both open a dialog; nothing changes until its commit button.
 */
export function ProjectMenu({
  project,
  onArchive,
  onDuplicate,
  variant = "row",
}: {
  project: Project;
  onArchive: () => void;
  onDuplicate: () => void;
  /** "row": a small button in a table row; "header": the page-header button. */
  variant?: "row" | "header";
}) {
  const { version, labels } = useUi();
  // Open dialogs on the next tick so the menu finishes closing and returns focus first.
  const later = (fn: () => void) => () => {
    window.setTimeout(fn, 0);
  };
  const name = variant === "row" ? `${labels.actionsMenu} for ${project.name}` : labels.actionsMenu;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {version === "v2" ? (
          <button type="button" className={s.btnIcon} aria-label={name} title={labels.actionsMenu}>
            <MoreVertical size={16} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className={cn(s.btnSecondary, variant === "row" && s.btnSm)} aria-label={name}>
            {labels.actionsMenu}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={s.menuContent} align="end" sideOffset={4}>
          <DropdownMenu.Item className={s.menuItem} onSelect={later(onDuplicate)}>
            Duplicate project
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={s.menuSeparator} />
          <DropdownMenu.Item className={s.menuItemDanger} disabled={project.status === "Archived"} onSelect={later(onArchive)}>
            Archive project
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The duplicate form owns its state: it mounts with the dialog, so the name is prefilled fresh each time. */
function DuplicateForm({ db, project, onCancel, onDone }: { db: LumenDb; project: Project; onCancel: () => void; onDone: (copy: Project) => void }) {
  const { prefix } = useUi();
  const [copyName, setCopyName] = React.useState(() => `${project.name} copy`);
  const [copyError, setCopyError] = React.useState("");
  const nameId = `${prefix}-copy-name`;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = copyName.trim();
    let error = "";
    if (!name) error = "Enter a project name";
    else if (!isValidProjectName(name)) error = "Use letters, digits, spaces and hyphens only";
    else if (projectNameExists(db, name)) error = `A project named ${name} already exists`;
    if (error) {
      setCopyError(error);
      window.setTimeout(() => document.getElementById(nameId)?.focus(), 0);
      return;
    }
    const copy = duplicateProject(project.id, name);
    if (copy) onDone(copy);
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 grid gap-4">
      <Field id={nameId} label="Project name" required error={copyError} className={`${prefix}-field`}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            type="text"
            name="copyName"
            required
            autoComplete="off"
            className={cn(inputClass, `${prefix}-input`)}
            value={copyName}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
              setCopyName(event.target.value);
              if (copyError) setCopyError("");
            }}
          />
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Duplicate project
        </Button>
      </div>
    </form>
  );
}

/** The Archive and Duplicate dialogs for one project. */
export function ProjectDialogs({
  db,
  project,
  mode,
  onClose,
  onDone,
}: {
  db: LumenDb;
  project: Project | null;
  mode: ProjectActionMode;
  onClose: () => void;
  onDone: (outcome: ProjectActionOutcome) => void;
}) {
  function archive() {
    if (!project) return;
    archiveProject(project.id);
    const done = project;
    onClose();
    onDone({ kind: "archived", project: done });
  }

  return (
    <>
      <LumenDialog
        open={mode === "archive" && Boolean(project)}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title="Archive project"
        description={
          project
            ? `Archive ${project.name} (${project.id})? Members lose access and the project stops answering. Its configuration and conversation history are kept.`
            : ""
        }
        footer={
          <>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={archive}>
              Archive project
            </Button>
          </>
        }
      />

      <LumenDialog
        open={mode === "duplicate" && Boolean(project)}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title="Duplicate project"
        description={project ? `Copies the instructions, knowledge sources, retention and reviewer of ${project.name} into a new project.` : ""}
      >
        {project ? (
          <DuplicateForm
            db={db}
            project={project}
            onCancel={onClose}
            onDone={(copy) => {
              const done = project;
              onClose();
              onDone({ kind: "duplicated", project: done, copy });
            }}
          />
        ) : null}
      </LumenDialog>
    </>
  );
}
