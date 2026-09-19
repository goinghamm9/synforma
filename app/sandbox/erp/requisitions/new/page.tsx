"use client";
import { useDb } from "../../_lib/db";
import { usePageTitle } from "../../_lib/use-page-title";
import { useUi } from "../../_lib/ui-version";
import { RequisitionWizard } from "../../_components/requisition-wizard";
import { Breadcrumb, PageHeader, PageSkeleton } from "../../_components/ui";

export default function NewRequisitionPage() {
  const { version, labels } = useUi();
  usePageTitle(labels.createRequisitionTile);
  const db = useDb();

  if (!db) return <PageSkeleton />;

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Home", href: "/sandbox/erp" },
          { label: "My Purchase Requisitions", href: "/sandbox/erp/requisitions" },
          { label: labels.createRequisitionTile },
        ]}
      />
      <PageHeader
        title={labels.createRequisitionTile}
        description={
          version === "v2"
            ? "Enter the general data and the items, then review, justify and order."
            : "Enter the general data, the items and the business justification, then review and submit for approval."
        }
      />
      <RequisitionWizard db={db} />
    </>
  );
}
