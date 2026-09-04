"use client";
import * as React from "react";
import { getAccount, useDb } from "../_lib/db";
import { usePageTitle } from "../_lib/use-page-title";
import { Card, EmptyState, Field, PageHeader, PageSkeleton, Table, inputClass } from "../_components/ui";
import s from "../crm.module.css";

export default function ContactsPage() {
  usePageTitle("Contacts");
  const db = useDb();
  const [query, setQuery] = React.useState("");
  if (!db) return <PageSkeleton />;

  const needle = query.trim().toLowerCase();
  const contacts = db.contacts.filter((contact) => {
    if (!needle) return true;
    const account = getAccount(db, contact.accountId);
    return [contact.name, contact.title, contact.email, account?.name ?? ""].some((v) => v.toLowerCase().includes(needle));
  });

  return (
    <>
      <PageHeader title="Contacts" description={`${db.contacts.length} contacts · ${contacts.length} shown`} />
      <Card bodyClassName="p-0">
        <div className="border-b border-[#d5dbe1] p-3 sm:max-w-md">
          <Field id="contact-search" label="Search">
            {({ id }) => (
              <input
                id={id}
                type="search"
                className={inputClass}
                placeholder="Search by name, title, account or email"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            )}
          </Field>
        </div>
        {contacts.length === 0 ? (
          <EmptyState title="No contacts match" description="Try a different search term." />
        ) : (
          <Table caption="Contacts">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Name</th>
                <th scope="col">Title</th>
                <th scope="col">Account</th>
                <th scope="col">Email</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => {
                const account = getAccount(db, contact.accountId);
                return (
                  <tr key={contact.id}>
                    <td className={s.num}>{contact.id}</td>
                    <td className="font-semibold">{contact.name}</td>
                    <td>{contact.title}</td>
                    <td>{account ? account.name : contact.accountId}</td>
                    <td>{contact.email}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
