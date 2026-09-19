"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCustomer, refundableAmount, sendReceipt, useDb, type Payment } from "../_lib/db";
import { useUi } from "../_lib/ui-version";
import { Button, Field, inputClass } from "./ui";
import { BillingDialog } from "./dialog";
import s from "../billing.module.css";

export function PaymentActions({ payment, onNotice }: { payment: Payment; onNotice: (text: string) => void }) {
  const router = useRouter();
  const db = useDb();
  const { version, labels, prefix } = useUi();
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const customer = db ? getCustomer(db, payment.customerId) : undefined;
  const [email, setEmail] = React.useState(customer ? customer.email : "");

  const refundHref = `/sandbox/billing/payments/${payment.id}/refund`;
  const canRefund = refundableAmount(payment) > 0;

  // Open dialogs on the next tick so the menu finishes closing and returns focus first.
  const openLater = (setter: (open: boolean) => void) => () => {
    window.setTimeout(() => setter(true), 0);
  };

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          {version === "v2" ? (
            <button type="button" className={cn(s.btnSecondary, "lb-menu-trigger")}>
              <MoreHorizontal size={16} aria-hidden="true" />
              {labels.actionsMenu}
            </button>
          ) : (
            <button type="button" className={cn(s.btnSecondary, "fld-actions")}>
              {labels.actionsMenu}
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          )}
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={s.menuContent} align="end" sideOffset={4}>
            <DropdownMenu.Item className={s.menuItem} disabled={!canRefund} onSelect={() => router.push(refundHref)}>
              {labels.refundPayment}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={s.menuItem}
              disabled={payment.status === "Failed"}
              onSelect={() => {
                setEmail(customer ? customer.email : "");
                openLater(setReceiptOpen)();
              }}
            >
              {labels.sendReceipt}
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={s.menuSeparator} />
            <DropdownMenu.Item className={s.menuItem} onSelect={() => router.push(`/sandbox/billing/customers/${payment.customerId}`)}>
              {labels.viewCustomer}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <BillingDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        title="Send receipt"
        description={`Email a receipt for payment ${payment.id} to the customer.`}
        footer={
          <>
            <Button type="button" onClick={() => setReceiptOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                sendReceipt(payment.id);
                setReceiptOpen(false);
                onNotice(`Receipt sent to ${email.trim() || "the customer"}.`);
              }}
            >
              Send receipt
            </Button>
          </>
        }
      >
        <Field id={`${prefix}-receipt-email`} label="Email address" className="mt-4">
          {({ id }) => <input id={id} type="email" name="email" className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} />}
        </Field>
      </BillingDialog>
    </>
  );
}
